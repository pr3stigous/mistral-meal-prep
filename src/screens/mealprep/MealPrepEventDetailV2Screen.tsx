import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii, mpShadows } from '../../constants/mealPrepTheme';
import { useEventDetail, LinkedRecipe, FullRecipe, EventAttendee } from './hooks/useEventDetail';
import { MealPrepEvent } from '../../lib/types';
import {
  getEventInviteLink,
  getEventByInviteToken,
  acceptEventInviteByToken,
  acceptCookTogetherInvitation,
  declineCookTogetherInvitation,
  EventPreview,
} from '../../services/mealPrepInviteService';

// Section components
import DetailHeroBanner from './detail-sections/DetailHeroBanner';
import DetailStateBanner from './detail-sections/DetailStateBanner';
import DetailEventInfo from './detail-sections/DetailEventInfo';
import DetailMetaGrid from './detail-sections/DetailMetaGrid';
import DetailAttendeesRow from './detail-sections/DetailAttendeesRow';
import DetailCapacityCard from './detail-sections/DetailCapacityCard';
import DetailRecipeCard from './detail-sections/DetailRecipeCard';
import DetailHostPackage from './detail-sections/DetailHostPackage';
import DetailContributionBoard from './detail-sections/DetailContributionBoard';
import DetailShareInvite from './detail-sections/DetailShareInvite';
import DetailComments from './detail-sections/DetailComments';
import DetailAttendeesList from './detail-sections/DetailAttendeesList';
import DetailDeleteEvent from './detail-sections/DetailDeleteEvent';
import DetailNotesRequirements from './detail-sections/DetailNotesRequirements';
import DetailStickyBottomBar from './detail-sections/DetailStickyBottomBar';
import DetailInvitedBanner from './detail-sections/DetailInvitedBanner';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'MealPrepEventDetail'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'MealPrepEventDetail'>;

type Props = {
  route: RouteProps;
};

