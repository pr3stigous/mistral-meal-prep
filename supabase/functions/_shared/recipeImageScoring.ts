/**
 * Recipe Image Scoring System
 * Matches recipe attributes to stock images from Supabase storage bucket.
 * Used by generate-recipes and parse-recipe-url edge functions.
 */

// Image scoring configuration - 207 images across 7 priority levels
// Priority: 1 = proteins/context-boosted, 2 = starches, 3 = dish types, 4+ = cuisine/breakfast/dessert
interface ImageConfig {
  image: string;
  priority: number;
  ingredientKeywords: string[];
  cuisineMatch?: string[];
  tagMatch?: string[];
  mealTypeMatch?: string[];
}

export const IMAGE_SCORING_CONFIG: ImageConfig[] = [
  // PRIORITY 1: Proteins
  { image: 'protein-chicken-grilled', priority: 1, ingredientKeywords: ['grilled chicken', 'chicken breast', 'bbq chicken'], tagMatch: ['grilled', 'healthy'] },
  { image: 'protein-chicken-shredded', priority: 1, ingredientKeywords: ['shredded chicken', 'pulled chicken', 'chicken salad'] },
  { image: 'protein-chicken-crispy', priority: 1, ingredientKeywords: ['fried chicken', 'crispy chicken', 'chicken tender', 'chicken nugget', 'breaded chicken', 'chicken schnitzel'] },
  { image: 'protein-chicken-roasted', priority: 1, ingredientKeywords: ['roasted chicken', 'roast chicken', 'baked chicken', 'chicken thigh', 'whole chicken'] },
  { image: 'protein-chicken-stir-fry', priority: 1, ingredientKeywords: ['chicken stir fry', 'chicken stir-fry'], cuisineMatch: ['chinese', 'asian', 'thai'] },
  { image: 'protein-beef-sliced', priority: 1, ingredientKeywords: ['sliced beef', 'beef strips', 'flank steak', 'skirt steak'] },
  { image: 'protein-beef-ground', priority: 1, ingredientKeywords: ['ground beef', 'beef mince', 'minced beef', 'hamburger meat', 'taco meat'] },
  { image: 'protein-beef-steak', priority: 1, ingredientKeywords: ['steak', 'ribeye', 'sirloin', 'filet', 'new york strip', 't-bone', 'porterhouse', 'brisket'] },
  { image: 'protein-beef-stew-meat', priority: 1, ingredientKeywords: ['beef stew', 'beef chuck', 'braised beef', 'beef bourguignon', 'pot roast'] },
  { image: 'protein-beef-shredded', priority: 1, ingredientKeywords: ['shredded beef', 'pulled beef', 'barbacoa', 'beef brisket'] },
  { image: 'protein-fish-white', priority: 1, ingredientKeywords: ['white fish', 'cod', 'tilapia', 'halibut', 'sea bass', 'snapper', 'sole', 'haddock'] },
  { image: 'protein-fish-salmon', priority: 1, ingredientKeywords: ['salmon', 'smoked salmon', 'salmon fillet'] },
  { image: 'protein-shrimp-cooked', priority: 1, ingredientKeywords: ['shrimp', 'prawn', 'scampi', 'shrimp cocktail'] },
  { image: 'protein-fish-grilled', priority: 1, ingredientKeywords: ['grilled fish', 'grilled salmon', 'fish fillet'] },
  { image: 'protein-seafood-mixed', priority: 1, ingredientKeywords: ['seafood', 'mixed seafood', 'cioppino', 'paella', 'bouillabaisse', 'clam', 'mussel', 'scallop', 'lobster', 'crab'] },
  { image: 'protein-tofu-crispy', priority: 1, ingredientKeywords: ['crispy tofu', 'fried tofu', 'tofu stir fry'], tagMatch: ['vegan', 'vegetarian'] },
  { image: 'protein-tofu-soft', priority: 1, ingredientKeywords: ['silken tofu', 'soft tofu', 'tofu soup', 'mapo tofu'] },
  { image: 'protein-tempeh', priority: 1, ingredientKeywords: ['tempeh'], tagMatch: ['vegan', 'vegetarian'] },
  { image: 'protein-beans-cooked', priority: 1, ingredientKeywords: ['black beans', 'kidney beans', 'pinto beans', 'cannellini', 'white beans', 'navy beans', 'refried beans'] },
  { image: 'protein-lentils', priority: 1, ingredientKeywords: ['lentil', 'dal', 'daal', 'red lentil', 'green lentil', 'brown lentil'] },
  { image: 'eggs-sunny-side', priority: 1, ingredientKeywords: ['sunny side', 'fried egg'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-scrambled', priority: 1, ingredientKeywords: ['scrambled egg'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-poached', priority: 1, ingredientKeywords: ['poached egg', 'eggs benedict'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-omelette', priority: 1, ingredientKeywords: ['omelette', 'omelet', 'frittata'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'eggs-hard-boiled', priority: 1, ingredientKeywords: ['hard boiled', 'hard-boiled', 'boiled egg'] },

  // PRIORITY 2: Starches/Carbs
  { image: 'pasta-red-sauce', priority: 2, ingredientKeywords: ['spaghetti', 'marinara', 'tomato sauce', 'bolognese', 'arrabbiata', 'pomodoro'], cuisineMatch: ['italian'] },
  { image: 'pasta-creamy', priority: 2, ingredientKeywords: ['alfredo', 'carbonara', 'cream sauce', 'creamy pasta', 'fettuccine'], cuisineMatch: ['italian'] },
  { image: 'pasta-pesto', priority: 2, ingredientKeywords: ['pesto', 'basil pesto', 'pesto pasta'] },
  { image: 'noodles-ramen-broth', priority: 2, ingredientKeywords: ['ramen', 'ramen noodle'], cuisineMatch: ['japanese'] },
  { image: 'noodles-stir-fried', priority: 2, ingredientKeywords: ['lo mein', 'chow mein', 'yakisoba', 'stir fry noodle', 'fried noodle'] },
  { image: 'noodles-pho-style', priority: 2, ingredientKeywords: ['pho', 'vietnamese noodle', 'rice noodle soup'], cuisineMatch: ['vietnamese'] },
  { image: 'noodles-pad-thai', priority: 2, ingredientKeywords: ['pad thai', 'thai noodle'], cuisineMatch: ['thai'] },
  { image: 'rice-white-plain', priority: 2, ingredientKeywords: ['white rice', 'steamed rice', 'jasmine rice', 'basmati'] },
  { image: 'rice-fried', priority: 2, ingredientKeywords: ['fried rice', 'yangzhou', 'egg fried rice'], cuisineMatch: ['chinese', 'asian'] },
  { image: 'rice-risotto', priority: 2, ingredientKeywords: ['risotto', 'arborio'], cuisineMatch: ['italian'] },
  { image: 'grain-quinoa', priority: 2, ingredientKeywords: ['quinoa'], tagMatch: ['healthy', 'gluten-free'] },

  // PRIORITY 3: Dish Types
  { image: 'soup-creamy-orange', priority: 3, ingredientKeywords: ['butternut squash soup', 'carrot soup', 'pumpkin soup', 'sweet potato soup'] },
  { image: 'soup-tomato', priority: 3, ingredientKeywords: ['tomato soup', 'gazpacho'] },
  { image: 'soup-noodle', priority: 3, ingredientKeywords: ['chicken noodle soup', 'noodle soup'] },
  { image: 'soup-coconut-curry', priority: 3, ingredientKeywords: ['coconut soup', 'tom kha', 'tom kha gai', 'curry soup', 'coconut milk'], cuisineMatch: ['thai', 'indian'] },
  { image: 'stew-brown', priority: 3, ingredientKeywords: ['beef stew', 'lamb stew', 'irish stew', 'brown stew'] },
  { image: 'stew-red', priority: 3, ingredientKeywords: ['chili', 'goulash', 'texas chili', 'ropa vieja'] },
  { image: 'salad-green-mixed', priority: 3, ingredientKeywords: ['mixed greens', 'garden salad', 'house salad', 'side salad'] },
  { image: 'salad-caesar', priority: 3, ingredientKeywords: ['caesar salad', 'caesar'] },
  { image: 'salad-grain', priority: 3, ingredientKeywords: ['grain salad', 'farro salad', 'quinoa salad', 'wheat berry'] },
  { image: 'bowl-buddha', priority: 3, ingredientKeywords: ['buddha bowl', 'power bowl', 'nourish bowl', 'grain bowl'], tagMatch: ['healthy', 'vegan', 'vegetarian'] },
  { image: 'bowl-burrito', priority: 3, ingredientKeywords: ['burrito bowl', 'chipotle bowl', 'mexican bowl'], cuisineMatch: ['mexican'] },
  { image: 'bowl-korean-style', priority: 3, ingredientKeywords: ['bibimbap', 'korean bowl', 'rice bowl'], cuisineMatch: ['korean'] },
  { image: 'bowl-curry', priority: 3, ingredientKeywords: ['curry bowl', 'curry rice', 'katsu curry'], cuisineMatch: ['indian', 'japanese', 'thai'] },
  { image: 'sandwich-grilled', priority: 3, ingredientKeywords: ['grilled cheese', 'panini', 'melt', 'cuban sandwich'] },
  { image: 'wrap-burrito', priority: 3, ingredientKeywords: ['burrito', 'wrap', 'breakfast burrito'], cuisineMatch: ['mexican'] },
  { image: 'taco-shell', priority: 3, ingredientKeywords: ['taco', 'street taco', 'fish taco'], cuisineMatch: ['mexican'] },
  { image: 'baked-casserole', priority: 3, ingredientKeywords: ['casserole', 'hotdish'] },
  { image: 'baked-lasagna', priority: 3, ingredientKeywords: ['lasagna', 'lasagne'], cuisineMatch: ['italian'] },
  { image: 'baked-mac-cheese', priority: 3, ingredientKeywords: ['mac and cheese', 'macaroni and cheese', 'mac n cheese'], cuisineMatch: ['american'] },
  { image: 'veg-roasted-mixed', priority: 3, ingredientKeywords: ['roasted vegetables', 'roasted veggies', 'sheet pan vegetables'] },
  { image: 'veg-stir-fry', priority: 3, ingredientKeywords: ['vegetable stir fry', 'stir fry vegetables', 'stir-fry'], cuisineMatch: ['asian', 'chinese'] },

  // PRIORITY 4: Cuisine-inspired (fallback)
  { image: 'cuisine-chinese-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['chinese'] },
  { image: 'cuisine-japanese-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['japanese'] },
  { image: 'cuisine-thai-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['thai'] },
  { image: 'cuisine-indian-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['indian'] },
  { image: 'cuisine-indian-curry', priority: 4, ingredientKeywords: ['curry', 'tikka', 'masala', 'korma', 'vindaloo'], cuisineMatch: ['indian'] },
  { image: 'cuisine-mexican-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['mexican'] },
  { image: 'cuisine-italian-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['italian'] },
  { image: 'cuisine-greek-plate', priority: 4, ingredientKeywords: [], cuisineMatch: ['greek'] },
  { image: 'cuisine-mezze', priority: 4, ingredientKeywords: ['mezze', 'hummus', 'baba ganoush', 'falafel'], cuisineMatch: ['middle eastern', 'lebanese', 'turkish'] },

  // PRIORITY 5: Breakfast
  { image: 'breakfast-pancakes', priority: 5, ingredientKeywords: ['pancake', 'pancakes', 'hotcakes', 'flapjacks'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-waffles', priority: 5, ingredientKeywords: ['waffle', 'waffles', 'belgian waffle'], mealTypeMatch: ['breakfast', 'brunch'] },
  { image: 'breakfast-oatmeal', priority: 5, ingredientKeywords: ['oatmeal', 'oats', 'porridge', 'overnight oats'], mealTypeMatch: ['breakfast'] },

  // PRIORITY 6: Desserts
  { image: 'dessert-cake-chocolate', priority: 6, ingredientKeywords: ['chocolate cake', 'devil food', 'chocolate layer'], tagMatch: ['dessert'] },
  { image: 'dessert-cookie-chocolate', priority: 6, ingredientKeywords: ['chocolate chip cookie', 'cookie'], tagMatch: ['dessert'] },
  { image: 'dessert-brownie', priority: 6, ingredientKeywords: ['brownie', 'fudge brownie'], tagMatch: ['dessert'] },
  { image: 'dessert-pie-fruit', priority: 6, ingredientKeywords: ['apple pie', 'cherry pie', 'berry pie', 'fruit pie', 'peach pie'], tagMatch: ['dessert'] },
  { image: 'dessert-ice-cream', priority: 6, ingredientKeywords: ['ice cream', 'gelato', 'sundae'], tagMatch: ['dessert'] },
];

interface RecipeForImageScoring {
  name?: string;
  cuisine?: string;
  tags?: string[];
  ingredients?: { name: string }[];
}

/**
 * Get the best matching image URL for a recipe based on weighted scoring.
 * @param recipe Recipe data with name, cuisine, tags, and ingredients
 * @param mealType Optional meal type (breakfast, lunch, dinner, etc.)
 * @param supabaseUrl The Supabase project URL
 * @returns Full URL to the stock image
 */
export function getRecipeImageUrl(
  recipe: RecipeForImageScoring,
  mealType: string,
  supabaseUrl: string
): string {
  const baseUrl = `${supabaseUrl}/storage/v1/object/public/recipe-stock-images`;
  const scores: { image: string; priority: number; score: number }[] = [];

  const ingredientNames = recipe.ingredients?.map(i => i.name.toLowerCase()) || [];
  const recipeName = recipe.name?.toLowerCase() || '';
  const cuisineLower = recipe.cuisine?.toLowerCase().replace(/[^a-z\s]/g, '') || '';
  const tagsLower = recipe.tags?.map(t => t.toLowerCase()) || [];
  const mealTypeLower = mealType?.toLowerCase() || '';

  // Context detection for priority boosting
  const isDessert = tagsLower.includes('dessert') || tagsLower.includes('baking') ||
                    tagsLower.includes('sweet') || mealTypeLower === 'dessert';
  const isBreakfast = mealTypeLower === 'breakfast' || mealTypeLower === 'brunch';

  for (const config of IMAGE_SCORING_CONFIG) {
    let score = 0;
    let effectivePriority = config.priority;

    // Context-aware priority boosting
    if (isDessert && config.image.startsWith('dessert-')) {
      effectivePriority = 1;
      score += 5;
    }
    if (isBreakfast && (config.image.startsWith('breakfast-') || config.image.startsWith('eggs-'))) {
      effectivePriority = Math.min(effectivePriority, 1);
      score += 3;
    }
    if (recipeName.includes('bowl') && config.image.startsWith('bowl-')) {
      effectivePriority = 1;
      score += 8;
    }
    if ((recipeName.includes('soup') || tagsLower.includes('soup')) &&
        (config.image.startsWith('soup-') || config.image.startsWith('stew-'))) {
      effectivePriority = 1;
      score += 8;
    }
    if (recipeName.includes('salad') && config.image.startsWith('salad-')) {
      effectivePriority = 1;
      score += 8;
    }

    // Score ingredient keyword matches
    for (const keyword of config.ingredientKeywords) {
      if (recipeName.includes(keyword) && keyword.length > 3) {
        score += 10;
      }
      for (const ingredientName of ingredientNames) {
        if (keyword.length >= 4) {
          if (ingredientName === keyword || ingredientName.includes(keyword)) {
            score += 2;
            break;
          }
        } else if (ingredientName === keyword) {
          score += 2;
          break;
        }
      }
    }

    // Score cuisine match
    if (config.cuisineMatch && cuisineLower) {
      for (const cuisine of config.cuisineMatch) {
        if (cuisineLower.includes(cuisine) || cuisine.includes(cuisineLower)) {
          score += 5;
          break;
        }
      }
    }

    // Score tag matches
    if (config.tagMatch) {
      for (const tag of config.tagMatch) {
        if (tagsLower.some(t => t === tag || t.includes(tag))) {
          score += 3;
        }
      }
    }

    // Score meal type match
    if (config.mealTypeMatch && mealTypeLower) {
      if (config.mealTypeMatch.some(mt => mealTypeLower.includes(mt))) {
        score += 3;
      }
    }

    if (score > 0) {
      scores.push({ image: config.image, priority: effectivePriority, score });
    }
  }

  // Sort by priority first, then by score
  scores.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.score - a.score;
  });

  // Return highest scoring image, or fallback
  if (scores.length > 0 && scores[0].score >= 2) {
    return `${baseUrl}/${scores[0].image}.png`;
  }

  // Fallback to buddha bowl (generic healthy dish)
  return `${baseUrl}/bowl-buddha.png`;
}
