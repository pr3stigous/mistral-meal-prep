-- Migration: Add meal_prep widget columns to user_widget_preferences
-- Adds visibility and order columns for the new Meal Prep homescreen widget

ALTER TABLE public.user_widget_preferences
  ADD COLUMN meal_prep_visible boolean DEFAULT true,
  ADD COLUMN meal_prep_order integer DEFAULT 7;

-- Update table comment
COMMENT ON TABLE public.user_widget_preferences IS 'Stores user preferences for homescreen widget visibility and ordering (trackers, mindfulness, food_timeline, daily_summary, journal, cookbook, meal_prep)';
