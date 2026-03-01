-- Add hero_emoji and hero_gradient columns to meal_prep_events
-- Used by the V2 event creation form and detail screen

ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS hero_emoji text DEFAULT '🍳';

ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS hero_gradient text[] DEFAULT ARRAY['#FFF6E5', '#FFECD2'];
