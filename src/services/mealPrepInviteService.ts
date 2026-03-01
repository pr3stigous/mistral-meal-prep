/**
 * Meal Prep Invite Service
 *
 * Handles invitation operations for meal prep events:
 * - Targeted invites (friends selected during event creation) - auto-approved
 * - Generic shareable link invites - require host approval
 *
 * Follows the same patterns as sharedTrackerService.ts
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// Types
// ============================================================================

export interface MealPrepRateLimitResult {
  allowed: boolean;
  same_email_blocked: boolean;
  daily_limit_reached: boolean;
  pending_limit_reached: boolean;
  daily_remaining: number;
  pending_remaining: number;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a random hex token (32 bytes = 64 hex chars)
 */
const generateToken = (): string => {
  const array = new Uint8Array(32);
  // Use crypto.getRandomValues in React Native
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Generate and store a shareable invite token for an event.
 * If the event already has a token, returns the existing one.
 */
export const generateEventInviteToken = async (
  eventId: string
): Promise<{ token: string; link: string } | null> => {
  // Check if event already has a token
  const { data: event } = await supabase
    .from('meal_prep_events')
    .select('invite_token')
    .eq('id', eventId)
    .single();

  if (event?.invite_token) {
    return {
      token: event.invite_token,
      link: `wellbody://signup?invite=${event.invite_token}`,
    };
  }

  // Generate new token
  const token = generateToken();

  const { error } = await supabase
    .from('meal_prep_events')
    .update({ invite_token: token })
    .eq('id', eventId);

  if (error) {
    console.error('Error generating invite token:', error);
    return null;
  }

  return {
    token,
    link: `wellbody://signup?invite=${token}`,
  };
};

/**
 * Get the shareable invite link for an event.
 * Generates one if it doesn't exist yet.
 */
export const getEventInviteLink = async (
  eventId: string
): Promise<string | null> => {
  const result = await generateEventInviteToken(eventId);
  return result?.link ?? null;
};

// ============================================================================
// Targeted Invitations (friends selected during event creation)
// ============================================================================

/**
 * Create targeted invitations for selected friends.
 * Creates attendees with 'invited' status - they must accept to become 'approved'.
 * (Previously auto-approved, now requires explicit acceptance like trackers)
 */
export const inviteToEvent = async (
  inviterId: string,
  eventId: string,
  inviteeUserIds: string[]
): Promise<{ success: boolean; error?: string; alreadyInvited?: boolean }> => {
  if (inviteeUserIds.length === 0) {
    return { success: true };
  }

  try {
    // Use SECURITY DEFINER RPC to bypass RLS (host inserting attendees for other users)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'invite_users_to_event',
      {
        p_event_id: eventId,
        p_user_ids: inviteeUserIds,
        p_registration_status: 'invited', // Changed from 'approved' - user must accept
        p_role: 'participant',
      }
    );

    if (rpcError) {
      console.error('Error creating event attendees:', rpcError);
      return { success: false, error: rpcError.message };
    }

    if (rpcResult && !rpcResult.success) {
      console.error('RPC error:', rpcResult.error);
      return { success: false, error: rpcResult.error };
    }

    // ON CONFLICT DO NOTHING means inserted=0 if user was already an attendee
    if (rpcResult?.inserted === 0) {
      return { success: true, alreadyInvited: true };
    }

    // For each invited user, get their email and create pending_invitations + rate limit records
    for (const userId of inviteeUserIds) {
      try {
        // Get user email from profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('user_id', userId)
          .single();

        if (profile?.email) {
          // Create pending_invitation record (for tracking/notification purposes)
          await supabase.from('pending_invitations').insert({
            inviter_id: inviterId,
            invitee_email: profile.email.toLowerCase().trim(),
            invitation_type: 'meal_prep',
            event_id: eventId,
          });

          // Record rate limit entry (with event_id for per-event limiting)
          await supabase.from('invitation_rate_limits').insert({
            user_id: inviterId,
            invitee_email: profile.email.toLowerCase().trim(),
            invitation_type: 'meal_prep',
            event_id: eventId,
          });
        }
      } catch (err) {
        // Continue with other invitees if one fails
        console.error('Error processing invite for user:', userId, err);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error inviting to event:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// Event Preview by Token
// ============================================================================

export interface EventPreview {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  location_name: string | null;
  location_city: string | null;
  location_state: string | null;
  expected_participants: string | null;
  estimated_duration_minutes: number | null; // Legacy
  event_end_time?: string | null;
  dietary_accommodations: string[] | null;
  skill_level: string | null;
  host_user_id: string;
  host_name: string;
  attendee_count: number;
  recipe_id: string | null;
  // Enriched fields for rich preview
  hero_emoji?: string | null;
  hero_gradient?: string[] | null;
  recipe_name?: string | null;
  recipe_image_url?: string | null;
  recipe_prep_time?: number | null;
  recipe_cook_time?: number | null;
  recipe_servings?: number | null;
  recipe_meal_prep_score?: number | null;
  // Full recipe fields (for recipe detail sheet in preview)
  recipe_description?: string | null;
  recipe_ingredients?: Array<{ name: string; quantity: number; unit: string; category?: string }> | null;
  recipe_instructions?: string[] | null;
  recipe_nutritional_info?: Record<string, number> | null;
  recipe_tags?: string[] | null;
  recipe_equipment_needed?: string[] | null;
  recipe_skill_level?: string | null;
  recipe_meal_prep_score_explanation?: string | null;
  recipe_source_url?: string | null;
  contribution_count?: number;
}

/**
 * Fetch event details by invite token (for preview before joining).
 * Uses SECURITY DEFINER RPC to bypass RLS.
 */
export const getEventByInviteToken = async (
  token: string
): Promise<{ success: boolean; event?: EventPreview; error?: string }> => {
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'get_event_by_invite_token',
      { p_token: token }
    );

    if (rpcError) {
      console.error('Error calling get_event_by_invite_token RPC:', rpcError);
      return {
        success: false,
        error: rpcError.message || 'Failed to fetch event',
      };
    }

    const result = rpcResult as {
      success: boolean;
      error?: string;
      event?: EventPreview;
    };

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Invalid invitation',
      };
    }

    return {
      success: true,
      event: result.event,
    };
  } catch (error: any) {
    console.error('Error fetching event by token:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// Generic Link Acceptance
// ============================================================================

/**
 * Accept a meal prep event invitation via token (generic shareable link).
 * Uses SECURITY DEFINER RPC to bypass RLS (user can't see event yet).
 * Creates an event_attendees record with 'pending' status (requires host approval).
 * Also creates a friend connection with the host.
 */
export const acceptEventInviteByToken = async (
  token: string,
  userId: string
): Promise<{ success: boolean; eventId?: string; error?: string }> => {
  try {
    // Use SECURITY DEFINER RPC to accept invite (bypasses RLS)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'accept_event_invite',
      {
        p_token: token,
        p_user_id: userId,
      }
    );

    if (rpcError) {
      console.error('Error calling accept_event_invite RPC:', rpcError);
      return {
        success: false,
        error: rpcError.message || 'Failed to accept invitation',
      };
    }

    const result = rpcResult as {
      success: boolean;
      error?: string;
      event_id?: string;
      event_title?: string;
      registration_status?: string;
      is_generic_link?: boolean;
      already_attendee?: boolean;
    };

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Invalid invitation',
      };
    }

    return {
      success: true,
      eventId: result.event_id,
    };
  } catch (error: any) {
    console.error('Error accepting event invite:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// Cook Together Invitations (SupportersScreen)
// ============================================================================

export interface CookTogetherInvitation {
  notificationId: number;
  eventId: string;
  eventTitle: string;
  eventDate: string | null;
  eventTime: string | null;
  eventLocation: string | null;
  inviterName: string | null;
  inviterId: string | null;
  createdAt: string;
}

/**
 * Get pending Cook Together invitations for the current user.
 * Queries the notifications table for unread cook_together_invitation entries,
 * then enriches with event details (date, time, location).
 */
export const getPendingCookTogetherInvitations = async (
  userId: string
): Promise<CookTogetherInvitation[]> => {
  // Query unread cook_together_invitation notifications
  const { data: notifications, error: notifError } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'cook_together_invitation')
    .eq('is_read', false)
    .order('created_at', { ascending: false });

  if (notifError) {
    console.error('Error fetching Cook Together notifications:', notifError);
    throw new Error(`Failed to fetch invitations: ${notifError.message}`);
  }

  if (!notifications || notifications.length === 0) return [];

  // Extract unique event IDs from notification data
  const eventIds = [
    ...new Set(
      notifications
        .map((n: any) => (n.data as any)?.event_id)
        .filter(Boolean)
    ),
  ];

  // Batch-fetch event details for date/time/location
  let eventMap = new Map<string, any>();
  if (eventIds.length > 0) {
    const { data: events, error: eventError } = await supabase
      .from('meal_prep_events')
      .select('id, title, event_date, event_time, location_name, location_address')
      .in('id', eventIds);

    if (eventError) {
      console.error('Error fetching event details for invitations:', eventError);
      // Continue without event details - we still have title from notification
    } else if (events) {
      eventMap = new Map(events.map((e: any) => [e.id, e]));
    }
  }

  // Merge notification data with event details
  return notifications.map((n: any) => {
    const data = n.data as any;
    const eventId = data?.event_id;
    const event = eventMap.get(eventId);

    return {
      notificationId: n.id,
      eventId: eventId || '',
      eventTitle: event?.title || data?.event_title || 'Cook Together Event',
      eventDate: event?.event_date || null,
      eventTime: event?.event_time || null,
      eventLocation: event?.location_name || event?.location_address || null,
      inviterName: data?.inviter_name || null,
      inviterId: data?.inviter_id || null,
      createdAt: n.created_at,
    };
  });
};

/**
 * Accept a Cook Together invitation.
 * Updates the attendee record from 'invited' to 'approved' and marks notification as read.
 */
export const acceptCookTogetherInvitation = async (
  userId: string,
  eventId: string,
  notificationId?: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Use RPC to update attendee status (bypasses RLS)
    const { data, error: rpcError } = await supabase.rpc('accept_direct_event_invite', {
      p_event_id: eventId,
      p_user_id: userId,
    });

    if (rpcError) {
      console.error('Error accepting Cook Together invitation (RPC):', rpcError);
      return { success: false, error: rpcError.message };
    }

    const result = data as { success: boolean; error?: string; message?: string };
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to accept invitation' };
    }

    // Mark notification as read (if notificationId provided)
    if (notificationId) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error accepting Cook Together invitation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Decline a Cook Together invitation.
 * Updates the attendee record to 'declined' and marks notification as read.
 */
export const declineCookTogetherInvitation = async (
  userId: string,
  eventId: string,
  notificationId?: number
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Use RPC to update attendee status (bypasses RLS)
    const { data, error: rpcError } = await supabase.rpc('decline_direct_event_invite', {
      p_event_id: eventId,
      p_user_id: userId,
    });

    if (rpcError) {
      console.error('Error declining Cook Together invitation (RPC):', rpcError);
      return { success: false, error: rpcError.message };
    }

    const result = data as { success: boolean; error?: string; message?: string };
    if (!result.success) {
      return { success: false, error: result.error || 'Failed to decline invitation' };
    }

    // Mark notification as read (if notificationId provided)
    if (notificationId) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error declining Cook Together invitation:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Dismiss a Cook Together invitation by marking the notification as read.
 * The user remains an invited attendee - they can still accept later.
 */
export const dismissCookTogetherInvitation = async (
  notificationId: number
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error dismissing Cook Together invitation:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
};

// ============================================================================
// Email Invitations
// ============================================================================

/**
 * Invite someone to a meal prep event by email.
 * Creates a pending_invitation record which triggers the edge function to send an email.
 *
 * Behavior matches tracker invitations:
 * - Existing user: Creates event_attendees (approved) + pending_invitation (email)
 * - Non-user: Creates pending_invitation only (email); auto-approved when they sign up
 *
 * The pending_invitation gets its own auto-generated token (not the event's generic
 * invite_token), so the accept_event_invite RPC treats it as a targeted invite
 * and auto-approves the user.
 */
export const inviteToEventByEmail = async (
  inviterId: string,
  eventId: string,
  email: string,
  eventTitle?: string
): Promise<{ success: boolean; error?: string }> => {
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // First check if this user already exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('email', normalizedEmail)
      .single();

    if (profile?.user_id) {
      // User exists - invite them directly (auto-approved)
      // This creates both event_attendees AND pending_invitation (for email)
      const result = await inviteToEvent(inviterId, eventId, [profile.user_id]);
      return result;
    }

    // User doesn't exist - create pending invitation to trigger email
    // Don't specify token - let it auto-generate so it's treated as a targeted invite
    // (not a generic link) when the user signs up and accepts
    const { error } = await supabase.from('pending_invitations').insert({
      inviter_id: inviterId,
      invitee_email: normalizedEmail,
      invitation_type: 'meal_prep',
      event_id: eventId,
      // token: auto-generated by DB default
    });

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Invitation already sent to this email' };
      }
      return { success: false, error: error.message };
    }

    // Record for rate limiting
    await supabase.from('invitation_rate_limits').insert({
      user_id: inviterId,
      invitee_email: normalizedEmail,
      invitation_type: 'meal_prep',
      event_id: eventId,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error inviting by email:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Check rate limits for sending a meal prep invitation.
 * Uses per-event rate limiting: 3 per email per event per 14 days, 15/day globally.
 */
export const checkMealPrepInviteRateLimit = async (
  email: string,
  eventId: string
): Promise<MealPrepRateLimitResult> => {
  const { data, error } = await supabase.rpc('check_invitation_rate_limit', {
    p_invitee_email: email,
    p_event_id: eventId,
  });

  if (error) {
    console.error('Error checking meal prep rate limit:', error);
    return {
      allowed: false,
      same_email_blocked: false,
      daily_limit_reached: false,
      pending_limit_reached: false,
      daily_remaining: 0,
      pending_remaining: 0,
    };
  }

  return data as unknown as MealPrepRateLimitResult;
};
