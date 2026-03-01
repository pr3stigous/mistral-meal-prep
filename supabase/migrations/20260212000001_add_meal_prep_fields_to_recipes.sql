-- =====================================================
-- Add Meal Prep Fields to Recipes Migration
-- Created: 2026-02-12
-- Description: Add columns for meal prep score, equipment,
-- skill level, and source URL to the recipes table.
-- =====================================================

-- Add meal_prep_score column (1-5 scale)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS meal_prep_score smallint;

-- Add CHECK constraint for meal_prep_score (named for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_meal_prep_score_check'
  ) THEN
    ALTER TABLE public.recipes
    ADD CONSTRAINT recipes_meal_prep_score_check
    CHECK (meal_prep_score IS NULL OR (meal_prep_score >= 1 AND meal_prep_score <= 5));
  END IF;
END $$;

-- Add meal_prep_score_explanation column
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS meal_prep_score_explanation text;

-- Add skill_level column
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS skill_level text;

-- Add CHECK constraint for skill_level (named for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recipes_skill_level_check'
  ) THEN
    ALTER TABLE public.recipes
    ADD CONSTRAINT recipes_skill_level_check
    CHECK (skill_level IS NULL OR skill_level IN ('beginner', 'intermediate', 'advanced'));
  END IF;
END $$;

-- Add equipment_needed column (array of strings)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS equipment_needed text[];

-- Add source_url column (for URL-imported recipes)
ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS source_url text;

-- Add index on meal_prep_score for filtering (partial index)
CREATE INDEX IF NOT EXISTS idx_recipes_meal_prep_score
ON public.recipes(meal_prep_score)
WHERE meal_prep_score IS NOT NULL;

-- Add comment explaining the columns
COMMENT ON COLUMN public.recipes.meal_prep_score IS 'Meal prep suitability score 1-5 (5 = freezer-friendly, perfect for batch cooking)';
COMMENT ON COLUMN public.recipes.meal_prep_score_explanation IS 'Brief explanation of why this meal prep score was given';
COMMENT ON COLUMN public.recipes.skill_level IS 'Recipe difficulty: beginner, intermediate, or advanced';
COMMENT ON COLUMN public.recipes.equipment_needed IS 'Array of cooking equipment needed for this recipe';
COMMENT ON COLUMN public.recipes.source_url IS 'Original URL if recipe was imported from a website';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
