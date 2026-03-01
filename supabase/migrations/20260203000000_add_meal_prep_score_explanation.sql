-- Add meal_prep_score_explanation column to recipes table
-- This stores the AI-generated explanation for why a recipe received its meal prep score

ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS meal_prep_score_explanation text;

COMMENT ON COLUMN public.recipes.meal_prep_score_explanation IS 'AI-generated explanation for the meal prep score (e.g., "Stores well for 5+ days, reheats perfectly, and portions easily into containers")';
