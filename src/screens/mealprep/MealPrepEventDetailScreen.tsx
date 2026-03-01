import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, FlatList, TextInput, LayoutChangeEvent, findNodeHandle, Modal, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { supabase } from '../../lib/supabase';
import { MealPrepEvent } from '../../lib/types'; // Use type from types.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons'; // For back button icon
import { useAuth } from '../../AuthContext'; // Added useAuth
import * as Clipboard from 'expo-clipboard';
import EventCommentsSection from '../../components/mealprep/EventCommentsSection';
import HostPackageSection from '../../components/mealprep/HostPackageSection';
import { getEventInviteLink, getEventByInviteToken, acceptEventInviteByToken, inviteToEvent, inviteToEventByEmail, checkMealPrepInviteRateLimit, EventPreview, acceptCookTogetherInvitation, declineCookTogetherInvitation } from '../../services/mealPrepInviteService';
import { useFriends } from '../../hooks/useFriends';
import { cookTogetherKeys } from '../../hooks/useCookTogetherInvitations';

// Define the navigation prop type for this screen
type MealPrepEventDetailNavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'MealPrepEventDetail'>;

// Type for the route prop
type MealPrepEventDetailScreenRouteProp = RouteProp<MealPrepStackParamList, 'MealPrepEventDetail'>;

type Props = {
  route: MealPrepEventDetailScreenRouteProp;
};

// Type for Event Attendee
type ProfileInfo = {
  user_id: string;
  name: string | null;
};

type EventAttendee = {
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

// Types for Contributions
type EventContributionNeeded = {
  id: string;
  event_id: string;
  description: string;
  type: string; // 'ingredient' | 'equipment' | 'money_off_app' | 'other_help'
  quantity_needed: number | null;
  unit: string; // 'items' | 'cups' | 'tbsp' | 'tsp' | 'grams' | 'kg' | 'ml' | 'liters' | 'oz' | 'lbs' | 'pieces'
  status: string; // 'needed' | 'partially_claimed' | 'fully_claimed'
  is_optional?: boolean;
  estimated_cost?: number | null;
  notes?: string | null;
  suggested_alternatives?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

// Interface for the expected RPC response from delete_claim_as_host
interface DeleteClaimAsHostResponse {
  success: boolean;
  message: string;
  deleted_claim_id?: string; // Optional, but good to have if returned
}

// Type for Event Contribution Claim with user profile
type EventContributionClaim = {
  id: string;
  contribution_needed_id: string;
  user_id: string;
  quantity_claimed: number;
  claimed_at?: string | null;
  user_name?: string | null; // User's display name from profile
};

// Type for linked recipe (for recipe summary display)
type LinkedRecipe = {
  id: number;
  name: string;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  image_url: string | null;
};

// Type for ingredient in full recipe
type RecipeIngredient = {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
};

// Type for nutritional info
type NutritionalInfo = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
};

// Type for full recipe details (used in modal)
type FullRecipe = {
  id: number;
  name: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  image_url: string | null;
  ingredients: RecipeIngredient[] | null;
  instructions: string[] | null;
  nutritional_info: NutritionalInfo | null;
  tags: string[] | null;
  skill_level?: string;
  meal_prep_score?: number;
  meal_prep_score_explanation?: string;
  equipment_needed?: string[];
  source_url?: string;
};

// Function to fetch a single event by ID
const fetchEventDetails = async (eventId: string): Promise<MealPrepEvent | null> => {
  if (!eventId) return null;
  const { data, error } = await supabase
    .from('meal_prep_events')
    .select('*')
    .eq('id', eventId)
    .single(); // We expect one event or null

  if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found, which is not an error for .single()
    console.error('Error fetching event details:', error);
    throw new Error(error.message);
  }
  return data as MealPrepEvent | null;
};

// Function to fetch linked recipe by ID
const fetchLinkedRecipe = async (recipeId: number | null | undefined): Promise<LinkedRecipe | null> => {
  if (!recipeId) return null;
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, prep_time_minutes, cook_time_minutes, servings, image_url')
    .eq('id', recipeId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching linked recipe:', error);
    return null; // Don't throw, just return null if recipe not found
  }
  return data as LinkedRecipe | null;
};

// Function to fetch full recipe details for modal
const fetchFullRecipe = async (recipeId: number | null | undefined): Promise<FullRecipe | null> => {
  if (!recipeId) return null;
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', recipeId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching full recipe:', error);
    return null;
  }

  if (!data) return null;

  // Cast to any to access fields that may not be in Supabase types
  // These fields (skill_level, meal_prep_score, equipment_needed, source_url)
  // may exist on recipes imported via URL or AI-generated
  const recipeData = data as any;

  // Transform the data to match FullRecipe type
  return {
    id: recipeData.id,
    name: recipeData.name,
    description: recipeData.description,
    prep_time_minutes: recipeData.prep_time_minutes,
    cook_time_minutes: recipeData.cook_time_minutes,
    servings: recipeData.servings,
    image_url: recipeData.image_url,
    ingredients: recipeData.ingredients,
    instructions: recipeData.instructions,
    nutritional_info: recipeData.nutritional_info,
    tags: recipeData.tags,
    skill_level: recipeData.skill_level,
    meal_prep_score: recipeData.meal_prep_score,
    meal_prep_score_explanation: recipeData.meal_prep_score_explanation,
    equipment_needed: recipeData.equipment_needed,
    source_url: recipeData.source_url,
  } as FullRecipe;
};

// Function to fetch attendee status for the current user and event
const fetchAttendeeStatus = async (eventId: string, userId: string | undefined): Promise<EventAttendee | null> => {
  if (!eventId || !userId) return null;
  let attendeeData: Omit<EventAttendee, 'profiles'> | null = null;

  const { data, error } = await supabase
    .from('event_attendees')
    .select('id, event_id, user_id, registration_status, role, requested_at, decision_at, notes_for_host')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching attendee base data:', error);
    throw new Error(error.message);
  }
  attendeeData = data ? { ...data, role: data.role as EventAttendee['role'] } : null;

  if (!attendeeData) {
    return null;
  }

  // Fetch profile separately
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, name')
    .eq('user_id', attendeeData.user_id)
    .single();

  if (profileError) {
    console.warn('Error fetching profile for attendee status:', profileError.message);
    // Continue without profile if it fails, or handle more gracefully
  }

  return {
    ...attendeeData,
    profiles: profileData || null,
  } as EventAttendee;
};

// Function to fetch pending attendees for an event (for hosts)
const fetchPendingAttendees = async (eventId: string): Promise<EventAttendee[]> => {
  if (!eventId) return [];
  const { data: attendeesBaseData, error } = await supabase
    .from('event_attendees')
    .select('id, event_id, user_id, registration_status, role, requested_at, decision_at, notes_for_host')
    .eq('event_id', eventId)
    .eq('registration_status', 'pending');

  if (error) {
    console.error('Error fetching pending attendees base data:', error);
    throw new Error(error.message);
  }
  if (!attendeesBaseData) return [];

  // For each attendee, fetch their profile
  const attendeesWithProfiles = await Promise.all(
    attendeesBaseData.map(async (attendee) => {
      const assertedAttendee = { ...attendee, role: attendee.role as EventAttendee['role'] };
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, name')
        .eq('user_id', assertedAttendee.user_id)
        .single();

      if (profileError) {
        console.warn(`Error fetching profile for ${assertedAttendee.user_id}:`, profileError.message);
        // Continue without profile if it fails
      }
      return {
        ...assertedAttendee,
        profiles: profileData || null,
      };
    })
  );

  return attendeesWithProfiles as EventAttendee[];
};

// Function to fetch count of approved attendees
const fetchApprovedAttendeeCount = async (eventId: string): Promise<number> => {
  if (!eventId) return 0;
  const { count, error } = await supabase
    .from('event_attendees')
    .select('*_count_placeholder_*', { count: 'exact', head: true }) // Select nothing, just get count
    .eq('event_id', eventId)
    .eq('registration_status', 'approved');

  if (error) {
    console.error('Error fetching approved attendee count:', error);
    throw new Error(error.message); // Let useQuery handle this error
  }
  return count || 0;
};

// Function to fetch count of approved attendees for a specific role
export const fetchApprovedRoleCount = async (eventId: string, role: 'participant' | 'pickup_only'): Promise<number> => {
  if (!eventId) return 0;
  const { count, error } = await supabase
    .from('event_attendees')
    .select('*_count_placeholder_*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('registration_status', 'approved')
    .eq('role', role);

  if (error) {
    console.error(`Error fetching approved ${role} count:`, error);
    throw new Error(error.message); 
  }
  return count || 0;
};

// Function to fetch approved attendees with their profile names
const fetchApprovedAttendees = async (eventId: string): Promise<EventAttendee[]> => {
  if (!eventId) return [];
  // 1. Fetch base approved attendee data
  const { data: attendeesBaseData, error: baseError } = await supabase
    .from('event_attendees')
    .select('id, event_id, user_id, registration_status, role, requested_at, decision_at, notes_for_host') // Select all necessary fields from event_attendees
    .eq('event_id', eventId)
    .eq('registration_status', 'approved');

  if (baseError) {
    console.error('Error fetching approved attendees base data:', baseError);
    throw new Error(baseError.message);
  }
  if (!attendeesBaseData) return [];

  // 2. For each attendee, fetch their profile
  const attendeesWithProfiles = await Promise.all(
    attendeesBaseData.map(async (attendee) => {
      const assertedAttendee = { ...attendee, role: attendee.role as EventAttendee['role'] }; // Assert role type
      let profileData: ProfileInfo | null = null;
      if (assertedAttendee.user_id) {
        const { data: pData, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, name')
          .eq('user_id', assertedAttendee.user_id)
          .single();

        if (profileError) {
          console.warn(`Error fetching profile for approved attendee ${assertedAttendee.user_id}:`, profileError.message);
          // Continue without profile if it fails, or handle as critical error
        }
        profileData = pData as ProfileInfo | null;
      }
      return {
        ...assertedAttendee,
        profiles: profileData,
      };
    })
  );
  // Cast the final result to EventAttendee[]
  return attendeesWithProfiles as EventAttendee[];
};

// Fetch Functions for Contributions
const fetchEventContributionsNeeded = async (eventId: string): Promise<EventContributionNeeded[]> => {
  if (!eventId) return [];
  const { data, error } = await supabase
    .from('event_contributions_needed')
    .select('*')
    .eq('event_id', eventId);
    // TODO: Consider ordering by type or description

  if (error) {
    console.error('Error fetching event contributions needed:', error);
    throw new Error(error.message);
  }
  return data || [];
};

// CORRECTED Function to fetch event contribution claims
const fetchEventContributionClaims = async (eventId: string): Promise<EventContributionClaim[]> => {
  console.log(`[fetchEventContributionClaims] Called for eventId: ${eventId}`);
  if (!eventId) {
    console.log("[fetchEventContributionClaims] No eventId, returning empty array.");
    return [];
  }

  // 1. Get all contribution_needed items for this event
  const { data: contributionsNeeded, error: contribError } = await supabase
    .from('event_contributions_needed')
    .select('id') // We only need the IDs
    .eq('event_id', eventId);

  if (contribError) {
    console.error('[fetchEventContributionClaims] Error fetching contribution_needed_ids:', contribError);
    // It might be better to throw an error here to let useQuery handle it
    // throw new Error(contribError.message);
    return []; // Or return empty on error to prevent breaking UI, though less ideal for query status
  }

  if (!contributionsNeeded || contributionsNeeded.length === 0) {
    console.log(`[fetchEventContributionClaims] No contributions needed found for event ${eventId}, so no claims.`);
    return []; // No contributions, so no claims
  }

  const contributionNeededIds = contributionsNeeded.map(cn => cn.id);
  console.log(`[fetchEventContributionClaims] Found contribution_needed_ids for event ${eventId}:`, contributionNeededIds);

  // 2. Fetch all claims for these contribution_needed_ids
  const { data: claimsData, error: claimsError } = await supabase
    .from('event_contribution_claims')
    .select('*')
    .in('contribution_needed_id', contributionNeededIds);

  if (claimsError) {
    console.error('[fetchEventContributionClaims] Error fetching actual claims:', claimsError);
    return [];
  }

  if (!claimsData || claimsData.length === 0) {
    return [];
  }

  // 3. Fetch user profiles for claims
  const uniqueUserIds = [...new Set(claimsData.map(c => c.user_id))];
  const profilesMap: Record<string, string | null> = {};

  if (uniqueUserIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, name')
      .in('user_id', uniqueUserIds);

    if (!profilesError && profiles) {
      profiles.forEach((p: { user_id: string; name: string | null }) => {
        profilesMap[p.user_id] = p.name;
      });
    }
  }

  // 4. Merge profile names into claims
  const claimsWithNames = claimsData.map(claim => ({
    ...claim,
    user_name: profilesMap[claim.user_id] || null,
  }));

  console.log(`[fetchEventContributionClaims] Fetched claims with names for eventId ${eventId}:`, JSON.stringify(claimsWithNames));
  return claimsWithNames;
};

// Define Prop types for the new components
type HostEventActionsProps = {
  event: MealPrepEvent;
  pendingAttendees: EventAttendee[] | undefined;
  isLoadingPendingAttendees: boolean;
  pendingAttendeesError: Error | null;
  handleApproveRequest: (attendeeId: string) => void;
  handleDenyRequest: (attendeeId: string) => void;
  handleDeleteEvent: () => void;
  isDeletingEvent: boolean;
  updateAttendeeStatusMutationIsPending: boolean;
  navigation: MealPrepEventDetailNavigationProp;
  approvedParticipantCount: number | null | undefined;
  approvedPickupOnlyCount: number | null | undefined;
  maxParticipants: number | null | undefined;
  maxPickupOnly: number | null | undefined;
  // pendingRequestsSectionRef: React.RefObject<View | null>; // Comment out
  // onPendingRequestsSectionLayout: (event: LayoutChangeEvent) => void; // Comment out
};

type UserEventActionsProps = {
  event: MealPrepEvent; // Keep event for context, e.g., if event is full, disable join
  attendeeStatus: EventAttendee | null | undefined;
  isLoadingAttendeeStatus: boolean;
  attendeeStatusError: Error | null;
  handleRequestToJoin: (role: 'participant' | 'pickup_only') => void;
  handleCancelOwnRequest: () => void;
  handleReRequestToJoin: (role: 'participant' | 'pickup_only') => void;
  joinNotes: string;
  setJoinNotes: (notes: string) => void;
  isJoining: boolean;
  isCancellingRequest: boolean;
  updateAttendeeStatusMutationIsPending: boolean;
  isReRequestingToJoin: boolean;
  approvedParticipantCount: number | null | undefined;
  approvedPickupOnlyCount: number | null | undefined;
  maxParticipants: number | null | undefined;
  maxPickupOnly: number | null | undefined;
  isOriginalHost: boolean;
  canManageEvent: boolean;
};

const HostEventActions: React.FC<HostEventActionsProps> = ({
  event, pendingAttendees, isLoadingPendingAttendees, pendingAttendeesError,
  handleApproveRequest, handleDenyRequest, handleDeleteEvent, isDeletingEvent,
  updateAttendeeStatusMutationIsPending, navigation,
  approvedParticipantCount, approvedPickupOnlyCount, maxParticipants, maxPickupOnly,
  // pendingRequestsSectionRef, // Comment out
  // onPendingRequestsSectionLayout // Comment out
}) => {
  return (
    <View>
      {/* Host Action Buttons */}
      <View style={styles.hostActionButtons}>
        <TouchableOpacity
          style={styles.editEventButton}
          onPress={() => navigation.navigate('EditMealPrepEvent', { eventId: event.id })}
        >
          <Ionicons name="pencil" size={16} color="#FFFFFF" style={{marginRight: 8}} />
          <Text style={styles.editEventButtonText}>Edit Event</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteEventButton, isDeletingEvent && styles.disabledButton]}
          onPress={handleDeleteEvent}
          disabled={isDeletingEvent}
        >
          {isDeletingEvent ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={16} color="#FFFFFF" style={{marginRight: 8}} />
              <Text style={styles.deleteEventButtonText}>Delete Event</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Pending Join Requests Section */}
      <View 
        // ref={pendingRequestsSectionRef} // Comment out
        // onLayout={onPendingRequestsSectionLayout} // Comment out
        style={styles.pendingRequestsContainer}
      >
        <Text style={styles.subSectionTitle}>Pending Join Requests</Text>
        {isLoadingPendingAttendees ? (
          <ActivityIndicator size="small" color="#3fa6a6" />
        ) : pendingAttendeesError ? (
          <Text style={styles.errorTextSmall}>Error loading requests: {pendingAttendeesError.message}</Text>
        ) : pendingAttendees && pendingAttendees.length > 0 ? (
          <FlatList
            data={pendingAttendees}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.attendeeRequestItem}>
                <View style={styles.attendeeInfoContainer}>
                    <Text style={styles.attendeeNameBold}>{item.profiles?.name || 'Unnamed User'} <Text style={styles.attendeeRole}>({item.role})</Text></Text>
                    {item.notes_for_host && item.notes_for_host.trim() !== '' && (
                        <Text style={styles.attendeeNotes}>Notes: {item.notes_for_host}</Text>
                    )}
                </View>
                <View style={styles.attendeeActionButtons}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.approveButton]}
                    onPress={() => handleApproveRequest(item.id)}
                    disabled={updateAttendeeStatusMutationIsPending}
                  >
                    <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.denyButton]} 
                    onPress={() => handleDenyRequest(item.id)}
                    disabled={updateAttendeeStatusMutationIsPending}
                  >
                    <Ionicons name="close-circle-outline" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        ) : (
          <Text style={styles.infoText}>No pending join requests.</Text>
        )}
      </View>
      <View style={styles.capacitySummaryContainer}>
        <Text style={styles.subSectionTitle}>Capacity Summary</Text>
        <Text style={styles.capacityText}>
            Participants: {approvedParticipantCount ?? '0'} / {maxParticipants ?? 'N/A'}
        </Text>
        {event.allow_pickup_only && (
            <Text style={styles.capacityText}>
                Pickup Only: {approvedPickupOnlyCount ?? '0'} / {maxPickupOnly ?? 'N/A'}
            </Text>
        )}
      </View>
    </View>
  );
};

