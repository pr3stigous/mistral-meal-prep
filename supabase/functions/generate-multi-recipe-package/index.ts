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

// Timezone to currency mapping
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
    .eq('function_name', 'generate-multi-recipe-package')
    .eq('operation', 'multi_recipe_package')
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

// =====================================================
// PROMPTS
// =====================================================

function getMultiRecipeFullPackagePrompt(currency: { code: string; symbol: string; name: string }) {
  return `
You are a professional chef and meal prep logistics expert. You will receive MULTIPLE recipes (2-5) for a single meal prep event, and must produce THREE things in a single response:

1. A **recipe manifest** — an explicit accounting of how EVERY input recipe was handled
2. A **contribution board** — a UNIFIED, scaled, diet-adjusted list of items guests can bring (merged across all recipes)
3. A **host package** — a UNIFIED shopping list, cross-recipe prep timeline, equipment checklist, space requirements, and per-recipe tips

## RECIPE MANIFEST (CRITICAL — DO THIS FIRST)
Before generating anything else, analyze ALL input recipes and produce a manifest. This is your accountability checklist.

For EACH input recipe, you MUST declare:
- **handling**: one of "kept_separate", "merged_with", or "used_as_component"
  - "kept_separate": recipe is treated as its own distinct dish
  - "merged_with": recipe was combined with another very similar recipe (ONLY when recipes are nearly identical variations of the same dish — same core technique, same main ingredients, just minor differences)
  - "used_as_component": recipe's output serves as an ingredient in another recipe (e.g., a chili recipe that becomes the topping for a chili dogs recipe)
- If "merged_with": specify which recipe it was merged into and why. The merged recipe's unique ingredients/steps MUST still be included.
- If "used_as_component": specify which recipe uses it and how. The timeline should reflect making this recipe first.

RULES:
- NEVER silently drop a recipe. Every recipe MUST appear in the manifest.
- When merging: prefer keeping recipes SEPARATE unless they are truly the same dish. Two chili dog recipes with different approaches should each get their own timeline steps.
- When one recipe's output is an ingredient in another: note this as a "component_relationship" in cross_recipe_notes and adjust the shopping list (don't buy canned versions of something you're making from scratch).

## CROSS-RECIPE INTELLIGENCE
Analyze relationships between recipes:
- **Component relationships**: Does one recipe produce something another recipe needs? (e.g., homemade chili that can top chili dogs, homemade pasta sauce for a pasta recipe)
- **Shared technique opportunities**: Can prep steps be combined? (e.g., both recipes need diced onions — dice all onions at once)
- **Timing dependencies**: Must one recipe finish before another can start? (e.g., chili must be ready before assembling chili dogs)
- **Conflict warnings**: Do recipes compete for the same equipment simultaneously?

## CRITICAL CONTEXT
This is a MULTI-RECIPE meal prep event. Each recipe may have different original serving sizes, but ALL must be scaled to serve the same target group size. You must intelligently merge and deduplicate ingredients and equipment across recipes.

## SCALING RULES
- For EACH recipe, calculate its scale factor: (target_people / recipe_servings)
- If a recipe's scale factor is 1.0, keep its original quantities exactly
- Scale most ingredients linearly (e.g., 2 chicken breasts for 4 → 4 for 8)
- Scale SUB-LINEARLY for: salt, oil, butter, seasonings, spices (~1.5x when doubling)
- Equipment: scale for group (more cutting boards, bigger pots/bowls)
- Round quantities to practical amounts (0.75 → 1, 3.3 → 3.5, etc.)

## CROSS-RECIPE MERGING RULES
- **Same ingredient + same unit across recipes**: SUM the scaled quantities into ONE entry
  Example: Recipe A needs 2 cups flour, Recipe B needs 1 cup flour → 3 cups flour (one entry)
- **Same ingredient + different units**: keep as separate entries
  Example: Recipe A needs 2 tbsp butter, Recipe B needs 0.5 cups butter → two separate entries
- **Equipment**: deduplicate by name. If multiple recipes need a "cutting board", list it once
- **Component ingredients**: If Recipe A produces something Recipe B needs, do NOT list that ingredient separately for Recipe B. Instead, note it in cross_recipe_notes.

## DIETARY SUBSTITUTION RULES
When dietary accommodations are specified, apply to ALL recipes:
- **Gluten-Free**: Replace flour → GF flour, soy sauce → tamari, breadcrumbs → GF breadcrumbs
- **Dairy-Free**: Replace butter → olive oil/vegan butter, milk → oat milk, cheese → nutritional yeast
- **Vegan**: Apply dairy-free rules + replace eggs → flax eggs, honey → maple syrup, meat → plant protein
- **Vegetarian**: Replace meat with plant-based alternative
- **Nut-Free**: Replace nuts/nut butters with seeds/seed butters
- Only add substitution_note when an actual substitution was made

## CONTRIBUTION BOARD RULES
Each contribution is an item guests can volunteer to bring:
- Include ALL scaled ingredients from ALL recipes (merged/deduplicated)
- Include equipment items needed (deduplicated)
- Category must be one of: produce, proteins, dairy, pantry, frozen, other, equipment
- Type must be: "ingredient" or "equipment"

### STRICT NAME FORMATTING (CRITICAL):
- "name" must be the PLAIN ingredient or equipment name ONLY. Never include parenthetical notes, dietary labels, or substitution info in the name.
  - CORRECT: "flour" or "sour cream" or "cutting board"
  - WRONG: "flour (gluten-free alternative)" or "sour cream (for Recipe A)"
- "substitution_note" is a SEPARATE field. Put dietary swap info ONLY there. If no swap was made, set it to null.
- "unit" must be a recognizable short unit (e.g., "lbs", "oz", "cups", "tbsp", "tsp", "cloves", "cans", "pieces"). Prefer abbreviations.
- "quantity" must be a number representing the scaled, merged amount. Use practical numbers (not 0.333, use 0.5 or 1).

## HOST PACKAGE RULES

### Shopping List:
- MERGE ingredients across all recipes — the host shops ONCE for everything
- Cost estimates in ${currency.name} (${currency.code}, symbol: ${currency.symbol})
- Categorize correctly: spices/seasonings → pantry, fresh herbs → produce, canned beans → proteins
- Add notes like "for [Recipe Name]" when an item is unique to one recipe, to help the host while shopping
- If a component relationship exists (Recipe A makes something Recipe B needs), do NOT list the store-bought version for Recipe B

### Prep Timeline (CRITICAL FOR MULTI-RECIPE):
- **EVERY recipe in the manifest with handling "kept_separate" or "used_as_component" MUST have at least 2 prep timeline steps.** This is non-negotiable.
- Create an INTERLEAVED timeline that coordinates all recipes efficiently
- Start long-cook items FIRST, use passive time (oven, simmering, resting) to prep the next dish
- Identify parallel tasks: "While [Recipe A] bakes, prep [Recipe B] ingredients"
- Each step must include which recipe it belongs to in the "task" description using [Recipe Name] prefix
- Assign phase: "prep" (before cooking), "cooking" (active cooking), "finishing" (plating/serving)
- Realistic durations (chopping 3 vegs = 10-15 min, not 30)
- Timeline should be EVENT-TIME AGNOSTIC — just describe what to do and how long
- Adjust complexity for the stated event skill level
- For component relationships: schedule the component recipe to finish BEFORE the recipe that needs it

### Equipment:
- MERGE across all recipes — list each item ONCE
- Be specific: "large mixing bowl" not "bowl"
- Include size_guidance: a practical size/capacity recommendation for the group size
- Consider the combined recipe volume — multiple recipes may compete for stove/oven space
- Note in "notes" if an item is needed by multiple recipes simultaneously

### Host Tips:
- Include CROSS-RECIPE coordination tips: "Start [Recipe A] first since it takes longest"
- Include per-recipe signature techniques
- If component relationships exist, add a tip explaining the connection
- If AUTHOR TIPS are provided for any recipe, incorporate relevant ones. Attribute as "From [Recipe Name] recipe author:"

### Substitution Guide:
- Only include when dietary accommodations were specified AND substitutions were made
- Rate impact_on_taste (1-5, 5 = identical) and impact_on_texture (1-5, 5 = identical)
- Note which recipes are affected by each substitution

### Scaling Notes:
- Only include when any recipe's scale factor is >1.5x AND there are genuine concerns
- Flag cross-recipe conflicts: "Both recipes need the oven at different temperatures"

### Common Mistakes:
- List 2-3 mistakes per recipe (not generic advice) — EVERY kept_separate/used_as_component recipe MUST have at least 1 mistake entry
- Include cross-recipe coordination mistakes when relevant

### Storage Guide:
- Cover each recipe's finished dish and any prep-ahead components
- Note which components from different recipes can share storage space

## RESPONSE FORMAT (return ONLY valid JSON):
{
  "recipe_manifest": [
    {
      "input_recipe": "string — exact recipe name as provided",
      "handling": "kept_separate" | "merged_with" | "used_as_component",
      "merged_into": "string or null — only if handling is merged_with",
      "merge_reason": "string or null — only if handling is merged_with",
      "component_of": "string or null — only if handling is used_as_component, name of recipe that uses this",
      "component_usage": "string or null — how this recipe is used as a component",
      "prep_timeline_steps": number,
      "common_mistakes_count": number
    }
  ],
  "cross_recipe_notes": [
    {
      "type": "component_relationship" | "shared_technique" | "timing_dependency" | "conflict_warning",
      "note": "string — human-readable explanation",
      "affected_recipes": ["string — recipe names"],
      "shopping_impact": "string or null — how this affects the shopping list"
    }
  ],
  "contributions": [
    {
      "name": "string — PLAIN ingredient/equipment name only",
      "quantity": number,
      "unit": "string",
      "category": "produce" | "proteins" | "dairy" | "pantry" | "frozen" | "other" | "equipment",
      "type": "ingredient" | "equipment",
      "substitution_note": "string or null"
    }
  ],
  "host_package": {
    "currency": "${currency.code}",
    "shopping_list": {
      "produce": [{ "item": "string", "quantity": "string with unit", "estimated_cost": number, "notes": "optional — which recipe(s) need this" }],
      "proteins": [...],
      "dairy": [...],
      "pantry": [...],
      "frozen": [...],
      "other": [...]
    },
    "prep_timeline": [
      {
        "phase": "prep" | "cooking" | "finishing",
        "task": "string — include recipe name, e.g. '[Pasta] Boil water and cook penne'",
        "duration_minutes": number,
        "can_do_ahead": boolean,
        "tips": "optional technique tip"
      }
    ],
    "equipment_checklist": [
      { "item": "string", "quantity": number, "essential": boolean, "notes": "optional", "size_guidance": "string" }
    ],
    "space_requirements": {
      "counter_space": "string",
      "stove_burners": number,
      "oven_needed": boolean,
      "refrigerator_space": "string",
      "simultaneous_cooks": number
    },
    "host_tips": ["string — recipe-specific or cross-recipe coordination tip"],
    "substitution_guide": [
      { "original": "string", "substitute": "string", "impact_on_taste": number, "impact_on_texture": number, "recommendation": "string" }
    ],
    "scaling_notes": ["string — warnings about non-linear scaling"],
    "common_mistakes": [
      { "mistake": "string — include recipe name context", "prevention": "string", "fix": "string" }
    ],
    "storage_guide": [
      { "item": "string — dish or component with recipe name", "method": "string", "duration": "string", "reheating": "string or null" }
    ]
  }
}

VALIDATION CHECKLIST (verify before responding):
- recipe_manifest has exactly one entry per input recipe
- Every recipe with handling "kept_separate" or "used_as_component" has prep_timeline_steps >= 2
- Every recipe with handling "kept_separate" or "used_as_component" has common_mistakes_count >= 1
- cross_recipe_notes includes any component_relationship or timing_dependency found
- substitution_guide and scaling_notes may be empty arrays [] when not applicable
- common_mistakes and storage_guide are populated for each active recipe

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;
}

function getMultiRecipeHostPackageOnlyPrompt(currency: { code: string; symbol: string; name: string }) {
  return `
You are a professional chef and meal prep logistics expert. You will receive MULTIPLE recipes (2-5) for a single meal prep event, and must produce a **recipe manifest**, **cross-recipe analysis**, and **host package**.

The contribution board has already been generated separately. You only need to produce the recipe manifest, cross-recipe notes, and host package.

## RECIPE MANIFEST (CRITICAL — DO THIS FIRST)
Before generating anything else, analyze ALL input recipes and produce a manifest.

For EACH input recipe, declare:
- **handling**: "kept_separate", "merged_with", or "used_as_component"
  - "kept_separate": recipe is its own distinct dish
  - "merged_with": recipe was combined with a nearly identical recipe (same core technique + main ingredients)
  - "used_as_component": recipe's output is an ingredient in another recipe
- If "merged_with": specify which recipe and why. Unique ingredients/steps MUST still be included.
- If "used_as_component": specify which recipe uses it and how.

RULES:
- NEVER silently drop a recipe. Every input recipe MUST appear.
- Prefer keeping recipes SEPARATE unless they are truly the same dish.
- When one recipe's output is an ingredient in another, note it as a component_relationship.

## CROSS-RECIPE INTELLIGENCE
Analyze relationships:
- **Component relationships**: Does one recipe produce something another needs?
- **Shared technique opportunities**: Can prep steps be combined?
- **Timing dependencies**: Must one finish before another starts?
- **Conflict warnings**: Do recipes compete for equipment simultaneously?

## CRITICAL CONTEXT
This is a MULTI-RECIPE meal prep event. The ingredients provided are already at the correct serving sizes (no scaling needed). Your job is to MERGE them into a unified shopping list and create an efficient cross-recipe prep timeline.

## CROSS-RECIPE MERGING RULES
- **Same ingredient across recipes**: combine into one shopping list entry with total quantity
- **Equipment**: deduplicate — list each item once
- Track which recipes need each item using notes
- **Component ingredients**: If Recipe A produces something Recipe B needs, do NOT list the store-bought version for Recipe B

## HOST PACKAGE RULES

### Shopping List:
- MERGE ingredients across all recipes — the host shops ONCE
- Cost estimates in ${currency.name} (${currency.code}, symbol: ${currency.symbol})
- Categorize correctly: spices/seasonings → pantry, fresh herbs → produce, canned beans → proteins
- Add notes like "for [Recipe Name]" when an item is unique to one recipe
- If a component relationship exists, do NOT list the store-bought version

### Prep Timeline (CRITICAL FOR MULTI-RECIPE):
- **EVERY recipe with handling "kept_separate" or "used_as_component" MUST have at least 2 prep timeline steps.**
- Create an INTERLEAVED timeline that coordinates all recipes efficiently
- Start long-cook items FIRST, use passive time to prep the next dish
- Each step must include which recipe it belongs to using [Recipe Name] prefix
- Assign phase: "prep" | "cooking" | "finishing"
- Realistic durations
- Timeline should be EVENT-TIME AGNOSTIC
- For component relationships: schedule the component recipe to finish BEFORE the recipe that needs it

### Equipment:
- MERGE across all recipes — list each item ONCE
- Be specific with size_guidance for the group size
- Note if an item is needed by multiple recipes simultaneously

### Host Tips:
- Cross-recipe coordination tips + per-recipe techniques
- If component relationships exist, add a tip explaining the connection
- If AUTHOR TIPS are provided, incorporate relevant ones

### Common Mistakes:
- 2-3 recipe-SPECIFIC mistakes per recipe — EVERY active recipe MUST have at least 1
- Include cross-recipe coordination mistakes

### Storage Guide:
- Cover each recipe's finished dish and prep-ahead components

## RESPONSE FORMAT (return ONLY valid JSON):
{
  "recipe_manifest": [
    {
      "input_recipe": "string — exact recipe name",
      "handling": "kept_separate" | "merged_with" | "used_as_component",
      "merged_into": "string or null",
      "merge_reason": "string or null",
      "component_of": "string or null",
      "component_usage": "string or null",
      "prep_timeline_steps": number,
      "common_mistakes_count": number
    }
  ],
  "cross_recipe_notes": [
    {
      "type": "component_relationship" | "shared_technique" | "timing_dependency" | "conflict_warning",
      "note": "string",
      "affected_recipes": ["string"],
      "shopping_impact": "string or null"
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
        "task": "string — include recipe name",
        "duration_minutes": number,
        "can_do_ahead": boolean,
        "tips": "optional technique tip"
      }
    ],
    "equipment_checklist": [
      { "item": "string", "quantity": number, "essential": boolean, "notes": "optional", "size_guidance": "string" }
    ],
    "space_requirements": {
      "counter_space": "string",
      "stove_burners": number,
      "oven_needed": boolean,
      "refrigerator_space": "string",
      "simultaneous_cooks": number
    },
    "host_tips": ["string"],
    "common_mistakes": [
      { "mistake": "string", "prevention": "string", "fix": "string" }
    ],
    "storage_guide": [
      { "item": "string", "method": "string", "duration": "string", "reheating": "string or null" }
    ]
  }
}

