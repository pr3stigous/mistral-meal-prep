-- =====================================================
-- Event Recipes Junction Table — Multi-Recipe Support
-- Created: 2026-02-28
-- Description: Junction table linking events to multiple recipes.
--   Enables multi-recipe meal prep events (1–5 recipes per event).
--   meal_prep_events.recipe_id kept for backward compat (single-recipe).
--   When event_recipes rows exist, they take precedence.
-- =====================================================

-- =====================================================
-- PART 1: Create table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.event_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.meal_prep_events(id) ON DELETE CASCADE,
  recipe_id bigint NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  label text,                -- optional: 'main', 'side', 'dessert', or freeform
  color_index int NOT NULL DEFAULT 0,  -- 0-4, maps to recipe color palette
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints
ALTER TABLE public.event_recipes
  ADD CONSTRAINT check_color_index CHECK (color_index >= 0 AND color_index <= 4);

ALTER TABLE public.event_recipes
  ADD CONSTRAINT check_sort_order CHECK (sort_order >= 0);

-- Unique: same recipe cannot appear twice in same event
ALTER TABLE public.event_recipes
  ADD CONSTRAINT uq_event_recipe UNIQUE (event_id, recipe_id);

-- Comments
COMMENT ON TABLE public.event_recipes IS 'Junction table linking events to multiple recipes (1–5 per event)';
COMMENT ON COLUMN public.event_recipes.sort_order IS 'Display order of recipes within the event (0-based)';
COMMENT ON COLUMN public.event_recipes.label IS 'Optional label: main, side, dessert, or freeform text';
COMMENT ON COLUMN public.event_recipes.color_index IS 'Color palette index (0-4): coral, green, amber, purple, blue';

-- =====================================================
-- PART 2: Indexes
-- =====================================================

-- FK index: event_id (most common lookup pattern)
CREATE INDEX IF NOT EXISTS idx_event_recipes_event_id
  ON public.event_recipes(event_id);

-- FK index: recipe_id (for recipe deletion/lookup)
CREATE INDEX IF NOT EXISTS idx_event_recipes_recipe_id
  ON public.event_recipes(recipe_id);

-- Composite: event + sort order (for ordered fetches)
CREATE INDEX IF NOT EXISTS idx_event_recipes_event_sort
  ON public.event_recipes(event_id, sort_order);

-- =====================================================
-- PART 3: RLS
-- =====================================================

ALTER TABLE public.event_recipes ENABLE ROW LEVEL SECURITY;

