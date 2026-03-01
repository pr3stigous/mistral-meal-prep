-- Fix: Allow event hosts to manage contributions via SECURITY DEFINER RPCs
--
-- Root cause: RLS is enabled on event_contributions_needed but the table has
-- no user_id column, so no INSERT/DELETE/SELECT policies can grant access.
-- Direct client operations are silently blocked.
--
-- Solution: SECURITY DEFINER RPCs that verify the caller is the event host
-- (or co-leader) before operating. Follows DB guide Pattern 2.

-- =====================================================
-- PART 1: Insert contributions (used by publish + regenerate)
-- =====================================================
CREATE OR REPLACE FUNCTION public.insert_event_contributions(
  p_event_id uuid,
  p_contributions jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_is_host boolean;
  v_is_co_leader boolean;
  v_inserted int := 0;
  v_contrib jsonb;
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
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can add contributions');
    END IF;
  END IF;

  -- Insert each contribution from the JSONB array
  FOR v_contrib IN SELECT * FROM jsonb_array_elements(p_contributions)
  LOOP
    INSERT INTO public.event_contributions_needed (
      event_id, description, type, quantity_needed, unit, notes
    ) VALUES (
      p_event_id,
      v_contrib->>'description',
      COALESCE(v_contrib->>'type', 'ingredient'),
      (v_contrib->>'quantity_needed')::numeric,
      v_contrib->>'unit',
      v_contrib->>'notes'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.insert_event_contributions(uuid, jsonb) TO authenticated;


-- =====================================================
-- PART 2: Delete all contributions for an event (used by regenerate)
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_event_contributions(
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

  -- Verify caller is the event host
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
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can delete contributions');
    END IF;
  END IF;

  -- Delete claims first (FK dependency: claims reference contributions)
  DELETE FROM public.event_contribution_claims
  WHERE contribution_needed_id IN (
    SELECT id FROM public.event_contributions_needed
    WHERE event_id = p_event_id
  );

  -- Then delete contributions
  DELETE FROM public.event_contributions_needed
  WHERE event_id = p_event_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_event_contributions(uuid) TO authenticated;


-- =====================================================
-- PART 3: Delete specific contributions by ID (used by edit screen save)
-- =====================================================
CREATE OR REPLACE FUNCTION public.delete_event_contributions_by_ids(
  p_event_id uuid,
  p_contribution_ids uuid[]
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
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can delete contributions');
    END IF;
  END IF;

  DELETE FROM public.event_contributions_needed
  WHERE event_id = p_event_id
    AND id = ANY(p_contribution_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'deleted', v_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.delete_event_contributions_by_ids(uuid, uuid[]) TO authenticated;


-- =====================================================
-- PART 4: Fetch contributions for an event (used by edit screen)
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_event_contributions(
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
    'contributions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ecn.id,
          'event_id', ecn.event_id,
          'description', ecn.description,
          'type', ecn.type,
          'quantity_needed', ecn.quantity_needed,
          'unit', ecn.unit,
          'notes', ecn.notes
        )
      )
      FROM public.event_contributions_needed ecn
      WHERE ecn.event_id = p_event_id
    ), '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_event_contributions(uuid) TO authenticated;
