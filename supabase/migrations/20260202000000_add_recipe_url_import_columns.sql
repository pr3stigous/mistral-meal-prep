-- Migration: Add columns for URL-imported recipes
-- Description: Adds skill_level, meal_prep_score, equipment_needed, and source_url to recipes table
-- These fields are populated when importing recipes via URL (parse-recipe-url edge function)

-- Add skill_level column
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS skill_level text;

-- Add meal_prep_score column (1-5 scale)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS meal_prep_score integer;

-- Add equipment_needed column (array of strings)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS equipment_needed text[];

-- Add source_url column (for URL-imported recipes)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS source_url text;

-- Add constraint for meal_prep_score (1-5) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_meal_prep_score'
  ) THEN
    ALTER TABLE public.recipes
    ADD CONSTRAINT check_meal_prep_score
      CHECK (meal_prep_score IS NULL OR (meal_prep_score >= 1 AND meal_prep_score <= 5));
  END IF;
END $$;

-- Add constraint for skill_level if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_recipe_skill_level'
  ) THEN
    ALTER TABLE public.recipes
    ADD CONSTRAINT check_recipe_skill_level
      CHECK (skill_level IS NULL OR skill_level IN ('beginner', 'intermediate', 'advanced'));
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.recipes.skill_level IS 'Cooking skill level: beginner, intermediate, or advanced';
COMMENT ON COLUMN public.recipes.meal_prep_score IS 'How well the recipe stores/portions for meal prep (1-5)';
COMMENT ON COLUMN public.recipes.equipment_needed IS 'List of equipment needed to prepare the recipe';
COMMENT ON COLUMN public.recipes.source_url IS 'Original URL for recipes imported via URL import feature';

-- Index for finding recipes by skill level
CREATE INDEX IF NOT EXISTS idx_recipes_skill_level
  ON public.recipes(skill_level)
  WHERE skill_level IS NOT NULL;

-- Index for finding recipes by meal prep score
CREATE INDEX IF NOT EXISTS idx_recipes_meal_prep_score
  ON public.recipes(meal_prep_score)
  WHERE meal_prep_score IS NOT NULL;
