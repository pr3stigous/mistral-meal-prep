/**
 * useCookTogetherInvitations Hook
 *
 * React Query hook for fetching and managing Cook Together event invitations.
 * Follows the same pattern as useSharedTrackers for tracker invitations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../AuthContext';
import {
  getPendingCookTogetherInvitations,
  acceptCookTogetherInvitation,
  declineCookTogetherInvitation,
  dismissCookTogetherInvitation,
  CookTogetherInvitation,
} from '../services/mealPrepInviteService';

export const cookTogetherKeys = {
  invitations: (userId: string) => ['cookTogether', 'invitations', userId] as const,
};

export const useCookTogetherInvitations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  /**
   * Fetch pending Cook Together invitations for the current user
   */
  const usePendingInvitations = () => {
    return useQuery<CookTogetherInvitation[], Error>({
      queryKey: cookTogetherKeys.invitations(userId || ''),
      queryFn: async () => {
        if (!userId) return [];
        return getPendingCookTogetherInvitations(userId);
      },
      enabled: !!userId,
    });
  };

  /**
   * Accept a Cook Together invitation
   * Updates attendee status from 'invited' to 'approved' and marks notification as read
   */
  const useAcceptInvitation = () => {
    return useMutation<
      { success: boolean; error?: string },
      Error,
      { eventId: string; notificationId: number }
    >({
      mutationFn: ({ eventId, notificationId }) => {
        if (!userId) throw new Error('User not authenticated');
        return acceptCookTogetherInvitation(userId, eventId, notificationId);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: cookTogetherKeys.invitations(userId || '') });
      },
    });
  };

  /**
   * Decline a Cook Together invitation
   * Updates attendee status to 'declined' and marks notification as read
   */
  const useDeclineInvitation = () => {
    return useMutation<
      { success: boolean; error?: string },
      Error,
      { eventId: string; notificationId: number }
    >({
      mutationFn: ({ eventId, notificationId }) => {
        if (!userId) throw new Error('User not authenticated');
        return declineCookTogetherInvitation(userId, eventId, notificationId);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: cookTogetherKeys.invitations(userId || '') });
      },
    });
  };

  /**
   * Dismiss (mark as read) a Cook Together invitation notification
   * Does not change attendee status - user can still accept later
   */
  const useDismissInvitation = () => {
    return useMutation<
      { success: boolean; error?: string },
      Error,
      { notificationId: number }
    >({
      mutationFn: ({ notificationId }) => dismissCookTogetherInvitation(notificationId),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: cookTogetherKeys.invitations(userId || '') });
      },
    });
  };

  return {
    usePendingInvitations,
    useAcceptInvitation,
    useDeclineInvitation,
    useDismissInvitation,
  };
};
