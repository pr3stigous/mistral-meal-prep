-- Migration: Add Meal Prep Notifications
-- Description: Creates notifications when existing users are invited to meal prep events
-- Author: Claude Code
-- Date: 2026-02-05

-------------------------------------------------------------------------------
-- Part 1: Update invite_users_to_event to create notifications
-- When an existing user is invited to a meal prep event, they get a notification
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_users_to_event(
  p_event_id uuid,
  p_user_ids uuid[],
  p_registration_status text DEFAULT 'approved',
  p_role text DEFAULT 'participant'
) RETURNS jsonb AS $$
DECLARE
  v_host_id uuid;
  v_uid uuid;
  v_inserted integer := 0;
  v_event_title text;
  v_inviter_name text;
  v_invitee_id uuid;
BEGIN
  -- Verify caller is the host of this event
  SELECT host_user_id, title INTO v_host_id, v_event_title
  FROM public.meal_prep_events
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found');
  END IF;

  v_uid := (SELECT auth.uid());

  IF v_host_id != v_uid THEN
    -- Also check if caller is a co-leader
    IF NOT EXISTS (
      SELECT 1 FROM public.event_attendees
      WHERE event_id = p_event_id
        AND user_id = v_uid
        AND role = 'co-leader'
        AND registration_status = 'approved'
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only the host or co-leader can invite users');
    END IF;
  END IF;

  -- Get inviter's name for notification
  SELECT name INTO v_inviter_name
  FROM public.profiles
  WHERE user_id = v_uid;

  -- Insert attendees, skipping duplicates
  INSERT INTO public.event_attendees (event_id, user_id, role, registration_status)
  SELECT p_event_id, unnest(p_user_ids), p_role, p_registration_status
  ON CONFLICT (event_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Create notifications for each newly invited user
  -- Only for users who were actually inserted (not duplicates)
  FOR v_invitee_id IN
    SELECT ea.user_id
    FROM public.event_attendees ea
    WHERE ea.event_id = p_event_id
      AND ea.user_id = ANY(p_user_ids)
      AND ea.user_id != v_uid  -- Don't notify the inviter
      AND NOT EXISTS (
        -- Don't create duplicate notifications
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = ea.user_id
          AND n.type = 'cook_together_invitation'
          AND n.data->>'event_id' = p_event_id::text
      )
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      body,
      data,
      created_at
    ) VALUES (
      v_invitee_id,
      'cook_together_invitation',
      'You''re Invited to Cook Together!',
      COALESCE(v_inviter_name, 'Someone') || ' invited you to "' || v_event_title || '"',
      jsonb_build_object(
        'event_id', p_event_id,
        'event_title', v_event_title,
        'inviter_id', v_uid,
        'inviter_name', v_inviter_name
      ),
      NOW()
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grant already exists from previous migration, but re-run for safety
GRANT EXECUTE ON FUNCTION public.invite_users_to_event(uuid, uuid[], text, text) TO authenticated;
