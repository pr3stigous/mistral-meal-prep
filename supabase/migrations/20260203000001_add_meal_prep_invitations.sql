-- Migration: Add Meal Prep Invitations Support
-- Description: Extends the invitation system to support meal prep event invitations
-- Author: Claude Code
-- Date: 2026-02-03

-------------------------------------------------------------------------------
-- Part 1: Extend pending_invitations for meal_prep type
-------------------------------------------------------------------------------

-- Drop the existing CHECK constraint on invitation_type and add meal_prep
ALTER TABLE public.pending_invitations
DROP CONSTRAINT IF EXISTS pending_invitations_invitation_type_check;

ALTER TABLE public.pending_invitations
ADD CONSTRAINT pending_invitations_invitation_type_check
  CHECK (invitation_type IN ('wellpal', 'challenge', 'meal_prep'));

-- Add event_id column for meal prep invitations
ALTER TABLE public.pending_invitations
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.meal_prep_events(id) ON DELETE CASCADE;

-- Index for event_id lookups
CREATE INDEX IF NOT EXISTS idx_pi_event_id
  ON public.pending_invitations(event_id)
  WHERE event_id IS NOT NULL;

-- Drop old unique constraint and create a new one that accounts for event_id
-- The old constraint was: UNIQUE(inviter_id, invitee_email, tracker_id)
-- We need to handle NULLs in tracker_id and event_id for uniqueness
ALTER TABLE public.pending_invitations
DROP CONSTRAINT IF EXISTS pending_invitations_inviter_id_invitee_email_tracker_id_key;

-- Create a unique index that handles NULLs properly using COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_unique_invitation
  ON public.pending_invitations (
    inviter_id,
    invitee_email,
    COALESCE(tracker_id::text, ''),
    COALESCE(event_id::text, '')
  );

-- Add event_id to invitation_rate_limits for per-event rate limiting
ALTER TABLE public.invitation_rate_limits
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.meal_prep_events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_irl_event_id
  ON public.invitation_rate_limits(event_id)
  WHERE event_id IS NOT NULL;

-------------------------------------------------------------------------------
-- Part 2: Add invite_token to meal_prep_events
-------------------------------------------------------------------------------

ALTER TABLE public.meal_prep_events
ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;

-- Note: The UNIQUE constraint above already creates an implicit unique index,
-- so no additional index on invite_token is needed.

COMMENT ON COLUMN public.meal_prep_events.invite_token IS 'Shareable invite token for generic invite links. Generated at event publish time.';

-------------------------------------------------------------------------------
-- Part 3: Update check_invitation_rate_limit RPC
-- Now supports per-event rate limiting for meal prep:
--   - 3 invites to same email per event per 14 days
--   - 15 invites per day globally across all events
--
-- IMPORTANT: We must drop the old single-arg function first, otherwise
-- CREATE OR REPLACE with a different signature creates a second overload.
-- Existing callers (sharedTrackerService) pass only email, so they'll use
-- the DEFAULT NULL for p_event_id and get the legacy behavior.
-------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.check_invitation_rate_limit(text);

CREATE OR REPLACE FUNCTION public.check_invitation_rate_limit(
  p_invitee_email text,
  p_event_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_same_email_count integer;
  v_daily_count integer;
  v_pending_count integer;
  v_result jsonb;
BEGIN
  -- Check: Same email within 14 days (per-event if event_id provided, otherwise global)
  IF p_event_id IS NOT NULL THEN
    -- Meal prep: count invites to same email for same event in 14 days (max 3)
    SELECT COUNT(*) INTO v_same_email_count
    FROM public.invitation_rate_limits
    WHERE user_id = (SELECT auth.uid())
      AND invitee_email = p_invitee_email
      AND event_id = p_event_id
      AND sent_at > NOW() - INTERVAL '14 days';
  ELSE
    -- Legacy: count any invites to same email in 14 days
    SELECT COUNT(*) INTO v_same_email_count
    FROM public.invitation_rate_limits
    WHERE user_id = (SELECT auth.uid())
      AND invitee_email = p_invitee_email
      AND sent_at > NOW() - INTERVAL '14 days';
  END IF;

  -- Check: Daily sends (global across all events)
  SELECT COUNT(*) INTO v_daily_count
  FROM public.invitation_rate_limits
  WHERE user_id = (SELECT auth.uid())
    AND sent_at > NOW() - INTERVAL '1 day';

  -- Check: Total pending invitations
  SELECT COUNT(*) INTO v_pending_count
  FROM public.pending_invitations
  WHERE inviter_id = (SELECT auth.uid())
    AND status = 'pending';

  -- For meal prep: same_email limit is 3 per event; for others: 1 globally
  IF p_event_id IS NOT NULL THEN
    v_result := jsonb_build_object(
      'allowed', (v_same_email_count < 3 AND v_daily_count < 15 AND v_pending_count < 30),
      'same_email_blocked', v_same_email_count >= 3,
      'daily_limit_reached', v_daily_count >= 15,
      'pending_limit_reached', v_pending_count >= 30,
      'daily_remaining', GREATEST(15 - v_daily_count, 0),
      'pending_remaining', GREATEST(30 - v_pending_count, 0)
    );
  ELSE
    v_result := jsonb_build_object(
      'allowed', (v_same_email_count = 0 AND v_daily_count < 15 AND v_pending_count < 30),
      'same_email_blocked', v_same_email_count > 0,
      'daily_limit_reached', v_daily_count >= 15,
      'pending_limit_reached', v_pending_count >= 30,
      'daily_remaining', GREATEST(15 - v_daily_count, 0),
      'pending_remaining', GREATEST(30 - v_pending_count, 0)
    );
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.check_invitation_rate_limit(text, uuid) TO authenticated;

-------------------------------------------------------------------------------
-- Part 4: Update get_invitation_by_token RPC
-- Now handles meal_prep invitation type and generic event invite tokens
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token text)
RETURNS jsonb AS $$
DECLARE
  v_invitation record;
  v_inviter_name text;
  v_tracker_name text;
  v_event_title text;
  v_event_id uuid;
  v_host_id uuid;
