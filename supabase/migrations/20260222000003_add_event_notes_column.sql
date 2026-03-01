-- Add event_notes column to meal_prep_events
-- Separates freeform host notes from the event description
ALTER TABLE public.meal_prep_events
  ADD COLUMN IF NOT EXISTS event_notes text DEFAULT NULL;
