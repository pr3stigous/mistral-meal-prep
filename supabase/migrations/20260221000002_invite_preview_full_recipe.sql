-- =====================================================
-- Migration: Return full recipe data in invite preview RPC
--
-- Problem:
--   Users who open a shared invite link can see the recipe
--   card but cannot tap to view full recipe details. The RPC
--   only returns summary fields (name, times, servings).
--
-- Fix:
--   Add full recipe data (ingredients, instructions, equipment,
--   nutrition, tags, description, skill_level, score explanation,
--   source_url) to the get_event_by_invite_token response.
--
-- Follows DB guide:
--   - SECURITY DEFINER with search_path = public
--   - GRANT EXECUTE to authenticated
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_event_by_invite_token(p_token text)
RETURNS jsonb AS $$
DECLARE
  v_event record;
  v_host_name text;
  v_attendee_count integer;
  -- Full recipe record
  v_recipe record;
  -- Contribution count
  v_contribution_count integer;
BEGIN
  -- First check if token exists in meal_prep_events.invite_token (generic link)
  SELECT e.*
  INTO v_event
  FROM public.meal_prep_events e
  WHERE e.invite_token = p_token;

  IF NOT FOUND THEN
    -- Check pending_invitations for targeted invite token
    SELECT e.*
    INTO v_event
    FROM public.pending_invitations pi
    JOIN public.meal_prep_events e ON e.id = pi.event_id
    WHERE pi.token = p_token
      AND pi.invitation_type = 'meal_prep';

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid or expired invitation'
      );
    END IF;
  END IF;

  -- Get host name
  SELECT COALESCE(p.name, p.username, 'Host') INTO v_host_name
  FROM public.profiles p
  WHERE p.user_id = v_event.host_user_id;

  -- Get attendee count
  SELECT COUNT(*) INTO v_attendee_count
  FROM public.event_attendees
  WHERE event_id = v_event.id
    AND registration_status = 'approved';

  -- Get full recipe data if recipe is attached
  IF v_event.recipe_id IS NOT NULL THEN
    SELECT * INTO v_recipe
    FROM public.recipes r
    WHERE r.id = v_event.recipe_id;
  END IF;

  -- Get contribution count
  SELECT COUNT(*) INTO v_contribution_count
  FROM public.event_contributions_needed
  WHERE event_id = v_event.id;

  RETURN jsonb_build_object(
    'success', true,
    'event', jsonb_build_object(
      'id', v_event.id,
      'title', v_event.title,
      'description', v_event.description,
      'event_date', v_event.event_date,
      'event_time', v_event.event_time,
      'location_name', v_event.location_name,
      'location_city', v_event.location_city,
      'location_state', v_event.location_state,
      'expected_participants', v_event.expected_participants,
      'estimated_duration_minutes', v_event.estimated_duration_minutes,
      'dietary_accommodations', v_event.dietary_accommodations,
      'skill_level', v_event.skill_level,
      'host_user_id', v_event.host_user_id,
      'host_name', COALESCE(v_host_name, 'Host'),
      'attendee_count', v_attendee_count,
      'recipe_id', v_event.recipe_id,
      -- Hero fields
      'hero_emoji', v_event.hero_emoji,
      'hero_gradient', v_event.hero_gradient,
      -- Recipe summary (backward compat)
      'recipe_name', v_recipe.name,
      'recipe_image_url', v_recipe.image_url,
      'recipe_prep_time', v_recipe.prep_time_minutes,
      'recipe_cook_time', v_recipe.cook_time_minutes,
      'recipe_servings', v_recipe.servings,
      'recipe_meal_prep_score', v_recipe.meal_prep_score,
      -- Full recipe fields (new)
      'recipe_description', v_recipe.description,
      'recipe_ingredients', v_recipe.ingredients,
      'recipe_instructions', v_recipe.instructions,
      'recipe_nutritional_info', v_recipe.nutritional_info,
      'recipe_tags', v_recipe.tags,
      'recipe_equipment_needed', v_recipe.equipment_needed,
      'recipe_skill_level', v_recipe.skill_level,
      'recipe_meal_prep_score_explanation', v_recipe.meal_prep_score_explanation,
      'recipe_source_url', v_recipe.source_url,
      -- Contribution count
      'contribution_count', COALESCE(v_contribution_count, 0)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_event_by_invite_token(text) TO authenticated;
