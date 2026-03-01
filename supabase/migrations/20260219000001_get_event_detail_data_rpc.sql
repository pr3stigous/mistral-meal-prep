-- Fix: Allow event attendees to see shared event data (recipe, contributions, fellow attendees)
--
-- Root cause: RLS on recipes, event_attendees, event_contributions_needed, and
-- event_contribution_claims restricts SELECT to row owners. Invited/pending/approved
-- attendees need to see shared event data.
--
-- Solution: Single SECURITY DEFINER RPC that fetches all event detail data,
-- following the DB guide's pattern for cross-table shared data access.

CREATE OR REPLACE FUNCTION public.get_event_detail_data(p_event_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_event record;
  v_is_host boolean;
  v_is_co_leader boolean;
  v_can_manage boolean;
  v_recipe_id bigint;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  -- Fetch event
  SELECT * INTO v_event
  FROM public.meal_prep_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Event not found');
  END IF;

  -- Check access: host OR attendee (approved/pending/invited)
  v_is_host := (v_event.host_user_id = v_uid);

  IF NOT v_is_host AND NOT EXISTS (
    SELECT 1 FROM public.event_attendees
    WHERE event_id = p_event_id
      AND user_id = v_uid
      AND registration_status IN ('approved', 'pending', 'invited')
  ) THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  -- Determine role
  v_is_co_leader := EXISTS (
    SELECT 1 FROM public.event_attendees
    WHERE event_id = p_event_id
      AND user_id = v_uid
      AND role = 'co-leader'
      AND registration_status = 'approved'
  );
  v_can_manage := v_is_host OR v_is_co_leader;
  v_recipe_id := v_event.recipe_id;

  -- Return all event detail data in one response
  RETURN jsonb_build_object(
    -- Linked recipe (summary for card display)
    'linked_recipe', CASE WHEN v_recipe_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'prep_time_minutes', r.prep_time_minutes,
        'cook_time_minutes', r.cook_time_minutes,
        'servings', r.servings,
        'image_url', r.image_url
      )
      FROM public.recipes r WHERE r.id = v_recipe_id
    ) ELSE NULL END,

    -- Full recipe (for detail sheet)
    'full_recipe', CASE WHEN v_recipe_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'id', r.id, 'name', r.name, 'description', r.description,
        'prep_time_minutes', r.prep_time_minutes,
        'cook_time_minutes', r.cook_time_minutes,
        'servings', r.servings, 'image_url', r.image_url,
        'ingredients', r.ingredients, 'instructions', r.instructions,
        'nutritional_info', r.nutritional_info, 'tags', r.tags,
        'skill_level', r.skill_level, 'meal_prep_score', r.meal_prep_score,
        'meal_prep_score_explanation', r.meal_prep_score_explanation,
        'equipment_needed', r.equipment_needed, 'source_url', r.source_url
      )
      FROM public.recipes r WHERE r.id = v_recipe_id
    ) ELSE NULL END,

    -- Approved attendees with profile names
    'approved_attendees', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ea.id, 'event_id', ea.event_id, 'user_id', ea.user_id,
          'role', ea.role, 'registration_status', ea.registration_status,
          'requested_at', ea.requested_at, 'decision_at', ea.decision_at,
          'notes_for_host', ea.notes_for_host,
          'profiles', jsonb_build_object('user_id', p.user_id, 'name', p.name)
        )
      )
      FROM public.event_attendees ea
      LEFT JOIN public.profiles p ON p.user_id = ea.user_id
      WHERE ea.event_id = p_event_id AND ea.registration_status = 'approved'
    ), '[]'::jsonb),

    -- Pending attendees (only returned for host/co-leader)
    'pending_attendees', CASE WHEN v_can_manage THEN COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ea.id, 'event_id', ea.event_id, 'user_id', ea.user_id,
          'role', ea.role, 'registration_status', ea.registration_status,
          'requested_at', ea.requested_at, 'decision_at', ea.decision_at,
          'notes_for_host', ea.notes_for_host,
          'profiles', jsonb_build_object('user_id', p.user_id, 'name', p.name)
        )
      )
      FROM public.event_attendees ea
      LEFT JOIN public.profiles p ON p.user_id = ea.user_id
      WHERE ea.event_id = p_event_id AND ea.registration_status = 'pending'
    ), '[]'::jsonb) ELSE '[]'::jsonb END,

    -- Contributions needed
    'contributions_needed', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ecn.id, 'event_id', ecn.event_id,
          'description', ecn.description, 'type', ecn.type,
          'quantity_needed', ecn.quantity_needed, 'unit', ecn.unit,
          'status', ecn.status, 'is_optional', ecn.is_optional,
          'estimated_cost', ecn.estimated_cost, 'notes', ecn.notes,
          'suggested_alternatives', ecn.suggested_alternatives,
          'created_at', ecn.created_at, 'updated_at', ecn.updated_at
        )
      )
      FROM public.event_contributions_needed ecn
      WHERE ecn.event_id = p_event_id
    ), '[]'::jsonb),

    -- Contribution claims with claimant names
    'contribution_claims', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ecc.id,
          'contribution_needed_id', ecc.contribution_needed_id,
          'user_id', ecc.user_id,
          'quantity_claimed', ecc.quantity_claimed,
          'claimed_at', ecc.claimed_at,
          'user_name', p.name
        )
      )
      FROM public.event_contribution_claims ecc
      JOIN public.event_contributions_needed ecn ON ecn.id = ecc.contribution_needed_id
      LEFT JOIN public.profiles p ON p.user_id = ecc.user_id
      WHERE ecn.event_id = p_event_id
    ), '[]'::jsonb),

    -- Counts
    'approved_participant_count', (
      SELECT COUNT(*)::int FROM public.event_attendees
      WHERE event_id = p_event_id AND registration_status = 'approved' AND role = 'participant'
    ),
    'approved_pickup_only_count', (
      SELECT COUNT(*)::int FROM public.event_attendees
      WHERE event_id = p_event_id AND registration_status = 'approved' AND role = 'pickup_only'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_event_detail_data(uuid) TO authenticated;
