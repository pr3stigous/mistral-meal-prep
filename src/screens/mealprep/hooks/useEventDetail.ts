import { useMemo } from 'react';
import { Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { MealPrepEvent } from '../../../lib/types';
import { useAuth } from '../../../AuthContext';

// =====================================================
// TYPES
// =====================================================

export type ProfileInfo = {
  user_id: string;
  name: string | null;
  username?: string | null;
};

export type EventAttendee = {
  id: string;
  event_id: string;
  user_id: string;
  role: 'participant' | 'co-leader' | 'pickup_only';
  requested_at?: string;
  decision_at?: string | null;
  notes_for_host?: string | null;
  registration_status: string;
  profiles: ProfileInfo | null;
};

export type EventContributionNeeded = {
  id: string;
  event_id: string;
  description: string;
  type: string;
  quantity_needed: number | null;
  unit: string;
  status: string;
  is_optional?: boolean;
  estimated_cost?: number | null;
  notes?: string | null;
  suggested_alternatives?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EventContributionClaim = {
  id: string;
  contribution_needed_id: string;
  user_id: string;
  quantity_claimed: number;
  claimed_at?: string | null;
  user_name?: string | null;
};

export type LinkedRecipe = {
  id: number;
  name: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  image_url: string | null;
};

export type FullRecipe = {
  id: number;
  name: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  image_url: string | null;
  ingredients: Array<{ name: string; quantity: number; unit: string; category?: string }> | null;
  instructions: string[] | null;
  nutritional_info: Record<string, number> | null;
  tags: string[] | null;
  skill_level?: string;
  meal_prep_score?: number;
  meal_prep_score_explanation?: string;
  equipment_needed?: string[];
  source_url?: string;
};

interface DeleteClaimAsHostResponse {
  success: boolean;
  message: string;
  deleted_claim_id?: string;
}

// =====================================================
// FETCH FUNCTIONS
// =====================================================

const fetchEventDetails = async (eventId: string): Promise<MealPrepEvent | null> => {
  if (!eventId) return null;
  const { data, error } = await supabase
    .from('meal_prep_events')
    .select('*')
    .eq('id', eventId)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return data as MealPrepEvent | null;
};

/**
 * Fetches all shared event data via SECURITY DEFINER RPC.
 * Bypasses RLS to return recipe, attendees, contributions, and claims
 * for any user with access to the event (host, approved, pending, invited).
 */
const fetchEventDetailData = async (eventId: string) => {
  if (!eventId) return null;
  const { data, error } = await supabase.rpc('get_event_detail_data', {
    p_event_id: eventId,
  });
  if (error) throw new Error(error.message);
  if (data?.error) return null;
  return data;
};

const fetchAttendeeWithProfile = async (attendee: any): Promise<EventAttendee> => {
  const asserted = { ...attendee, role: attendee.role as EventAttendee['role'] };
  const { data: profile } = await supabase
    .from('profiles').select('user_id, name').eq('user_id', asserted.user_id).single();
  return { ...asserted, profiles: profile || null } as EventAttendee;
};

const fetchAttendeeStatus = async (eventId: string, userId: string | undefined): Promise<EventAttendee | null> => {
  if (!eventId || !userId) return null;
  const { data, error } = await supabase
    .from('event_attendees')
    .select('id, event_id, user_id, registration_status, role, requested_at, decision_at, notes_for_host')
    .eq('event_id', eventId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return fetchAttendeeWithProfile(data);
};

// =====================================================
// HOOK
// =====================================================

export function useEventDetail(eventId: string) {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  // ---------- Queries ----------

  // Event details (works via existing RLS on meal_prep_events)
  const { data: event, isLoading: isLoadingEvent, error: eventError, refetch: refetchEvent } = useQuery({
    queryKey: ['mealPrepEvent', eventId],
    queryFn: () => fetchEventDetails(eventId),
    enabled: !!eventId,
  });

  // User's own attendee status (works via existing RLS - own row access)
  const { data: attendeeStatus, isLoading: isLoadingAttendeeStatus, refetch: refetchAttendeeStatus } = useQuery({
    queryKey: ['attendeeStatus', eventId, currentUser?.id],
    queryFn: () => fetchAttendeeStatus(eventId, currentUser?.id),
    enabled: !!eventId && !!currentUser?.id,
  });

  // All shared event data via SECURITY DEFINER RPC (recipe, attendees, contributions, claims)
  const { data: detailData, refetch: refetchDetailData } = useQuery({
    queryKey: ['eventDetailData', eventId],
    queryFn: () => fetchEventDetailData(eventId),
    enabled: !!eventId,
  });

  // Extract individual pieces from RPC response
  const linkedRecipe: LinkedRecipe | null = detailData?.linked_recipe || null;
  const fullRecipeData: FullRecipe | null = detailData?.full_recipe || null;
  const approvedAttendees: EventAttendee[] = detailData?.approved_attendees || [];
  const pendingAttendees: EventAttendee[] = detailData?.pending_attendees || [];
  const contributionsNeeded: EventContributionNeeded[] = detailData?.contributions_needed || [];
  const contributionClaims: EventContributionClaim[] = detailData?.contribution_claims || [];
  const approvedParticipantCount: number = detailData?.approved_participant_count || 0;
  const approvedPickupOnlyCount: number = detailData?.approved_pickup_only_count || 0;

  // Provide fetchFullRecipeEnabled for backward compat (data already loaded via RPC)
  const fetchFullRecipeEnabled = (_recipeId: number | null | undefined, _enabled: boolean) =>
    useQuery<FullRecipe | null>({
      queryKey: ['fullRecipe', event?.recipe_id],
      queryFn: () => Promise.resolve(fullRecipeData),
      enabled: !!fullRecipeData,
      initialData: fullRecipeData,
    });

  const isOriginalHost = useMemo(() => event?.host_user_id === currentUser?.id, [event, currentUser?.id]);
  const isCoLeader = useMemo(
    () => attendeeStatus?.role === 'co-leader' && attendeeStatus?.registration_status === 'approved',
    [attendeeStatus]
  );
  const canManageEvent = useMemo(() => isOriginalHost || isCoLeader, [isOriginalHost, isCoLeader]);
  const isUserApproved = attendeeStatus?.registration_status === 'approved';

  // ---------- Mutations ----------

  const updateAttendeeStatus = useMutation({
    mutationFn: async ({ attendeeId, newStatus, role, notes }: {
      attendeeId: string; newStatus: string; role?: string; notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('update_attendee_status', {
        p_attendee_id: attendeeId,
        p_new_status: newStatus,
        p_role: role || null,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      refetchDetailData();
      refetchAttendeeStatus();
      queryClient.invalidateQueries({ queryKey: ['approvedParticipantCount', eventId] });
      queryClient.invalidateQueries({ queryKey: ['approvedPickupOnlyCount', eventId] });
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to update status.');
    },
  });

  const addClaim = useMutation({
    mutationFn: async ({ contributionNeededId, quantity }: { contributionNeededId: string; quantity: number }) => {
      if (!currentUser?.id) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('claim_event_contribution', {
        p_contribution_needed_id: contributionNeededId,
        p_quantity: quantity,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      refetchDetailData();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to claim item.');
    },
  });

  const removeClaim = useMutation({
    mutationFn: async ({ claimId }: { claimId: string }) => {
      const { data, error } = await supabase.rpc('unclaim_event_contribution', { p_claim_id: claimId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      refetchDetailData();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to remove claim.');
    },
  });

  const removeClaimAsHost = useMutation({
    mutationFn: async (claimId: string) => {
      const { data, error } = await supabase.rpc('delete_claim_as_host', { p_claim_id: claimId });
      if (error) throw error;
      return data as DeleteClaimAsHostResponse;
    },
    onSuccess: () => {
      refetchDetailData();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to remove claim.');
    },
  });

  const updateAttendeeRole = useMutation({
    mutationFn: async ({ attendeeId, newRole }: { attendeeId: string; newRole: 'participant' | 'co-leader' }) => {
      const { data, error } = await supabase
        .from('event_attendees').update({ role: newRole }).eq('id', attendeeId).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      refetchDetailData();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to update role.');
    },
  });

  const addAttendee = useMutation({
    mutationFn: async ({ userId, role, notes }: {
      userId: string; role: 'participant' | 'pickup_only'; notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('add_event_attendee', {
        p_event_id: eventId,
        p_user_id: userId,
        p_role: role,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      refetchAttendeeStatus();
      refetchDetailData();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to request to join.');
    },
  });

  const reRequestToJoin = useMutation({
    mutationFn: async ({ attendeeId, role, notes }: {
      attendeeId: string; role: string; notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('re_request_to_join', {
        p_attendee_id: attendeeId,
        p_role: role,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      refetchAttendeeStatus();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message || 'Failed to re-request.');
    },
  });

  const toggleCommentsRestriction = useMutation({
    mutationFn: async ({ restricted }: { restricted: boolean }) => {
      const { error } = await supabase.rpc('toggle_comments_restriction', {
        p_event_id: eventId,
        p_restricted: restricted,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refetchEvent();
    },
  });

  const refetchAll = () => {
    refetchEvent();
    refetchAttendeeStatus();
    refetchDetailData();
  };

  return {
    // Queries
    event,
    isLoadingEvent,
    eventError,
    linkedRecipe,
    fetchFullRecipeEnabled,
    attendeeStatus,
    isLoadingAttendeeStatus,
    pendingAttendees,
    approvedAttendees,
    approvedParticipantCount,
    approvedPickupOnlyCount,
    contributionsNeeded,
    contributionClaims,

    // Derived
    isOriginalHost,
    isCoLeader,
    canManageEvent,
    isUserApproved: isUserApproved || false,

    // Mutations
    updateAttendeeStatus,
    addClaim,
    removeClaim,
    removeClaimAsHost,
    updateAttendeeRole,
    addAttendee,
    reRequestToJoin,
    toggleCommentsRestriction,

    refetchAll,
    refetchEvent,
    refetchAttendeeStatus,
  };
}