BEGIN
  -- First, try to find in pending_invitations
  SELECT
    id,
    invitee_email,
    invitation_type,
    tracker_id,
    event_id,
    inviter_id,
    status
  INTO v_invitation
  FROM public.pending_invitations
  WHERE token = p_token;

  -- If not found in pending_invitations, check meal_prep_events.invite_token
  IF NOT FOUND THEN
    SELECT id, host_user_id, title
    INTO v_event_id, v_host_id, v_event_title
    FROM public.meal_prep_events
    WHERE invite_token = p_token;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invitation not found'
      );
    END IF;

    -- Get host name
    SELECT name INTO v_inviter_name
    FROM public.profiles
    WHERE user_id = v_host_id;

    -- Return generic event invite info
    RETURN jsonb_build_object(
      'success', true,
      'invitee_email', '',
      'invitation_type', 'meal_prep',
      'event_id', v_event_id,
      'event_title', v_event_title,
      'inviter_name', COALESCE(v_inviter_name, 'Someone'),
      'is_generic_link', true
    );
  END IF;

  -- Check if invitation is still pending
  IF v_invitation.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invitation is no longer valid',
      'status', v_invitation.status
    );
  END IF;

  -- Get inviter's name
  SELECT name INTO v_inviter_name
  FROM public.profiles
  WHERE user_id = v_invitation.inviter_id;

  -- Get tracker name if this is a challenge invitation
  IF v_invitation.invitation_type = 'challenge' AND v_invitation.tracker_id IS NOT NULL THEN
    SELECT name INTO v_tracker_name
    FROM public.user_trackers
    WHERE id = v_invitation.tracker_id;
  END IF;

  -- Get event title if this is a meal_prep invitation
  IF v_invitation.invitation_type = 'meal_prep' AND v_invitation.event_id IS NOT NULL THEN
    SELECT title INTO v_event_title
    FROM public.meal_prep_events
    WHERE id = v_invitation.event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invitee_email', v_invitation.invitee_email,
    'invitation_type', v_invitation.invitation_type,
    'tracker_id', v_invitation.tracker_id,
    'event_id', v_invitation.event_id,
    'event_title', v_event_title,
    'inviter_name', COALESCE(v_inviter_name, 'Someone'),
    'tracker_name', v_tracker_name,
    'is_generic_link', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Grant execute to both authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon;

-------------------------------------------------------------------------------
-- Part 5: SECURITY DEFINER function for hosts to add attendees
-- The INSERT RLS policy on event_attendees only allows user_id = auth.uid().
-- Hosts need to add other users as attendees when publishing events.
-------------------------------------------------------------------------------

-- Ensure UNIQUE constraint on (event_id, user_id) exists for ON CONFLICT clause.
-- Uses exception handling for idempotency (safe if constraint already exists).
DO $$
BEGIN
  ALTER TABLE public.event_attendees
    ADD CONSTRAINT event_attendees_event_id_user_id_key UNIQUE (event_id, user_id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

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
BEGIN
  -- Verify caller is the host of this event
  SELECT host_user_id INTO v_host_id
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

  -- Insert attendees, skipping duplicates
  INSERT INTO public.event_attendees (event_id, user_id, role, registration_status)
  SELECT p_event_id, unnest(p_user_ids), p_role, p_registration_status
  ON CONFLICT (event_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'inserted', v_inserted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

GRANT EXECUTE ON FUNCTION public.invite_users_to_event(uuid, uuid[], text, text) TO authenticated;