export default function MealPrepEventDetailV2Screen({ route }: Props) {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { eventId, inviteToken, invitedMode, notificationId } = route.params;

  // Core hook
  const {
    event, isLoadingEvent, eventError,
    linkedRecipe,
    fetchFullRecipeEnabled,
    attendeeStatus, isLoadingAttendeeStatus,
    pendingAttendees, approvedAttendees,
    approvedParticipantCount, approvedPickupOnlyCount,
    contributionsNeeded, contributionClaims,
    isOriginalHost, isCoLeader, canManageEvent, isUserApproved,
    updateAttendeeStatus, addClaim, removeClaim, removeClaimAsHost,
    updateAttendeeRole, addAttendee, reRequestToJoin, toggleCommentsRestriction,
    refetchAll, refetchEvent, refetchAttendeeStatus,
  } = useEventDetail(eventId);

  // Event requirements
  const { data: eventRequirements = [] } = useQuery({
    queryKey: ['eventRequirements', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_requirements')
        .select('id, description, type')
        .eq('event_id', eventId);
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!eventId,
  });

  // Full recipe (fetched on demand)
  const [showRecipeDetail, setShowRecipeDetail] = useState(false);
  const { data: fullRecipe } = fetchFullRecipeEnabled(event?.recipe_id, showRecipeDetail || !!event?.recipe_id);

  // Preview mode state (for invite token without RLS access)
  const [previewEvent, setPreviewEvent] = useState<EventPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Invite state
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [isDecliningInvite, setIsDecliningInvite] = useState(false);
  const [hasAcceptedInvite, setHasAcceptedInvite] = useState(false);

  // Join state
  const [isJoining, setIsJoining] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);
  const [hasRequestedToJoin, setHasRequestedToJoin] = useState(false);

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      refetchAll();
    }, [])
  );

  // Load preview if we have a token but no event (RLS blocked)
  useEffect(() => {
    if (!event && !isLoadingEvent && inviteToken && !previewEvent && !isLoadingPreview) {
      setIsLoadingPreview(true);
      getEventByInviteToken(inviteToken)
        .then(result => {
          if (result.success && result.event) setPreviewEvent(result.event);
        })
        .catch(console.error)
        .finally(() => setIsLoadingPreview(false));
    }
  }, [event, isLoadingEvent, inviteToken, previewEvent, isLoadingPreview]);

  // Handlers
  const handleRequestToJoin = async () => {
    if (!user?.id) return;
    if (event?.joining_paused || event?.is_cancelled) {
      Alert.alert('Unavailable', event?.is_cancelled ? 'This event has been cancelled.' : 'Joining is currently paused for this event.');
      return;
    }
    setIsJoining(true);
    try {
      if (inviteToken) {
        await acceptEventInviteByToken(inviteToken, user.id);
      } else {
        await addAttendee.mutateAsync({ userId: user.id, role: 'participant' });
      }
      setHasRequestedToJoin(true);
      refetchAttendeeStatus();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to request to join.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!attendeeStatus?.id) return;
    setIsCancelling(true);
    try {
      await updateAttendeeStatus.mutateAsync({ attendeeId: attendeeStatus.id, newStatus: 'cancelled_by_user' });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleLeaveEvent = () => {
    if (!attendeeStatus?.id) return;
    Alert.alert('Leave Event', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => updateAttendeeStatus.mutateAsync({ attendeeId: attendeeStatus.id, newStatus: 'cancelled_by_user' }),
      },
    ]);
  };

  const handleAcceptInvite = async () => {
    if (!user?.id) return;
    setIsAcceptingInvite(true);
    try {
      await acceptCookTogetherInvitation(user.id, eventId, notificationId);
      setHasAcceptedInvite(true);
      refetchAttendeeStatus();
      refetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept invite.');
    } finally {
      setIsAcceptingInvite(false);
    }
  };

  const handleDeclineInvite = async () => {
    if (!user?.id) return;
    setIsDecliningInvite(true);
    try {
      await declineCookTogetherInvitation(user.id, eventId, notificationId);
      Alert.alert('Declined', 'You have declined this invitation.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to decline invite.');
    } finally {
      setIsDecliningInvite(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event?.id) return;
    setIsDeletingEvent(true);
    try {
      // Delete contributions via RPC (bypasses RLS on event_contributions_needed)
      await supabase.rpc('delete_event_contributions', { p_event_id: event.id });
      await supabase.from('event_attendees').delete().eq('event_id', event.id);
      await supabase.from('meal_prep_events').delete().eq('id', event.id);
      Alert.alert('Deleted', 'Event has been deleted.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete event.');
    } finally {
      setIsDeletingEvent(false);
    }
  };

  const isPastEvent = (() => {
    if (!event?.event_date) return false;
    const eventDate = new Date(event.event_date + 'T23:59:59');
    return eventDate < new Date();
  })();

  const handleEdit = () => {
    navigation.navigate('EditMealPrepEvent', { eventId });
  };

  const handleShareEvent = async () => {
    const link = await getEventInviteLink(eventId);
    if (link) {
      await Share.share({ message: `Join my Cook Together event! ${link}` });
    }
  };

  const isInvitedStatus = attendeeStatus?.registration_status === 'invited' && !hasAcceptedInvite;
  const isPendingStatus = attendeeStatus?.registration_status === 'pending';
  const isInPreviewMode = !event && !isLoadingEvent && previewEvent && inviteToken;

  // Loading
  if (isLoadingEvent && !previewEvent) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={mpColors.teal} />
      </SafeAreaView>
    );
  }

  // Preview mode (invite token, no direct access)
  if (isInPreviewMode) {
    // Build mock MealPrepEvent from preview data for detail components
    const mockEvent = {
      id: previewEvent.id,
      title: previewEvent.title,
      description: previewEvent.description,
      event_date: previewEvent.event_date || '',
      event_time: previewEvent.event_time,
      location: previewEvent.location_name,
      location_city: previewEvent.location_city,
      location_state: previewEvent.location_state,
      address_visibility: 'after_rsvp',
      estimated_duration_minutes: null,
      event_end_time: previewEvent.event_end_time || null,
      expected_participants: previewEvent.expected_participants,
      dietary_accommodations: previewEvent.dietary_accommodations,
      skill_level: previewEvent.skill_level,
      hero_emoji: previewEvent.hero_emoji || '🍳',
      hero_gradient: previewEvent.hero_gradient || ['#FFF6E5', '#FFECD2'],
      host_id: previewEvent.host_user_id,
      host_user_id: previewEvent.host_user_id,
      status: 'planning',
      recipe_id: previewEvent.recipe_id ? Number(previewEvent.recipe_id) : null,
      max_attendees: null,
      latitude: null,
      longitude: null,
      is_public: false,
      created_at: '',
      updated_at: '',
    } as MealPrepEvent;

    // Build mock linked recipe from preview data
    const mockLinkedRecipe: LinkedRecipe | null = previewEvent.recipe_name ? {
      id: Number(previewEvent.recipe_id) || 0,
      name: previewEvent.recipe_name,
      prep_time_minutes: previewEvent.recipe_prep_time ?? null,
      cook_time_minutes: previewEvent.recipe_cook_time ?? null,
      servings: previewEvent.recipe_servings ?? null,
      image_url: previewEvent.recipe_image_url ?? null,
    } : null;

    // Build mock full recipe so invite-link users can view recipe details
    const mockFullRecipe: FullRecipe | null = previewEvent.recipe_name ? {
      id: Number(previewEvent.recipe_id) || 0,
      name: previewEvent.recipe_name,
      description: previewEvent.recipe_description ?? null,
      prep_time_minutes: previewEvent.recipe_prep_time ?? null,
      cook_time_minutes: previewEvent.recipe_cook_time ?? null,
      servings: previewEvent.recipe_servings ?? null,
      image_url: previewEvent.recipe_image_url ?? null,
      ingredients: previewEvent.recipe_ingredients ?? null,
      instructions: previewEvent.recipe_instructions ?? null,
      nutritional_info: previewEvent.recipe_nutritional_info ?? null,
      tags: previewEvent.recipe_tags ?? null,
      skill_level: previewEvent.recipe_skill_level ?? undefined,
      meal_prep_score: previewEvent.recipe_meal_prep_score ?? undefined,
      meal_prep_score_explanation: previewEvent.recipe_meal_prep_score_explanation ?? undefined,
      equipment_needed: previewEvent.recipe_equipment_needed ?? undefined,
      source_url: previewEvent.recipe_source_url ?? undefined,
    } : null;

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <DetailHeroBanner event={mockEvent} canManage={false} />
          <DetailEventInfo event={mockEvent} />
          <DetailMetaGrid event={mockEvent} isApproved={false} canManage={false} />

          {/* Host & attendee summary */}
          <View style={styles.previewHostRow}>
            <View style={styles.previewHostDot}>
              <Text style={styles.previewHostInitial}>{(previewEvent.host_name || 'H').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.previewHostText}>
              Hosted by {previewEvent.host_name || 'Host'}
              {previewEvent.attendee_count > 0 ? ` \u2022 ${previewEvent.attendee_count} attending` : ''}
            </Text>
          </View>

          {mockLinkedRecipe && (
            <DetailRecipeCard linkedRecipe={mockLinkedRecipe} fullRecipe={mockFullRecipe} />
          )}

          {(previewEvent.contribution_count ?? 0) > 0 && (
            <DetailContributionBoard
              contributions={[]}
              claims={[]}
              isApproved={false}
              canManage={false}
              isPending={false}
              isPreview={true}
              previewCount={previewEvent.contribution_count}
              onClaim={() => {}}
              onUnclaim={() => {}}
            />
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
        <DetailStickyBottomBar
          attendeeStatus={hasRequestedToJoin ? { id: '', event_id: '', user_id: '', role: 'participant', registration_status: 'pending', profiles: null } as EventAttendee : null}
          canManage={false}
          isJoining={isJoining}
          isCancelling={false}
          onRequestToJoin={handleRequestToJoin}
          onCancelRequest={() => {}}
          onLeaveEvent={() => {}}
          onEdit={() => {}}
          onShare={() => {}}
        />
      </SafeAreaView>
    );
  }

  // Error or no event
  if (!event) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </SafeAreaView>
    );
  }

  // Main render
  return (
    <SafeAreaView style={styles.container}>
      {!canManageEvent && <DetailStateBanner status={attendeeStatus?.registration_status || null} />}

      {event?.is_cancelled && (
        <View style={styles.cancelledBanner}>
          <Ionicons name="close-circle" size={18} color={mpColors.red} />
          <Text style={styles.cancelledBannerText}>This event has been cancelled</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <DetailHeroBanner event={event} canManage={canManageEvent} />
        <DetailEventInfo event={event} />
        <DetailMetaGrid event={event} isApproved={isUserApproved} canManage={canManageEvent} attendeeStatus={attendeeStatus?.registration_status} />

        {!canManageEvent && (
          <DetailAttendeesRow
            attendees={approvedAttendees}
            hostName={event.host?.name || undefined}
            maxAttendees={event.max_attendees}
          />
        )}

        {canManageEvent && (
          <DetailCapacityCard
            participantCount={approvedParticipantCount}
            pickupOnlyCount={approvedPickupOnlyCount}
            maxParticipants={event.max_attendees}
            pendingCount={pendingAttendees.length}
          />
        )}

        {event.recipe_id && (
          <DetailRecipeCard
            linkedRecipe={linkedRecipe}
            fullRecipe={fullRecipe}
            onRequestFullRecipe={() => setShowRecipeDetail(true)}
          />
        )}

        {canManageEvent && event.host_package && (
          <DetailHostPackage event={event} />
        )}

        <DetailContributionBoard
          contributions={contributionsNeeded}
          claims={contributionClaims}
          isApproved={isUserApproved}
          canManage={canManageEvent}
          isPending={isPendingStatus || false}
          onClaim={(contribId, qty) => addClaim.mutate({ contributionNeededId: contribId, quantity: qty })}
          onUnclaim={(claimId) => removeClaim.mutate({ claimId })}
        />

        <DetailNotesRequirements
          eventNotes={(event as any).event_notes}
          requirements={eventRequirements}
        />

        {canManageEvent && (
          <DetailShareInvite
            eventId={eventId}
            inviteToken={event.invite_token}
            existingAttendees={approvedAttendees}
            onInviteSent={refetchAll}
          />
        )}

        <DetailComments
          eventId={eventId}
          isParticipant={isUserApproved || canManageEvent}
          canManage={canManageEvent}
          commentsRestricted={event.comments_restricted_to_hosts || false}
          onToggleRestriction={(restricted) => toggleCommentsRestriction.mutate({ restricted })}
        />

        <DetailAttendeesList
          approvedAttendees={approvedAttendees}
          pendingAttendees={pendingAttendees}
          canManage={canManageEvent}
          hostUserId={(event as any).host_user_id || event.host_id}
          onApprove={(id) => updateAttendeeStatus.mutate({ attendeeId: id, newStatus: 'approved' })}
          onDeny={(id) => updateAttendeeStatus.mutate({ attendeeId: id, newStatus: 'denied' })}
          onUpdateRole={(id, role) => updateAttendeeRole.mutate({ attendeeId: id, newRole: role })}
        />

        {canManageEvent && (
          <DetailDeleteEvent onDelete={handleDeleteEvent} isDeleting={isDeletingEvent} />
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sticky bottom bars */}
      {isInvitedStatus ? (
        <DetailInvitedBanner
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
          isAccepting={isAcceptingInvite}
          isDeclining={isDecliningInvite}
        />
      ) : (
        <DetailStickyBottomBar
          attendeeStatus={attendeeStatus}
          canManage={canManageEvent}
          isPastEvent={isPastEvent}
          joiningPaused={event?.joining_paused}
          isCancelled={event?.is_cancelled}
          isJoining={isJoining}
          isCancelling={isCancelling}
          onRequestToJoin={handleRequestToJoin}
          onCancelRequest={handleCancelRequest}
          onLeaveEvent={handleLeaveEvent}
          onEdit={handleEdit}
          onShare={handleShareEvent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mpColors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mpColors.background,
  },
  errorText: {
    fontSize: 16,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  // Preview mode - host row
  previewHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
    gap: 10,
  },
  previewHostDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: mpColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHostInitial: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  previewHostText: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    flex: 1,
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: mpColors.redLight,
  },
  cancelledBannerText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.red,
  },
});
