-- Enrich get_event_by_invite_token RPC with hero fields, recipe summary, and contribution count
-- This enables the rich pre-RSVP guest preview using detail section components

CREATE OR REPLACE FUNCTION public.get_event_by_invite_token(p_token text)
RETURNS jsonb AS $$
DECLARE
  v_event record;
  v_host_name text;
  v_attendee_count integer;
  -- Recipe fields
  v_recipe_name text;
  v_recipe_image_url text;
  v_recipe_prep_time integer;
  v_recipe_cook_time integer;
  v_recipe_servings integer;
  v_recipe_meal_prep_score smallint;
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
  SELECT name INTO v_host_name
  FROM public.profiles
  WHERE user_id = v_event.host_user_id;

  -- Get attendee count
  SELECT COUNT(*) INTO v_attendee_count
  FROM public.event_attendees
  WHERE event_id = v_event.id
    AND registration_status = 'approved';

  -- Get recipe summary if recipe is attached
  IF v_event.recipe_id IS NOT NULL THEN
    SELECT r.name, r.image_url, r.prep_time_minutes, r.cook_time_minutes, r.servings, r.meal_prep_score
    INTO v_recipe_name, v_recipe_image_url, v_recipe_prep_time, v_recipe_cook_time, v_recipe_servings, v_recipe_meal_prep_score
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
      -- New enriched fields
      'hero_emoji', v_event.hero_emoji,
      'hero_gradient', v_event.hero_gradient,
      'recipe_name', v_recipe_name,
      'recipe_image_url', v_recipe_image_url,
      'recipe_prep_time', v_recipe_prep_time,
      'recipe_cook_time', v_recipe_cook_time,
      'recipe_servings', v_recipe_servings,
      'recipe_meal_prep_score', v_recipe_meal_prep_score,
      'contribution_count', COALESCE(v_contribution_count, 0)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_event_by_invite_token(text) TO authenticated;
