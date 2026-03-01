import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// Using OpenAI-compatible SDK pointed at Mistral AI API
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT = { limit: 9999, periodDays: 1 }; // TODO: restore to 10 after testing

const PRICING = {
  'mistral-small-latest': { prompt: 0.15, completion: 0.60 },
};

function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = PRICING[model as keyof typeof PRICING];
  if (!pricing) return 0;
  return (promptTokens / 1000000 * pricing.prompt) + (completionTokens / 1000000 * pricing.completion);
}

// Timezone to currency mapping (same as generate-host-package)
const TIMEZONE_CURRENCY_MAP: Record<string, { code: string; symbol: string; name: string }> = {
  'Asia/Tokyo': { code: 'JPY', symbol: '\u00a5', name: 'Japanese Yen' },
  'Europe/Paris': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Berlin': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Rome': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Madrid': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Amsterdam': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Brussels': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Vienna': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Dublin': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Helsinki': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Lisbon': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/Athens': { code: 'EUR', symbol: '\u20ac', name: 'Euro' },
  'Europe/London': { code: 'GBP', symbol: '\u00a3', name: 'British Pound' },
  'America/Toronto': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  'America/Vancouver': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  'America/Montreal': { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  'Australia/Sydney': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Melbourne': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Perth': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Australia/Brisbane': { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  'Asia/Kolkata': { code: 'INR', symbol: '\u20b9', name: 'Indian Rupee' },
  'Asia/Shanghai': { code: 'CNY', symbol: '\u00a5', name: 'Chinese Yuan' },
  'Asia/Hong_Kong': { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  'Asia/Singapore': { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  'Asia/Seoul': { code: 'KRW', symbol: '\u20a9', name: 'South Korean Won' },
  'America/Sao_Paulo': { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  'America/Mexico_City': { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  'Europe/Zurich': { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  'Europe/Stockholm': { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  'Europe/Oslo': { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  'Europe/Copenhagen': { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  'Pacific/Auckland': { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  'Asia/Bangkok': { code: 'THB', symbol: '\u0e3f', name: 'Thai Baht' },
  'Asia/Manila': { code: 'PHP', symbol: '\u20b1', name: 'Philippine Peso' },
  'Asia/Jakarta': { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  'Asia/Kuala_Lumpur': { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  'Asia/Dubai': { code: 'AED', symbol: '\u062f.\u0625', name: 'UAE Dirham' },
  'Asia/Jerusalem': { code: 'ILS', symbol: '\u20aa', name: 'Israeli Shekel' },
  'Africa/Johannesburg': { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  'Europe/Warsaw': { code: 'PLN', symbol: 'z\u0142', name: 'Polish Zloty' },
  'Europe/Prague': { code: 'CZK', symbol: 'K\u010d', name: 'Czech Koruna' },
  'Europe/Istanbul': { code: 'TRY', symbol: '\u20ba', name: 'Turkish Lira' },
  'Europe/Moscow': { code: 'RUB', symbol: '\u20bd', name: 'Russian Ruble' },
};

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
    .eq('function_name', 'generate-event-package')
    .eq('operation', 'event_package')
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

  return { allowed: used < RATE_LIMIT.limit, remaining, limit: RATE_LIMIT.limit, resetAt };
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

/** Use the upper end of each range so there's always enough food */
function getGroupTargetCount(range: string, customCount?: number): number {
  if (range === 'custom' && customCount && customCount > 0) return customCount;
  switch (range) {
    case '2-4': return 4;
    case '5-8': return 8;
    case '9-12': return 12;
    case '13+': return 16;
    default: return 8;
  }
}

function getFullPackagePrompt(currency: { code: string; symbol: string; name: string }) {
  return `
You are a professional chef and meal prep logistics expert. You will receive a recipe and event details, and must produce TWO things in a single response:

1. A **contribution board** — scaled, diet-adjusted list of items guests can bring
2. A **host package** — shopping list, prep timeline, equipment checklist, space requirements, and tips

## CRITICAL CONTEXT
The recipe was written for a certain number of servings, but the EVENT may have more or fewer people. You MUST scale quantities accordingly.

## SCALING RULES
- Calculate a scale factor: (target_people / recipe_servings). We use the UPPER end of the group range (e.g., "5-8" → 8 people) to ensure enough food.
- If scale factor is 1.0 (recipe servings match target), keep original quantities exactly — do NOT adjust.
- Scale most ingredients linearly (e.g., 2 chicken breasts for 4 people → 4 for 8 people)
- Scale SUB-LINEARLY for: salt, oil, butter, seasonings, spices (these don't double when servings double — use ~1.5x when doubling)
- Equipment: scale for group (more cutting boards, bigger pots/bowls)
- Round quantities to practical amounts (0.75 → 1, 3.3 → 3.5, etc.)

## DIETARY SUBSTITUTION RULES
When dietary accommodations are specified:
- **Gluten-Free**: Replace flour → GF flour, soy sauce → tamari, breadcrumbs → GF breadcrumbs. Add substitution_note.
- **Dairy-Free**: Replace butter → olive oil/vegan butter, milk → oat milk, cheese → nutritional yeast. Add substitution_note.
- **Vegan**: Apply dairy-free rules + replace eggs → flax eggs, honey → maple syrup, meat → plant protein. Add substitution_note.
- **Vegetarian**: Replace meat with plant-based alternative. Add substitution_note.
- **Nut-Free**: Replace nuts/nut butters with seeds/seed butters. Add substitution_note.
- Only add substitution_note when an actual substitution was made.

## CONTRIBUTION BOARD RULES
Each contribution is an item guests can volunteer to bring:
- Include ALL scaled ingredients from the recipe
- Include equipment items needed
- Category must be one of: produce, proteins, dairy, pantry, frozen, other, equipment
- Type must be: "ingredient" or "equipment"

### STRICT NAME FORMATTING (CRITICAL):
- "name" must be the PLAIN ingredient or equipment name ONLY. Never include parenthetical notes, dietary labels, or substitution info in the name.
  - CORRECT: "flour" or "sour cream" or "cutting board"
  - WRONG: "flour (gluten-free alternative)" or "sour cream (dairy-free alternative)"
- "substitution_note" is a SEPARATE field. Put dietary swap info ONLY there. If no swap was made, set it to null.
  - CORRECT substitution_note: "Use gluten-free flour instead of regular flour"
  - WRONG substitution_note: null (when a swap was actually made)
- "unit" must be a recognizable short unit (e.g., "lbs", "oz", "cups", "tbsp", "tsp", "cloves", "cans", "pieces"). Prefer abbreviations.
- "quantity" must be a number representing the scaled amount. Use practical numbers (not 0.333, use 0.5 or 1).

## EXAMPLE
Input recipe (serves 4): 2 lbs BBQ brisket, 12 oz tortilla chips, 2 cups shredded cheese, 0.5 cup jalapenos, 0.5 cup sour cream, 2 tbsp fresh lime juice
Event: 8 people (upper end of "5-8" range), Vegetarian + Dairy-Free accommodations. Recipe serves 4 so scale factor = 8/4 = 2x.

Example contributions output:
[
  {"name": "jackfruit", "quantity": 4, "unit": "lbs", "category": "produce", "type": "ingredient", "substitution_note": "Use jackfruit as vegetarian alternative for BBQ brisket"},
  {"name": "tortilla chips", "quantity": 24, "unit": "oz", "category": "pantry", "type": "ingredient", "substitution_note": null},
  {"name": "dairy-free shredded cheese", "quantity": 4, "unit": "cups", "category": "dairy", "type": "ingredient", "substitution_note": "Use dairy-free cheese instead of regular shredded cheese"},
  {"name": "jalapenos", "quantity": 1, "unit": "cup", "category": "produce", "type": "ingredient", "substitution_note": null},
  {"name": "dairy-free sour cream", "quantity": 1, "unit": "cup", "category": "dairy", "type": "ingredient", "substitution_note": "Use dairy-free sour cream alternative"},
  {"name": "fresh lime juice", "quantity": 4, "unit": "tbsp", "category": "produce", "type": "ingredient", "substitution_note": null}
]

Notice: names are clean, units are explicit, substitution_note is separate and only present when a swap happened.

## HOST PACKAGE RULES

### Shopping List:
- USE ONLY THE SCALED INGREDIENTS — do not add or remove items
- Cost estimates in ${currency.name} (${currency.code}, symbol: ${currency.symbol})
- Categorize correctly: spices/seasonings → pantry, fresh herbs → produce, canned beans → proteins

### Prep Timeline:
- Base on ACTUAL recipe instructions
- Assign phase: "prep" (before cooking), "cooking" (active cooking), "finishing" (plating/serving)
- Realistic durations (chopping 3 vegs = 10-15 min, not 30)
- Timeline should be EVENT-TIME AGNOSTIC — just describe what to do and how long
- Adjust complexity for the stated event skill level (simpler instructions for beginners)
- Keep total active time realistic for the stated event duration

### Equipment:
- List only what's ACTUALLY needed
- Be specific: "large mixing bowl" not "bowl"
- For each item, include size_guidance: a practical size/capacity recommendation for the group size
- Consider the scaled recipe volume — a doubled recipe may need a bigger pot
- Be specific about capacity: "at least 5-quart Dutch oven" not just "large pot"
- Examples: "6-quart or larger for this batch size", "12-inch skillet recommended for 8 servings"

### Host Tips:
- RECIPE-SPECIFIC, not generic
- Include the signature technique
- Mention substitutions for hard-to-find ingredients
- If AUTHOR TIPS are provided, incorporate relevant ones into host_tips and prep_timeline tips. Attribute them as "From the recipe author:" when appropriate.

### Substitution Guide:
- Only include when dietary accommodations were specified AND substitutions were made
- For EACH substitution, provide an honest assessment of how it affects the dish
- Rate impact_on_taste (1-5, 5 = identical to original) and impact_on_texture (1-5, 5 = identical)
- Give a candid recommendation: is the swap worth it, or should the host consider a different approach?
- Example: { "original": "heavy cream", "substitute": "cashew cream", "impact_on_taste": 4, "impact_on_texture": 3, "recommendation": "Works well in sauces but won't whip for garnish — skip the cream topping" }

### Scaling Notes:
- Only include when scale factor is >1.5x AND there are genuine scaling concerns
- Flag ingredients or techniques that don't scale linearly
- Include warnings about equipment capacity at this batch size
- Examples: "Baking soda doesn't scale linearly — use only 1.5x when doubling", "This batch may not fit in a standard stand mixer — mix in two batches"

### Common Mistakes:
- List 3-5 recipe-SPECIFIC mistakes people commonly make with THIS dish
- For each: what the mistake is, how to prevent it, and how to fix it if it happens
- Be specific to the recipe, not generic cooking advice
- Example: { "mistake": "Scrambled eggs in carbonara", "prevention": "Remove pan from heat completely before adding egg mixture, toss quickly", "fix": "If eggs start to scramble, add a splash of pasta water and toss vigorously off heat" }

### Storage Guide:
- Cover the finished dish and any components that can be prepped ahead
- Include method (fridge/freezer/counter), how long it keeps, and reheating instructions
- Be specific: "Stores in airtight container in fridge for 3-4 days. Reheat in oven at 350°F for 15 min — do NOT microwave (crust gets soggy)"
- Note which components freeze well vs. poorly

## RESPONSE FORMAT (return ONLY valid JSON):
{
  "contributions": [
    {
      "name": "string — PLAIN ingredient/equipment name only, NO parenthetical notes",
      "quantity": number,
      "unit": "string",
      "category": "produce" | "proteins" | "dairy" | "pantry" | "frozen" | "other" | "equipment",
      "type": "ingredient" | "equipment",
      "substitution_note": "string or null — only if ingredient was swapped for dietary reasons"
    }
  ],
  "host_package": {
    "currency": "${currency.code}",
    "shopping_list": {
      "produce": [{ "item": "string", "quantity": "string with unit", "estimated_cost": number, "notes": "optional" }],
      "proteins": [...],
      "dairy": [...],
      "pantry": [...],
      "frozen": [...],
      "other": [...]
    },
    "prep_timeline": [
      {
        "phase": "prep" | "cooking" | "finishing",
        "task": "string — specific action",
        "duration_minutes": number,
        "can_do_ahead": boolean,
        "tips": "optional technique tip"
      }
    ],
    "equipment_checklist": [
      { "item": "string", "quantity": number, "essential": boolean, "notes": "optional", "size_guidance": "string — practical size/capacity recommendation for this group size" }
    ],
    "space_requirements": {
      "counter_space": "string",
      "stove_burners": number,
      "oven_needed": boolean,
      "refrigerator_space": "string",
      "simultaneous_cooks": number
    },
    "host_tips": ["string — recipe-specific tip"],
    "substitution_guide": [
      { "original": "string", "substitute": "string", "impact_on_taste": number, "impact_on_texture": number, "recommendation": "string — honest assessment" }
    ],
    "scaling_notes": ["string — warnings about non-linear scaling at this batch size"],
    "common_mistakes": [
      { "mistake": "string — what goes wrong", "prevention": "string — how to avoid it", "fix": "string — how to recover" }
    ],
    "storage_guide": [
      { "item": "string — dish or component", "method": "string — fridge/freezer/counter", "duration": "string — how long it keeps", "reheating": "string or null — how to reheat, null if eaten cold" }
    ]
  }
}

Note: substitution_guide and scaling_notes may be empty arrays [] when not applicable. common_mistakes and storage_guide should always be populated.

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;
}

function getHostPackageOnlyPrompt(currency: { code: string; symbol: string; name: string }) {
  return `
You are a professional chef and meal prep logistics expert. You will receive a recipe and event details, and must produce a **host package** — shopping list, prep timeline, equipment checklist, space requirements, and tips.

The contribution board has already been generated separately. You only need to produce the host package.

## HOST PACKAGE RULES

### Shopping List:
- Based on the recipe ingredients provided (already at the correct serving size)
- Cost estimates in ${currency.name} (${currency.code}, symbol: ${currency.symbol})
- Categorize correctly: spices/seasonings → pantry, fresh herbs → produce, canned beans → proteins

### Prep Timeline:
- Base on ACTUAL recipe instructions
- Assign phase: "prep" (before cooking), "cooking" (active cooking), "finishing" (plating/serving)
- Realistic durations (chopping 3 vegs = 10-15 min, not 30)
- Timeline should be EVENT-TIME AGNOSTIC — just describe what to do and how long
- Adjust complexity for the stated event skill level (simpler instructions for beginners)
- Keep total active time realistic for the stated event duration

### Equipment:
- List only what's ACTUALLY needed
- Be specific: "large mixing bowl" not "bowl"
- For each item, include size_guidance: a practical size/capacity recommendation for the group size
- Consider the scaled recipe volume — a doubled recipe may need a bigger pot
- Be specific about capacity: "at least 5-quart Dutch oven" not just "large pot"

### Host Tips:
- RECIPE-SPECIFIC, not generic
- Include the signature technique
- Mention substitutions for hard-to-find ingredients
- If AUTHOR TIPS are provided, incorporate relevant ones into host_tips and prep_timeline tips. Attribute them as "From the recipe author:" when appropriate.

### Common Mistakes:
- List 3-5 recipe-SPECIFIC mistakes people commonly make with THIS dish
- For each: what the mistake is, how to prevent it, and how to fix it if it happens
- Be specific to the recipe, not generic cooking advice

### Storage Guide:
- Cover the finished dish and any components that can be prepped ahead
- Include method (fridge/freezer/counter), how long it keeps, and reheating instructions
- Note which components freeze well vs. poorly

## RESPONSE FORMAT (return ONLY valid JSON):
{
  "host_package": {
    "currency": "${currency.code}",
    "shopping_list": {
      "produce": [{ "item": "string", "quantity": "string with unit", "estimated_cost": number, "notes": "optional" }],
      "proteins": [...],
      "dairy": [...],
      "pantry": [...],
      "frozen": [...],
      "other": [...]
    },
    "prep_timeline": [
      {
        "phase": "prep" | "cooking" | "finishing",
        "task": "string — specific action",
        "duration_minutes": number,
        "can_do_ahead": boolean,
        "tips": "optional technique tip"
      }
    ],
    "equipment_checklist": [
      { "item": "string", "quantity": number, "essential": boolean, "notes": "optional", "size_guidance": "string — practical size/capacity recommendation" }
    ],
    "space_requirements": {
      "counter_space": "string",
      "stove_burners": number,
      "oven_needed": boolean,
      "refrigerator_space": "string",
      "simultaneous_cooks": number
    },
    "host_tips": ["string — recipe-specific tip"],
    "common_mistakes": [
      { "mistake": "string — what goes wrong", "prevention": "string — how to avoid it", "fix": "string — how to recover" }
    ],
    "storage_guide": [
      { "item": "string — dish or component", "method": "string — fridge/freezer/counter", "duration": "string — how long it keeps", "reheating": "string or null — how to reheat, null if eaten cold" }
    ]
  }
}

Note: common_mistakes and storage_guide should always be populated.

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;
}

const mistralClient = new OpenAI({
  apiKey: Deno.env.get('MISTRAL_API_KEY') || '',
  baseURL: 'https://api.mistral.ai/v1',
});

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const apiKey = Deno.env.get('MISTRAL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Mistral API key is not configured', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    const { recipe, event_details, user_id, mode } = requestBody;
    const packageMode: 'full_package' | 'host_package_only' = mode === 'host_package_only' ? 'host_package_only' : 'full_package';

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
          message: `Daily limit reached. You can generate ${rateLimit.limit} event packages per day.`,
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
    console.log(`[generate-event-package] User timezone: ${userTimezone}, Currency: ${currency.code}`);

    const targetPeople = event_details?.expected_participants
      ? getGroupTargetCount(event_details.expected_participants, event_details?.custom_participant_count)
      : recipe.servings || 4;

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

AUTHOR TIPS (from original recipe source):
${JSON.stringify(recipe.author_tips || [], null, 2)}
`;

    const eventContext = `
EVENT DETAILS:
- Target People: ${targetPeople} (group range: ${event_details?.expected_participants || 'not specified'})
- Scale Factor: ${(targetPeople / (recipe.servings || 4)).toFixed(2)}x from original ${recipe.servings || 4} servings
- Dietary Accommodations: ${event_details?.dietary_accommodations?.length > 0 ? event_details.dietary_accommodations.join(', ') : 'None'}
- Event Skill Level: ${event_details?.skill_level || recipe.skill_level || 'intermediate'}
- Event Date: ${event_details?.event_date || 'Not specified'}
- Event Time: ${event_details?.event_time || 'Not specified'}
`;

    const systemPrompt = packageMode === 'host_package_only'
      ? getHostPackageOnlyPrompt(currency)
      : getFullPackagePrompt(currency);

    const userMessage = packageMode === 'host_package_only'
      ? `${recipeContext}\n${eventContext}\n\nGenerate a host package (shopping list, prep timeline, equipment checklist, space requirements, tips) for this meal prep event with ${targetPeople} people. The contribution board is handled separately.`
      : `${recipeContext}\n${eventContext}\n\nGenerate a complete event package (contributions + host package) for this meal prep event. Scale all quantities for ${targetPeople} people.`;

    console.log(`[generate-event-package] Mode: ${packageMode}, recipe: ${recipe.name}, ${targetPeople} people`);

    const chatCompletion = await mistralClient.chat.completions.create({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
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
    const result = JSON.parse(responseContent || '{}');

    if (result.error) {
      await logUsage(supabaseClient, {
        user_id,
        function_name: 'generate-event-package',
        operation: 'event_package',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'recipe',
        success: false,
        error_message: result.error,
        response_time_ms: responseTime,
      });

      return new Response(
        JSON.stringify({ error: result.error, success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Log successful usage
    await logUsage(supabaseClient, {
      user_id,
      function_name: 'generate-event-package',
      operation: 'event_package',
      model: 'mistral-small-latest',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      input_method: 'recipe',
      success: true,
      response_time_ms: responseTime,
    });

    const updatedRateLimit = await checkRateLimit(supabaseClient, user_id);

    console.log(`[generate-event-package] Success for: ${recipe.name} (${promptTokens}+${completionTokens} tokens)`);

    return new Response(
      JSON.stringify({
        contributions: result.contributions || [],
        host_package: result.host_package || null,
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
    console.error('[generate-event-package] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred', success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
