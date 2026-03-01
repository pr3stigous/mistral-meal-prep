import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// Using OpenAI-compatible SDK pointed at Mistral AI API
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts';
import { getRecipeImageUrl } from '../_shared/recipeImageScoring.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limits - TESTING: temporarily set high limit
const RATE_LIMIT = { limit: 9999, periodDays: 1 }; // TODO: restore to 4 after testing

// Timeouts
const JINA_TIMEOUT_MS = 45_000;    // 45s for URL fetching
const LLM_TIMEOUT_MS = 60_000;  // 60s for LLM parsing
const MAX_MARKDOWN_CHARS = 30_000; // Truncate to avoid token limit blowout

// Pricing for cost estimation (per 1M tokens)
const PRICING = {
  'mistral-small-latest': { prompt: 0.15, completion: 0.60 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  if (!pricing) return 0;
  return (promptTokens / 1000000 * pricing.prompt) + (completionTokens / 1000000 * pricing.completion);
}

async function checkRateLimit(
  supabaseClient: any,
  userId: string
): Promise<{ allowed: boolean; remaining: number; limit: number; resetAt: Date }> {
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - RATE_LIMIT.periodDays);
  periodStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabaseClient
    .from('llm_usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('function_name', 'parse-recipe-url')
    .eq('operation', 'url_import')
    .eq('success', true)
    .gte('created_at', periodStart.toISOString());

  if (error) {
    console.error('Rate limit check failed:', error);
    return { allowed: true, remaining: RATE_LIMIT.limit, limit: RATE_LIMIT.limit, resetAt: new Date() };
  }

  const used = count || 0;
  const remaining = Math.max(0, RATE_LIMIT.limit - used);

  const resetAt = new Date(periodStart);
  resetAt.setDate(resetAt.getDate() + RATE_LIMIT.periodDays);

  return {
    allowed: used < RATE_LIMIT.limit,
    remaining,
    limit: RATE_LIMIT.limit,
    resetAt,
  };
}

async function logUsage(
  supabaseClient: any,
  params: {
    user_id: string;
    function_name: string;
    operation: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    input_method: string;
    success: boolean;
    error_message?: string;
    response_time_ms: number;
  }
) {
  try {
    await supabaseClient.from('llm_usage_logs').insert(params);
  } catch (err) {
    console.error('Failed to log usage:', err);
  }
}

// Recipe parsing prompt (shared with generate-recipes)
const RECIPE_PARSE_PROMPT = `
You are a recipe parsing assistant. Your job is to extract structured data from recipe content.
Analyze the provided recipe and return a valid JSON object with the following structure:

{
  "name": "Recipe Name",
  "description": "Brief 1-2 sentence description of the dish",
  "prep_time_minutes": integer,
  "cook_time_minutes": integer,
  "servings": integer,
  "ingredients": [
    {
      "name": "ingredient name",
      "quantity": float,
      "unit": "unit (cups, tbsp, oz, etc.)",
      "category": "produce" | "proteins" | "dairy" | "pantry" | "frozen" | "other"
    }
  ],
  "instructions": ["Step 1...", "Step 2...", ...],
  "skill_level": "beginner" | "intermediate" | "advanced",
  "meal_prep_score": integer 1-5 (how well it stores/portions for meal prep),
  "meal_prep_score_explanation": "Brief 1-sentence explanation of WHY this score was given",
  "tags": ["tag1", "tag2", ...],
  "nutritional_info": {
    "calories": integer per serving,
    "protein_g": integer,
    "carbs_g": integer,
    "fat_g": integer,
    "fiber_g": integer,
    "sugar_g": integer,
    "sodium_mg": integer
  },
  "equipment_needed": ["pot", "pan", "blender", etc.],
  "author_tips": ["string — useful cooking tips, serving suggestions, storage/reheating advice, common mistakes, technique notes, or other helpful context from the page. Max 5 tips."]
}

IMPORTANT RULES:
1. Categorize each ingredient correctly:
   - produce: fruits, vegetables, herbs, fresh items
   - proteins: meat, fish, poultry, tofu, eggs, legumes
   - dairy: milk, cheese, yogurt, butter, cream
   - pantry: spices, oils, flour, sugar, canned goods, dry goods
   - frozen: frozen vegetables, frozen fruits, ice cream
   - other: anything else
2. Skill level should be:
   - beginner: simple techniques, few ingredients, forgiving recipes
   - intermediate: some technique required, moderate complexity
   - advanced: complex techniques, precise timing, specialized skills
3. Meal prep score (1-5) - ALWAYS provide a specific explanation:
   - 1: Doesn't store well, best eaten immediately (e.g., fresh salads with delicate greens, fried foods that get soggy)
   - 2: Lasts 1-2 days refrigerated (e.g., dishes with crispy elements, creamy sauces that separate)
   - 3: Lasts 3-4 days, reheats okay (e.g., most cooked dishes, stir-fries, pasta)
   - 4: Lasts 5+ days, reheats well, portions easily (e.g., stews, curries, grain bowls)
   - 5: Freezer-friendly, perfect for batch cooking (e.g., soups, chili, casseroles, marinated proteins)
   The explanation should mention: storage duration, any components that don't store well, and reheating notes if relevant.
4. If cooking times aren't specified, estimate reasonable values.
5. Calculate nutritional info per serving using standard values.
6. Extract all equipment mentioned or obviously needed.
7. If the content doesn't appear to be a recipe, return an error object: {"error": "No recipe found in content"}
8. Extract any useful cooking tips, serving suggestions, storage advice, or author notes from the page content. These are often found in blog text above/below the recipe card. Keep each tip concise (1-2 sentences). Max 5 tips. If no useful tips found, return an empty array.

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;

const mistralClient = new OpenAI({
  apiKey: Deno.env.get('MISTRAL_API_KEY') || '',
  baseURL: 'https://api.mistral.ai/v1',
});

// Fetch with timeout using AbortController
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Fetch URL content using Jina AI Reader
async function fetchUrlWithJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(jinaUrl, {
      headers: { 'Accept': 'text/markdown' },
    }, JINA_TIMEOUT_MS);
  } catch (err: any) {
    if (err.message.includes('timed out')) {
      throw new Error('Recipe URL took too long to fetch. The site may be blocking automated access. Try a different recipe URL.');
    }
    throw new Error(`Failed to connect to recipe reader service: ${err.message}`);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 403 || status === 401 || status === 451) {
      throw new Error('This website blocks automated recipe reading. Try copying the recipe text and pasting it instead.');
    }
    if (status === 404) {
      throw new Error('Recipe page not found. Check the URL and try again.');
    }
    if (status >= 500) {
      throw new Error('Recipe reader service is temporarily unavailable. Please try again in a few minutes.');
    }
    throw new Error(`Failed to read recipe page (HTTP ${status})`);
  }

  const markdown = await response.text();

  if (!markdown || markdown.trim().length < 100) {
    throw new Error('Could not extract recipe content from this URL. The page may require login, be behind a paywall, or have no recipe content.');
  }

  return markdown;
}

// Validate URL format
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Helper to return a JSON error response
function errorResponse(error: string, status: number, details?: string) {
  return new Response(
    JSON.stringify({ error, details: details || undefined, success: false }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status }
  );
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let userId = '';

  // Wrap entire handler so we always return a response (never let the function die silently)
  try {
    // Check if API key is configured
    const apiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!apiKey) {
      console.error('[parse-recipe-url] MISTRAL_API_KEY is not configured');
      return errorResponse('Service configuration error', 500);
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch {
      return errorResponse('Invalid request body — expected JSON', 400);
    }

    const { url, user_id } = requestBody;
    userId = user_id || '';

    // Validate inputs
    if (!url || typeof url !== 'string') {
      return errorResponse('URL is required', 400);
    }

    if (!isValidUrl(url)) {
      return errorResponse('Invalid URL format. Must start with http:// or https://', 400);
    }

    if (!user_id || typeof user_id !== 'string') {
      return errorResponse('user_id is required', 400);
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(supabaseClient, user_id);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMITED',
          message: `Daily limit reached for URL imports. You can import ${rateLimit.limit} recipes per day. Try again tomorrow.`,
          limit: rateLimit.limit,
          remaining: 0,
          resetAt: rateLimit.resetAt.toISOString(),
          success: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Step 1: Fetch URL content using Jina AI Reader
    console.log(`[parse-recipe-url] Fetching URL: ${url}`);
    let markdown: string;
    try {
      markdown = await fetchUrlWithJina(url);
      console.log(`[parse-recipe-url] Fetched ${markdown.length} characters from Jina`);
    } catch (jinaError: any) {
      const errMsg = jinaError.message || 'Failed to fetch recipe from URL';
      console.error(`[parse-recipe-url] Jina fetch failed: ${errMsg}`);

      // Log the failure so we can track problem domains
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'parse-recipe-url',
        operation: 'url_import',
        model: 'none',
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
        input_method: 'url',
        success: false,
        error_message: `Jina fetch: ${errMsg}`,
        response_time_ms: Date.now() - startTime,
      });

      return errorResponse(errMsg, 400);
    }

    // Truncate oversized content to avoid blowing the Mistral token limit
    if (markdown.length > MAX_MARKDOWN_CHARS) {
      console.log(`[parse-recipe-url] Truncating markdown from ${markdown.length} to ${MAX_MARKDOWN_CHARS} chars`);
      markdown = markdown.substring(0, MAX_MARKDOWN_CHARS);
    }

    // Step 2: Parse markdown using Mistral
    console.log('[parse-recipe-url] Parsing with Mistral...');

    let chatCompletion: any;
    try {
      chatCompletion = await mistralClient.chat.completions.create({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: RECIPE_PARSE_PROMPT },
          { role: 'user', content: `Parse this recipe from a webpage:\n\n${markdown}` }
        ],
        response_format: { type: 'json_object' },
      });
    } catch (llmError: any) {
      const errMsg = llmError.message || 'Mistral API call failed';
      console.error(`[parse-recipe-url] Mistral error: ${errMsg}`);

      await logUsage(supabaseClient, {
        user_id,
        function_name: 'parse-recipe-url',
        operation: 'url_import',
        model: 'mistral-small-latest',
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
        input_method: 'url',
        success: false,
        error_message: `Mistral: ${errMsg}`,
        response_time_ms: Date.now() - startTime,
      });

      // User-friendly message based on error type
      if (errMsg.includes('rate limit') || errMsg.includes('429')) {
        return errorResponse('AI service is busy. Please try again in a minute.', 503);
      }
      if (errMsg.includes('401') || errMsg.includes('auth')) {
        return errorResponse('AI service authentication error', 500);
      }
      return errorResponse('Failed to parse recipe. Please try again.', 500);
    }

    const responseTime = Date.now() - startTime;
    const usage = chatCompletion.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const estimatedCost = calculateCost('mistral-small-latest', promptTokens, completionTokens);

    // Safely extract response content
    const responseContent = chatCompletion.choices?.[0]?.message?.content;
    if (!responseContent) {
      console.error('[parse-recipe-url] Mistral returned empty response');
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'parse-recipe-url',
        operation: 'url_import',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'url',
        success: false,
        error_message: 'Mistral returned empty response',
        response_time_ms: responseTime,
      });
      return errorResponse('AI could not parse this recipe. The page content may not contain a recognizable recipe.', 400);
    }

    // Parse JSON response safely
    let parsedRecipe: any;
    try {
      parsedRecipe = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('[parse-recipe-url] Failed to parse Mistral JSON:', responseContent.substring(0, 200));
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'parse-recipe-url',
        operation: 'url_import',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'url',
        success: false,
        error_message: 'Invalid JSON from Mistral',
        response_time_ms: responseTime,
      });
      return errorResponse('Failed to parse recipe data. Please try again.', 500);
    }

    // Check if Mistral determined this isn't a recipe
    if (parsedRecipe.error) {
      console.log(`[parse-recipe-url] Not a recipe: ${parsedRecipe.error}`);
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'parse-recipe-url',
        operation: 'url_import',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'url',
        success: false,
        error_message: parsedRecipe.error,
        response_time_ms: responseTime,
      });

      return errorResponse('No recipe found on this page. Make sure the URL points to a recipe.', 400);
    }

    // Validate that we got minimum required fields
    if (!parsedRecipe.name || !parsedRecipe.ingredients || parsedRecipe.ingredients.length === 0) {
      console.error('[parse-recipe-url] Parsed recipe missing required fields:', {
        hasName: !!parsedRecipe.name,
        ingredientCount: parsedRecipe.ingredients?.length || 0,
      });
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'parse-recipe-url',
        operation: 'url_import',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'url',
        success: false,
        error_message: 'Parsed recipe missing name or ingredients',
        response_time_ms: responseTime,
      });
      return errorResponse('Could not extract a complete recipe from this page. Try a different URL.', 400);
    }

    // Add source URL to recipe
    parsedRecipe.source_url = url;

    // Assign image URL (non-critical — don't fail the whole import if this errors)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      parsedRecipe.image_url = getRecipeImageUrl(
        {
          name: parsedRecipe.name,
          tags: parsedRecipe.tags,
          ingredients: parsedRecipe.ingredients,
        },
        '', // mealType not available for URL imports
        supabaseUrl
      );
      console.log(`[parse-recipe-url] Assigned image: ${parsedRecipe.image_url}`);
    } catch (imgError) {
      console.error('[parse-recipe-url] Image assignment failed (non-fatal):', imgError);
      parsedRecipe.image_url = null;
    }

    // Log successful usage
    await logUsage(supabaseClient, {
      user_id,
      function_name: 'parse-recipe-url',
      operation: 'url_import',
      model: 'mistral-small-latest',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      input_method: 'url',
      success: true,
      response_time_ms: responseTime,
    });

    // Get updated rate limit info
    const updatedRateLimit = await checkRateLimit(supabaseClient, user_id);

    console.log(`[parse-recipe-url] Success: "${parsedRecipe.name}" (${responseTime}ms, ${totalTokens} tokens, $${estimatedCost.toFixed(4)})`);

    return new Response(
      JSON.stringify({
        recipe: parsedRecipe,
        success: true,
        _rateLimit: {
          remaining: updatedRateLimit.remaining,
          limit: updatedRateLimit.limit,
          resetAt: updatedRateLimit.resetAt.toISOString(),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    // Top-level catch — something truly unexpected
    const responseTime = Date.now() - startTime;
    console.error(`[parse-recipe-url] Unhandled error (${responseTime}ms):`, error?.message || error);

    return new Response(
      JSON.stringify({
        error: 'Something went wrong importing this recipe. Please try again.',
        success: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
