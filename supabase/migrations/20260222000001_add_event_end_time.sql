-- Add optional event_end_time column to meal_prep_events
-- Replaces the estimated_duration_minutes concept with a concrete end time

ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS event_end_time text;

COMMENT ON COLUMN public.meal_prep_events.event_end_time IS 'Optional end time for the event in HH:MM format (24-hour). Null means no end time specified.';