const UserEventActions: React.FC<UserEventActionsProps> = ({ 
  event, // event prop might be used later for conditions like event full
  attendeeStatus, isLoadingAttendeeStatus, attendeeStatusError, 
  handleRequestToJoin, handleCancelOwnRequest, handleReRequestToJoin,
  joinNotes, setJoinNotes,
  isJoining, isCancellingRequest, updateAttendeeStatusMutationIsPending, isReRequestingToJoin,
  approvedParticipantCount, approvedPickupOnlyCount, maxParticipants, maxPickupOnly,
  isOriginalHost, canManageEvent
}) => {
  if (isLoadingAttendeeStatus) {
    return <ActivityIndicator color="#3fa6a6" style={{ marginVertical: 20 }} />;
  }

  if (attendeeStatusError) {
      return <Text style={styles.errorTextSmall}>Could not load your status. {attendeeStatusError.message}</Text>
  }

  if (attendeeStatus) {
    switch (attendeeStatus.registration_status) {
      case 'pending':
        return (
          <View style={styles.centeredInfoContainer}>
            <TextInput
              style={styles.notesInput}
              placeholder="Optional notes for host (e.g., dietary needs)"
              value={joinNotes}
              onChangeText={setJoinNotes}
              multiline
            />
            <TouchableOpacity
              style={[styles.cancelButton, (isCancellingRequest || updateAttendeeStatusMutationIsPending) && styles.disabledButton, { marginTop: 10 } ]}
              onPress={handleCancelOwnRequest}
              disabled={isCancellingRequest || updateAttendeeStatusMutationIsPending}
            >
              {isCancellingRequest ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.cancelButtonText}>Cancel My Request</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      case 'approved':
        if (event.status === 'completed') {
          return <Text style={styles.infoText}>You attended this event. It has now been completed.</Text>;
        } else if (event.status === 'cancelled') {
          return <Text style={styles.infoText}>You were approved for this event, but it has since been cancelled.</Text>;
        }
        return (
            <View style={styles.centeredInfoContainer}>
              {!canManageEvent && <Text style={styles.infoText}>You are approved to attend this event!</Text>}
              {!isOriginalHost && (
                <TouchableOpacity
                  style={[styles.cancelButton, (isCancellingRequest || updateAttendeeStatusMutationIsPending) && styles.disabledButton, { marginTop: 10 }]}
                  onPress={handleCancelOwnRequest}
                  disabled={isCancellingRequest || updateAttendeeStatusMutationIsPending}
                >
                  {isCancellingRequest ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.cancelButtonText}>Leave Event</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
        );
      case 'denied':
        if (event.status === 'completed') {
          return <Text style={styles.infoText}>Your request to join this event was denied. The event has now been completed.</Text>;
        } else if (event.status === 'cancelled') {
          return <Text style={styles.infoText}>Your request to join this event was denied. The event has since been cancelled.</Text>;
        }
        return <Text style={styles.infoText}>Your request to join this event was denied.</Text>;
      case 'cancelled_by_user':
        if (event.status === 'cancelled') {
          return <Text style={styles.infoText}>You had cancelled your request to join this event. The event itself has also now been cancelled.</Text>;
        } else if (event.status === 'completed') {
          return <Text style={styles.infoText}>You had cancelled your request to join this event. The event has since been completed.</Text>;
        }
        
        const showRoleChoiceAlertForRejoin = () => {
          const participantSlotsFull = typeof approvedParticipantCount === 'number' && typeof maxParticipants === 'number' && approvedParticipantCount >= maxParticipants;
          const pickupSlotsFull = typeof approvedPickupOnlyCount === 'number' && typeof maxPickupOnly === 'number' && approvedPickupOnlyCount >= maxPickupOnly;

          Alert.alert(
            "Choose Role",
            "How would you like to join this event?",
            [
              {
                text: `As Participant ${participantSlotsFull ? "(Full)" : ""}`,
                onPress: () => handleReRequestToJoin('participant'),
                style: "default",
              },
              {
                text: `For Pickup Only ${pickupSlotsFull ? "(Full)" : ""}`,
                onPress: () => handleReRequestToJoin('pickup_only'),
                style: "default",
              },
              { text: "Cancel", style: "cancel" },
            ],
            { cancelable: true }
          );
        };

        return (
          <View style={styles.centeredInfoContainer}>
            <TextInput
              style={styles.notesInput}
              placeholder="Optional notes for host (e.g., dietary needs)"
              value={joinNotes}
              onChangeText={setJoinNotes}
              multiline
            />
            {event.allow_pickup_only ? (
              <TouchableOpacity
                style={[styles.joinButton, styles.marginTopShorter, isReRequestingToJoin && styles.disabledButton]}
                onPress={showRoleChoiceAlertForRejoin}
                disabled={isReRequestingToJoin}
              >
                {isReRequestingToJoin ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.joinButtonText}>Request to Join Again</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.joinButton, styles.marginTopShorter, isReRequestingToJoin && styles.disabledButton]}
                onPress={() => handleReRequestToJoin('participant')}
                disabled={isReRequestingToJoin}
              >
                {isReRequestingToJoin ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.joinButtonText}>Request to Join Again</Text>}
              </TouchableOpacity>
            )}
          </View>
        );
      default:
          return <Text style={styles.infoText}>Your status: {attendeeStatus.registration_status}</Text>;
    }
  }

  // No attendee record found, show request to join button
  // First, check if the event is cancelled or completed
  if (event.status === 'cancelled') {
    return <Text style={styles.infoText}>This event has been cancelled and is no longer accepting requests.</Text>;
  } else if (event.status === 'completed') {
    return <Text style={styles.infoText}>This event has been completed and is no longer accepting requests.</Text>;
  }

  const showRoleChoiceAlert = () => {
    const participantSlotsFull = typeof approvedParticipantCount === 'number' && typeof maxParticipants === 'number' && approvedParticipantCount >= maxParticipants;
    const pickupSlotsFull = typeof approvedPickupOnlyCount === 'number' && typeof maxPickupOnly === 'number' && approvedPickupOnlyCount >= maxPickupOnly;

    Alert.alert(
      "Choose Role",
      "How would you like to join this event?",
      [
        {
          text: `As Participant ${participantSlotsFull ? "(Full)" : ""}`,
          onPress: () => handleRequestToJoin('participant'),
          style: participantSlotsFull ? "destructive" : "default", // Or just disable if alert allows
          // React Native Alert buttons don't have a direct disabled prop, so style or onPress check needed
        },
        {
          text: `For Pickup Only ${pickupSlotsFull ? "(Full)" : ""}`,
          onPress: () => handleRequestToJoin('pickup_only'),
          style: pickupSlotsFull ? "destructive" : "default",
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const isParticipantModeFull = typeof approvedParticipantCount === 'number' && typeof maxParticipants === 'number' && approvedParticipantCount >= maxParticipants;

  return (
    <View style={styles.centeredInfoContainer}>
      <TextInput
        style={styles.notesInput}
        placeholder="Optional notes for host (e.g., dietary needs)"
        value={joinNotes}
        onChangeText={setJoinNotes}
        multiline
      />
      {event.allow_pickup_only ? (
        <TouchableOpacity 
          style={[styles.joinButton, styles.marginTopShorter, (isJoining || ( 
            (typeof approvedParticipantCount === 'number' && typeof maxParticipants === 'number' && approvedParticipantCount >= maxParticipants) && 
            (typeof approvedPickupOnlyCount === 'number' && typeof maxPickupOnly === 'number' && approvedPickupOnlyCount >= maxPickupOnly)
          )) && styles.disabledButton]} // Disable if both are full
          onPress={showRoleChoiceAlert} 
          disabled={isJoining || ( 
            (typeof approvedParticipantCount === 'number' && typeof maxParticipants === 'number' && approvedParticipantCount >= maxParticipants) && 
            (typeof approvedPickupOnlyCount === 'number' && typeof maxPickupOnly === 'number' && approvedPickupOnlyCount >= maxPickupOnly)
          )} // Disable if both are full
        >
          {isJoining ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.joinButtonText}>Request to Join</Text>}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity 
          style={[styles.joinButton, styles.marginTopShorter, (isJoining || isParticipantModeFull) && styles.disabledButton]}
          onPress={() => handleRequestToJoin('participant')} 
          disabled={isJoining || isParticipantModeFull}
        >
          {isJoining ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.joinButtonText}>Request to Join as Participant</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
};

// Share & Invite Section component for hosts
const ShareInviteSection = ({ eventId, inviteToken, eventTitle, existingAttendeeIds, onInvitesSent }: {
  eventId: string;
  inviteToken: string | null | undefined;
  eventTitle?: string;
  existingAttendeeIds?: string[];
  onInvitesSent?: () => void;
}) => {
  const { user } = useAuth();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Email invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Get friends list
  const { useAcceptedFriends } = useFriends();
  const { data: friends = [] } = useAcceptedFriends();

  // Filter out existing attendees
  const availableFriends = useMemo(() => {
    const attendeeSet = new Set(existingAttendeeIds || []);
    return friends.filter(f => !attendeeSet.has(f.user_id));
  }, [friends, existingAttendeeIds]);

  useEffect(() => {
    if (inviteToken) {
      setInviteLink(`wellbody://signup?invite=${inviteToken}`);
    }
  }, [inviteToken]);

  const handleGetLink = async () => {
    if (inviteLink) return;
    setIsLoading(true);
    try {
      const link = await getEventInviteLink(eventId);
      if (link) {
        setInviteLink(link);
      }
    } catch (err) {
      console.error('Error getting invite link:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) {
      await handleGetLink();
    }
    const link = inviteLink || `wellbody://signup?invite=${inviteToken}`;
    if (link) {
      await Clipboard.setStringAsync(link);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    let link = inviteLink;
    if (!link) {
      await handleGetLink();
      link = inviteLink;
    }
    if (!link) return;

    try {
      await Share.share({
        message: eventTitle
          ? `Join my meal prep event "${eventTitle}"! ${link}`
          : `Join my meal prep event! ${link}`,
      });
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const handleInviteFriend = async (friendId: string) => {
    if (!user?.id || isInviting) return;

    setIsInviting(true);
    try {
      const result = await inviteToEvent(user.id, eventId, [friendId]);
      if (result.success) {
        Alert.alert('Invited!', 'Your WellPal has been invited and auto-approved.');
        onInvitesSent?.();
      } else {
        Alert.alert('Error', result.error || 'Failed to send invite');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invite');
    } finally {
      setIsInviting(false);
    }
  };

  const handleInviteByEmail = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    if (!user?.id) return;

    setIsSendingEmail(true);
    try {
      // Check rate limit first
      const rateLimit = await checkMealPrepInviteRateLimit(email, eventId);
      if (!rateLimit.allowed) {
        if (rateLimit.same_email_blocked) {
          Alert.alert('Already Invited', 'You recently invited this email to this event');
        } else if (rateLimit.daily_limit_reached) {
          Alert.alert('Daily Limit', "You've reached your daily invitation limit");
        } else if (rateLimit.pending_limit_reached) {
          Alert.alert('Pending Limit', 'Too many pending invitations');
        } else {
          Alert.alert('Rate Limit', 'Please try again later');
        }
        return;
      }

      const result = await inviteToEventByEmail(user.id, eventId, email, eventTitle);
      if (result.success) {
        Alert.alert('Invitation Sent!', `An invitation has been sent to ${email}.`);
        setInviteEmail('');
        onInvitesSent?.();
      } else {
        Alert.alert('Error', result.error || 'Failed to send invitation');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send invitation');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <View style={shareStyles.container}>
      <View style={shareStyles.header}>
        <Ionicons name="link-outline" size={20} color="#3fa6a6" />
        <Text style={shareStyles.title}>Share & Invite</Text>
      </View>

      {/* Inline Invite Section - like trackers */}
      <View style={shareStyles.inviteTeammatesSection}>
        {/* Select WellPals */}
        {availableFriends.length > 0 && (
          <>
            <Text style={shareStyles.selectLabel}>Select WellPals</Text>
            <View style={shareStyles.friendChipsContainer}>
              {availableFriends.slice(0, 6).map(friend => (
                <TouchableOpacity
                  key={friend.user_id}
                  style={shareStyles.friendChip}
                  onPress={() => handleInviteFriend(friend.user_id)}
                  disabled={isInviting}
                >
                  <Ionicons name="person-outline" size={14} color="#6B7280" />
                  <Text style={shareStyles.friendChipText} numberOfLines={1}>
                    {friend.name || friend.email?.split('@')[0] || 'WellPal'}
                  </Text>
                </TouchableOpacity>
              ))}
              {availableFriends.length > 6 && (
                <View style={shareStyles.moreChip}>
                  <Text style={shareStyles.moreChipText}>+{availableFriends.length - 6} more</Text>
                </View>
              )}
            </View>
          </>
        )}

        {availableFriends.length === 0 && friends.length > 0 && (
          <Text style={shareStyles.allInvitedText}>All your WellPals are already invited!</Text>
        )}

        {/* Or invite by email */}
        <Text style={shareStyles.orInviteLabel}>Or invite by email</Text>
        <TextInput
          style={shareStyles.emailInputInline}
          value={inviteEmail}
          onChangeText={setInviteEmail}
          placeholder="friend@example.com"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isSendingEmail}
          onSubmitEditing={handleInviteByEmail}
          returnKeyType="send"
        />
        <Text style={shareStyles.emailHelperInline}>
          They'll get an invitation to join Wellbody and this event
        </Text>

        {inviteEmail.trim().length > 0 && (
          <TouchableOpacity
            style={[shareStyles.sendEmailButton, isSendingEmail && shareStyles.sendEmailButtonDisabled]}
            onPress={handleInviteByEmail}
            disabled={isSendingEmail}
          >
            {isSendingEmail ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#FFFFFF" />
                <Text style={shareStyles.sendEmailButtonText}>Send Invite</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={shareStyles.divider} />

      <Text style={shareStyles.orText}>or share invite link</Text>

      <View style={shareStyles.buttonRow}>
        <TouchableOpacity
          style={shareStyles.copyButton}
          onPress={handleCopyLink}
          disabled={isLoading}
        >
          <Ionicons
            name={isCopied ? 'checkmark' : 'copy-outline'}
            size={18}
            color={isCopied ? '#34C759' : '#3fa6a6'}
          />
          <Text style={[shareStyles.copyButtonText, isCopied && { color: '#34C759' }]}>
            {isCopied ? 'Copied!' : 'Copy Link'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={shareStyles.shareButton}
          onPress={handleShare}
          disabled={isLoading}
        >
          <Ionicons name="share-outline" size={18} color="#FFFFFF" />
          <Text style={shareStyles.shareButtonText}>Share</Text>
        </TouchableOpacity>
      </View>
      <Text style={shareStyles.hint}>
        Guests who use this link will need your approval to join
      </Text>
    </View>
  );
};

const shareStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  // Inline invite section (like trackers)
  inviteTeammatesSection: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    padding: 16,
    marginBottom: 12,
  },
  selectLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  friendChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
    maxWidth: 140,
  },
  friendChipText: {
    fontSize: 14,
    color: '#374151',
  },
  moreChip: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  moreChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  allInvitedText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  orInviteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 10,
  },
  emailInputInline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  emailHelperInline: {
    fontSize: 13,
    color: '#17A2B8',
    marginTop: 8,
  },
  sendEmailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3fa6a6',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
    gap: 8,
  },
  sendEmailButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  sendEmailButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 12,
  },
  orText: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
  },
  copyButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3fa6a6',
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3fa6a6',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
});

const MealPrepEventDetailScreen = ({ route }: Props) => {
  const { eventId, inviteToken, invitedMode, notificationId } = route.params;
  const navigation = useNavigation<MealPrepEventDetailNavigationProp>();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth(); // Consistently use currentUser

  // State for join notes, claim quantity etc.
  const [joinNotes, setJoinNotes] = useState('');
  const [claimQuantityInput, setClaimQuantityInput] = useState('');
  const [isJoining, setIsJoining] = useState(false); // Added state for join action
  const [isCancellingRequest, setIsCancellingRequest] = useState(false); // Added state for cancel action
  const [scrollToApproved, setScrollToApproved] = useState(false);

  // Invite preview mode state
  const [isRequestingToJoin, setIsRequestingToJoin] = useState(false);
  const [previewEvent, setPreviewEvent] = useState<EventPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Invited mode state (for Accept/Decline banner)
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [isDecliningInvite, setIsDecliningInvite] = useState(false);
  const [hasAcceptedInvite, setHasAcceptedInvite] = useState(false); // Track if just accepted for immediate UI update

  // Claim modal state
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedContributionForClaim, setSelectedContributionForClaim] = useState<EventContributionNeeded | null>(null);
  const [claimQuantity, setClaimQuantity] = useState(1);

  // Recipe detail modal state
  const [showRecipeDetail, setShowRecipeDetail] = useState(false);

  // Refs for scrolling
  const scrollViewRef = useRef<FlatList>(null);
  // const pendingRequestsSectionRef = useRef<View>(null); // Commented out if not used

  // --- Data Fetching Queries ---
  const { data: event, isLoading: isLoadingEventDetails, error: eventDetailsError, refetch: refetchEventDetails } = useQuery<MealPrepEvent | null, Error>({
    queryKey: ['mealPrepEvent', eventId], // Simplified key
    queryFn: () => fetchEventDetails(eventId),
    enabled: !!eventId,
  });

  // Fetch linked recipe when event has a recipe_id
  const { data: linkedRecipe, isLoading: isLoadingLinkedRecipe } = useQuery<LinkedRecipe | null, Error>({
    queryKey: ['linkedRecipe', event?.recipe_id],
    queryFn: () => fetchLinkedRecipe(event?.recipe_id),
    enabled: !!event?.recipe_id,
  });

  // Fetch full recipe details for modal (only when modal is opened)
  const { data: fullRecipe, isLoading: isLoadingFullRecipe } = useQuery<FullRecipe | null, Error>({
    queryKey: ['fullRecipe', event?.recipe_id],
    queryFn: () => fetchFullRecipe(event?.recipe_id),
    enabled: !!event?.recipe_id && showRecipeDetail,
  });

  const {
    data: currentUserAttendeeStatus, // Consistently currentUserAttendeeStatus
    isLoading: isLoadingAttendeeStatus, 
    error: attendeeStatusError, 
    refetch: refetchAttendeeStatus 
  } = useQuery<EventAttendee | null, Error>({
    queryKey: ['attendeeStatus', eventId, currentUser?.id],
    queryFn: () => fetchAttendeeStatus(eventId, currentUser?.id),
    enabled: !!eventId && !!currentUser?.id,
  });

  const isOriginalHost = useMemo(() => event?.host_user_id === currentUser?.id, [event, currentUser?.id]);
  const isCoLeader = useMemo(() => currentUserAttendeeStatus?.role === 'co-leader' && currentUserAttendeeStatus?.registration_status === 'approved', [currentUserAttendeeStatus]);
  const canManageEvent = useMemo(() => isOriginalHost || isCoLeader, [isOriginalHost, isCoLeader]);

  const { data: pendingAttendees, isLoading: isLoadingPendingAttendees, error: pendingAttendeesError, refetch: refetchPendingAttendees } = useQuery<EventAttendee[], Error>({
    queryKey: ['pendingAttendees', eventId],
    queryFn: () => fetchPendingAttendees(eventId),
    enabled: !!event && canManageEvent && event.status === 'active', // Use canManageEvent
  });

  const { data: approvedAttendees, isLoading: isLoadingApprovedAttendees, error: approvedAttendeesError, refetch: refetchApprovedAttendees } = useQuery<EventAttendee[], Error>({
    queryKey: ['approvedAttendees', eventId],
    queryFn: () => fetchApprovedAttendees(eventId),
    enabled: !!eventId,
  });

  const { data: approvedParticipantCount, isLoading: isLoadingApprovedParticipantCount, error: approvedParticipantCountError, refetch: refetchApprovedParticipantCount } = useQuery<number, Error>({
    queryKey: ['approvedParticipantCount', eventId],
    queryFn: () => fetchApprovedRoleCount(eventId, 'participant'),
    enabled: !!eventId,
  });

  const { data: approvedPickupOnlyCount, isLoading: isLoadingApprovedPickupOnlyCount, error: approvedPickupOnlyCountError, refetch: refetchApprovedPickupOnlyCount } = useQuery<number, Error>({
    queryKey: ['approvedPickupOnlyCount', eventId],
    queryFn: () => fetchApprovedRoleCount(eventId, 'pickup_only'),
    enabled: !!eventId,
  });


  const { data: eventContributionsNeeded, isLoading: isLoadingEventContributionsNeeded, error: eventContributionsNeededError, refetch: refetchEventContributionsNeeded } = useQuery<EventContributionNeeded[], Error>({
    queryKey: ['eventContributionsNeeded', eventId],
    queryFn: () => fetchEventContributionsNeeded(eventId),
    enabled: !!eventId,
  });

  const { data: eventContributionClaims, isLoading: isLoadingEventContributionClaims, error: eventContributionClaimsError, refetch: refetchEventContributionClaims } = useQuery<EventContributionClaim[], Error>({
    queryKey: ['eventContributionClaims', eventId],
    queryFn: () => fetchEventContributionClaims(eventId),
    enabled: !!eventId,
  });

  // --- Mutations ---
  const updateAttendeeStatusMutation = useMutation<
    any, // Using any for now if response type is complex or varies
    Error,
    { attendeeId: string; newStatus: string; role?: 'participant' | 'co-leader' | 'pickup_only'; notes?: string | null },
    { previousPendingAttendees: EventAttendee[] | undefined, previousApprovedAttendees: EventAttendee[] | undefined }
  >( // ... mutationFn, onSuccess, onError as defined before, ensuring currentUser is used if needed
    {
      mutationFn: async (variables) => {
        // Use the new RPC function instead of a direct update
        const { error } = await supabase.rpc('handle_attendee_status_change', {
          p_attendee_id: variables.attendeeId,
          p_new_status: variables.newStatus,
        });

        if (error) throw error;
        
        // The RPC function doesn't return data, so we return null or a success indicator
        // The optimistic update handles the UI, and onSettled handles the refetch.
        return null;
      },
      onMutate: async (variables) => {
        if (variables.newStatus !== 'approved') return;

        // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
        await queryClient.cancelQueries({ queryKey: ['pendingAttendees', eventId] });
        await queryClient.cancelQueries({ queryKey: ['approvedAttendees', eventId] });

        // Snapshot the previous value
        const previousPendingAttendees = queryClient.getQueryData<EventAttendee[]>(['pendingAttendees', eventId]);
        const previousApprovedAttendees = queryClient.getQueryData<EventAttendee[]>(['approvedAttendees', eventId]);

        // Optimistically update to the new value
        if (previousPendingAttendees && previousApprovedAttendees) {
          const attendeeToMove = previousPendingAttendees.find(a => a.id === variables.attendeeId);
          if (attendeeToMove) {
            // Remove from pending
            const newPendingAttendees = previousPendingAttendees.filter(a => a.id !== variables.attendeeId);
            // Add to approved with updated status
            const newApprovedAttendees = [...previousApprovedAttendees, { ...attendeeToMove, registration_status: 'approved' }];
            
            queryClient.setQueryData(['pendingAttendees', eventId], newPendingAttendees);
            queryClient.setQueryData(['approvedAttendees', eventId], newApprovedAttendees);
          }
        }
        
        return { previousPendingAttendees, previousApprovedAttendees };
      },
      onSuccess: (data, variables) => {
        if (variables.newStatus === 'approved') {
          Alert.alert('Request Approved', 'The attendee has been approved.');
        } else if (variables.newStatus === 'denied') {
          Alert.alert('Request Denied', 'The attendee has been denied.');
        } else if (variables.newStatus === 'cancelled_by_user') {
          Alert.alert('Request Cancelled', 'Your request to join the event has been cancelled.');
        } else if (variables.newStatus === 'pending' && data && data.id === currentUserAttendeeStatus?.id) {
          Alert.alert('Request Sent', 'Your request to join the event has been sent again.');
          setJoinNotes(''); 
        }
      },
      onError: (error, variables, context) => {
        // Rollback on error
        if (context?.previousPendingAttendees) {
          queryClient.setQueryData(['pendingAttendees', eventId], context.previousPendingAttendees);
        }
        if (context?.previousApprovedAttendees) {
          queryClient.setQueryData(['approvedAttendees', eventId], context.previousApprovedAttendees);
        }
        Alert.alert('Error', `Failed to update status: ${error.message}`);
      },
      onSettled: () => {
        // Always refetch after error or success
        queryClient.invalidateQueries({ queryKey: ['pendingAttendees', eventId] });
        queryClient.invalidateQueries({ queryKey: ['approvedAttendees', eventId] });
        queryClient.invalidateQueries({ queryKey: ['attendeeStatus', eventId, currentUser?.id] });
        queryClient.invalidateQueries({ queryKey: ['approvedParticipantCount', eventId] });
        queryClient.invalidateQueries({ queryKey: ['approvedPickupOnlyCount', eventId] });
        queryClient.invalidateQueries({ queryKey: ['eventContributionClaims', eventId] });
      }
    }
  );
  
  const addClaimMutation = useMutation<
    EventContributionClaim, Error, { contributionNeededId: string; quantity: number }
  >( // ... mutationFn, onSuccess, onError as defined before, ensuring currentUser is used
    {
      mutationFn: async ({ contributionNeededId, quantity }) => {
        if (!currentUser?.id) throw new Error('User not authenticated');
        const { data, error } = await supabase
          .from('event_contribution_claims')
          .insert({
            contribution_needed_id: contributionNeededId,
            user_id: currentUser.id,
            quantity_claimed: quantity,
          })
          .select()
          .single();
        if (error) throw error;
        return data as EventContributionClaim;
      },
      onSuccess: () => {
        Alert.alert('Success', 'Your claim has been recorded!');
        setClaimQuantityInput(''); // Clear input
        queryClient.invalidateQueries({ queryKey: ['eventContributionClaims', eventId] });
        queryClient.invalidateQueries({ queryKey: ['eventContributionsNeeded', eventId] }); // To update status like 'partially_claimed'
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to add claim: ${error.message}`);
      },
    }
  );

  const removeClaimMutation = useMutation<
    any, Error, { claimId: string }
  >( // ... mutationFn, onSuccess, onError as defined before
    {
      mutationFn: async ({ claimId }) => {
        const { error } = await supabase.from('event_contribution_claims').delete().match({ id: claimId });
        if (error) throw error;
        return null; // Or some success indicator
      },
      onSuccess: () => {
        Alert.alert('Claim Removed', 'Your claim has been removed.');
        queryClient.invalidateQueries({ queryKey: ['eventContributionClaims', eventId] });
        queryClient.invalidateQueries({ queryKey: ['eventContributionsNeeded', eventId] });
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to remove claim: ${error.message}`);
      },
    }
  );

  const removeClaimAsHostMutation = useMutation<
    DeleteClaimAsHostResponse, 
    Error, 
    string // claimId
  >( // ... mutationFn, onSuccess, onError, using `delete_claim_as_host` RPC
    {
      mutationFn: async (claimIdToDelete) => {
        const { data, error } = await supabase.rpc('delete_claim_as_host', { claim_id_to_delete: claimIdToDelete });
        if (error) throw error;
        return data as unknown as DeleteClaimAsHostResponse; 
      },
      onSuccess: (response) => {
        if (response.success) {
          Alert.alert('Claim Removed', response.message || 'The claim has been removed by the host.');
          queryClient.invalidateQueries({ queryKey: ['eventContributionClaims', eventId] });
          queryClient.invalidateQueries({ queryKey: ['eventContributionsNeeded', eventId] });
        } else {
          Alert.alert('Error', response.message || 'Could not remove claim as host.');
        }
      },
      onError: (error) => {
        Alert.alert('Error', `Failed to remove claim as host: ${error.message}`);
      },
    }
  );

  const updateAttendeeRoleMutation = useMutation<
    EventAttendee, // Expect the updated attendee record back
    Error,
    { attendeeId: string; newRole: 'participant' | 'co-leader' }
  >({
    mutationFn: async ({ attendeeId, newRole }) => {
      const { data, error } = await supabase
        .from('event_attendees')
        .update({ role: newRole })
        .eq('id', attendeeId)
        .select('*') // Select all fields to match EventAttendee type
        .single();
      if (error) throw error;
      // We need to fetch the profile information separately to fully match EventAttendee type
      // However, for role update, the core data is sufficient for invalidation.
      // For simplicity here, we assume the RLS allows this update and returns the core fields.
      // A more robust solution might return the joined data or refetch the specific attendee.
      return data as unknown as EventAttendee; // This will miss profile, but okay for query invalidation
    },
    onSuccess: (data, variables) => {
      Alert.alert('Role Updated', `Attendee role changed to ${variables.newRole}.`);
      queryClient.invalidateQueries({ queryKey: ['approvedAttendees', eventId] });
      // Potentially invalidate other queries if role affects other parts of the UI significantly
      // For instance, if the user whose role changed is the current user:
      if (data && data.user_id === currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ['attendeeStatus', eventId, currentUser?.id] });
      }
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update attendee role: ${error.message}`);
    },
  });

  const addAttendeeMutation = useMutation<
    EventAttendee, // Expect the new attendee record back
    Error,
    { eventId: string; userId: string; role: 'participant' | 'pickup_only'; notes?: string | null }
  >({
    mutationFn: async ({ eventId, userId, role, notes }) => {
      const { data, error } = await supabase
        .from('event_attendees')
        .insert({
          event_id: eventId,
          user_id: userId,
          role: role,
          registration_status: 'pending',
          notes_for_host: notes,
          requested_at: new Date().toISOString(),
        })
        .select('*, profiles(user_id, name)') // Fetch profile info along with the attendee record
        .single();
      if (error) throw error;
      // The select above should ideally match EventAttendee structure. If profiles are nested, cast might be needed.
      // For now, assuming the select gets the necessary fields for EventAttendee type directly or indirectly.
      return data as EventAttendee;
    },
    onSuccess: (data) => {
      Alert.alert('Request Sent', 'Your request to join the event has been sent.');
      setJoinNotes(''); // Clear join notes input
      queryClient.invalidateQueries({ queryKey: ['attendeeStatus', data.event_id, data.user_id] });
      queryClient.invalidateQueries({ queryKey: ['pendingAttendees', data.event_id] }); // For hosts/co-hosts viewing
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to send join request: ${error.message}`);
    },
  });

  const reRequestToJoinMutation = useMutation<
    EventAttendee,
    Error,
    { eventId: string; userId: string; attendeeId: string; role: 'participant' | 'co-leader' | 'pickup_only'; notes?: string | null }
  >({
    mutationFn: async ({ eventId, userId, attendeeId, role, notes }) => {
      // 1. Delete the old record
      const { error: deleteError } = await supabase
        .from('event_attendees')
        .delete()
        .match({ id: attendeeId });
  
      if (deleteError) throw deleteError;
  
      // 2. Insert the new record
      const { data, error: insertError } = await supabase
        .from('event_attendees')
        .insert({
          event_id: eventId,
          user_id: userId,
          role: role,
          registration_status: 'pending',
          notes_for_host: notes,
          requested_at: new Date().toISOString(),
        })
        .select('*, profiles(user_id, name)')
        .single();
  
      if (insertError) throw insertError;
      return data as EventAttendee;
    },
    onSuccess: (data) => {
      Alert.alert('Request Sent', 'Your request to join the event has been sent again.');
      setJoinNotes('');
      queryClient.invalidateQueries({ queryKey: ['attendeeStatus', data.event_id, data.user_id] });
      queryClient.invalidateQueries({ queryKey: ['pendingAttendees', data.event_id] });
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to resubmit join request: ${error.message}`);
    },
  });

  // Mutation for toggling comments restriction
  const toggleCommentsRestrictionMutation = useMutation<
    void,
    Error,
    { eventId: string; restricted: boolean }
  >({
    mutationFn: async ({ eventId, restricted }) => {
      const { error } = await supabase
        .from('meal_prep_events')
        .update({ comments_restricted_to_hosts: restricted })
        .eq('id', eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealPrepEventDetails', eventId] });
    },
    onError: (error) => {
      Alert.alert('Error', `Failed to update comment settings: ${error.message}`);
    },
  });

  // --- Event Handlers ---
  const handleApproveRequest = (attendeeId: string) => {
    updateAttendeeStatusMutation.mutate({ attendeeId, newStatus: 'approved' });
  };

  const handleDenyRequest = (attendeeId: string) => {
    updateAttendeeStatusMutation.mutate({ attendeeId, newStatus: 'denied' });
  };

  // Delete event handler (host only)
  // Note: RLS policy "Allow hosts to delete their own events" already exists
  const [isDeletingEvent, setIsDeletingEvent] = useState(false);

  const handleDeleteEvent = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event? This will remove all attendees, contributions, and comments. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!event?.id) return;

            setIsDeletingEvent(true);
            try {
              // Delete related records first (in order to handle FK constraints)
              // 1. Delete contribution claims
              const { data: contributions } = await supabase
                .from('event_contributions_needed')
                .select('id')
                .eq('event_id', event.id);

              if (contributions && contributions.length > 0) {
                const contributionIds = contributions.map(c => c.id);
                await supabase
                  .from('event_contribution_claims')
                  .delete()
                  .in('contribution_needed_id', contributionIds);
              }

              // 2. Delete contributions needed
              await supabase
                .from('event_contributions_needed')
                .delete()
                .eq('event_id', event.id);

              // 3. Delete attendees
              await supabase
                .from('event_attendees')
                .delete()
                .eq('event_id', event.id);

              // 4. Delete comments (if table exists)
              try {
                await supabase
                  .from('event_comments')
                  .delete()
                  .eq('event_id', event.id);
              } catch {
                // Table might not exist, ignore
              }

              // 5. Finally delete the event itself
              const { error } = await supabase
                .from('meal_prep_events')
                .delete()
                .eq('id', event.id);

              if (error) throw error;

              Alert.alert('Event Deleted', 'The event has been deleted successfully.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (error: any) {
              console.error('Delete event error:', error);
              Alert.alert('Error', error.message || 'Failed to delete event. Please try again.');
            } finally {
              setIsDeletingEvent(false);
            }
          },
        },
      ]
    );
  };

  const handleRequestToJoin = async (roleToRequest: 'participant' | 'pickup_only') => {
    if (!currentUser?.id || !event?.id) {
      Alert.alert('Error', 'Cannot process request: User or Event not identified.');
      return;
    }
    setIsJoining(true); // Set loading state for UI if needed
    addAttendeeMutation.mutate({
      eventId: event.id,
      userId: currentUser.id,
      role: roleToRequest,
      notes: joinNotes,
    }, {
      onSettled: () => {
        setIsJoining(false); // Reset loading state
      }
    });
  };

  const handleCancelOwnRequest = async () => {
    if (!currentUserAttendeeStatus?.id) return;
    setIsCancellingRequest(true);
    updateAttendeeStatusMutation.mutate(
      { attendeeId: currentUserAttendeeStatus.id, newStatus: 'cancelled_by_user' },
      {
        onSettled: () => {
          setIsCancellingRequest(false);
        },
      }
    );
  };

  const handleReRequestToJoin = (roleToRequest: 'participant' | 'pickup_only') => {
    if (!currentUserAttendeeStatus?.id || !event?.id || !currentUser?.id) return;
    reRequestToJoinMutation.mutate({
      attendeeId: currentUserAttendeeStatus.id,
      eventId: event.id,
      userId: currentUser.id,
      role: roleToRequest,
      notes: joinNotes,
    });
  };
  
  const handleAddClaim = (contribution: EventContributionNeeded) => {
    const { quantity_needed } = contribution;

    if (quantity_needed === null || quantity_needed === undefined) {
      // For non-quantifiable items like "help with cleanup", claim 1 directly
      addClaimMutation.mutate({ contributionNeededId: contribution.id, quantity: 1 });
    } else {
      // For quantifiable items, show the claim modal with number picker
      setSelectedContributionForClaim(contribution);
      setClaimQuantity(1);
      setShowClaimModal(true);
    }
  };

  const handleConfirmClaim = () => {
    if (!selectedContributionForClaim) return;

    const { quantity_needed } = selectedContributionForClaim;

    if (claimQuantity <= 0) {
      Alert.alert('Invalid Quantity', 'Please select a valid quantity greater than 0.');
      return;
    }

    // Check if over-claiming
    const claimsForThisContribution = eventContributionClaims?.filter(c => c.contribution_needed_id === selectedContributionForClaim.id) || [];
    const totalClaimed = claimsForThisContribution.reduce((sum, acc) => sum + acc.quantity_claimed, 0);
    const remaining = (quantity_needed || 0) - totalClaimed;

    if (quantity_needed !== null && claimQuantity > remaining) {
      Alert.alert('Cannot Overclaim', `The quantity you selected exceeds the remaining items needed (${remaining}).`);
      return;
    }

    addClaimMutation.mutate({ contributionNeededId: selectedContributionForClaim.id, quantity: claimQuantity });
    setShowClaimModal(false);
    setSelectedContributionForClaim(null);
    setClaimQuantity(1);
  };

  const getMaxClaimableQuantity = (): number => {
    if (!selectedContributionForClaim) return 1;
    const { quantity_needed } = selectedContributionForClaim;
    if (quantity_needed === null) return 10; // Default max for non-quantified items

    const claimsForThisContribution = eventContributionClaims?.filter(c => c.contribution_needed_id === selectedContributionForClaim.id) || [];
    const totalClaimed = claimsForThisContribution.reduce((sum, acc) => sum + acc.quantity_claimed, 0);
    return Math.max(1, quantity_needed - totalClaimed);
  };

  const handleRemoveClaim = (claimId: string | undefined) => {
    if (!claimId) return;
    Alert.alert(
      "Confirm Unclaim",
      "Are you sure you want to remove your claim? Quantity specific unclaiming is not yet supported for this item type.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unclaim", onPress: () => removeClaimMutation.mutate({ claimId }), style: "destructive" },
      ]
    );
  };

  const handleRemoveClaimAsHost = (claimId: string) => {
    Alert.alert(
      "Confirm Remove Claim (Host)",
      "Are you sure you want to remove this user's claim? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove Claim", onPress: () => removeClaimAsHostMutation.mutate(claimId), style: "destructive" },
      ]
    );
  };

  // --- Invite Token Preview Mode ---
  // If user arrived via invite token and can't see event (RLS blocks), fetch via token
  useEffect(() => {
    const fetchPreview = async () => {
      if (!inviteToken) return;

      // Only fetch preview if event is not found (RLS blocked) and user is not already an attendee
      if (event || isLoadingEventDetails) return;
      if (currentUserAttendeeStatus) return; // Already an attendee

      setIsLoadingPreview(true);
      setPreviewError(null);

      try {
        const result = await getEventByInviteToken(inviteToken);
        if (result.success && result.event) {
          setPreviewEvent(result.event);
        } else {
          setPreviewError(result.error || 'Failed to load event preview');
        }
      } catch (err: any) {
        setPreviewError(err.message || 'Failed to load event preview');
      } finally {
        setIsLoadingPreview(false);
      }
    };

    fetchPreview();
  }, [inviteToken, event, isLoadingEventDetails, currentUserAttendeeStatus]);

  // Handler for requesting to join via invite token
  const handleRequestToJoinViaToken = async () => {
    if (!inviteToken || !currentUser?.id) {
      Alert.alert('Error', 'Cannot process request: User or invitation not identified.');
      return;
    }

    setIsRequestingToJoin(true);
    try {
      const result = await acceptEventInviteByToken(inviteToken, currentUser.id);
      if (result.success && result.eventId) {
        Alert.alert(
          'Request Sent!',
          'Your request to join has been sent to the host. You\'ll be notified when they respond.',
          [{ text: 'OK' }]
        );
        // Refetch to update the attendee status
        refetchAttendeeStatus();
        refetchEventDetails();
        // Clear the preview since user is now an attendee
        setPreviewEvent(null);
      } else {
        Alert.alert('Error', result.error || 'Failed to send join request');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to send join request');
    } finally {
      setIsRequestingToJoin(false);
    }
  };

  // Handler for accepting invite (when in invited mode)
  const handleAcceptInvite = async () => {
    if (!currentUser?.id || !eventId || !notificationId) {
      Alert.alert('Error', 'Cannot process request: User or event not identified.');
      return;
    }

    setIsAcceptingInvite(true);
    try {
      const result = await acceptCookTogetherInvitation(currentUser.id, eventId, notificationId);
      if (result.success) {
        // Immediately hide the banner
        setHasAcceptedInvite(true);

        // Invalidate the cook together invitations query (removes card from SupportersScreen)
        queryClient.invalidateQueries({ queryKey: cookTogetherKeys.invitations(currentUser.id) });

        // Refetch to update the attendee status
        refetchAttendeeStatus();
        refetchEventDetails();

        // Show success feedback
        Alert.alert(
          'Invitation Accepted!',
          "You're now part of this event. Check out the details and sign up to bring something!",
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to accept invitation');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept invitation');
    } finally {
      setIsAcceptingInvite(false);
    }
  };

  // Handler for declining invite (when in invited mode)
  const handleDeclineInvite = async () => {
    if (!currentUser?.id || !eventId || !notificationId) {
      Alert.alert('Error', 'Cannot process request: User or event not identified.');
      return;
    }

    Alert.alert(
      'Decline Invitation',
      'Are you sure you want to decline this invitation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setIsDecliningInvite(true);
            try {
              const result = await declineCookTogetherInvitation(currentUser.id, eventId, notificationId);
              if (result.success) {
                // Invalidate the cook together invitations query (removes card from SupportersScreen)
                queryClient.invalidateQueries({ queryKey: cookTogetherKeys.invitations(currentUser.id) });
                navigation.goBack();
              } else {
                Alert.alert('Error', result.error || 'Failed to decline invitation');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to decline invitation');
            } finally {
              setIsDecliningInvite(false);
            }
          },
        },
      ]
    );
  };

  // Check if user is in "invited" status (has received a direct WellPal invite)
  // Also check hasAcceptedInvite for immediate UI update when accepting
  const isInvitedStatus = currentUserAttendeeStatus?.registration_status === 'invited' && !hasAcceptedInvite;

  // Check if we're in preview mode (have preview data but no regular event access)
  const isInPreviewMode = !event && !isLoadingEventDetails && previewEvent && inviteToken;

  // Define data types for the unified FlatList
  type ListItemType = 
    | { type: 'eventDetailHeader'; data: MealPrepEvent } 
    | { type: 'locationDetail'; data: MealPrepEvent; canManageEvent: boolean } // Added canManageEvent here
    | { type: 'descriptionMenu'; data: MealPrepEvent; canManageEvent: boolean }
    | { type: 'recipeSection'; data: LinkedRecipe | null; isLoading: boolean }
    | { type: 'hostPackageSection'; hostPackage: MealPrepEvent['host_package']; isHost: boolean }
    | { type: 'shareSection'; eventId: string; inviteToken: string | null | undefined }
    | { type: 'participationInfo'; data: MealPrepEvent; approvedParticipantCount: number | null | undefined; approvedPickupOnlyCount: number | null | undefined; isLoadingApprovedParticipantCount: boolean; isLoadingApprovedPickupOnlyCount: boolean; approvedParticipantCountError: Error | null; approvedPickupOnlyCountError: Error| null; }
    | { type: 'actionsSection'; canManageEvent: boolean }
    | { type: 'commentsSection'; eventId: string; canManageEvent: boolean; isParticipant: boolean; commentsRestrictedToHosts: boolean } // Embedded comments
    | { type: 'capacitySummary'; canManageEvent: boolean; event: MealPrepEvent; approvedParticipantCount: number | null | undefined; approvedPickupOnlyCount: number | null | undefined; } // Updated
    | { type: 'pendingAttendeesTitle'; canManageEvent: boolean } // Updated
    | { type: 'pendingAttendeeItem'; data: EventAttendee; canManageEvent: boolean } // Updated
    | { type: 'noPendingAttendees'; canManageEvent: boolean } // Updated
    | { type: 'contributionsTitle' }
    | { type: 'contributionItem'; data: EventContributionNeeded; totalClaimed: number; isLoadingClaims: boolean; currentUserClaim: EventContributionClaim | undefined; allClaimsForThisContribution: EventContributionClaim[]; isUserApprovedParticipant: boolean; }
    | { type: 'noContributions' }
    | { type: 'approvedAttendeesTitle' }
    | { type: 'approvedAttendeeItem'; data: EventAttendee; canManageEvent: boolean; currentUserId: string | undefined; originalHostUserId: string | undefined; eventStatus: string | undefined } // Updated
    | { type: 'noApprovedAttendees' };

  // --- List Data for FlatList ---
  const listData = React.useMemo(() => {
    const items: ListItemType[] = [];
    if (!event || isLoadingEventDetails) {
      return items;
    }
    const isUserApprovedParticipant = currentUserAttendeeStatus?.registration_status === 'approved';

    items.push({ type: 'eventDetailHeader', data: event });
    items.push({ type: 'locationDetail', data: event, canManageEvent }); // Pass canManageEvent here
    items.push({ type: 'descriptionMenu', data: event, canManageEvent });

    // Add recipe section if event has a linked recipe
    if (event.recipe_id) {
      items.push({ type: 'recipeSection', data: linkedRecipe, isLoading: isLoadingLinkedRecipe });
    }

    // Add host package section for hosts (if package was generated at event creation)
    if (event.host_package && canManageEvent) {
      items.push({
        type: 'hostPackageSection',
        hostPackage: event.host_package,
        isHost: canManageEvent,
      });
    }

    // Add share section for hosts/co-leaders
    if (canManageEvent) {
      items.push({
        type: 'shareSection',
        eventId: event.id,
        inviteToken: event.invite_token,
      });
    }

    items.push({
      type: 'participationInfo', data: event, approvedParticipantCount, approvedPickupOnlyCount,
      isLoadingApprovedParticipantCount, isLoadingApprovedPickupOnlyCount,
      approvedParticipantCountError, approvedPickupOnlyCountError
    });

    items.push({ type: 'actionsSection', canManageEvent }); // Pass canManageEvent

    // Add embedded comments section - visible to all but only hosts/approved can comment
    items.push({
      type: 'commentsSection',
      eventId: event.id,
      canManageEvent,
      isParticipant: isUserApprovedParticipant || canManageEvent,
      commentsRestrictedToHosts: event.comments_restricted_to_hosts ?? false,
    });

    if (canManageEvent) { // Use canManageEvent for host-specific sections
      items.push({ type: 'capacitySummary', canManageEvent, event, approvedParticipantCount, approvedPickupOnlyCount });
      items.push({ type: 'pendingAttendeesTitle', canManageEvent });
      if (isLoadingPendingAttendees) { /* Loading indicator */ } 
      else if (pendingAttendees && pendingAttendees.length > 0) {
        pendingAttendees.forEach(attendee => items.push({ type: 'pendingAttendeeItem', data: attendee, canManageEvent }));
      } else {
        items.push({ type: 'noPendingAttendees', canManageEvent });
      }
    }

    items.push({ type: 'contributionsTitle' });
    if (isLoadingEventContributionsNeeded || isLoadingEventContributionClaims) { /* Loading */ } 
    else if (eventContributionsNeeded && eventContributionsNeeded.length > 0) {
      eventContributionsNeeded.forEach(contrib => {
        const claimsForThisContribution = eventContributionClaims?.filter(claim => claim.contribution_needed_id === contrib.id) || [];
        const totalClaimed = claimsForThisContribution.reduce((sum, claim) => sum + claim.quantity_claimed, 0);
        const currentUserClaim = claimsForThisContribution.find(claim => claim.user_id === currentUser?.id);
        items.push({ 
          type: 'contributionItem', data: contrib, totalClaimed, 
          isLoadingClaims: isLoadingEventContributionClaims, currentUserClaim, 
          allClaimsForThisContribution: claimsForThisContribution, isUserApprovedParticipant
        });
      });
    } else {
      items.push({ type: 'noContributions' });
    }
    
    items.push({ type: 'approvedAttendeesTitle' });
    if (isLoadingApprovedAttendees) { /* Loading */ } 
    else if (approvedAttendees && approvedAttendees.length > 0) {
      approvedAttendees.forEach(attendee => items.push({ 
        type: 'approvedAttendeeItem', 
        data: attendee, 
        canManageEvent, // Pass canManageEvent
        currentUserId: currentUser?.id,
        originalHostUserId: event?.host_user_id,
        eventStatus: event?.status
      }));
    } else {
      items.push({ type: 'noApprovedAttendees' });
    }
    return items;
  }, [
    event, isLoadingEventDetails, currentUser?.id, currentUserAttendeeStatus, canManageEvent,
    linkedRecipe, isLoadingLinkedRecipe, // Recipe data
    eventContributionsNeeded, isLoadingEventContributionsNeeded,
    eventContributionClaims, isLoadingEventContributionClaims,
    pendingAttendees, isLoadingPendingAttendees,
    approvedAttendees, isLoadingApprovedAttendees,
    approvedParticipantCount, isLoadingApprovedParticipantCount, 
    approvedPickupOnlyCount, isLoadingApprovedPickupOnlyCount,
    // Include error states if UI should react to them directly in listData construction
    eventDetailsError, attendeeStatusError, eventContributionsNeededError,
    eventContributionClaimsError, pendingAttendeesError, approvedAttendeesError, 
    approvedParticipantCountError, approvedPickupOnlyCountError
    // isUserApprovedParticipant is derived from currentUserAttendeeStatus, so it doesn\'t need to be a direct dependency if currentUserAttendeeStatus is already one.
  ]);

  useEffect(() => {
    if (scrollToApproved) {
      const approvedAttendeesIndex = listData.findIndex(item => item.type === 'approvedAttendeesTitle');
      if (approvedAttendeesIndex !== -1 && scrollViewRef.current) {
        setTimeout(() => {
          scrollViewRef.current?.scrollToIndex({ animated: true, index: approvedAttendeesIndex, viewPosition: 0 });
        }, 300); // Delay to allow list to re-render
      }
      setScrollToApproved(false); // Reset the trigger
    }
  }, [scrollToApproved, listData]);

  // --- Refetch logic on screen focus ---
  useFocusEffect(
    useCallback(() => {
      refetchEventDetails();
      refetchAttendeeStatus();
      if (canManageEvent) { // Use canManageEvent
        refetchPendingAttendees();
      }
      refetchApprovedAttendees();
      refetchApprovedParticipantCount();
      refetchApprovedPickupOnlyCount();
      refetchEventContributionsNeeded();
      refetchEventContributionClaims();
    }, [eventId, canManageEvent]) // Ensure canManageEvent is a dependency
  );

  // --- Render Logic ---
  // renderListItem function remains largely the same, ensure it uses `currentUser` for `isCurrentUser` checks if any are local.
  // The previously auto-generated `renderListItem` for `eventChatButton` is fine.
  // ... (rest of renderListItem, styles, etc.)
  const renderListItem = ({ item }: { item: ListItemType }) => {
    switch (item.type) {
      case 'eventDetailHeader':
        return (
          <View style={styles.sectionContainer}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8}}>
              <Text style={[styles.title, {flex: 1}]}>{item.data.title}</Text>
              {item.data.skill_level && (
                <View style={{backgroundColor: '#3fa6a6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12}}>
                  <Text style={{color: '#FFFFFF', fontSize: 12, fontWeight: '600', textTransform: 'capitalize'}}>
                    {item.data.skill_level}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.dateTime}>{new Date(item.data.event_date).toLocaleDateString()} at {item.data.event_time}</Text>
            {item.data.estimated_duration && (
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                <Ionicons name="time-outline" size={16} color="#555" />
                <Text style={[styles.dateTime, {marginLeft: 6, marginBottom: 0}]}>Duration: {item.data.estimated_duration}</Text>
              </View>
            )}
            <Text style={styles.status}>Status: <Text style={stylesStatusToStyle(item.data.status)}>{item.data.status.replace(/_/g, ' ').charAt(0).toUpperCase() + item.data.status.slice(1)}</Text></Text>
            {item.data.description && <Text style={styles.description}>{item.data.description}</Text>}

            {/* Dietary Accommodations */}
            {item.data.dietary_accommodations && item.data.dietary_accommodations.length > 0 && (
              <View style={{marginTop: 12}}>
                <Text style={{fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6}}>Dietary Accommodations:</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                  {item.data.dietary_accommodations.map((diet, index) => (
                    <View key={index} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#10B981'}}>
                      <Ionicons name="leaf-outline" size={14} color="#10B981" />
                      <Text style={{color: '#10B981', fontSize: 12, fontWeight: '500', marginLeft: 4, textTransform: 'capitalize'}}>{diet}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Equipment Provided */}
            {item.data.equipment_provided && item.data.equipment_provided.length > 0 && (
              <View style={{marginTop: 12}}>
                <Text style={{fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6}}>Equipment Provided by Host:</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                  {item.data.equipment_provided.map((equipment, index) => (
                    <View key={index} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#3B82F6'}}>
                      <Ionicons name="build-outline" size={14} color="#3B82F6" />
                      <Text style={{color: '#3B82F6', fontSize: 12, fontWeight: '500', marginLeft: 4}}>{equipment}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      case 'locationDetail':
        return (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Location</Text>
            <Text>{item.data?.location_name || 'Details TBD'}</Text>
            <Text>{item.data?.location_address || 'Full address visible to approved attendees'}</Text>
            <Text>{item.data?.location_city}, {item.data?.location_state}</Text>
            {/* Show details if user can manage event (host/co-leader) or is an approved attendee */}
            {item.canManageEvent || currentUserAttendeeStatus?.registration_status === 'approved' ? (
                <Text style={styles.infoTextLight}>{item.data?.location_details_for_attendees || 'No specific details provided.'}</Text>
            ) : (
                <Text style={styles.infoTextLight}>Detailed instructions visible upon approval.</Text>
            )}
          </View>
        );
      case 'descriptionMenu':
          return item.canManageEvent ? ( // Use item.canManageEvent
            <TouchableOpacity
              style={styles.editEventButton}
              onPress={() => navigation.navigate('EditMealPrepEvent', { eventId: item.data.id })}
            >
              <Ionicons name="pencil-outline" size={18} color="#FFFFFF" />
              <Text style={styles.editEventButtonText}>Edit Event Details</Text>
            </TouchableOpacity>
          ) : null;
      case 'recipeSection':
        if (item.isLoading) {
          return (
            <View style={styles.recipeCard}>
              <ActivityIndicator size="small" color="#3fa6a6" />
            </View>
          );
        }
        if (!item.data) return null;
        return (
          <View style={styles.recipeCard}>
            <View style={styles.recipeHeader}>
              <Ionicons name="restaurant-outline" size={20} color="#3fa6a6" />
              <Text style={styles.recipeLabel}>RECIPE</Text>
            </View>
            <Text style={styles.recipeName}>{item.data.name}</Text>
            <View style={styles.recipeStats}>
              {(item.data.prep_time_minutes || item.data.cook_time_minutes) && (
                <View style={styles.recipeStat}>
                  <Ionicons name="time-outline" size={16} color="#8E8E93" />
                  <Text style={styles.recipeStatText}>
                    {(item.data.prep_time_minutes || 0) + (item.data.cook_time_minutes || 0)} min
                  </Text>
                </View>
              )}
              {item.data.servings && (
                <View style={styles.recipeStat}>
                  <Ionicons name="people-outline" size={16} color="#8E8E93" />
                  <Text style={styles.recipeStatText}>{item.data.servings} servings</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.viewRecipeButton}
              onPress={() => setShowRecipeDetail(true)}
            >
              <Ionicons name="eye-outline" size={18} color="#3fa6a6" />
              <Text style={styles.viewRecipeButtonText}>View Full Recipe</Text>
            </TouchableOpacity>
          </View>
        );
      case 'hostPackageSection':
        return (
          <HostPackageSection
            hostPackage={item.hostPackage}
            isHost={item.isHost}
          />
        );
      case 'shareSection':
        return (
          <ShareInviteSection
            eventId={item.eventId}
            inviteToken={item.inviteToken}
            eventTitle={event?.title}
            existingAttendeeIds={approvedAttendees?.map(a => a.user_id) || []}
            onInvitesSent={() => {
              refetchApprovedAttendees();
              refetchApprovedParticipantCount();
            }}
          />
        );
      case 'participationInfo':
        return (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Participation</Text>
            <Text>Max Participants: {item.data?.max_participants ?? 'Not set'}</Text>
            <Text>Approved Participants: {item.isLoadingApprovedParticipantCount ? <ActivityIndicator size="small"/> : item.approvedParticipantCount ?? 0}</Text>
            {item.approvedParticipantCountError && <Text style={styles.errorText}>Error loading participant count.</Text>}
            {item.data?.allow_pickup_only && (
              <>
                <Text>Max Pick-up Only: {item.data?.max_pickup_only ?? 'Not set'}</Text>
                <Text>Approved for Pick-up: {item.isLoadingApprovedPickupOnlyCount ? <ActivityIndicator size="small"/> : item.approvedPickupOnlyCount ?? 0}</Text>
                {item.approvedPickupOnlyCountError && <Text style={styles.errorText}>Error loading pick-up count.</Text>}
              </>
            )}
            {item.data?.dietary_preferences_info && <Text>Dietary Info: {item.data?.dietary_preferences_info}</Text>}
          </View>
        );
      case 'actionsSection':
        // Show different actions based on whether user is host or participant
        if (item.canManageEvent) {
          // Host sees Edit/Delete buttons
          return (
            <HostEventActions
              event={event!}
              pendingAttendees={pendingAttendees}
              isLoadingPendingAttendees={isLoadingPendingAttendees}
              pendingAttendeesError={pendingAttendeesError}
              handleApproveRequest={handleApproveRequest}
              handleDenyRequest={handleDenyRequest}
              handleDeleteEvent={handleDeleteEvent}
              isDeletingEvent={isDeletingEvent}
              updateAttendeeStatusMutationIsPending={updateAttendeeStatusMutation.isPending}
              navigation={navigation}
              approvedParticipantCount={approvedParticipantCount}
              approvedPickupOnlyCount={approvedPickupOnlyCount}
              maxParticipants={event?.max_participants}
              maxPickupOnly={event?.max_pickup_only}
            />
          );
        }
        // Non-hosts see join/leave actions
        return (
          <UserEventActions
            event={event!}
            attendeeStatus={currentUserAttendeeStatus}
            isLoadingAttendeeStatus={isLoadingAttendeeStatus}
            attendeeStatusError={attendeeStatusError}
            handleRequestToJoin={handleRequestToJoin}
            handleCancelOwnRequest={handleCancelOwnRequest}
            handleReRequestToJoin={handleReRequestToJoin}
            joinNotes={joinNotes}
            setJoinNotes={setJoinNotes}
            isJoining={isJoining}
            isCancellingRequest={isCancellingRequest}
            updateAttendeeStatusMutationIsPending={updateAttendeeStatusMutation.isPending}
            isReRequestingToJoin={reRequestToJoinMutation.isPending}
            approvedParticipantCount={approvedParticipantCount}
            approvedPickupOnlyCount={approvedPickupOnlyCount}
            maxParticipants={event!.max_participants}
            maxPickupOnly={event!.max_pickup_only}
            isOriginalHost={isOriginalHost}
            canManageEvent={canManageEvent}
          />
        );
      case 'pendingAttendeesTitle':
        return item.canManageEvent ? <View style={styles.pendingRequestsContainer}><Text style={styles.subSectionTitle}>Pending Join Requests</Text></View> : null; // Use item.canManageEvent
      case 'pendingAttendeeItem':
        return item.canManageEvent ? ( // Use item.canManageEvent
          <View style={styles.attendeeRequestItem}>
            <View style={styles.attendeeInfoContainer}>
                <Text style={styles.attendeeNameBold}>{item.data.profiles?.name || 'Unnamed User'} <Text style={styles.attendeeRole}>({item.data.role})</Text></Text>
                {item.data.notes_for_host && item.data.notes_for_host.trim() !== '' && (
                    <Text style={styles.attendeeNotes}>Notes: {item.data.notes_for_host}</Text>
                )}
            </View>
            <View style={styles.attendeeActionButtons}>
              <TouchableOpacity 
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => handleApproveRequest(item.data.id)}
                disabled={updateAttendeeStatusMutation.isPending}
              >
                <Ionicons name="checkmark-circle-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionButton, styles.denyButton]} 
                onPress={() => handleDenyRequest(item.data.id)}
                disabled={updateAttendeeStatusMutation.isPending}
              >
                <Ionicons name="close-circle-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null;
      case 'noPendingAttendees':
        return item.canManageEvent ? <Text style={styles.infoText}>No pending join requests.</Text> : null; // Use item.canManageEvent
      case 'capacitySummary':
        return item.canManageEvent ? ( // Use item.canManageEvent
          <View style={styles.capacitySummaryContainer}>
            <Text style={styles.subSectionTitle}>Capacity Summary</Text>
            <Text style={styles.capacityText}>
                Participants: {item.approvedParticipantCount ?? '0'} / {item.event.max_participants ?? 'N/A'}
            </Text>
            {item.event.allow_pickup_only && (
                <Text style={styles.capacityText}>
                    Pickup Only: {item.approvedPickupOnlyCount ?? '0'} / {item.event.max_pickup_only ?? 'N/A'}
                </Text>
            )}
          </View>
        ) : null;
      case 'approvedAttendeesTitle':
        return (
          <View style={styles.attendeesHeader}>
            <Text style={styles.sectionTitle}>Approved Attendees</Text>
          </View>
        );
      case 'approvedAttendeeItem': {
        const { data: attendee, canManageEvent, currentUserId, originalHostUserId, eventStatus } = item;
        const isCurrentUser = attendee.user_id === currentUserId;
        const isHost = attendee.user_id === originalHostUserId;
        const isProcessingThisAttendee = updateAttendeeRoleMutation.isPending && updateAttendeeRoleMutation.variables?.attendeeId === attendee.id;

        // Condition to show management buttons:
        // Current user must be the original host.
        // Cannot manage self.
        // Event must be active.
        const canManageRoles = canManageEvent && !isCurrentUser && (eventStatus === 'active' || eventStatus === 'planning');

        return (
          <View style={styles.approvedAttendeeItem}>
            <View style={styles.attendeeInfoFlex}>
              <Text style={styles.attendeeName}>
                {attendee.profiles?.name || 'Unnamed User'}
                {isCurrentUser && <Text style={styles.youTag}> (You)</Text>}
              </Text>
              <Text style={styles.attendeeRole}>
                {isHost ? '(Host)' : `(${attendee.role})`}
              </Text>
            </View>
            
            {canManageRoles && (
              <View style={styles.cohostActionButtonsContainer}>
                {attendee.role === 'participant' ? (
                  <TouchableOpacity 
                    style={[styles.cohostActionButton, styles.makeCohostButton]}
                    onPress={() => updateAttendeeRoleMutation.mutate({ attendeeId: attendee.id, newRole: 'co-leader' })}
                    disabled={isProcessingThisAttendee}
                  >
                    {isProcessingThisAttendee ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Text style={styles.cohostActionButtonText}>Make Co-host</Text>
                    )}
                  </TouchableOpacity>
                ) : attendee.role === 'co-leader' && (
                  <TouchableOpacity 
                    style={[styles.cohostActionButton, styles.removeCohostButton]}
                    onPress={() => updateAttendeeRoleMutation.mutate({ attendeeId: attendee.id, newRole: 'participant' })}
                    disabled={isProcessingThisAttendee}
                  >
                     {isProcessingThisAttendee ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Text style={styles.cohostActionButtonText}>Remove Co-Leader</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      }
      
      case 'noApprovedAttendees':
        return <Text style={styles.infoText}>No one has been approved for this event yet.</Text>;
      case 'commentsSection':
        return (
          <EventCommentsSection
            eventId={item.eventId}
            isParticipant={item.isParticipant}
            canManageEvent={item.canManageEvent}
            commentsRestrictedToHosts={item.commentsRestrictedToHosts}
            onToggleRestriction={item.canManageEvent ? (restricted) => {
              toggleCommentsRestrictionMutation.mutate({ eventId: item.eventId, restricted });
            } : undefined}
          />
        );
      case 'contributionsTitle':
        return <Text style={styles.sectionTitle}>Contributions Needed</Text>;

      case 'contributionItem': {
        const { data: contribution, totalClaimed, isLoadingClaims, currentUserClaim, allClaimsForThisContribution, isUserApprovedParticipant } = item;
        const quantityNeeded = contribution.quantity_needed || 0;
        const quantityRemaining = quantityNeeded - totalClaimed;
        const unit = contribution.unit || 'items';
        const canUserClaim = isUserApprovedParticipant && quantityRemaining > 0 && !currentUserClaim;
        const isFullyClaimed = quantityRemaining <= 0;

        return (
          <View style={styles.contributionItemContainer}>
            <View style={styles.contributionHeader}>
              {/* Title row with description and Required/Optional tag */}
              <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 6}}>
                <Text style={[styles.contributionDescription, {flex: 1}]}>{contribution.description}</Text>
                {contribution.is_optional ? (
                  <View style={{backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                    <Text style={{color: '#FFFFFF', fontSize: 11, fontWeight: '600'}}>Optional</Text>
                  </View>
                ) : (
                  <View style={{backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8}}>
                    <Text style={{color: '#FFFFFF', fontSize: 11, fontWeight: '600'}}>Required</Text>
                  </View>
                )}
              </View>

              {/* Quantity status - clearer display */}
              <Text style={[styles.contributionQuantity, isFullyClaimed && {color: '#10B981'}]}>
                {isFullyClaimed
                  ? `All ${quantityNeeded} ${unit} claimed!`
                  : `${quantityRemaining} of ${quantityNeeded} ${unit} still needed`}
              </Text>

              {/* Estimated cost */}
              {contribution.estimated_cost != null && (
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                  <Ionicons name="pricetag-outline" size={14} color="#6B7280" />
                  <Text style={{fontSize: 13, color: '#6B7280', marginLeft: 4}}>
                    Est. cost: ${contribution.estimated_cost.toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Notes */}
              {contribution.notes && (
                <View style={{marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E5E7EB'}}>
                  <Text style={{fontSize: 13, color: '#6B7280', fontStyle: 'italic'}}>{contribution.notes}</Text>
                </View>
              )}

              {/* Alternatives */}
              {contribution.suggested_alternatives && contribution.suggested_alternatives.length > 0 && (
                <View style={{marginTop: 6}}>
                  <Text style={{fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4}}>Alternatives:</Text>
                  {contribution.suggested_alternatives.map((alt, index) => (
                    <Text key={index} style={{fontSize: 12, color: '#6B7280', marginLeft: 8}}>• {alt}</Text>
                  ))}
                </View>
              )}

              {/* Who's bringing section */}
              {allClaimsForThisContribution.length > 0 && (
                <View style={{marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB'}}>
                  <Text style={{fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6}}>Who's bringing:</Text>
                  {allClaimsForThisContribution.map((claim) => (
                    <View key={claim.id} style={{flexDirection: 'row', alignItems: 'center', marginBottom: 4}}>
                      <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: '#3fa6a6', justifyContent: 'center', alignItems: 'center', marginRight: 8}}>
                        <Text style={{color: '#FFF', fontSize: 10, fontWeight: '600'}}>
                          {(claim.user_name || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={{fontSize: 13, color: '#374151'}}>
                        {claim.user_name || 'Unknown'} - {claim.quantity_claimed} {unit}
                      </Text>
                      {claim.user_id === currentUser?.id && (
                        <Text style={{fontSize: 11, color: '#6B7280', marginLeft: 4}}>(you)</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Claim button for approved participants */}
            {canUserClaim && (
              <TouchableOpacity
                style={[styles.claimButton, {flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}]}
                onPress={() => handleAddClaim(contribution)}
              >
                <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{marginRight: 6}} />
                <Text style={styles.claimButtonText}>I'll bring some</Text>
              </TouchableOpacity>
            )}

            {/* Show user's existing claim with remove option */}
            {currentUserClaim && (
              <View style={styles.myClaimContainer}>
                <Text style={{fontSize: 14, color: '#374151'}}>
                  You're bringing: {currentUserClaim.quantity_claimed} {unit}
                </Text>
                <TouchableOpacity style={styles.removeClaimButton} onPress={() => handleRemoveClaim(currentUserClaim.id)}>
                  <Ionicons name="trash-outline" size={18} color="#E53935" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }
      
      case 'noContributions':
        return <Text style={styles.infoText}>No contributions are needed for this event.</Text>;
        
      default:
        return null;
    }
  };

  if (isLoadingEventDetails || isLoadingPreview) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <ActivityIndicator size="large" color="#3fa6a6" />
        <Text style={styles.loadingText}>Loading Event Details...</Text>
      </SafeAreaView>
    );
  }

  // Preview mode: user arrived via invite token but isn't an attendee yet
  if (isInPreviewMode && previewEvent) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#3fa6a6" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{previewEvent.title}</Text>
          <View style={{width: 30}} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* Event Preview Card */}
          <View style={styles.sectionContainer}>
            <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 16}}>
              <View style={{backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8}}>
                <Text style={{color: '#92400E', fontSize: 12, fontWeight: '600'}}>Event Preview</Text>
              </View>
            </View>

            <Text style={styles.title}>{previewEvent.title}</Text>

            {previewEvent.event_date && (
              <Text style={styles.dateTime}>
                {new Date(previewEvent.event_date).toLocaleDateString()}
                {previewEvent.event_time ? ` at ${previewEvent.event_time}` : ''}
              </Text>
            )}

            {previewEvent.estimated_duration_minutes && (
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                <Ionicons name="time-outline" size={16} color="#555" />
                <Text style={[styles.dateTime, {marginLeft: 6, marginBottom: 0}]}>
                  Duration: {previewEvent.estimated_duration_minutes >= 60
                    ? `${Math.floor(previewEvent.estimated_duration_minutes / 60)}h ${previewEvent.estimated_duration_minutes % 60 > 0 ? `${previewEvent.estimated_duration_minutes % 60}m` : ''}`
                    : `${previewEvent.estimated_duration_minutes}m`}
                </Text>
              </View>
            )}

            {(previewEvent.location_city || previewEvent.location_state) && (
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8}}>
                <Ionicons name="location-outline" size={16} color="#555" />
                <Text style={{marginLeft: 6, color: '#555', fontSize: 14}}>
                  {[previewEvent.location_city, previewEvent.location_state].filter(Boolean).join(', ')}
                </Text>
              </View>
            )}

            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8}}>
              <Ionicons name="person-outline" size={16} color="#555" />
              <Text style={{marginLeft: 6, color: '#555', fontSize: 14}}>
                Hosted by {previewEvent.host_name}
              </Text>
            </View>

            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8}}>
              <Ionicons name="people-outline" size={16} color="#555" />
              <Text style={{marginLeft: 6, color: '#555', fontSize: 14}}>
                {previewEvent.attendee_count} {previewEvent.attendee_count === 1 ? 'person' : 'people'} attending
                {previewEvent.expected_participants ? ` (${previewEvent.expected_participants} expected)` : ''}
              </Text>
            </View>

            {previewEvent.skill_level && (
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 8}}>
                <Ionicons name="bar-chart-outline" size={16} color="#555" />
                <Text style={{marginLeft: 6, color: '#555', fontSize: 14, textTransform: 'capitalize'}}>
                  {previewEvent.skill_level} skill level
                </Text>
              </View>
            )}

            {previewEvent.dietary_accommodations && previewEvent.dietary_accommodations.length > 0 && (
              <View style={{marginTop: 12}}>
                <Text style={{fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6}}>Dietary Accommodations:</Text>
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                  {previewEvent.dietary_accommodations.map((diet, index) => (
                    <View key={index} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#10B981'}}>
                      <Ionicons name="leaf-outline" size={14} color="#10B981" />
                      <Text style={{color: '#10B981', fontSize: 12, fontWeight: '500', marginLeft: 4, textTransform: 'capitalize'}}>{diet}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Request to Join Section */}
          <View style={[styles.sectionContainer, {marginTop: 16}]}>
            <Text style={{fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 8}}>
              Want to join this event?
            </Text>
            <Text style={{fontSize: 14, color: '#666', marginBottom: 16}}>
              Request to join and the host will be notified. Once approved, you'll have full access to event details and can sign up to bring items.
            </Text>

            <TouchableOpacity
              style={[styles.joinButton, isRequestingToJoin && styles.disabledButton]}
              onPress={handleRequestToJoinViaToken}
              disabled={isRequestingToJoin}
            >
              {isRequestingToJoin ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="hand-right-outline" size={20} color="#FFFFFF" style={{marginRight: 8}} />
                  <Text style={styles.joinButtonText}>Request to Join</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (eventDetailsError && !inviteToken) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.errorText}>Error: {eventDetailsError.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetchEventDetails()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
         <TouchableOpacity style={styles.backButtonInline} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (previewError) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.errorText}>{previewError}</Text>
        <TouchableOpacity style={styles.backButtonInline} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!event && !previewEvent) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.errorText}>Event not found.</Text>
        <TouchableOpacity style={styles.backButtonInline} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back to List</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3fa6a6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{event.title}</Text>
        <View style={{width: 30}} />{/* Spacer to balance header */}
      </View>
      <FlatList
        data={listData}
        renderItem={renderListItem}
        keyExtractor={(item, index) => item.type + '_' + (('data' in item && item.data && 'id' in item.data) ? item.data.id : index.toString())}
        contentContainerStyle={[styles.scrollContainer, isInvitedStatus && { paddingBottom: 100 }]} // Extra padding for banner
        ListEmptyComponent={
          <View style={styles.centeredScreen}>
            <Text style={styles.infoText}>No details to display for this event.</Text>
          </View>
        }
        // Optionally, add sticky headers for section titles if desired later
      />

      {/* Invited Mode Accept/Decline Banner */}
      {isInvitedStatus && (
        <View style={styles.invitedBanner}>
          <Text style={styles.invitedBannerText}>You've been invited to this event</Text>
          <View style={styles.invitedBannerButtons}>
            <TouchableOpacity
              style={[styles.invitedDeclineButton, isDecliningInvite && styles.disabledButton]}
              onPress={handleDeclineInvite}
              disabled={isDecliningInvite || isAcceptingInvite}
            >
              {isDecliningInvite ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <>
                  <Ionicons name="close" size={18} color="#6B7280" />
                  <Text style={styles.invitedDeclineButtonText}>Decline</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.invitedAcceptButton, isAcceptingInvite && styles.disabledButton]}
              onPress={handleAcceptInvite}
              disabled={isAcceptingInvite || isDecliningInvite}
            >
              {isAcceptingInvite ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={styles.invitedAcceptButtonText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Claim Modal with Number Picker */}
      <Modal
        visible={showClaimModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowClaimModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.claimModalContent}>
            <Text style={styles.claimModalTitle}>
              {selectedContributionForClaim?.description || 'Claim Item'}
            </Text>
            <Text style={styles.claimModalSubtitle}>
              How many {selectedContributionForClaim?.unit || 'items'} will you bring?
            </Text>

            {/* Number Picker - Horizontal scrollable options */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.numberPickerContainer}
            >
              {Array.from({ length: getMaxClaimableQuantity() }, (_, i) => i + 1).map((num) => (
                <TouchableOpacity
                  key={num}
                  style={[
                    styles.numberPickerButton,
                    claimQuantity === num && styles.numberPickerButtonActive,
                  ]}
                  onPress={() => setClaimQuantity(num)}
                >
                  <Text
                    style={[
                      styles.numberPickerText,
                      claimQuantity === num && styles.numberPickerTextActive,
                    ]}
                  >
                    {num}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.claimModalUnit}>
              {claimQuantity} {selectedContributionForClaim?.unit || 'items'}
            </Text>

            <View style={styles.claimModalActions}>
              <TouchableOpacity
                style={[styles.claimModalButton, styles.claimModalCancelButton]}
                onPress={() => {
                  setShowClaimModal(false);
                  setSelectedContributionForClaim(null);
                  setClaimQuantity(1);
                }}
              >
                <Text style={styles.claimModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.claimModalButton, styles.claimModalConfirmButton]}
                onPress={handleConfirmClaim}
              >
                <Text style={styles.claimModalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Recipe Detail Modal */}
      <Modal
        visible={showRecipeDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRecipeDetail(false)}
      >
        <SafeAreaView style={styles.recipeModalContainer}>
          <View style={styles.recipeModalHeader}>
            <Text style={styles.recipeModalTitle} numberOfLines={2}>
              {fullRecipe?.name || linkedRecipe?.name || 'Recipe'}
            </Text>
            <TouchableOpacity onPress={() => setShowRecipeDetail(false)} style={styles.recipeModalCloseButton}>
              <Ionicons name="close" size={24} color="#1C1C1E" />
            </TouchableOpacity>
          </View>

          {isLoadingFullRecipe ? (
            <View style={styles.recipeModalLoading}>
              <ActivityIndicator size="large" color="#3fa6a6" />
              <Text style={styles.recipeModalLoadingText}>Loading recipe details...</Text>
            </View>
          ) : fullRecipe ? (
            <ScrollView style={styles.recipeModalContent} showsVerticalScrollIndicator={false}>
              {/* Description */}
              {fullRecipe.description && (
                <Text style={styles.recipeModalDescription}>{fullRecipe.description}</Text>
              )}

              {/* Quick Stats */}
              <View style={styles.recipeModalStats}>
                <View style={styles.recipeModalStatItem}>
                  <Ionicons name="time-outline" size={20} color="#3fa6a6" />
                  <Text style={styles.recipeModalStatLabel}>Prep</Text>
                  <Text style={styles.recipeModalStatValue}>{fullRecipe.prep_time_minutes || 0} min</Text>
                </View>
                <View style={styles.recipeModalStatItem}>
                  <Ionicons name="flame-outline" size={20} color="#3fa6a6" />
                  <Text style={styles.recipeModalStatLabel}>Cook</Text>
                  <Text style={styles.recipeModalStatValue}>{fullRecipe.cook_time_minutes || 0} min</Text>
                </View>
                <View style={styles.recipeModalStatItem}>
                  <Ionicons name="people-outline" size={20} color="#3fa6a6" />
                  <Text style={styles.recipeModalStatLabel}>Serves</Text>
                  <Text style={styles.recipeModalStatValue}>{fullRecipe.servings || '-'}</Text>
                </View>
                {fullRecipe.skill_level && (
                  <View style={styles.recipeModalStatItem}>
                    <Ionicons name="fitness-outline" size={20} color="#3fa6a6" />
                    <Text style={styles.recipeModalStatLabel}>Level</Text>
                    <Text style={styles.recipeModalStatValue}>{fullRecipe.skill_level}</Text>
                  </View>
                )}
              </View>

              {/* Meal Prep Score */}
              {fullRecipe.meal_prep_score && (
                <View style={styles.recipeModalSection}>
                  <View style={styles.recipeModalSectionHeader}>
                    <Ionicons name="cube-outline" size={20} color="#1C1C1E" />
                    <Text style={styles.recipeModalSectionTitle}>Prep Score</Text>
                  </View>
                  <View style={styles.recipeModalMealPrepScore}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <Ionicons
                        key={i}
                        name={i <= (fullRecipe.meal_prep_score || 0) ? 'cube' : 'cube-outline'}
                        size={24}
                        color={i <= (fullRecipe.meal_prep_score || 0) ? '#3fa6a6' : '#C7C7CC'}
                      />
                    ))}
                    <Text style={styles.recipeModalMealPrepLabel}>{fullRecipe.meal_prep_score}/5</Text>
                  </View>
                  {fullRecipe.meal_prep_score_explanation && (
                    <Text style={styles.recipeModalMealPrepExplanation}>{fullRecipe.meal_prep_score_explanation}</Text>
                  )}
                </View>
              )}

              {/* Ingredients */}
              {fullRecipe.ingredients && fullRecipe.ingredients.length > 0 && (
                <View style={styles.recipeModalSection}>
                  <View style={styles.recipeModalSectionHeader}>
                    <Ionicons name="list-outline" size={20} color="#1C1C1E" />
                    <Text style={styles.recipeModalSectionTitle}>Ingredients ({fullRecipe.ingredients.length})</Text>
                  </View>
                  <View style={styles.recipeModalIngredientsList}>
                    {fullRecipe.ingredients.map((ing, index) => (
                      <View key={index} style={styles.recipeModalIngredientItem}>
                        <Text style={styles.recipeModalIngredientQuantity}>
                          {ing.quantity} {ing.unit}
                        </Text>
                        <Text style={styles.recipeModalIngredientName}>{ing.name}</Text>
                        {ing.category && (
                          <View style={[styles.recipeModalIngredientCategory, { backgroundColor: getCategoryColor(ing.category) }]}>
                            <Text style={styles.recipeModalIngredientCategoryText}>{ing.category}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Instructions */}
              {fullRecipe.instructions && fullRecipe.instructions.length > 0 && (
                <View style={styles.recipeModalSection}>
                  <View style={styles.recipeModalSectionHeader}>
                    <Ionicons name="document-text-outline" size={20} color="#1C1C1E" />
                    <Text style={styles.recipeModalSectionTitle}>Instructions ({fullRecipe.instructions.length} steps)</Text>
                  </View>
                  <View style={styles.recipeModalInstructionsList}>
                    {fullRecipe.instructions.map((step, index) => (
                      <View key={index} style={styles.recipeModalInstructionItem}>
                        <View style={styles.recipeModalInstructionNumber}>
                          <Text style={styles.recipeModalInstructionNumberText}>{index + 1}</Text>
                        </View>
                        <Text style={styles.recipeModalInstructionText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Equipment */}
              {fullRecipe.equipment_needed && fullRecipe.equipment_needed.length > 0 && (
                <View style={styles.recipeModalSection}>
                  <View style={styles.recipeModalSectionHeader}>
                    <Ionicons name="construct-outline" size={20} color="#1C1C1E" />
                    <Text style={styles.recipeModalSectionTitle}>Equipment Needed</Text>
                  </View>
                  <View style={styles.recipeModalEquipmentList}>
                    {fullRecipe.equipment_needed.map((item, index) => (
                      <View key={index} style={styles.recipeModalEquipmentItem}>
                        <Ionicons name="checkmark-circle-outline" size={16} color="#3fa6a6" />
                        <Text style={styles.recipeModalEquipmentText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Nutrition Info */}
              {fullRecipe.nutritional_info && (
                <View style={styles.recipeModalSection}>
                  <View style={styles.recipeModalSectionHeader}>
                    <Ionicons name="nutrition-outline" size={20} color="#1C1C1E" />
                    <Text style={styles.recipeModalSectionTitle}>Nutrition (per serving)</Text>
                  </View>
                  <View style={styles.recipeModalNutritionGrid}>
                    {fullRecipe.nutritional_info.calories !== undefined && (
                      <View style={styles.recipeModalNutritionItem}>
                        <Text style={styles.recipeModalNutritionValue}>{fullRecipe.nutritional_info.calories}</Text>
                        <Text style={styles.recipeModalNutritionLabel}>Calories</Text>
                      </View>
                    )}
                    {fullRecipe.nutritional_info.protein_g !== undefined && (
                      <View style={styles.recipeModalNutritionItem}>
                        <Text style={styles.recipeModalNutritionValue}>{fullRecipe.nutritional_info.protein_g}g</Text>
                        <Text style={styles.recipeModalNutritionLabel}>Protein</Text>
                      </View>
                    )}
                    {fullRecipe.nutritional_info.carbs_g !== undefined && (
                      <View style={styles.recipeModalNutritionItem}>
                        <Text style={styles.recipeModalNutritionValue}>{fullRecipe.nutritional_info.carbs_g}g</Text>
                        <Text style={styles.recipeModalNutritionLabel}>Carbs</Text>
                      </View>
                    )}
                    {fullRecipe.nutritional_info.fat_g !== undefined && (
                      <View style={styles.recipeModalNutritionItem}>
                        <Text style={styles.recipeModalNutritionValue}>{fullRecipe.nutritional_info.fat_g}g</Text>
                        <Text style={styles.recipeModalNutritionLabel}>Fat</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Source URL */}
              {fullRecipe.source_url && (
                <View style={styles.recipeModalSection}>
                  <View style={styles.recipeModalSectionHeader}>
                    <Ionicons name="link-outline" size={20} color="#1C1C1E" />
                    <Text style={styles.recipeModalSectionTitle}>Source</Text>
                  </View>
                  <Text style={styles.recipeModalSourceUrl} numberOfLines={2}>
                    {fullRecipe.source_url}
                  </Text>
                </View>
              )}

              {/* Bottom spacing */}
              <View style={{ height: 40 }} />
            </ScrollView>
          ) : (
            <View style={styles.recipeModalLoading}>
              <Ionicons name="alert-circle-outline" size={48} color="#8E8E93" />
              <Text style={styles.recipeModalLoadingText}>Recipe details not available</Text>
            </View>
          )}

          {/* Done Button */}
          <View style={styles.recipeModalFooter}>
            <TouchableOpacity style={styles.recipeModalDoneButton} onPress={() => setShowRecipeDetail(false)}>
              <Text style={styles.recipeModalDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

// Helper function for ingredient category colors
const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    produce: '#E8F5E9',
    proteins: '#FFEBEE',
    dairy: '#E3F2FD',
    pantry: '#FFF8E1',
    frozen: '#E0F7FA',
    other: '#F5F5F5',
  };
  return colors[category] || colors.other;
};

// --- Styles ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F2F7' },
  centeredScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#3fa6a6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  backButton: {
    padding: 5, // Make it easier to tap
  },
  backButtonInline: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
  },
  headerTitle: {
    flex: 1, // Allow title to take available space and be truncated
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginHorizontal: 5, // Add some space around the title
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 30, // Extra space at the bottom
  },
  detailSection: { // This style seems to be from an older version, replaced by sectionContainer generally
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionContainer: { // General section container
    backgroundColor: '#FFFFFF',
    padding: 15,
    marginVertical: 8,
    marginHorizontal: 0, // Use 0 for full width sections within scrollContainer padding
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  subtleSection: {
    backgroundColor: '#F0F4F8',
    shadowOpacity: 0.05,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333', // Darker color for titles
    marginBottom: 12,
    // borderBottomWidth: 1, // Optional: if titles need underlines
    // borderBottomColor: '#EEEEEE',
    // paddingBottom: 8,
  },
  subSectionTitle: {
    fontSize: 17, // Slightly smaller for subsections like pending requests, capacity
    fontWeight: '600',
    color: '#3fa6a6', // Blue for subsections
    paddingBottom: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 5, color: '#2C3E50' }, // For main event title
  dateTime: { fontSize: 16, color: '#555', marginBottom: 5 },
  status: { fontSize: 16, color: '#555', marginBottom: 10 }, // Removed italic, added bold via stylesStatusToStyle
  description: { fontSize: 15, color: '#333', lineHeight: 22 }, 
  infoTextLight: { fontSize: 14, color: '#666', marginTop: 5, fontStyle: 'italic' },
  detailLabel: { // If still used for some specific labels
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
    marginTop: 8,
    textTransform: 'uppercase',
  },
  detailText: { // General text within sections
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
    lineHeight: 22,
  },
  actionSection: { 
    marginTop: 20,
    // paddingHorizontal: 5, // Removed, sectionContainer handles padding
  },
  joinButton: {
    backgroundColor: '#3fa6a6',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledButton: { 
    backgroundColor: '#A9A9A9',
  },
  infoText: { 
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    paddingVertical: 15,
    // backgroundColor: '#E9ECEF', // Optional: background for info blocks
    // borderRadius: 8,
    marginVertical: 10, // Give some space around info texts
  },
  errorTextSmall: { 
    fontSize: 14,
    color: 'red',
    textAlign: 'center',
    marginVertical: 10,
  },
  requestItem: { // For pending requests list items (if using this style name)
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  requesterInfo: { // If used for requester name in pending list
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
  },
  userIdInParens: { 
    fontSize: 13,
    color: '#777',
    fontWeight: 'normal',
  },
  requestDate: { // If used for request date
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  actionButtonsContainer: { // For host approve/deny buttons row
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 5,
  },
  actionButton: { // Individual approve/deny button style
    paddingVertical: 10, // Increased padding
    paddingHorizontal: 10, // Increased padding
    borderRadius: 22, // Circular buttons
    marginLeft: 10,
    width: 44, height: 44, // Ensure circular by equal width/height
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    backgroundColor: '#28a745', // Green
  },
  denyButton: {
    backgroundColor: '#dc3545', // Red
  },
  actionButtonText: { // Text within approve/deny (if not using icons only)
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  listElementMessage: { 
    textAlign: 'center',
    fontSize: 15,
    color: '#555',
    paddingVertical: 20,
  },
  centeredInfoContainer: { // For UserEventActions section
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10, // Add some vertical padding
  },
  notesInput: { 
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
    color: '#495057',
    minHeight: 60,
    textAlignVertical: 'top',
    width: '100%', // Take full width of parent (centeredInfoContainer)
  },
  marginTopShorter: { 
    marginTop: 8,
  },
  cancelButton: {
    backgroundColor: '#C9A5A1',
    paddingVertical: 12, // Consistent padding with joinButton
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 180,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hostActionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 10,
  },
  editEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3fa6a6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  editEventButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc3545',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  deleteEventButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  requesterNotes: { 
    fontSize: 14,
    fontStyle: 'italic',
    color: '#555',
    marginTop: 4,
    marginBottom: 6,
  },
  attendeeItem: { // For approved attendee list items
    backgroundColor: '#f9f9f9',
    padding: 12, // Increased padding
    borderRadius: 8, // Rounded corners
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  attendeeName: { // General attendee name style
    fontSize: 16,
    color: '#333', // Darker text
    fontWeight: '500',
  },
  approvedAttendeeNotes: { 
    fontSize: 14,
    fontStyle: 'italic',
    color: '#666',
    marginTop: 4,
  },
  manageEventButton: { // If a general manage button is needed (like Edit Event)
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  manageEventButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  pendingRequestsContainer: { // Container for the pending requests section in HostActions
    marginVertical: 15, // Use vertical margin for spacing
  },
  attendeeRequestItem: { // Individual pending request item
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  attendeeInfoContainer: { // Text part of pending request
    flex: 1,
    marginRight: 10,
  },
  attendeeNameBold: { // Name in pending request
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  attendeeRole: { // Role in pending request
    fontSize: 14,
    fontWeight: 'normal',
    color: '#555',
  },
  attendeeNotes: { // Notes in pending request
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  attendeeActionButtons: { // Container for approve/deny buttons
    flexDirection: 'row',
    alignItems: 'center',
  },
  capacitySummaryContainer: { // For host's capacity view
      marginTop: 15, 
      paddingTop: 15,
      borderTopWidth: 1,
      borderTopColor: '#E9ECEF',
      marginBottom: 10, // Add some bottom margin
  },
  capacityText: {
      fontSize: 15,
      color: '#495057',
      marginBottom: 5,
  },
  listItemContainer: { // For requirements, contributions general items
    backgroundColor: '#FFFFFF',
    padding: 15, // Increased padding
    marginVertical: 8,
    // marginHorizontal: 10, // Let sectionContainer handle horizontal margin
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemIcon: { // Icon for requirement/contribution items
    marginRight: 10,
    color: '#4F4F4F', // A neutral icon color
  },
  listItemText: { // Text for requirement/contribution description
    fontSize: 15,
    color: '#333',
    flexShrink: 1,
  },
  listItemType: { // Not used anymore, icon + text preferred
    fontWeight: 'bold',
    fontSize: 15,
    color: '#333',
    marginRight: 5,
    marginBottom: 3,
    textTransform: 'capitalize',
  },
  listItemDescription: { // Not used anymore, listItemText is primary
    fontSize: 15,
    color: '#555',
    flexShrink: 1,
  },
  listItemContainerDetailed: { // Specifically for contribution items with more details
    backgroundColor: '#FFFFFF',
    padding: 15,
    marginVertical: 8,
    // marginHorizontal: 10, // Handled by sectionContainer if wrapped
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  listItemHeader: { // Header part of a contribution item (icon, description)
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listItemDetails: { // Details part of contribution (needed, claimed, actions)
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  contributionItemContainer: { // Replaces listItemContainerDetailed for clarity
    backgroundColor: '#FFF',
    padding: 15,
    marginVertical: 8,
    // marginHorizontal: 10, // Let sectionContainer handle horizontal margin
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  contributionHeader: {
    flexDirection: 'column',
    marginBottom: 5,
  },
  contributionDetail: {
    fontSize: 13,
    color: '#555',
    marginBottom: 3,
    marginLeft: 30, // Indent details under icon
  },
  fullyClaimedText: {
    color: 'green',
    fontWeight: 'bold',
    marginLeft: 30, // Indent
  },
  currentUserClaimSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    marginLeft: 30, // Indent under icon
    marginRight: 10, // Give some space on the right
  },
  claimText: { fontSize: 14, fontWeight: '500', color: '#333' },
  unclaimButton: { // For user's own unclaim button
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
  unclaimButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    marginLeft: 5,
    fontWeight: '500',
  },
  claimActionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    marginLeft: 30, // Indent under icon
    marginRight: 10, // Space on right
  },
  claimInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
    fontSize: 14,
  },
  // claimButton: { // Defined earlier, can be reused or made more specific if needed
  //   flexDirection: 'row',
  //   backgroundColor: '#3fa6a6',
  //   paddingVertical: 10,
  //   paddingHorizontal: 15,
  //   borderRadius: 5,
  //   alignItems: 'center',
  //   justifyContent: 'center',
  // },
  // claimButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginLeft: 5 },
  hostClaimsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginLeft: 30, // Indent under icon
  },
  hostClaimsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#444',
  },
  individualClaimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  claimTextSmall: { fontSize: 13, color: '#555' }, 
  removeHostButtonSmall: { // For host removing individual claims
    padding: 5,
    borderRadius: 4,
    marginLeft: 10, 
  },
  detailTextSmall: { // Already defined, ensure consistency if this is different
    fontSize: 14,
    color: '#454F5B',
    flexWrap: 'wrap',
  },
  claimedByYouText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#1a73e8',
  },
  inlineActivityIndicator: {
    marginLeft: 5,
  },
  individualClaimsContainer: { // Defined earlier, ensure consistency
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC',
  },
  subtleHeading: { // Defined earlier
    fontSize: 13,
    color: '#666',
    marginBottom: 5,
    fontStyle: 'italic',
  },
  individualClaimItem: { // Defined earlier
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 4,
    marginBottom: 5,
  },
  claimInfoBlock: { // Defined earlier
    flex: 1, 
  },
  claimDetailText: { // Defined earlier
    fontSize: 13,
    color: '#444',
  },
  removeHostButton: { // Defined earlier
    backgroundColor: '#E57373', 
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginLeft: 10, 
  },
  eventChatButton: {
    flexDirection: 'row',
    backgroundColor: '#3fa6a6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10, 
    marginHorizontal: 10, 
    elevation: 2, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  eventChatButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8, // Space between icon and text if icon is added
  },
  // Status-specific styles for Text components
  statusActive: { color: '#2ECC71', fontWeight: 'bold' },
  statusPlanning: { color: '#3498DB', fontWeight: 'bold' },
  statusCompleted: { color: '#95A5A6', fontWeight: 'bold' },
  statusCancelled: { color: '#E74C3C', fontWeight: 'bold' },
  attendeeInfoFlex: { // To allow text to take space and buttons to align right
    flex: 1,
  },
  cohostActionButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10, // Space between name and buttons
  },
  cohostActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 30, // Ensure consistent height
  },
  makeCohostButton: {
    backgroundColor: '#3fa6a6', // Teal theme color
  },
  removeCohostButton: {
    backgroundColor: '#d9534f', // A red color
  },
  cohostActionButtonText: {
    color: '#FFFFFF',
    fontSize: 12, // Smaller font for these buttons
    fontWeight: 'bold',
  },
  contributionDescription: {
    fontSize: 15,
    color: '#333',
    marginBottom: 5,
  },
  contributionQuantity: {
    fontSize: 13,
    color: '#666',
    marginBottom: 5,
  },
  myClaimContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  removeClaimButton: {
    marginLeft: 10,
  },
  claimButton: {
    backgroundColor: '#3fa6a6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  attendeesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEE',
    marginLeft: 30, // Indent under icon
    marginRight: 10, // Give some space on the right
  },
  approvedAttendeeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  youTag: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  hostTag: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
  promoteButton: {
    backgroundColor: '#5cb85c',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  promoteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Recipe Card Styles
  recipeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3fa6a6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  recipeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3fa6a6',
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  recipeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  recipeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeStatText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  viewRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2F2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  viewRecipeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3fa6a6',
  },
  // Recipe Detail Modal Styles
  recipeModalContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  recipeModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  recipeModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginRight: 16,
  },
  recipeModalCloseButton: {
    padding: 4,
  },
  recipeModalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  recipeModalLoadingText: {
    fontSize: 15,
    color: '#8E8E93',
  },
  recipeModalContent: {
    flex: 1,
    padding: 16,
  },
  recipeModalDescription: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginBottom: 16,
  },
  recipeModalStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  recipeModalStatItem: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
    gap: 4,
  },
  recipeModalStatLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  recipeModalStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  recipeModalSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  recipeModalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  recipeModalSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  recipeModalMealPrepScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeModalMealPrepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3fa6a6',
    marginLeft: 8,
  },
  recipeModalMealPrepExplanation: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 18,
  },
  recipeModalIngredientsList: {
    gap: 8,
  },
  recipeModalIngredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  recipeModalIngredientQuantity: {
    width: 80,
    fontSize: 14,
    fontWeight: '500',
    color: '#3fa6a6',
  },
  recipeModalIngredientName: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
  },
  recipeModalIngredientCategory: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  recipeModalIngredientCategoryText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666666',
    textTransform: 'capitalize',
  },
  recipeModalInstructionsList: {
    gap: 12,
  },
  recipeModalInstructionItem: {
    flexDirection: 'row',
    gap: 12,
  },
  recipeModalInstructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3fa6a6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeModalInstructionNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  recipeModalInstructionText: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
    lineHeight: 22,
  },
  recipeModalEquipmentList: {
    gap: 8,
  },
  recipeModalEquipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recipeModalEquipmentText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  recipeModalNutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  recipeModalNutritionItem: {
    alignItems: 'center',
    minWidth: 70,
  },
  recipeModalNutritionValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3fa6a6',
  },
  recipeModalNutritionLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  recipeModalSourceUrl: {
    fontSize: 13,
    color: '#3fa6a6',
    textDecorationLine: 'underline',
  },
  recipeModalFooter: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  recipeModalDoneButton: {
    backgroundColor: '#3fa6a6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  recipeModalDoneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Claim Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  claimModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  claimModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 8,
  },
  claimModalSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 20,
  },
  numberPickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  numberPickerButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  numberPickerButtonActive: {
    backgroundColor: '#3fa6a6',
  },
  numberPickerText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  numberPickerTextActive: {
    color: '#FFFFFF',
  },
  claimModalUnit: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3fa6a6',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  claimModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  claimModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  claimModalCancelButton: {
    backgroundColor: '#F3F4F6',
  },
  claimModalConfirmButton: {
    backgroundColor: '#3fa6a6',
  },
  claimModalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  claimModalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Invited Mode Banner Styles
  invitedBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  invitedBannerText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 12,
  },
  invitedBannerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  invitedDeclineButton: {
    flex: 0.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  invitedDeclineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  invitedAcceptButton: {
    flex: 0.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#10B981',
    gap: 6,
  },
  invitedAcceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

const stylesStatusToStyle = (status: string) => {
  switch (status) {
    case 'active': return styles.statusActive;
    case 'planning': return styles.statusPlanning;
    case 'completed': return styles.statusCompleted;
    case 'cancelled': return styles.statusCancelled;
    default: return {}; // Return empty object for default/unknown status
  }
};

export default MealPrepEventDetailScreen; 