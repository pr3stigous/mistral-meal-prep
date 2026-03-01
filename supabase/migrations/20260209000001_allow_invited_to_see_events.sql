-- =====================================================
-- Allow Invited Users to See Events Migration
-- Created: 2026-02-09
-- Description: Update RLS and helper functions to allow
-- users with 'invited' status to see events.
-- =====================================================

-- Update the helper function to include 'invited' status
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

  -- Check if user is attendee (now includes 'invited' status)
  SELECT EXISTS (
    SELECT 1 FROM public.event_attendees
    WHERE event_id = p_event_id
    AND user_id = v_user_id
    AND registration_status IN ('approved', 'pending', 'invited')
  ) INTO v_is_attendee;

  RETURN v_is_attendee;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Ensure GRANT is set (idempotent)
GRANT EXECUTE ON FUNCTION public.user_can_access_event(uuid) TO authenticated;

-- Update the get_accessible_events function to include 'invited' status
CREATE OR REPLACE FUNCTION public.get_accessible_events()
RETURNS SETOF public.meal_prep_events AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT e.*
  FROM public.meal_prep_events e
  LEFT JOIN public.event_attendees a ON a.event_id = e.id
  WHERE e.host_user_id = (SELECT auth.uid())
     OR (a.user_id = (SELECT auth.uid()) AND a.registration_status IN ('approved', 'pending', 'invited'))
  ORDER BY e.event_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Ensure GRANT is set (idempotent)
GRANT EXECUTE ON FUNCTION public.get_accessible_events() TO authenticated;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
