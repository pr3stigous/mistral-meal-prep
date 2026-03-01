import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// Using OpenAI-compatible SDK pointed at Mistral AI API
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limits - matches parse-recipe-url limit (they're a package deal)
const RATE_LIMIT = { limit: 9999, periodDays: 1 }; // TODO: restore to 4 after testing

// Pricing for cost estimation (per 1M tokens)
const PRICING = {
  'mistral-small-latest': { prompt: 0.15, completion: 0.60 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  if (!pricing) return 0;
  return (promptTokens / 1000000 * pricing.prompt) + (completionTokens / 1000000 * pricing.completion);
}

// Timezone to currency mapping
const TIMEZONE_CURRENCY_MAP: Record<string, { code: string; symbol: string; name: string }> = {
  // Japan
  'Asia/Tokyo': { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  // Europe - Euro zone
  'Europe/Paris': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Berlin': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Rome': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Madrid': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Amsterdam': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Brussels': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Vienna': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Dublin': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Helsinki': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Lisbon': { code: 'EUR', symbol: '€', name: 'Euro' },
  'Europe/Athens': { code: 'EUR', symbol: '€', name: 'Euro' },
  // UK
  'Europe/London': { code: 'GBP', symbol: '£', name: 'British Pound' },
  // Canada
  'America/Toronto': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  'America/Vancouver': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  'America/Montreal': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  // Australia
  'Australia/Sydney': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Melbourne': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Perth': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Brisbane': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  // India
  'Asia/Kolkata': { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  // China
  'Asia/Shanghai': { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  'Asia/Hong_Kong': { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  // Singapore
  'Asia/Singapore': { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  // South Korea
  'Asia/Seoul': { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  // Brazil
  'America/Sao_Paulo': { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  // Mexico
  'America/Mexico_City': { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  // Switzerland
  'Europe/Zurich': { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  // Sweden
  'Europe/Stockholm': { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  // Norway
  'Europe/Oslo': { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  // Denmark
  'Europe/Copenhagen': { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  // New Zealand
  'Pacific/Auckland': { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  // Thailand
  'Asia/Bangkok': { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  // Philippines
  'Asia/Manila': { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  // Indonesia
  'Asia/Jakarta': { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  // Malaysia
  'Asia/Kuala_Lumpur': { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  // UAE
  'Asia/Dubai': { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  // Israel
  'Asia/Jerusalem': { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  // South Africa
  'Africa/Johannesburg': { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  // Poland
  'Europe/Warsaw': { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  // Czech Republic
  'Europe/Prague': { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  // Turkey
  'Europe/Istanbul': { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  // Russia
  'Europe/Moscow': { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
};

// Default to USD for US timezones and unknown timezones
const DEFAULT_CURRENCY = { code: 'USD', symbol: '$', name: 'US Dollar' };

function getCurrencyFromTimezone(timezone: string | null): { code: string; symbol: string; name: string } {
  if (!timezone) return DEFAULT_CURRENCY;
  return TIMEZONE_CURRENCY_MAP[timezone] || DEFAULT_CURRENCY;
}

async function getUserTimezone(supabaseClient: any, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseClient
      .from('user_notification_settings')
      .select('timezone')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return data.timezone;
  } catch {
    return null;
  }
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
    .eq('function_name', 'generate-host-package')
    .eq('operation', 'host_package')
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

// Host Package Generation Prompt - dynamic based on user's currency
function getHostPackagePrompt(currency: { code: string; symbol: string; name: string }) {
  const costFieldName = `estimated_cost_${currency.code.toLowerCase()}`;

  return `
You are a professional chef creating a "Host Package" to help a beginner cook execute a meal prep session perfectly.

Your job is to analyze the PROVIDED recipe data and create practical, accurate guidance. You must be PRECISE - use ONLY the ingredients and steps from the recipe, do not invent or omit anything.

## CRITICAL RULES

### Shopping List Rules:
1. USE ONLY THE EXACT INGREDIENTS PROVIDED - do not add or remove items
2. Keep the EXACT quantities from the recipe (scaled if target servings differ)
3. Use the EXACT names (e.g., "red onion" not "onion", "sumac" not omitted)
4. Categorize correctly: spices/seasonings → pantry, fresh herbs → produce, canned beans → proteins
5. Cost estimates should be realistic grocery store prices in ${currency.name} (${currency.code}, symbol: ${currency.symbol})

### Prep Timeline Rules:
1. BASE THE TIMELINE ON THE ACTUAL RECIPE INSTRUCTIONS - do not invent steps
2. Time estimates must be REALISTIC:
   - Draining canned beans = 1-2 minutes, not 10
   - Chopping 3 vegetables = 10-15 minutes, not 30
   - Simple salad assembly = 5 minutes, not 30
3. If the recipe says "15 min prep time", the timeline should total ~15-20 min of active work
4. Only include "day before" tasks if the recipe ACTUALLY benefits from it (marinades, doughs, etc.)
5. Highlight KEY TECHNIQUES that make the dish special (e.g., "massage salt into onions")
6. Order tasks logically - what actually needs to happen first?
7. ASSIGN A PHASE to each step:
   - "prep" = anything done BEFORE cooking starts (shopping, chopping, marinating, measuring)
   - "cooking" = active cooking time (sautéing, baking, simmering, grilling)
   - "finishing" = final steps AFTER main cooking (plating, garnishing, resting, serving)
8. DO NOT use event-relative times like "2 hours before event" - the timeline should be EVENT-TIME AGNOSTIC
9. Steps should just describe WHAT to do and HOW LONG it takes - the host decides when to start

### Equipment Rules:
1. List only what's ACTUALLY needed to cook this recipe
2. Don't include serving dishes or storage containers unless specifically needed
3. Be specific: "large mixing bowl" not just "bowl"

### Host Tips Rules:
1. Tips must be SPECIFIC TO THIS RECIPE, not generic cooking advice
2. Include the signature technique or "secret" that makes this dish work
3. Mention substitutions for hard-to-find ingredients
4. Include storage/make-ahead info if relevant to this dish

## RESPONSE FORMAT (return ONLY valid JSON):
{
  "currency": "${currency.code}",
  "shopping_list": {
    "produce": [
      { "item": "string - EXACT ingredient name from recipe", "quantity": "string with unit - EXACT from recipe", "estimated_cost": number (in ${currency.code}), "notes": "optional buying tip" }
    ],
    "proteins": [...],
    "dairy": [...],
    "pantry": [...],
    "frozen": [...],
    "other": [...]
  },
  "prep_timeline": [
    {
      "phase": "prep" | "cooking" | "finishing",
      "task": "string - specific action from the recipe instructions",
      "duration_minutes": number (REALISTIC - not inflated),
      "can_do_ahead": boolean (only true for prep phase tasks that can be done day-before),
      "tips": "optional - technique tip specific to this step"
    }
  ],
  "equipment_checklist": [
    {
      "item": "string - specific equipment",
      "quantity": number,
      "essential": boolean (true if cooking fails without it),
      "notes": "size/type needed"
    }
  ],
  "space_requirements": {
    "counter_space": "string",
    "stove_burners": number (0 if no stovetop needed),
    "oven_needed": boolean,
    "refrigerator_space": "string",
    "simultaneous_cooks": number
  },
  "host_tips": [
    "string - RECIPE-SPECIFIC tip that helps this dish succeed"
  ]
}

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;
}

const mistralClient = new OpenAI({
  apiKey: Deno.env.get('MISTRAL_API_KEY') || '',
  baseURL: 'https://api.mistral.ai/v1',
});

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
    const { recipe, event_details, user_id } = requestBody;

    // Validate inputs
    if (!recipe) {
      return new Response(
        JSON.stringify({ error: 'Recipe data is required', success: false }),
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
          message: `Daily limit reached for host package generation. You can generate ${rateLimit.limit} packages per day. Try again tomorrow.`,
          limit: rateLimit.limit,
          remaining: 0,
          resetAt: rateLimit.resetAt.toISOString(),
          success: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // Get user's timezone and currency
    const userTimezone = await getUserTimezone(supabaseClient, user_id);
    const currency = getCurrencyFromTimezone(userTimezone);
    console.log(`[generate-host-package] User timezone: ${userTimezone}, Currency: ${currency.code}`);

    // Build the context for the AI
    const recipeContext = `
RECIPE INFORMATION:
- Name: ${recipe.name}
- Description: ${recipe.description || 'N/A'}
- Original Servings: ${recipe.servings || 4}
- Prep Time: ${recipe.prep_time_minutes || 0} minutes
- Cook Time: ${recipe.cook_time_minutes || 0} minutes
- Skill Level: ${recipe.skill_level || 'intermediate'}

INGREDIENTS:
${JSON.stringify(recipe.ingredients || [], null, 2)}

INSTRUCTIONS:
${JSON.stringify(recipe.instructions || [], null, 2)}

EQUIPMENT NEEDED (from recipe):
${JSON.stringify(recipe.equipment_needed || [], null, 2)}
`;

    const eventContext = event_details ? `
EVENT DETAILS:
- Event Date: ${event_details.event_date || 'Not specified'}
- Event Time: ${event_details.event_time || 'Not specified'}
- Expected Participants: ${event_details.expected_participants || '4-6'}
- Target Servings: ${event_details.target_servings || recipe.servings || 4}
- Dietary Accommodations: ${event_details.dietary_accommodations?.join(', ') || 'None specified'}
- Host's Skill Level: ${event_details.host_skill_level || 'intermediate'}
` : `
EVENT DETAILS:
- Target Servings: ${recipe.servings || 4}
- Assume a typical meal prep session
`;

    const userMessage = `${recipeContext}\n${eventContext}\n\nGenerate a comprehensive host package for this meal prep event.`;

    console.log('[generate-host-package] Generating host package for:', recipe.name);

    // Call Mistral with currency-localized prompt
    const chatCompletion = await mistralClient.chat.completions.create({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: getHostPackagePrompt(currency) },
        { role: 'user', content: userMessage }
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
    const hostPackage = JSON.parse(responseContent || '{}');

    // Check for errors in response
    if (hostPackage.error) {
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'generate-host-package',
        operation: 'host_package',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'recipe',
        success: false,
        error_message: hostPackage.error,
        response_time_ms: responseTime,
      });

      return new Response(
        JSON.stringify({ error: hostPackage.error, success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Log successful usage
    await logUsage(supabaseClient, {
      user_id,
      function_name: 'generate-host-package',
      operation: 'host_package',
      model: 'mistral-small-latest',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      input_method: 'recipe',
      success: true,
      response_time_ms: responseTime,
    });

    // Get updated rate limit info
    const updatedRateLimit = await checkRateLimit(supabaseClient, user_id);

    console.log(`[generate-host-package] Successfully generated host package for: ${recipe.name}`);

    return new Response(
      JSON.stringify({
        host_package: hostPackage,
        recipe_name: recipe.name,
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
    console.error('[generate-host-package] Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'An unexpected error occurred',
        success: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
