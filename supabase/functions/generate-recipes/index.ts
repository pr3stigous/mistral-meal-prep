import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
// Using OpenAI-compatible SDK pointed at Mistral AI API
import OpenAI from 'https://deno.land/x/openai@v4.20.1/mod.ts';

// Note: Deno-specific imports and globals will show errors in a Node.js-based linter.
// These errors can be ignored and will work correctly when deployed to Supabase Functions.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limits
const RATE_LIMIT = { limit: 30, periodDays: 7 }; // 30 recipe generations per week

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
    .eq('function_name', 'generate-recipes')
    .eq('operation', 'recipe_generation')
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

// Image scoring configuration v2 - 207 images
// Priority: 1 = proteins/context-boosted, 2 = starches, 3 = dish types, 4+ = cuisine/breakfast/dessert
const IMAGE_SCORING_CONFIG: {
  image: string;
  priority: number;
  ingredientKeywords: string[];
  cuisineMatch?: string[];
  tagMatch?: string[];
  mealTypeMatch?: string[];
}[] = [
  // ============================================
  // PRIORITY 1: Proteins
  // ============================================
  // Chicken (5 variations)
  { image: 'protein-chicken-grilled', priority: 1, ingredientKeywords: ['grilled chicken', 'chicken breast', 'bbq chicken'], tagMatch: ['grilled', 'healthy'] },
  { image: 'protein-chicken-shredded', priority: 1, ingredientKeywords: ['shredded chicken', 'pulled chicken', 'chicken salad'] },
  { image: 'protein-chicken-crispy', priority: 1, ingredientKeywords: ['fried chicken', 'crispy chicken', 'chicken tender', 'chicken nugget', 'breaded chicken', 'chicken schnitzel'] },
  { image: 'protein-chicken-roasted', priority: 1, ingredientKeywords: ['roasted chicken', 'roast chicken', 'baked chicken', 'chicken thigh', 'whole chicken'] },
  { image: 'protein-chicken-stir-fry', priority: 1, ingredientKeywords: ['chicken stir fry', 'chicken stir-fry'], cuisineMatch: ['chinese', 'asian', 'thai'] },
  // Beef (5 variations)
  { image: 'protein-beef-sliced', priority: 1, ingredientKeywords: ['sliced beef', 'beef strips', 'flank steak', 'skirt steak'] },
  { image: 'protein-beef-ground', priority: 1, ingredientKeywords: ['ground beef', 'beef mince', 'minced beef', 'hamburger meat', 'taco meat'] },
  { image: 'protein-beef-steak', priority: 1, ingredientKeywords: ['steak', 'ribeye', 'sirloin', 'filet', 'new york strip', 't-bone', 'porterhouse'] },
  { image: 'protein-beef-stew-meat', priority: 1, ingredientKeywords: ['beef stew', 'beef chuck', 'braised beef', 'beef bourguignon', 'pot roast'] },
  { image: 'protein-beef-shredded', priority: 1, ingredientKeywords: ['shredded beef', 'pulled beef', 'barbacoa', 'beef brisket'] },
  // Seafood (5 variations)
  { image: 'protein-fish-white', priority: 1, ingredientKeywords: ['white fish', 'cod', 'tilapia', 'halibut', 'sea bass', 'snapper', 'sole', 'haddock'] },
  { image: 'protein-fish-salmon', priority: 1, ingredientKeywords: ['salmon', 'smoked salmon', 'salmon fillet'] },
  { image: 'protein-shrimp-cooked', priority: 1, ingredientKeywords: ['shrimp', 'prawn', 'scampi', 'shrimp cocktail'] },
  { image: 'protein-fish-grilled', priority: 1, ingredientKeywords: ['grilled fish', 'grilled salmon', 'fish fillet'] },
  { image: 'protein-seafood-mixed', priority: 1, ingredientKeywords: ['seafood', 'mixed seafood', 'cioppino', 'paella', 'bouillabaisse', 'clam', 'mussel', 'scallop', 'lobster', 'crab'] },
  // Plant proteins (5 variations)
  { image: 'protein-tofu-crispy', priority: 1, ingredientKeywords: ['crispy tofu', 'fried tofu', 'tofu stir fry'], tagMatch: ['vegan', 'vegetarian'] },
  { image: 'protein-tofu-soft', priority: 1, ingredientKeywords: ['silken tofu', 'soft tofu', 'tofu soup', 'mapo tofu'] },
  { image: 'protein-tempeh', priority: 1, ingredientKeywords: ['tempeh'], tagMatch: ['vegan', 'vegetarian'] },
  { image: 'protein-beans-cooked', priority: 1, ingredientKeywords: ['black beans', 'kidney beans', 'pinto beans', 'cannellini', 'white beans', 'navy beans', 'refried beans'] },
  { image: 'protein-lentils', priority: 1, ingredientKeywords: ['lentil', 'dal', 'daal', 'red lentil', 'green lentil', 'brown lentil'] },
  // Eggs (8 variations)
  { image: 'eggs-sunny-side', priority: 1, ingredientKeywords: ['sunny side', 'fried egg'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-scrambled', priority: 1, ingredientKeywords: ['scrambled egg'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-poached', priority: 1, ingredientKeywords: ['poached egg', 'eggs benedict'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-omelette', priority: 1, ingredientKeywords: ['omelette', 'omelet', 'frittata'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-hard-boiled', priority: 1, ingredientKeywords: ['hard boiled', 'hard-boiled', 'boiled egg'] },
  { image: 'eggs-fried-over', priority: 1, ingredientKeywords: ['over easy', 'over-easy', 'fried egg'] },
  { image: 'eggs-baked', priority: 1, ingredientKeywords: ['baked egg', 'egg casserole'] },
  { image: 'eggs-frittata', priority: 1, ingredientKeywords: ['frittata', 'egg bake', 'spanish tortilla'] },

  // ============================================
  // PRIORITY 2: Starches/Carbs
  // ============================================
  // Pasta (7 variations)
  { image: 'pasta-red-sauce', priority: 2, ingredientKeywords: ['spaghetti', 'marinara', 'tomato sauce', 'bolognese', 'arrabbiata', 'pomodoro'], cuisineMatch: ['italian'] },
  { image: 'pasta-creamy', priority: 2, ingredientKeywords: ['alfredo', 'carbonara', 'cream sauce', 'creamy pasta', 'fettuccine'], cuisineMatch: ['italian'] },
  { image: 'pasta-olive-oil', priority: 2, ingredientKeywords: ['aglio e olio', 'garlic oil pasta', 'pasta primavera'] },
  { image: 'pasta-baked', priority: 2, ingredientKeywords: ['baked ziti', 'baked pasta', 'pasta bake'] },
  { image: 'pasta-pesto', priority: 2, ingredientKeywords: ['pesto', 'basil pesto', 'pesto pasta'] },
  { image: 'pasta-soup', priority: 2, ingredientKeywords: ['pasta soup', 'minestrone', 'tortellini soup', 'orzo soup'] },
  { image: 'pasta-salad', priority: 2, ingredientKeywords: ['pasta salad', 'cold pasta', 'macaroni salad'] },
  // Asian noodles (8 variations)
  { image: 'noodles-ramen-broth', priority: 2, ingredientKeywords: ['ramen', 'ramen noodle'], cuisineMatch: ['japanese'] },
  { image: 'noodles-stir-fried', priority: 2, ingredientKeywords: ['lo mein', 'chow mein', 'yakisoba', 'stir fry noodle', 'fried noodle'] },
  { image: 'noodles-cold', priority: 2, ingredientKeywords: ['cold noodle', 'zaru soba', 'hiyashi'], cuisineMatch: ['japanese', 'korean'] },
  { image: 'noodles-pho-style', priority: 2, ingredientKeywords: ['pho', 'vietnamese noodle', 'rice noodle soup'], cuisineMatch: ['vietnamese'] },
  { image: 'noodles-pad-thai', priority: 2, ingredientKeywords: ['pad thai', 'thai noodle'], cuisineMatch: ['thai'] },
  { image: 'noodles-udon', priority: 2, ingredientKeywords: ['udon'], cuisineMatch: ['japanese'] },
  { image: 'noodles-glass', priority: 2, ingredientKeywords: ['glass noodle', 'cellophane noodle', 'japchae', 'spring roll'], cuisineMatch: ['korean', 'thai', 'chinese'] },
  { image: 'noodles-soba', priority: 2, ingredientKeywords: ['soba', 'buckwheat noodle'], cuisineMatch: ['japanese'] },
  // Rice & grains (12 variations)
  { image: 'rice-white-plain', priority: 2, ingredientKeywords: ['white rice', 'steamed rice', 'jasmine rice', 'basmati'] },
  { image: 'rice-fried', priority: 2, ingredientKeywords: ['fried rice', 'yangzhou', 'egg fried rice'], cuisineMatch: ['chinese', 'asian'] },
  { image: 'rice-pilaf', priority: 2, ingredientKeywords: ['rice pilaf', 'pilau', 'pulao'] },
  { image: 'rice-brown', priority: 2, ingredientKeywords: ['brown rice', 'whole grain rice'] },
  { image: 'rice-sushi', priority: 2, ingredientKeywords: ['sushi rice', 'sushi', 'maki', 'nigiri'], cuisineMatch: ['japanese'] },
  { image: 'rice-risotto', priority: 2, ingredientKeywords: ['risotto', 'arborio'], cuisineMatch: ['italian'] },
  { image: 'rice-coconut', priority: 2, ingredientKeywords: ['coconut rice', 'arroz con coco'], cuisineMatch: ['thai', 'caribbean', 'indian'] },
  { image: 'grain-quinoa', priority: 2, ingredientKeywords: ['quinoa'], tagMatch: ['healthy', 'gluten-free'] },
  { image: 'grain-couscous', priority: 2, ingredientKeywords: ['couscous'], cuisineMatch: ['moroccan', 'mediterranean'] },
  { image: 'grain-farro', priority: 2, ingredientKeywords: ['farro'], cuisineMatch: ['italian'] },
  { image: 'grain-bulgur', priority: 2, ingredientKeywords: ['bulgur', 'tabbouleh', 'kibbeh'], cuisineMatch: ['middle eastern', 'lebanese'] },
  { image: 'grain-polenta', priority: 2, ingredientKeywords: ['polenta', 'grits', 'cornmeal'], cuisineMatch: ['italian', 'southern'] },

  // ============================================
  // PRIORITY 3: Dish Types
  // ============================================
  // Soups & stews (15)
  { image: 'soup-creamy-orange', priority: 3, ingredientKeywords: ['butternut squash soup', 'carrot soup', 'pumpkin soup', 'sweet potato soup'] },
  { image: 'soup-creamy-green', priority: 3, ingredientKeywords: ['broccoli soup', 'pea soup', 'spinach soup', 'asparagus soup'] },
  { image: 'soup-clear-broth', priority: 3, ingredientKeywords: ['chicken broth', 'vegetable broth', 'consomme', 'clear soup'] },
  { image: 'soup-tomato', priority: 3, ingredientKeywords: ['tomato soup', 'gazpacho'] },
  { image: 'soup-chunky-vegetable', priority: 3, ingredientKeywords: ['vegetable soup', 'minestrone', 'garden soup'] },
  { image: 'soup-noodle', priority: 3, ingredientKeywords: ['chicken noodle soup', 'noodle soup'] },
  { image: 'soup-bean', priority: 3, ingredientKeywords: ['bean soup', 'black bean soup', 'white bean soup', 'ham and bean'] },
  { image: 'soup-miso', priority: 3, ingredientKeywords: ['miso soup', 'miso'], cuisineMatch: ['japanese'] },
  { image: 'soup-coconut-curry', priority: 3, ingredientKeywords: ['coconut soup', 'tom kha', 'tom kha gai', 'curry soup', 'coconut milk'], cuisineMatch: ['thai', 'indian'] },
  { image: 'stew-brown', priority: 3, ingredientKeywords: ['beef stew', 'lamb stew', 'irish stew', 'brown stew'] },
  { image: 'stew-red', priority: 3, ingredientKeywords: ['chili', 'goulash', 'texas chili', 'ropa vieja'] },
  { image: 'stew-green', priority: 3, ingredientKeywords: ['green curry', 'green chili', 'chile verde', 'saag'] },
  { image: 'soup-hot-sour', priority: 3, ingredientKeywords: ['hot and sour', 'hot sour', 'suan la tang'], cuisineMatch: ['chinese'] },
  { image: 'soup-chowder', priority: 3, ingredientKeywords: ['chowder', 'clam chowder', 'corn chowder', 'potato chowder'] },
  { image: 'soup-lentil', priority: 3, ingredientKeywords: ['lentil soup', 'dal soup', 'red lentil soup'] },
  // Salads (12)
  { image: 'salad-green-mixed', priority: 3, ingredientKeywords: ['mixed greens', 'garden salad', 'house salad', 'side salad'] },
  { image: 'salad-grain', priority: 3, ingredientKeywords: ['grain salad', 'farro salad', 'quinoa salad', 'wheat berry'] },
  { image: 'salad-chopped', priority: 3, ingredientKeywords: ['chopped salad', 'israeli salad', 'shirazi'], cuisineMatch: ['mediterranean', 'middle eastern'] },
  { image: 'salad-asian-slaw', priority: 3, ingredientKeywords: ['asian slaw', 'cabbage slaw', 'sesame slaw', 'coleslaw'], cuisineMatch: ['asian'] },
  { image: 'salad-caesar', priority: 3, ingredientKeywords: ['caesar salad', 'caesar'] },
  { image: 'salad-kale', priority: 3, ingredientKeywords: ['kale salad', 'massaged kale'] },
  { image: 'salad-bean', priority: 3, ingredientKeywords: ['bean salad', 'three bean', 'black bean salad', 'chickpea salad'] },
  { image: 'salad-cucumber', priority: 3, ingredientKeywords: ['cucumber salad', 'tzatziki', 'sunomono'] },
  { image: 'salad-tomato', priority: 3, ingredientKeywords: ['tomato salad', 'caprese', 'panzanella'] },
  { image: 'salad-pasta-cold', priority: 3, ingredientKeywords: ['pasta salad'] },
  { image: 'salad-potato', priority: 3, ingredientKeywords: ['potato salad', 'german potato'] },
  { image: 'salad-fruit', priority: 3, ingredientKeywords: ['fruit salad', 'mixed fruit'], mealTypeMatch: ['breakfast', 'dessert'] },
  // Bowls (12)
  { image: 'bowl-buddha', priority: 3, ingredientKeywords: ['buddha bowl', 'power bowl', 'nourish bowl', 'grain bowl'], tagMatch: ['healthy', 'vegan', 'vegetarian'] },
  { image: 'bowl-poke-style', priority: 3, ingredientKeywords: ['poke', 'poke bowl', 'ahi bowl'], cuisineMatch: ['hawaiian', 'japanese'] },
  { image: 'bowl-burrito', priority: 3, ingredientKeywords: ['burrito bowl', 'chipotle bowl', 'mexican bowl'], cuisineMatch: ['mexican'] },
  { image: 'bowl-mediterranean', priority: 3, ingredientKeywords: ['mediterranean bowl', 'greek bowl', 'falafel bowl'], cuisineMatch: ['mediterranean', 'greek'] },
  { image: 'bowl-smoothie', priority: 3, ingredientKeywords: ['smoothie bowl'], mealTypeMatch: ['breakfast'] },
  { image: 'bowl-acai', priority: 3, ingredientKeywords: ['acai', 'acai bowl'], mealTypeMatch: ['breakfast'] },
  { image: 'bowl-breakfast', priority: 3, ingredientKeywords: ['breakfast bowl', 'yogurt bowl'], mealTypeMatch: ['breakfast'] },
  { image: 'bowl-korean-style', priority: 3, ingredientKeywords: ['bibimbap', 'korean bowl', 'rice bowl'], cuisineMatch: ['korean'] },
  { image: 'bowl-curry', priority: 3, ingredientKeywords: ['curry bowl', 'curry rice', 'katsu curry'], cuisineMatch: ['indian', 'japanese', 'thai'] },
  { image: 'bowl-teriyaki', priority: 3, ingredientKeywords: ['teriyaki bowl', 'teriyaki'], cuisineMatch: ['japanese'] },
  { image: 'bowl-falafel', priority: 3, ingredientKeywords: ['falafel'], cuisineMatch: ['middle eastern', 'mediterranean'] },
  { image: 'bowl-grain-veggie', priority: 3, ingredientKeywords: ['veggie bowl', 'vegetable bowl'], tagMatch: ['vegetarian', 'vegan'] },
  // Sandwiches, wraps, toasts (10)
  { image: 'sandwich-grilled', priority: 3, ingredientKeywords: ['grilled cheese', 'panini', 'melt', 'cuban sandwich'] },
  { image: 'sandwich-stacked', priority: 3, ingredientKeywords: ['club sandwich', 'blt', 'deli sandwich', 'sub', 'hoagie'] },
  { image: 'sandwich-open-face', priority: 3, ingredientKeywords: ['open face', 'open-faced', 'tartine', 'bruschetta'] },
  { image: 'wrap-burrito', priority: 3, ingredientKeywords: ['burrito', 'wrap', 'breakfast burrito'], cuisineMatch: ['mexican'] },
  { image: 'wrap-spring-roll', priority: 3, ingredientKeywords: ['spring roll', 'summer roll', 'fresh roll', 'rice paper'], cuisineMatch: ['vietnamese', 'thai'] },
  { image: 'toast-avocado', priority: 3, ingredientKeywords: ['avocado toast', 'avo toast'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'toast-breakfast', priority: 3, ingredientKeywords: ['breakfast toast', 'eggs on toast'], mealTypeMatch: ['breakfast'] },
  { image: 'flatbread', priority: 3, ingredientKeywords: ['flatbread', 'naan', 'pita', 'lavash'], cuisineMatch: ['indian', 'middle eastern'] },
  { image: 'quesadilla', priority: 3, ingredientKeywords: ['quesadilla'], cuisineMatch: ['mexican'] },
  { image: 'taco-shell', priority: 3, ingredientKeywords: ['taco', 'street taco', 'fish taco'], cuisineMatch: ['mexican'] },
  // Baked dishes (10)
  { image: 'baked-casserole', priority: 3, ingredientKeywords: ['casserole', 'hotdish'] },
  { image: 'baked-lasagna', priority: 3, ingredientKeywords: ['lasagna', 'lasagne'], cuisineMatch: ['italian'] },
  { image: 'baked-enchiladas', priority: 3, ingredientKeywords: ['enchilada', 'enchiladas'], cuisineMatch: ['mexican'] },
  { image: 'baked-gratin', priority: 3, ingredientKeywords: ['gratin', 'au gratin', 'scalloped'], cuisineMatch: ['french'] },
  { image: 'baked-shepherd-pie', priority: 3, ingredientKeywords: ['shepherd pie', 'shepherds pie', 'cottage pie'], cuisineMatch: ['british', 'irish'] },
  { image: 'baked-mac-cheese', priority: 3, ingredientKeywords: ['mac and cheese', 'macaroni and cheese', 'mac n cheese'], cuisineMatch: ['american'] },
  { image: 'baked-stuffed-pepper', priority: 3, ingredientKeywords: ['stuffed pepper', 'stuffed bell pepper'] },
  { image: 'baked-quiche', priority: 3, ingredientKeywords: ['quiche', 'quiche lorraine'], cuisineMatch: ['french'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'baked-pot-pie', priority: 3, ingredientKeywords: ['pot pie', 'chicken pot pie'] },
  { image: 'baked-one-pan', priority: 3, ingredientKeywords: ['sheet pan', 'one pan', 'one-pan', 'one pot'] },
  // Roasted vegetables (12)
  { image: 'veg-roasted-mixed', priority: 3, ingredientKeywords: ['roasted vegetables', 'roasted veggies', 'sheet pan vegetables'] },
  { image: 'veg-roasted-root', priority: 3, ingredientKeywords: ['roasted root', 'root vegetables', 'roasted carrots', 'roasted parsnips'] },
  { image: 'veg-grilled', priority: 3, ingredientKeywords: ['grilled vegetables', 'grilled veggies', 'grilled zucchini'] },
  { image: 'veg-steamed', priority: 3, ingredientKeywords: ['steamed vegetables', 'steamed broccoli'] },
  { image: 'veg-sauteed', priority: 3, ingredientKeywords: ['sauteed vegetables', 'sautéed', 'pan fried vegetables'] },
  { image: 'veg-stir-fry', priority: 3, ingredientKeywords: ['vegetable stir fry', 'stir fry vegetables', 'stir-fry'], cuisineMatch: ['asian', 'chinese'] },
  { image: 'veg-roasted-broccoli', priority: 3, ingredientKeywords: ['roasted broccoli', 'charred broccoli'] },
  { image: 'veg-roasted-cauliflower', priority: 3, ingredientKeywords: ['roasted cauliflower', 'cauliflower steak'] },
  { image: 'veg-roasted-brussels', priority: 3, ingredientKeywords: ['brussels sprouts', 'roasted brussels'] },
  { image: 'veg-mashed-potato', priority: 3, ingredientKeywords: ['mashed potato', 'mashed potatoes', 'potato puree'] },
  { image: 'veg-baked-potato', priority: 3, ingredientKeywords: ['baked potato', 'jacket potato', 'loaded potato'] },
  { image: 'veg-fries', priority: 3, ingredientKeywords: ['fries', 'french fries', 'potato wedges', 'sweet potato fries'] },

  // ============================================
  // PRIORITY 4: Cuisine-inspired (fallback)
  // ============================================
  { image: 'cuisine-chinese-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['chinese'] },
  { image: 'cuisine-japanese-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['japanese'] },
  { image: 'cuisine-korean-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['korean'] },
  { image: 'cuisine-thai-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['thai'] },
  { image: 'cuisine-vietnamese-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['vietnamese'] },
  { image: 'cuisine-indian-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['indian'] },
  { image: 'cuisine-indian-curry', priority: 4, ingredientKeywords: ['curry', 'tikka', 'masala', 'korma', 'vindaloo'], cuisineMatch: ['indian'] },
  { image: 'cuisine-dim-sum', priority: 4, ingredientKeywords: ['dim sum', 'dumpling', 'gyoza', 'wonton', 'bao'], cuisineMatch: ['chinese'] },
  { image: 'cuisine-sushi-plate', priority: 4, ingredientKeywords: ['sushi', 'sashimi', 'maki roll'], cuisineMatch: ['japanese'] },
  { image: 'cuisine-greek-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['greek'] },
  { image: 'cuisine-mezze', priority: 4, ingredientKeywords: ['mezze', 'hummus', 'baba ganoush', 'falafel'], cuisineMatch: ['middle eastern', 'lebanese', 'turkish'] },
  { image: 'cuisine-moroccan', priority: 4, ingredientKeywords: ['tagine', 'moroccan'], cuisineMatch: ['moroccan'] },
  { image: 'cuisine-turkish', priority: 4, ingredientKeywords: [], cuisineMatch: ['turkish'] },
  { image: 'cuisine-lebanese', priority: 4, ingredientKeywords: [], cuisineMatch: ['lebanese'] },
  { image: 'cuisine-persian', priority: 4, ingredientKeywords: ['persian rice', 'tahdig'], cuisineMatch: ['persian', 'iranian'] },
  { image: 'cuisine-italian-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['italian'] },
  { image: 'cuisine-french-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['french'] },
  { image: 'cuisine-spanish-plate', priority: 4, ingredientKeywords: ['tapas', 'patatas bravas'], cuisineMatch: ['spanish'] },
  { image: 'cuisine-german-plate', priority: 4, ingredientKeywords: ['schnitzel', 'bratwurst', 'sauerkraut'], cuisineMatch: ['german'] },
  { image: 'cuisine-mexican-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['mexican'] },
  { image: 'cuisine-tex-mex', priority: 4, ingredientKeywords: ['nachos', 'fajita'], cuisineMatch: ['tex-mex'] },
  { image: 'cuisine-brazilian', priority: 4, ingredientKeywords: ['feijoada', 'picanha'], cuisineMatch: ['brazilian'] },
  { image: 'cuisine-cajun', priority: 4, ingredientKeywords: ['jambalaya', 'gumbo', 'cajun', 'creole', 'etouffee'], cuisineMatch: ['cajun', 'creole'] },
  { image: 'cuisine-southern-us', priority: 4, ingredientKeywords: ['southern', 'soul food', 'fried chicken', 'collard greens'], cuisineMatch: ['southern', 'american'] },
  { image: 'cuisine-caribbean', priority: 4, ingredientKeywords: ['jerk', 'plantain', 'rice and peas'], cuisineMatch: ['caribbean', 'jamaican'] },

  // ============================================
  // PRIORITY 5: Breakfast
  // ============================================
  { image: 'breakfast-pancakes', priority: 5, ingredientKeywords: ['pancake', 'pancakes', 'hotcakes', 'flapjacks'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-waffles', priority: 5, ingredientKeywords: ['waffle', 'waffles', 'belgian waffle'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-french-toast', priority: 5, ingredientKeywords: ['french toast', 'pain perdu'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-oatmeal', priority: 5, ingredientKeywords: ['oatmeal', 'oats', 'porridge', 'overnight oats'], mealTypeMatch: ['breakfast'] },
  { image: 'breakfast-granola', priority: 5, ingredientKeywords: ['granola', 'muesli', 'parfait'], mealTypeMatch: ['breakfast'] },
  { image: 'breakfast-crepes', priority: 5, ingredientKeywords: ['crepe', 'crepes'], mealTypeMatch: ['breakfast', 'brunch'], cuisineMatch: ['french'] },
  { image: 'breakfast-hash', priority: 5, ingredientKeywords: ['hash', 'breakfast hash', 'corned beef hash', 'hash browns'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-bagel', priority: 5, ingredientKeywords: ['bagel', 'lox'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-muffin', priority: 5, ingredientKeywords: ['muffin', 'blueberry muffin'], mealTypeMatch: ['breakfast'] },
  { image: 'breakfast-porridge', priority: 5, ingredientKeywords: ['congee', 'jook', 'rice porridge'], mealTypeMatch: ['breakfast'], cuisineMatch: ['chinese', 'asian'] },
  { image: 'breakfast-shakshuka', priority: 5, ingredientKeywords: ['shakshuka', 'eggs in purgatory'], mealTypeMatch: ['breakfast', 'brunch'], cuisineMatch: ['middle eastern'] },
  { image: 'breakfast-english', priority: 5, ingredientKeywords: ['full english', 'english breakfast', 'fry up'], mealTypeMatch: ['breakfast'], cuisineMatch: ['british'] },

  // ============================================
  // PRIORITY 6: Desserts
  // ============================================
  { image: 'dessert-cake-chocolate', priority: 6, ingredientKeywords: ['chocolate cake', 'devil food', 'chocolate layer'], tagMatch: ['dessert'] },
  { image: 'dessert-cake-vanilla', priority: 6, ingredientKeywords: ['vanilla cake', 'birthday cake', 'layer cake', 'white cake'], tagMatch: ['dessert'] },
  { image: 'dessert-cake-carrot', priority: 6, ingredientKeywords: ['carrot cake'], tagMatch: ['dessert'] },
  { image: 'dessert-cake-cheese', priority: 6, ingredientKeywords: ['cheesecake', 'cheese cake'], tagMatch: ['dessert'] },
  { image: 'dessert-cake-pound', priority: 6, ingredientKeywords: ['pound cake', 'loaf cake', 'bundt cake'], tagMatch: ['dessert'] },
  { image: 'dessert-cupcake', priority: 6, ingredientKeywords: ['cupcake'], tagMatch: ['dessert'] },
  { image: 'dessert-cookie-chocolate', priority: 6, ingredientKeywords: ['chocolate chip cookie', 'cookie'], tagMatch: ['dessert'] },
  { image: 'dessert-cookie-variety', priority: 6, ingredientKeywords: ['cookies', 'sugar cookie', 'snickerdoodle', 'oatmeal cookie'], tagMatch: ['dessert'] },
  { image: 'dessert-brownie', priority: 6, ingredientKeywords: ['brownie', 'fudge brownie'], tagMatch: ['dessert'] },
  { image: 'dessert-blondie', priority: 6, ingredientKeywords: ['blondie', 'butterscotch bar'], tagMatch: ['dessert'] },
  { image: 'dessert-bar', priority: 6, ingredientKeywords: ['bar', 'lemon bar', 'cookie bar', 'seven layer'], tagMatch: ['dessert'] },
  { image: 'dessert-pie-fruit', priority: 6, ingredientKeywords: ['apple pie', 'cherry pie', 'berry pie', 'fruit pie', 'peach pie'], tagMatch: ['dessert'] },
  { image: 'dessert-pie-cream', priority: 6, ingredientKeywords: ['cream pie', 'banana cream', 'coconut cream', 'key lime'], tagMatch: ['dessert'] },
  { image: 'dessert-tart-fruit', priority: 6, ingredientKeywords: ['fruit tart', 'berry tart', 'tart'], tagMatch: ['dessert'] },
  { image: 'dessert-tart-custard', priority: 6, ingredientKeywords: ['custard tart', 'egg tart', 'portuguese tart'], tagMatch: ['dessert'] },
  { image: 'dessert-galette', priority: 6, ingredientKeywords: ['galette', 'crostata', 'rustic pie'], tagMatch: ['dessert'] },
  { image: 'dessert-ice-cream', priority: 6, ingredientKeywords: ['ice cream', 'gelato', 'sundae'], tagMatch: ['dessert'] },
  { image: 'dessert-sorbet', priority: 6, ingredientKeywords: ['sorbet', 'sherbet'], tagMatch: ['dessert'] },
  { image: 'dessert-popsicle', priority: 6, ingredientKeywords: ['popsicle', 'ice pop', 'paleta'], tagMatch: ['dessert'] },
  { image: 'dessert-frozen-yogurt', priority: 6, ingredientKeywords: ['frozen yogurt', 'froyo'], tagMatch: ['dessert'] },
  { image: 'dessert-pudding', priority: 6, ingredientKeywords: ['pudding', 'chocolate pudding', 'vanilla pudding', 'rice pudding'], tagMatch: ['dessert'] },
  { image: 'dessert-flan', priority: 6, ingredientKeywords: ['flan', 'creme caramel', 'crème caramel', 'leche flan'], tagMatch: ['dessert'] },
  { image: 'dessert-panna-cotta', priority: 6, ingredientKeywords: ['panna cotta'], tagMatch: ['dessert'], cuisineMatch: ['italian'] },
  { image: 'dessert-mousse', priority: 6, ingredientKeywords: ['mousse', 'chocolate mousse'], tagMatch: ['dessert'] },
  { image: 'dessert-tiramisu', priority: 6, ingredientKeywords: ['tiramisu'], tagMatch: ['dessert'], cuisineMatch: ['italian'] },
  { image: 'dessert-croissant', priority: 6, ingredientKeywords: ['croissant'], mealTypeMatch: ['breakfast'], cuisineMatch: ['french'] },
  { image: 'dessert-danish', priority: 6, ingredientKeywords: ['danish', 'pastry'], tagMatch: ['dessert'], mealTypeMatch: ['breakfast'] },
  { image: 'dessert-donut', priority: 6, ingredientKeywords: ['donut', 'doughnut', 'glazed donut'], tagMatch: ['dessert'], mealTypeMatch: ['breakfast'] },
  { image: 'dessert-fruit-crisp', priority: 6, ingredientKeywords: ['crisp', 'crumble', 'cobbler', 'apple crisp', 'berry crumble'], tagMatch: ['dessert'] },

  // ============================================
  // PRIORITY 7: Snacks & Drinks (lowest)
  // ============================================
  { image: 'snack-hummus-plate', priority: 7, ingredientKeywords: ['hummus', 'hummus plate'] },
  { image: 'snack-bruschetta', priority: 7, ingredientKeywords: ['bruschetta', 'crostini'], cuisineMatch: ['italian'] },
  { image: 'snack-stuffed-mushroom', priority: 7, ingredientKeywords: ['stuffed mushroom'] },
  { image: 'snack-deviled-eggs', priority: 7, ingredientKeywords: ['deviled egg', 'devilled egg'] },
  { image: 'snack-chips-dip', priority: 7, ingredientKeywords: ['chips and dip', 'guacamole', 'salsa', 'queso dip'] },
  { image: 'snack-cheese-board', priority: 7, ingredientKeywords: ['cheese board', 'cheese plate', 'charcuterie'] },
  { image: 'snack-popcorn', priority: 7, ingredientKeywords: ['popcorn'] },
  { image: 'snack-nuts-mixed', priority: 7, ingredientKeywords: ['mixed nuts', 'roasted nuts', 'trail mix'] },
  { image: 'snack-edamame', priority: 7, ingredientKeywords: ['edamame'] },
  { image: 'snack-veggie-sticks', priority: 7, ingredientKeywords: ['veggie sticks', 'crudites', 'vegetable platter'] },
  { image: 'drink-smoothie-green', priority: 7, ingredientKeywords: ['green smoothie', 'green juice', 'spinach smoothie', 'kale smoothie'] },
  { image: 'drink-smoothie-berry', priority: 7, ingredientKeywords: ['berry smoothie', 'mixed berry', 'strawberry smoothie'] },
  { image: 'drink-smoothie-tropical', priority: 7, ingredientKeywords: ['tropical smoothie', 'mango smoothie', 'pineapple smoothie'] },
  { image: 'drink-latte', priority: 7, ingredientKeywords: ['latte', 'cappuccino', 'coffee'] },
  { image: 'drink-tea', priority: 7, ingredientKeywords: ['tea', 'chai', 'matcha'] },
];

// Get image URL based on weighted scoring of recipe attributes
// Includes context-aware priority boosting for desserts, breakfast, bowls, soups, salads
function getRecipeImageUrl(
  recipe: { name?: string; cuisine?: string; tags?: string[]; ingredients?: { name: string }[] },
  mealType: string,
  supabaseUrl: string
): string {
  const baseUrl = `${supabaseUrl}/storage/v1/object/public/recipe-stock-images`;
  const scores: { image: string; priority: number; score: number; matches: string[] }[] = [];

  const ingredientNames = recipe.ingredients?.map(i => i.name.toLowerCase()) || [];
  const recipeName = recipe.name?.toLowerCase() || '';
  const cuisineLower = recipe.cuisine?.toLowerCase().replace(/[^a-z\s]/g, '') || '';
  const tagsLower = recipe.tags?.map(t => t.toLowerCase()) || [];
  const mealTypeLower = mealType?.toLowerCase() || '';

  // Context detection for priority boosting
  const isDessert = tagsLower.includes('dessert') || tagsLower.includes('baking') ||
                    tagsLower.includes('sweet') || mealTypeLower === 'dessert' || mealTypeLower === 'snack';
  const isBreakfast = mealTypeLower === 'breakfast' || mealTypeLower === 'brunch';

  for (const config of IMAGE_SCORING_CONFIG) {
    let score = 0;
    const matches: string[] = [];
    let effectivePriority = config.priority;

    // Context-aware priority boosting
    if (isDessert && config.image.startsWith('dessert-')) {
      effectivePriority = 1;
      score += 5;
      matches.push('context:dessert');
    }
    if (isBreakfast && (config.image.startsWith('breakfast-') || config.image.startsWith('eggs-'))) {
      effectivePriority = Math.min(effectivePriority, 1);
      score += 3;
      matches.push('context:breakfast');
    }
    if (recipeName.includes('bowl') && config.image.startsWith('bowl-')) {
      effectivePriority = 1;
      score += 8;
      matches.push('context:bowl');
    }
    if ((recipeName.includes('soup') || tagsLower.includes('soup')) &&
        (config.image.startsWith('soup-') || config.image.startsWith('stew-'))) {
      effectivePriority = 1;
      score += 8;
      matches.push('context:soup');
    }
    if (recipeName.includes('salad') && config.image.startsWith('salad-')) {
      effectivePriority = 1;
      score += 8;
      matches.push('context:salad');
    }

    // Score ingredient keyword matches
    for (const keyword of config.ingredientKeywords) {
      // Recipe name exact phrase match (10 points - very strong)
      if (recipeName.includes(keyword) && keyword.length > 3) {
        score += 10;
        matches.push(`name:"${keyword}"`);
      }
      // Stricter ingredient matching
      for (const ingredientName of ingredientNames) {
        if (keyword.length >= 4) {
          if (ingredientName === keyword || ingredientName.includes(keyword) ||
              (keyword.length > ingredientName.length && keyword.includes(ingredientName) && ingredientName.length >= 4)) {
            score += 2;
            matches.push(`ingredient:${keyword}`);
            break;
          }
        } else if (ingredientName === keyword) {
          score += 2;
          matches.push(`ingredient:${keyword}`);
          break;
        }
      }
    }

    // Score cuisine match (5 points)
    if (config.cuisineMatch && cuisineLower) {
      for (const cuisine of config.cuisineMatch) {
        if (cuisineLower.includes(cuisine) || cuisine.includes(cuisineLower)) {
          score += 5;
          matches.push(`cuisine:${cuisine}`);
          break;
        }
      }
    }

    // Score tag matches (3 points each)
    if (config.tagMatch) {
      for (const tag of config.tagMatch) {
        if (tagsLower.some(t => t === tag || t.includes(tag))) {
          score += 3;
          matches.push(`tag:${tag}`);
        }
      }
    }

    // Score meal type match (3 points)
    if (config.mealTypeMatch && mealTypeLower) {
      if (config.mealTypeMatch.some(mt => mealTypeLower.includes(mt))) {
        score += 3;
        matches.push(`mealType:${mealTypeLower}`);
      }
    }

    if (score > 0) {
      scores.push({ image: config.image, priority: effectivePriority, score, matches });
    }
  }

  // Sort by priority first, then by score
  scores.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.score - a.score;
  });

  // Log scoring for debugging
  if (scores.length > 0) {
    console.log(`Image scoring for "${recipe.name || recipe.ingredients?.[0]?.name || 'recipe'}":`);
    scores.slice(0, 3).forEach(s => {
      console.log(`  ${s.image}: P${s.priority}, ${s.score}pts [${s.matches.join(', ')}]`);
    });
  }

  // Return highest scoring image, or fallback
  if (scores.length > 0 && scores[0].score >= 2) {
    return `${baseUrl}/${scores[0].image}.png`;
  }

  // Fallback to buddha bowl (generic healthy dish)
  return `${baseUrl}/bowl-buddha.png`;
}

const mistralClient = new OpenAI({
  apiKey: Deno.env.get('MISTRAL_API_KEY') || '',
  baseURL: 'https://api.mistral.ai/v1',
});
const supabaseUrl = Deno.env.get('SUPABASE_URL');

// Parse Mode: Extract structured recipe data from raw text
async function handleParseMode(rawRecipeText: string): Promise<Response> {
  if (!rawRecipeText || rawRecipeText.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: 'Recipe text is required for parsing' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }

  const parseSystemPrompt = `
You are a recipe parsing assistant. Your job is to extract structured data from raw recipe text.
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
  "equipment_needed": ["pot", "pan", "blender", etc.]
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
3. Meal prep score (1-5):
   - 1: Doesn't store well, best eaten immediately
   - 2: Lasts 1-2 days refrigerated
   - 3: Lasts 3-4 days, reheats okay
   - 4: Lasts 5+ days, reheats well, portions easily
   - 5: Freezer-friendly, perfect for batch cooking
4. If cooking times aren't specified, estimate reasonable values.
5. Calculate nutritional info per serving using standard values.
6. Extract all equipment mentioned or obviously needed.

You MUST respond ONLY with valid JSON. No markdown, no explanations.
`;

  try {
    const chatCompletion = await mistralClient.chat.completions.create({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: parseSystemPrompt },
        { role: 'user', content: `Parse this recipe:\n\n${rawRecipeText}` }
      ],
      response_format: { type: 'json_object' },
    });

    const responseContent = chatCompletion.choices[0].message.content;
    const parsedRecipe = JSON.parse(responseContent);

    // Assign image based on recipe attributes
    parsedRecipe.image_url = getRecipeImageUrl(parsedRecipe, '', supabaseUrl || '');

    return new Response(JSON.stringify({ recipe: parsedRecipe, success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Parse mode error:', error);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}

serve(async (req: Request) => {
  // This is needed if you're planning to invoke your function from a browser.
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
        JSON.stringify({ error: 'Mistral API key is not configured. Please set MISTRAL_API_KEY environment variable.' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // Create Supabase client with service role for logging
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestBody = await req.json();
    const { mode = 'generate', user_id } = requestBody;

    // Route to parse mode if requested (no rate limit for parsing)
    if (mode === 'parse') {
      return await handleParseMode(requestBody.rawRecipeText);
    }

    // For generate mode, require user_id and check rate limit
    if (!user_id) {
      return new Response(JSON.stringify({
        error: 'user_id is required for rate limiting',
        success: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Check rate limit
    const rateLimit = await checkRateLimit(supabaseClient, user_id);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({
        error: 'RATE_LIMITED',
        message: `Weekly limit reached for recipe generation. You have used all ${rateLimit.limit} allowed generations this week.`,
        limit: rateLimit.limit,
        remaining: 0,
        resetAt: rateLimit.resetAt.toISOString(),
        success: false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 429,
      });
    }

    // Generate mode (existing functionality)
    const {
      ingredients, time, mealType, servings, dietaryPreferences, availableEquipment, anythingElse
    } = requestBody;

    const systemPrompt = `
      You are an intelligent meal assistant for an app named "Wellbody". Your goal is to create three DISTINCTLY DIFFERENT recipes based on the user's criteria.

      CRITICAL - VARIETY REQUIREMENTS:
      The three recipes MUST be meaningfully different from each other. Vary them across these dimensions:
      1. **Cuisine/Style** - Draw from different culinary traditions (e.g., Asian, Mediterranean, Latin American, American comfort, Indian, Middle Eastern). Do NOT make three recipes from the same cuisine.
      2. **Cooking Technique** - Use different methods (e.g., one stir-fried, one baked/roasted, one grilled, one raw/salad, one simmered/braised). Avoid using the same technique for all three.
      3. **Flavor Profile** - Vary the taste experience (e.g., one bold & spicy, one bright & citrusy, one rich & savory, one fresh & herby).
      4. **Dish Type** - If appropriate for the meal type, vary the format (e.g., a bowl, a wrap/sandwich, a plated dish with sides).
      5. **Skill Level** - Provide a range of complexity:
         - Recipe 1: EASY - Minimal steps, basic techniques, beginner-friendly, quick wins
         - Recipe 2: MODERATE - Some technique required, a bit more involved but still approachable
         - Recipe 3: ELEVATED - More sophisticated, impressive for special occasions, worth the extra effort

      The recipes should feel like completely different meal options that give the user real choice - NOT three variations of the same dish.

      INGREDIENT USAGE:
      You do NOT need to use every ingredient provided. The user is telling you what they have available - use the ingredients that make sense together for each recipe. Each recipe can use a different subset of the available ingredients. Focus on creating delicious, cohesive dishes rather than forcing all ingredients into every recipe. If some ingredients don't pair well together, simply don't use them in the same dish.

      You MUST respond ONLY with a single, valid JSON object. Do not include any markdown formatting (like \`\`\`json), text, notes, or explanations outside of the JSON structure itself.

      The JSON object must have a single key "recipes" which is an array containing exactly three recipe objects. Each recipe object MUST have the following keys:
      - "name": string (make names descriptive and appetizing)
      - "description": string (1-2 sentences highlighting what makes this dish special)
      - "skill_level": string (one of: "easy", "moderate", "elevated")
      - "cuisine": string (e.g., "Asian", "Mediterranean", "Latin American", "American", "Indian", "Middle Eastern", "Italian", "French")
      - "prep_time_minutes": integer
      - "cook_time_minutes": integer
      - "servings": integer
      - "ingredients": An array of objects, where each object has "name" (string), "quantity" (float), and "unit" (string).
      - "instructions": An array of strings (clear, actionable steps).
      - "tags": An array of strings (e.g., "High-Protein", "Vegan", "Quick").
      - "calories": integer (total calories per serving)
      - "nutritional_info": An object with "protein_g" (integer), "carbs_g" (integer), "fat_g" (integer), "fiber_g" (integer), "sodium_mg" (integer), and "sugar_g" (integer). All values should be per serving.

      IMPORTANT: Calculate nutritional information accurately based on the ingredients and quantities you specify. Use standard nutritional databases for reference. The nutritional values should be realistic and match the recipe ingredients.
    `;

    const userPrompt = `
      I have the following criteria:
      - Ingredients on hand: "${ingredients || 'any'}"
      - Time available: ${time || 30} minutes total
      - Meal type: ${mealType || 'any'}
      - Servings: ${servings || 2}
      - Dietary Preferences: "${(dietaryPreferences || []).join(', ') || 'none'}"
      - Available Equipment: "${(availableEquipment || []).join(', ') || 'standard kitchen'}"
      - Additional Notes: "${anythingElse || 'none'}"
    `;

    const chatCompletion = await mistralClient.chat.completions.create({
      model: 'mistral-small-latest',
      messages: [
        { "role": "system", "content": systemPrompt },
        { "role": "user", "content": userPrompt }
      ],
      response_format: { type: "json_object" },
    });

    const responseTime = Date.now() - startTime;
    const usage = chatCompletion.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = usage?.total_tokens || 0;
    const estimatedCost = calculateCost('mistral-small-latest', promptTokens, completionTokens);

    const responseContent = chatCompletion.choices[0].message.content;
    let recipesJson = JSON.parse(responseContent);

    // --- Assign images based on recipe attributes ---
    if (recipesJson.recipes && Array.isArray(recipesJson.recipes)) {
      for (const recipe of recipesJson.recipes) {
        recipe.image_url = getRecipeImageUrl(recipe, mealType || '', supabaseUrl || '');
        console.log(`Assigned image to "${recipe.name}": ${recipe.image_url}`);
      }
    }
    // --- End of Image Assignment ---

    // Log usage
    await logUsage(supabaseClient, {
      user_id,
      function_name: 'generate-recipes',
      operation: 'recipe_generation',
      model: 'mistral-small-latest',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: estimatedCost,
      input_method: 'text',
      success: true,
      response_time_ms: responseTime,
    });

    // Get updated rate limit info to return to client
    const updatedRateLimit = await checkRateLimit(supabaseClient, user_id);

    return new Response(JSON.stringify({
      ...recipesJson,
      _rateLimit: {
        remaining: updatedRateLimit.remaining,
        limit: updatedRateLimit.limit,
        resetAt: updatedRateLimit.resetAt.toISOString(),
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Error in Edge Function:', error);
    const errorMessage = error.message || 'An unexpected error occurred';
    const errorDetails = {
      error: errorMessage,
      type: error.name || 'UnknownError',
      details: error.toString()
    };

    // Check for specific Mistral API errors
    if (errorMessage.includes('API key')) {
      errorDetails.error = 'Mistral API key issue. Please check your API key configuration.';
    } else if (errorMessage.includes('model')) {
      errorDetails.error = 'Model access issue. Please check your Mistral subscription.';
    }

    return new Response(JSON.stringify(errorDetails), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}); 