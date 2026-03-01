-- =====================================================
-- Event Wizard - Schema Migration
-- Created: 2025-11-29
-- Description: Adds event drafts, templates, and wizard-related columns
-- =====================================================

-- =====================================================
-- PART 1: event_drafts - Auto-save Draft Storage
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_completed INTEGER DEFAULT 0,
  draft_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for event_drafts
ALTER TABLE public.event_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own drafts"
  ON public.event_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own drafts"
  ON public.event_drafts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own drafts"
  ON public.event_drafts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own drafts"
  ON public.event_drafts FOR DELETE
  USING (auth.uid() = user_id);

-- Index for quick draft lookup
CREATE INDEX IF NOT EXISTS idx_event_drafts_user_id
  ON public.event_drafts(user_id);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_event_drafts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_event_drafts_updated_at
  BEFORE UPDATE ON public.event_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_event_drafts_updated_at();

COMMENT ON TABLE public.event_drafts IS 'Stores event creation drafts for auto-save functionality';
COMMENT ON COLUMN public.event_drafts.step_completed IS 'Last completed wizard step (0-4)';
COMMENT ON COLUMN public.event_drafts.draft_data IS 'JSON blob containing all form data across steps';

-- =====================================================
-- PART 2: event_templates - Quick-Start Templates
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  is_system BOOLEAN DEFAULT false,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for event_templates
ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can view system templates
CREATE POLICY "Users can view system templates"
  ON public.event_templates FOR SELECT
  USING (is_system = true);

-- Users can view their own custom templates
CREATE POLICY "Users can view their own templates"
  ON public.event_templates FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own templates (not system)
CREATE POLICY "Users can create their own templates"
  ON public.event_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system = false);

-- Users can update their own templates
CREATE POLICY "Users can update their own templates"
  ON public.event_templates FOR UPDATE
  USING (auth.uid() = user_id AND is_system = false);

-- Users can delete their own templates
CREATE POLICY "Users can delete their own templates"
  ON public.event_templates FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);

-- Index for template lookup
CREATE INDEX IF NOT EXISTS idx_event_templates_system
  ON public.event_templates(is_system) WHERE is_system = true;

CREATE INDEX IF NOT EXISTS idx_event_templates_user_id
  ON public.event_templates(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.event_templates IS 'Pre-configured event templates for quick start';
COMMENT ON COLUMN public.event_templates.is_system IS 'True for system-provided templates, false for user-created';

-- =====================================================
-- PART 3: meal_prep_events - Additional Wizard Columns
-- =====================================================

-- Add recipe reference
ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS recipe_id BIGINT REFERENCES public.recipes(id) ON DELETE SET NULL;

-- Add estimated duration in minutes (simpler than interval for wizard)
ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER;

-- Add expected participants range
ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS expected_participants TEXT;

-- Add address visibility control
ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS address_visibility TEXT DEFAULT 'after_rsvp';

-- Add constraints
ALTER TABLE public.meal_prep_events
ADD CONSTRAINT check_expected_participants
  CHECK (expected_participants IS NULL OR expected_participants IN ('2-4', '5-8', '9-12', '13+'));

ALTER TABLE public.meal_prep_events
ADD CONSTRAINT check_address_visibility
  CHECK (address_visibility IS NULL OR address_visibility IN ('now', 'after_rsvp', 'day_before'));

ALTER TABLE public.meal_prep_events
ADD CONSTRAINT check_duration_minutes
  CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0);

-- Index for recipe lookup
CREATE INDEX IF NOT EXISTS idx_meal_prep_events_recipe_id
  ON public.meal_prep_events(recipe_id) WHERE recipe_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.meal_prep_events.recipe_id IS 'Reference to linked recipe from library';
COMMENT ON COLUMN public.meal_prep_events.estimated_duration_minutes IS 'Event duration in minutes (e.g., 60, 120, 180)';
COMMENT ON COLUMN public.meal_prep_events.expected_participants IS 'Expected participant range: 2-4, 5-8, 9-12, 13+';
COMMENT ON COLUMN public.meal_prep_events.address_visibility IS 'When to reveal exact address: now, after_rsvp, day_before';

-- =====================================================
-- PART 4: Seed System Templates
-- =====================================================

INSERT INTO public.event_templates (name, description, template_data, is_system)
VALUES
  (
    'Sunday Meal Prep',
    'Classic weekend batch cooking session for the week ahead',
    '{
      "estimated_duration_minutes": 180,
      "expected_participants": "5-8",
      "skill_level": "intermediate",
      "dietary_accommodations": [],
      "suggested_time": "10:00",
      "suggested_day": "sunday"
    }'::jsonb,
    true
  ),
  (
    'Weeknight Dinner Prep',
    'Quick after-work cooking session for a few days',
    '{
      "estimated_duration_minutes": 120,
      "expected_participants": "2-4",
      "skill_level": "beginner",
      "dietary_accommodations": [],
      "suggested_time": "18:00",
      "suggested_day": "tuesday"
    }'::jsonb,
    true
  ),
  (
    'Meal Prep Party',
    'Large group cooking event with social focus',
    '{
      "estimated_duration_minutes": 180,
      "expected_participants": "9-12",
      "skill_level": "intermediate",
      "dietary_accommodations": [],
      "suggested_time": "14:00",
      "suggested_day": "saturday"
    }'::jsonb,
    true
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