VALIDATION CHECKLIST (verify before responding):
- recipe_manifest has exactly one entry per input recipe
- Every recipe with handling "kept_separate" or "used_as_component" has prep_timeline_steps >= 2
- Every recipe with handling "kept_separate" or "used_as_component" has common_mistakes_count >= 1
- cross_recipe_notes includes any component_relationship or timing_dependency found
- common_mistakes and storage_guide are populated for each active recipe

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;
}

// =====================================================
// MAIN HANDLER
// =====================================================

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
    const { recipes, event_details, user_id, mode } = requestBody;
    const packageMode: 'full_package' | 'host_package_only' = mode === 'host_package_only' ? 'host_package_only' : 'full_package';

    // Validate input
    if (!recipes || !Array.isArray(recipes) || recipes.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least 2 recipes are required', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (recipes.length > 5) {
      return new Response(
        JSON.stringify({ error: 'Maximum 5 recipes per event', success: false }),
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
          message: `Daily limit reached. You can generate ${rateLimit.limit} multi-recipe packages per day.`,
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

    const targetPeople = event_details?.expected_participants
      ? getGroupTargetCount(event_details.expected_participants, event_details?.custom_participant_count)
      : recipes[0].servings || 4;

    // Build per-recipe context
    const recipeNames = recipes.map((r: any) => r.name).join(', ');
    const recipesContext = recipes.map((r: any, i: number) => {
      const scaleFactor = targetPeople / (r.servings || 4);
      return `
--- RECIPE ${i + 1}: ${r.name} ---
- Description: ${r.description || 'N/A'}
- Original Servings: ${r.servings || 4}
- Scale Factor: ${scaleFactor.toFixed(2)}x (from ${r.servings || 4} to ${targetPeople} people)
- Prep Time: ${r.prep_time_minutes || 0} minutes
- Cook Time: ${r.cook_time_minutes || 0} minutes
- Skill Level: ${r.skill_level || 'intermediate'}

INGREDIENTS:
${JSON.stringify(r.ingredients || [], null, 2)}

INSTRUCTIONS:
${JSON.stringify(r.instructions || [], null, 2)}

EQUIPMENT NEEDED:
${JSON.stringify(r.equipment_needed || [], null, 2)}

AUTHOR TIPS:
${JSON.stringify(r.author_tips || [], null, 2)}
`;
    }).join('\n');

    const eventContext = `
EVENT DETAILS:
- Number of Recipes: ${recipes.length}
- Target People: ${targetPeople} (group range: ${event_details?.expected_participants || 'not specified'})
- Dietary Accommodations: ${event_details?.dietary_accommodations?.length > 0 ? event_details.dietary_accommodations.join(', ') : 'None'}
- Event Skill Level: ${event_details?.skill_level || 'intermediate'}
- Event Date: ${event_details?.event_date || 'Not specified'}
- Event Time: ${event_details?.event_time || 'Not specified'}
`;

    const systemPrompt = packageMode === 'host_package_only'
      ? getMultiRecipeHostPackageOnlyPrompt(currency)
      : getMultiRecipeFullPackagePrompt(currency);

    const recipeList = recipes.map((r: any, i: number) => `${i + 1}. "${r.name}"`).join(', ');

    const userMessage = packageMode === 'host_package_only'
      ? `${recipesContext}\n${eventContext}\n\nYou have ${recipes.length} recipes to process: ${recipeList}. Your recipe_manifest MUST contain exactly ${recipes.length} entries — one for each recipe listed above. Generate a unified host package (merged shopping list, interleaved prep timeline, equipment checklist, space requirements, per-recipe tips) for this meal prep event with ${targetPeople} people. The contribution board is handled separately.`
      : `${recipesContext}\n${eventContext}\n\nYou have ${recipes.length} recipes to process: ${recipeList}. Your recipe_manifest MUST contain exactly ${recipes.length} entries — one for each recipe listed above. Generate a complete multi-recipe event package (unified contributions + host package) for this meal prep event. Scale all quantities for ${targetPeople} people and merge/deduplicate across recipes.`;

    console.log(`[generate-multi-recipe-package] Mode: ${packageMode}, ${recipes.length} recipes (${recipeNames}), ${targetPeople} people`);

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
        function_name: 'generate-multi-recipe-package',
        operation: 'multi_recipe_package',
        model: 'mistral-small-latest',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        input_method: 'multi_recipe',
        success: false,
        error_message: result.error,
        response_time_ms: responseTime,
      });

      return new Response(
        JSON.stringify({ error: result.error, success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Server-side validation: check recipe_manifest covers all input recipes
    const manifest = result.recipe_manifest || [];
    const inputRecipeNames = recipes.map((r: any) => r.name);
    const manifestNames = manifest.map((m: any) => m.input_recipe);
    const missingRecipes = inputRecipeNames.filter(
      (name: string) => !manifestNames.some((mn: string) => mn.toLowerCase() === name.toLowerCase())
    );

    if (missingRecipes.length > 0) {
      console.warn(`[generate-multi-recipe-package] Manifest missing recipes: ${missingRecipes.join(', ')}. Adding as kept_separate.`);
      // Auto-fix: add missing recipes to manifest as kept_separate
      for (const name of missingRecipes) {
        manifest.push({
          input_recipe: name,
          handling: 'kept_separate',
          merged_into: null,
          merge_reason: null,
          component_of: null,
          component_usage: null,
          prep_timeline_steps: 0,
          common_mistakes_count: 0,
        });
      }
    }

    // Log successful usage
    await logUsage(supabaseClient, {
      user_id,
      function_name: 'generate-multi-recipe-package',
      operation: 'multi_recipe_package',
      model: 'mistral-small-latest',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      input_method: 'multi_recipe',
      success: true,
      response_time_ms: responseTime,
    });

    const updatedRateLimit = await checkRateLimit(supabaseClient, user_id);

    console.log(`[generate-multi-recipe-package] Success: ${recipes.length} recipes (${promptTokens}+${completionTokens} tokens, $${estimatedCost.toFixed(4)})`);

    return new Response(
      JSON.stringify({
        contributions: result.contributions || [],
        host_package: result.host_package || null,
        recipe_manifest: manifest,
        cross_recipe_notes: result.cross_recipe_notes || [],
        recipe_count: recipes.length,
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
    console.error('[generate-multi-recipe-package] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred', success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
