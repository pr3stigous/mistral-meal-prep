import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// Using OpenAI-compatible SDK pointed at Mistral AI API
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limits - share with parse-recipe-url
const RATE_LIMIT = { limit: 10, periodDays: 1 };

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
    .eq('function_name', 'enhance-recipe-for-mealprep')
    .eq('operation', 'recipe_enhancement')
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

// Recipe enhancement prompt - focuses on meal prep analysis
const RECIPE_ENHANCE_PROMPT = `
You are a meal prep expert assistant. Your job is to analyze a recipe and provide meal prep-specific enhancements.

Given the recipe data below, analyze it and return a JSON object with the following meal prep enhancements:

{
  "meal_prep_score": integer 1-5 (how well it stores/portions for meal prep),
  "meal_prep_score_explanation": "Brief 1-sentence explanation of WHY this score was given",
  "skill_level": "beginner" | "intermediate" | "advanced",
  "equipment_needed": ["pot", "pan", "blender", etc.],
  "ingredients_categorized": [
    {
      "name": "ingredient name",
      "quantity": float,
      "unit": "unit",
      "category": "produce" | "proteins" | "dairy" | "pantry" | "frozen" | "other"
    }
  ]
}

IMPORTANT RULES:
1. Meal prep score (1-5) - ALWAYS provide a specific explanation:
   - 1: Doesn't store well, best eaten immediately (e.g., fresh salads with delicate greens, fried foods that get soggy)
   - 2: Lasts 1-2 days refrigerated (e.g., dishes with crispy elements, creamy sauces that separate)
   - 3: Lasts 3-4 days, reheats okay (e.g., most cooked dishes, stir-fries, pasta)
   - 4: Lasts 5+ days, reheats well, portions easily (e.g., stews, curries, grain bowls)
   - 5: Freezer-friendly, perfect for batch cooking (e.g., soups, chili, casseroles, marinated proteins)
   The explanation should mention: storage duration, any components that don't store well, and reheating notes if relevant.

2. Skill level should be:
   - beginner: simple techniques, few ingredients, forgiving recipes
   - intermediate: some technique required, moderate complexity
   - advanced: complex techniques, precise timing, specialized skills

3. Equipment: List all cooking equipment needed (pots, pans, baking sheets, blender, etc.)
   - Be thorough - include mixing bowls, cutting boards, knives for complex prep
   - Don't include basic utensils like spoons or spatulas unless specialized

4. Categorize each ingredient:
   - produce: fruits, vegetables, herbs, fresh items
   - proteins: meat, fish, poultry, tofu, eggs, legumes
   - dairy: milk, cheese, yogurt, butter, cream
   - pantry: spices, oils, flour, sugar, canned goods, dry goods
   - frozen: frozen vegetables, frozen fruits
   - other: anything else

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;

const mistralClient = new OpenAI({
  apiKey: Deno.env.get('MISTRAL_API_KEY') || '',
  baseURL: 'https://api.mistral.ai/v1',
});

interface RecipeInput {
  id: number;
  name: string;
  description?: string | null;
  ingredients?: any[] | null;
  instructions?: string[] | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  servings?: number | null;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Check if API key is configured
    const apiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!apiKey) {
      console.error('MISTRAL_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Mistral API key is not configured', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    const { recipe, user_id } = requestBody as { recipe: RecipeInput; user_id: string };

    // Validate inputs
    if (!recipe || !recipe.id || !recipe.name) {
      return new Response(
        JSON.stringify({ error: 'Recipe with id and name is required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required for rate limiting', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(supabaseClient, user_id);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: 'RATE_LIMITED',
          message: `Daily limit reached for recipe enhancements. You can enhance ${rateLimit.limit} recipes per day. Try again tomorrow.`,
          limit: rateLimit.limit,
          remaining: 0,
          resetAt: rateLimit.resetAt.toISOString(),
          success: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Build recipe description for LLM
    const recipeDescription = `
Recipe: ${recipe.name}
${recipe.description ? `Description: ${recipe.description}` : ''}
Prep Time: ${recipe.prep_time_minutes || 'Not specified'} minutes
Cook Time: ${recipe.cook_time_minutes || 'Not specified'} minutes
Servings: ${recipe.servings || 'Not specified'}

Ingredients:
${recipe.ingredients && Array.isArray(recipe.ingredients)
  ? recipe.ingredients.map((ing: any) => {
      if (typeof ing === 'string') return `- ${ing}`;
      return `- ${ing.quantity || ''} ${ing.unit || ''} ${ing.name || ing}`.trim();
    }).join('\n')
  : 'No ingredients listed'
}

Instructions:
${recipe.instructions && Array.isArray(recipe.instructions)
  ? recipe.instructions.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n')
  : 'No instructions listed'
}
`;

    console.log(`[enhance-recipe-for-mealprep] Enhancing recipe: ${recipe.name}`);

    // Call Mistral
    const chatCompletion = await mistralClient.chat.completions.create({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: RECIPE_ENHANCE_PROMPT },
        { role: 'user', content: `Analyze and enhance this recipe for meal prep:\n\n${recipeDescription}` }
      ],
      response_format: { type: 'json_object' },
    });

    const responseTime = Date.now() - startTime;
    const usage = chatCompletion.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const estimatedCost = calculateCost('mistral-small-latest', promptTokens, completionTokens);

    const responseContent = chatCompletion.choices[0].message.content;
    const enhancement = JSON.parse(responseContent || '{}');

    // Log successful usage
    await logUsage(supabaseClient, {
      user_id,
      function_name: 'enhance-recipe-for-mealprep',
      operation: 'recipe_enhancement',
      model: 'mistral-small-latest',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      input_method: 'recipe_data',
      success: true,
      response_time_ms: responseTime,
    });

    // Update the recipe in the database with enhancement data
    const updateData: any = {
      meal_prep_score: enhancement.meal_prep_score,
      meal_prep_score_explanation: enhancement.meal_prep_score_explanation,
      skill_level: enhancement.skill_level,
      equipment_needed: enhancement.equipment_needed,
    };

    // If ingredients were categorized and original didn't have categories, update them
    if (enhancement.ingredients_categorized && Array.isArray(enhancement.ingredients_categorized)) {
      updateData.ingredients = enhancement.ingredients_categorized;
    }

    const { error: updateError } = await supabaseClient
      .from('recipes')
      .update(updateData)
      .eq('id', recipe.id);

    if (updateError) {
      console.error('[enhance-recipe-for-mealprep] Failed to update recipe:', updateError);
      // Don't fail the whole request - still return the enhancement
    } else {
      console.log(`[enhance-recipe-for-mealprep] Updated recipe ${recipe.id} with enhancements`);
    }

    // Get updated rate limit info
    const updatedRateLimit = await checkRateLimit(supabaseClient, user_id);

    console.log(`[enhance-recipe-for-mealprep] Successfully enhanced recipe: ${recipe.name}`);

    return new Response(
      JSON.stringify({
        enhancement,
        recipe_id: recipe.id,
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
    console.error('[enhance-recipe-for-mealprep] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred',
        success: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