-- No direct SELECT/INSERT/UPDATE/DELETE policies.
-- This table has no user_id column (shared data), so all access goes through
-- SECURITY DEFINER RPCs that verify host/co-leader/attendee status.
-- Same pattern as event_contributions_needed (see DB guide: "Simple RLS +
-- SECURITY DEFINER Functions" for shared data).

-- =====================================================
-- PART 4: RPC — Insert event recipes (used by publish)
-- =====================================================

CREATE OR REPLACE FUNCTION public.insert_event_recipes(
  p_event_id uuid,
  p_recipes jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_is_host boolean;
  v_is_co_leader boolean;
  v_inserted int := 0;
  v_recipe jsonb;
  v_count int;
BEGIN
  v_uid := (SELECT auth.uid());

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify caller is the event host
  SELECT (host_user_id = v_uid) INTO v_is_host
  FROM public.meal_prep_events
  WHERE id = p_event_id;

  IF v_is_host IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  -- Also check co-leader status
  IF NOT v_is_host THEN
    SELECT EXISTS(
      SELECT 1 FROM public.event_attendees
      WHERE event_id = p_event_id
        AND user_id = v_uid
        AND role = 'co-leader'
        AND registration_status = 'approved'
    ) INTO v_is_co_leader;

    IF NOT v_is_co_leader THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can manage recipes');
    END IF;
  END IF;

  -- Check existing count + new count won't exceed 5
  SELECT COUNT(*) INTO v_count
  FROM public.event_recipes
  WHERE event_id = p_event_id;

  IF v_count + jsonb_array_length(p_recipes) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 5 recipes per event');
  END IF;

  -- Insert each recipe from the JSONB array
  FOR v_recipe IN SELECT * FROM jsonb_array_elements(p_recipes)
  LOOP
    INSERT INTO public.event_recipes (
      event_id, recipe_id, sort_order, label, color_index
    ) VALUES (
      p_event_id,
      (v_recipe->>'recipe_id')::bigint,
      COALESCE((v_recipe->>'sort_order')::int, v_inserted),
      v_recipe->>'label',
      COALESCE((v_recipe->>'color_index')::int, v_inserted)
    )
    ON CONFLICT (event_id, recipe_id) DO NOTHING;

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.insert_event_recipes(uuid, jsonb) TO authenticated;

-- =====================================================
-- PART 5: RPC — Delete all event recipes (used by regenerate)
-- =====================================================

CREATE OR REPLACE FUNCTION public.delete_event_recipes(
  p_event_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_is_host boolean;
  v_is_co_leader boolean;
  v_deleted int;
BEGIN
  v_uid := (SELECT auth.uid());

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT (host_user_id = v_uid) INTO v_is_host
  FROM public.meal_prep_events
  WHERE id = p_event_id;

  IF v_is_host IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  IF NOT v_is_host THEN
    SELECT EXISTS(
      SELECT 1 FROM public.event_attendees
      WHERE event_id = p_event_id
        AND user_id = v_uid
        AND role = 'co-leader'
        AND registration_status = 'approved'
    ) INTO v_is_co_leader;

    IF NOT v_is_co_leader THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can manage recipes');
    END IF;
  END IF;

  DELETE FROM public.event_recipes
  WHERE event_id = p_event_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_event_recipes(uuid) TO authenticated;

-- =====================================================
-- PART 6: RPC — Remove specific recipe from event
-- =====================================================

CREATE OR REPLACE FUNCTION public.remove_event_recipe(
  p_event_id uuid,
  p_recipe_id bigint
)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_is_host boolean;
  v_is_co_leader boolean;
  v_deleted int;
BEGIN
  v_uid := (SELECT auth.uid());

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT (host_user_id = v_uid) INTO v_is_host
  FROM public.meal_prep_events
  WHERE id = p_event_id;

  IF v_is_host IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  IF NOT v_is_host THEN
    SELECT EXISTS(
      SELECT 1 FROM public.event_attendees
      WHERE event_id = p_event_id
        AND user_id = v_uid
        AND role = 'co-leader'
        AND registration_status = 'approved'
    ) INTO v_is_co_leader;

    IF NOT v_is_co_leader THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can manage recipes');
    END IF;
  END IF;

  DELETE FROM public.event_recipes
  WHERE event_id = p_event_id
    AND recipe_id = p_recipe_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipe not found in this event');
  END IF;

  -- Re-order remaining recipes to close gaps
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) - 1 AS new_order
    FROM public.event_recipes
    WHERE event_id = p_event_id
  )
  UPDATE public.event_recipes er
  SET sort_order = ordered.new_order,
      color_index = ordered.new_order
  FROM ordered
  WHERE er.id = ordered.id;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.remove_event_recipe(uuid, bigint) TO authenticated;

-- =====================================================
-- PART 7: RPC — Get event recipes (for detail/edit screens)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_event_recipes(
  p_event_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_has_access boolean;
BEGIN
  v_uid := (SELECT auth.uid());

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user is host or attendee
  SELECT EXISTS(
    SELECT 1 FROM public.meal_prep_events
    WHERE id = p_event_id AND host_user_id = v_uid
    UNION ALL
    SELECT 1 FROM public.event_attendees
    WHERE event_id = p_event_id AND user_id = v_uid
      AND registration_status IN ('approved', 'invited')
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'recipes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', er.id,
          'event_id', er.event_id,
          'recipe_id', er.recipe_id,
          'sort_order', er.sort_order,
          'label', er.label,
          'color_index', er.color_index,
          'created_at', er.created_at,
          'recipe', jsonb_build_object(
            'id', r.id,
            'name', r.name,
            'description', r.description,
            'servings', r.servings,
            'prep_time_minutes', r.prep_time_minutes,
            'cook_time_minutes', r.cook_time_minutes,
            'skill_level', r.skill_level,
            'meal_prep_score', r.meal_prep_score,
            'ingredients', r.ingredients,
            'instructions', r.instructions,
            'equipment_needed', r.equipment_needed,
            'image_url', r.image_url
          )
        ) ORDER BY er.sort_order
      )
      FROM public.event_recipes er
      JOIN public.recipes r ON r.id = er.recipe_id
      WHERE er.event_id = p_event_id
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_event_recipes(uuid) TO authenticated;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
