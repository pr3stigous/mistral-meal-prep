-- =====================================================
-- Private Events RLS Migration
-- Created: 2026-02-09
-- Description: Enforce private/invite-only events.
-- Users can only see events they host or are attending.
-- Uses SECURITY DEFINER function to avoid RLS recursion.
-- =====================================================

-- =====================================================
-- PART 1: Helper function to check event access
-- =====================================================

-- Function to check if user can access an event (host or attendee)
CREATE OR REPLACE FUNCTION public.user_can_access_event(p_event_id uuid)
RETURNS boolean AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_is_host boolean;
  v_is_attendee boolean;
BEGIN
  -- Check if user is host
  SELECT EXISTS (
    SELECT 1 FROM public.meal_prep_events
    WHERE id = p_event_id AND host_user_id = v_user_id
  ) INTO v_is_host;

  IF v_is_host THEN
    RETURN true;
  END IF;

  -- Check if user is attendee
  SELECT EXISTS (
    SELECT 1 FROM public.event_attendees
    WHERE event_id = p_event_id
    AND user_id = v_user_id
    AND registration_status IN ('approved', 'pending')
  ) INTO v_is_attendee;

  RETURN v_is_attendee;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.user_can_access_event(uuid) TO authenticated;

-- =====================================================
-- PART 2: RLS Policy for meal_prep_events
-- =====================================================

-- Ensure RLS is enabled
ALTER TABLE public.meal_prep_events ENABLE ROW LEVEL SECURITY;

-- Drop existing SELECT policies (we'll replace with new one)
DROP POLICY IF EXISTS "Users can view meal_prep_events" ON public.meal_prep_events;
DROP POLICY IF EXISTS "Users can view their own events" ON public.meal_prep_events;
DROP POLICY IF EXISTS "meal_prep_events_select_policy" ON public.meal_prep_events;
DROP POLICY IF EXISTS "Users can view events they host or attend" ON public.meal_prep_events;
DROP POLICY IF EXISTS "Allow public read access to all meal prep events" ON public.meal_prep_events;

-- Create new SELECT policy using the helper function
CREATE POLICY "Users can view events they host or attend"
ON public.meal_prep_events FOR SELECT TO authenticated
USING (
  host_user_id = (SELECT auth.uid())
  OR public.user_can_access_event(id)
);

-- =====================================================
-- PART 3: SECURITY DEFINER function for fetching events
-- (Alternative approach - use this if RLS causes issues)
-- =====================================================

-- Function to get all events user can access (host + attending)
CREATE OR REPLACE FUNCTION public.get_accessible_events()
RETURNS SETOF public.meal_prep_events AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.*
  FROM public.meal_prep_events e
  LEFT JOIN public.event_attendees a ON a.event_id = e.id
  WHERE e.host_user_id = (SELECT auth.uid())
     OR (a.user_id = (SELECT auth.uid()) AND a.registration_status IN ('approved', 'pending'))
  ORDER BY e.event_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_accessible_events() TO authenticated;

-- =====================================================
-- PART 4: Performance indexes
-- =====================================================

-- Index on event_attendees for user lookups
CREATE INDEX IF NOT EXISTS idx_event_attendees_user_status
ON public.event_attendees(user_id, registration_status);

-- Index on event_attendees for event lookups
CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id
ON public.event_attendees(event_id);

-- =====================================================
-- PART 5: SECURITY DEFINER function for accepting invites
-- Bypasses RLS so users can accept invites to events they
-- can't yet see (because they're not attendees yet).
-- =====================================================

CREATE OR REPLACE FUNCTION public.accept_event_invite(
  p_token text,
  p_user_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_event_id uuid;
  v_host_id uuid;
  v_event_title text;
  v_is_generic boolean;
  v_existing_attendee record;
BEGIN
  -- First check if token exists in meal_prep_events.invite_token (generic link)
  SELECT id, host_user_id, title
  INTO v_event_id, v_host_id, v_event_title
  FROM public.meal_prep_events
  WHERE invite_token = p_token;

  IF FOUND THEN
    v_is_generic := true;
  ELSE
    -- Check pending_invitations for targeted invite token
    SELECT pi.event_id, e.host_user_id, e.title
    INTO v_event_id, v_host_id, v_event_title
    FROM public.pending_invitations pi
    JOIN public.meal_prep_events e ON e.id = pi.event_id
    WHERE pi.token = p_token
      AND pi.invitation_type = 'meal_prep'
      AND pi.status = 'pending';

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid or expired invitation'
      );
    END IF;
    v_is_generic := false;
  END IF;

  -- Check if user is already an attendee
  SELECT id, registration_status
  INTO v_existing_attendee
  FROM public.event_attendees
  WHERE event_id = v_event_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Check if they can re-request (previously denied or cancelled)
    IF v_existing_attendee.registration_status IN ('denied', 'cancelled_by_user') THEN
      -- Allow re-request: update status to pending
      UPDATE public.event_attendees
      SET registration_status = 'pending',
          requested_at = NOW(),
          decision_at = NULL,
          notes_for_host = NULL
      WHERE id = v_existing_attendee.id;

      RETURN jsonb_build_object(
        'success', true,
        'event_id', v_event_id,
        'registration_status', 'pending',
        're_requested', true
      );
    END IF;

    -- Already an active attendee (pending or approved) - return current status
    RETURN jsonb_build_object(
      'success', true,
      'event_id', v_event_id,
      'already_attendee', true,
      'registration_status', v_existing_attendee.registration_status
    );
  END IF;

  -- Create new attendee record
  -- Generic links get 'pending' status (needs host approval)
  -- Targeted invites get 'approved' status
  INSERT INTO public.event_attendees (event_id, user_id, role, registration_status)
  VALUES (
    v_event_id,
    p_user_id,
    'participant',
    CASE WHEN v_is_generic THEN 'pending' ELSE 'approved' END
  );

  -- If targeted invite, mark pending_invitation as accepted
  IF NOT v_is_generic THEN
    UPDATE public.pending_invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE token = p_token;
  END IF;

  -- Create friend connection with host (if not already friends)
  INSERT INTO public.friend_requests (requester_id, recipient_id, status)
  SELECT v_host_id, p_user_id, 'accepted'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE (requester_id = v_host_id AND recipient_id = p_user_id)
       OR (requester_id = p_user_id AND recipient_id = v_host_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'event_title', v_event_title,
    'registration_status', CASE WHEN v_is_generic THEN 'pending' ELSE 'approved' END,
    'is_generic_link', v_is_generic
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.accept_event_invite(text, uuid) TO authenticated;

-- =====================================================
-- PART 6: SECURITY DEFINER function for previewing events by token
-- Allows users to see event details before deciding to join.
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_event_by_invite_token(p_token text)
RETURNS jsonb AS $$
DECLARE
  v_event record;
  v_host_name text;
  v_attendee_count integer;
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
      'recipe_id', v_event.recipe_id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_event_by_invite_token(text) TO authenticated;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
