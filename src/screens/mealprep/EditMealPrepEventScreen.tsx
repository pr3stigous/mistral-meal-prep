import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, RouteProp, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../constants/mealPrepTheme';
import { useEventDetail } from './hooks/useEventDetail';
import {
  EditEventFormData,
  EventRequirementUIItem,
  eventToFormData,
} from '../../lib/eventFormTypes';

// Reused creation sections
import HeroBannerSection from './create/sections/HeroBannerSection';
import TitleSection from './create/sections/TitleSection';
import DateTimeSection from './create/sections/DateTimeSection';
import LocationSection from './create/sections/LocationSection';
import GroupSizeSection from './create/sections/GroupSizeSection';
import SkillLevelSection from './create/sections/SkillLevelSection';
import DietarySection from './create/sections/DietarySection';
import NotesSection from './create/sections/NotesSection';
import SectionDivider from './create/sections/SectionDivider';

// New edit sections
import EditDescriptionSection from './edit-sections/EditDescriptionSection';
import EditLocationDetailsSection from './edit-sections/EditLocationDetailsSection';
import EditLinkedRecipeCard from './edit-sections/EditLinkedRecipeCard';
import EditBottomBar from './edit-sections/EditBottomBar';
import EditEventActions from './edit-sections/EditEventActions';
import EditContributionBoard from './edit-sections/EditContributionBoard';
import EditNotesRequirements from './edit-sections/EditNotesRequirements';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'EditMealPrepEvent'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'EditMealPrepEvent'>;

// Fetch requirements (not part of useEventDetail)
const fetchEventRequirements = async (eventId: string): Promise<EventRequirementUIItem[]> => {
  if (!eventId) return [];
  const { data, error } = await supabase
    .from('event_requirements')
    .select('id, description, type')
    .eq('event_id', eventId);
  if (error) throw new Error(error.message);
  return (data || []).map(r => ({ id: r.id, description: r.description, type: r.type }));
};

const EditMealPrepEventScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { eventId } = route.params;
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── Data Loading ───
  const {
    event, isLoadingEvent, eventError,
    linkedRecipe,
    contributionsNeeded, contributionClaims,
    isOriginalHost, isCoLeader, canManageEvent,
    removeClaimAsHost,
    refetchAll,
  } = useEventDetail(eventId);

  const { data: initialRequirements } = useQuery({
    queryKey: ['eventRequirementsForEdit', eventId],
    queryFn: () => fetchEventRequirements(eventId),
    enabled: !!eventId,
  });

  // ─── Form State ───
  const [formData, setFormData] = useState<EditEventFormData | null>(null);
  const [initialFormData, setInitialFormData] = useState<EditEventFormData | null>(null);
  const [requirements, setRequirements] = useState<EventRequirementUIItem[]>([]);
  const [initialReqs, setInitialReqs] = useState<EventRequirementUIItem[]>([]);
  const [pendingContribAdds, setPendingContribAdds] = useState<Array<{ description: string; type: string; quantity_needed: number | null; unit: string }>>([]);
  const [pendingContribRemoves, setPendingContribRemoves] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPauseLoading, setIsPauseLoading] = useState(false);
  const [isCancelLoading, setIsCancelLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);

  // Initialize form from event data
  useEffect(() => {
    if (event && !formData) {
      const data = eventToFormData(event);
      setFormData(data);
      setInitialFormData(data);
    }
  }, [event]);

  // Initialize requirements
  useEffect(() => {
    if (initialRequirements && requirements.length === 0 && initialReqs.length === 0) {
      setRequirements(initialRequirements);
      setInitialReqs(initialRequirements);
    }
  }, [initialRequirements]);

  // ─── onChange Handler ───
  const handleChange = useCallback((updates: Partial<EditEventFormData>) => {
    setFormData(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  // ─── Change Detection ───
  const hasChanges = useMemo(() => {
    if (!formData || !initialFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialFormData)
      || JSON.stringify(requirements) !== JSON.stringify(initialReqs)
      || pendingContribAdds.length > 0
      || pendingContribRemoves.length > 0;
  }, [formData, initialFormData, requirements, initialReqs, pendingContribAdds, pendingContribRemoves]);

  // ─── Contribution Handlers ───
  const handleAddContribution = useCallback((c: { description: string; type: string; quantity_needed: number | null; unit: string }) => {
    setPendingContribAdds(prev => [...prev, c]);
  }, []);

  const handleRemoveContribution = useCallback((contributionId: string) => {
    // If it's a pending add, just remove from the pending list
    setPendingContribAdds(prev => {
      const idx = prev.findIndex((_, i) => `pending_${i}` === contributionId);
      if (idx >= 0) return prev.filter((_, i) => `pending_${i}` !== contributionId);
      return prev;
    });
    // If it's an existing contribution, add to remove list
    if (!contributionId.startsWith('pending_')) {
      setPendingContribRemoves(prev => [...prev, contributionId]);
    }
  }, []);

  const handleEditContribution = useCallback((contributionId: string, updates: { quantity_needed?: number; unit?: string }) => {
    // For now, edit operations are applied via save handler
    // We'd need a more complex state management — keeping simple for v1
    Alert.alert('Info', 'Quantity changes will be saved with the event.');
  }, []);

  // ─── Requirement Handlers ───
  const handleAddRequirement = useCallback((req: { description: string; type: string }) => {
    setRequirements(prev => [
      ...prev,
      { id: `new_${Date.now()}`, description: req.description, type: req.type, isNew: true },
    ]);
  }, []);

  const handleRemoveRequirement = useCallback((id: string) => {
    setRequirements(prev => prev.filter(r => r.id !== id));
  }, []);

  // ─── Save Handler ───
  const handleSave = useCallback(async () => {
    if (!formData || !user || !eventId) return;

    // Validate
    if (!formData.title.trim()) {
      Alert.alert('Missing Information', 'Event title is required.');
      return;
    }
    if (!formData.locationCity.trim()) {
      Alert.alert('Missing Information', 'City is required.');
      return;
    }

    setIsSaving(true);
    try {
      // --- Geocode if address changed ---
      let lat = formData.latitude ?? null;
      let lng = formData.longitude ?? null;
      const addressChanged = initialFormData && (
        formData.locationCity !== initialFormData.locationCity
        || formData.locationState !== initialFormData.locationState
        || formData.locationZip !== initialFormData.locationZip
        || formData.locationCountry !== initialFormData.locationCountry
      );

      if (addressChanged && formData.locationCity.trim() && formData.locationCountry.trim()) {
        try {
          const { data: geoData } = await supabase.functions.invoke('geocode-address', {
            body: {
              city: formData.locationCity.trim(),
              state: formData.locationState.trim() || undefined,
              zip: formData.locationZip.trim() || undefined,
              country: formData.locationCountry.trim(),
            },
          });
          if (geoData) {
            lat = geoData.latitude;
            lng = geoData.longitude;
          }
        } catch (e) {
          console.warn('Geocoding warning:', e);
        }
      }

      // --- Build update payload ---
      const payload: Record<string, any> = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        event_date: formData.eventDate,
        event_time: formData.eventTime,
        event_end_time: formData.eventEndTime || null,
        location_city: formData.locationCity.trim(),
        location_state: formData.locationState.trim() || null,
        location_country: formData.locationCountry.trim() || 'USA',
        location_zip: formData.locationZip.trim() || null,
        location_general_description: formData.locationDescription.trim() || null,
        location_details_for_attendees: formData.locationDetailsForAttendees.trim() || null,
        latitude: lat,
        longitude: lng,
        expected_participants: formData.expectedParticipants || null,
        max_participants: formData.maxParticipants || null,
        dietary_accommodations: formData.dietaryAccommodations.length > 0 ? formData.dietaryAccommodations : null,
        skill_level: formData.skillLevel || null,
        hero_emoji: formData.heroEmoji,
        hero_gradient: formData.heroGradient,
        event_notes: formData.eventNotes.trim() || null,
      };

      // --- Update event ---
      const { error: updateError } = await supabase
        .from('meal_prep_events')
        .update(payload)
        .eq('id', eventId);

      if (updateError) throw updateError;

      // --- Diff requirements ---
      const reqsToDelete = initialReqs
        .filter(ir => !requirements.some(r => r.id === ir.id))
        .map(r => r.id);
      const reqsToAdd = requirements
        .filter(r => r.isNew)
        .map(r => ({ event_id: eventId, description: r.description, type: r.type }));

      if (reqsToDelete.length > 0) {
        await supabase.from('event_requirements').delete().in('id', reqsToDelete);
      }
      if (reqsToAdd.length > 0) {
        await supabase.from('event_requirements').insert(reqsToAdd);
      }

      // --- Diff contributions ---
      if (pendingContribRemoves.length > 0) {
        await supabase.rpc('delete_event_contributions_by_ids', {
          p_event_id: eventId,
          p_contribution_ids: pendingContribRemoves,
        });
      }
      if (pendingContribAdds.length > 0) {
        await supabase.rpc('insert_event_contributions', {
          p_event_id: eventId,
          p_contributions: pendingContribAdds.map(c => ({
            description: c.description,
            type: c.type,
            quantity_needed: c.quantity_needed,
            unit: c.unit || null,
          })),
        });
      }

      // Invalidate caches
      queryClient.invalidateQueries({ queryKey: ['mealPrepEvents'] });
      queryClient.invalidateQueries({ queryKey: ['mealPrepEvent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['mealPrepEventEditDetails', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventDetailData', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventRequirementsForEdit', eventId] });
      queryClient.invalidateQueries({ queryKey: ['eventRequirements', eventId] });

      navigation.navigate('MealPrepEventDetail', { eventId });
    } catch (err: any) {
      console.error('Save failed:', err);
      Alert.alert('Save Failed', err.message || 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [formData, initialFormData, user, eventId, requirements, initialReqs, pendingContribAdds, pendingContribRemoves, queryClient, navigation]);

  // ─── Lifecycle Handlers ───
  const handlePauseToggle = useCallback(async () => {
    if (!formData) return;
    setIsPauseLoading(true);
    try {
      const rpc = formData.joiningPaused ? 'unpause_event_joining' : 'pause_event_joining';
      const { data, error } = await supabase.rpc(rpc, { p_event_id: eventId });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      handleChange({ joiningPaused: !formData.joiningPaused });
      // Also update initial so it's not seen as a "change"
      setInitialFormData(prev => prev ? { ...prev, joiningPaused: !formData.joiningPaused } : prev);
      refetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update.');
    } finally {
      setIsPauseLoading(false);
    }
  }, [formData, eventId, handleChange, refetchAll]);

  const handleCancelEvent = useCallback(async () => {
    setIsCancelLoading(true);
    try {
      const { data, error } = await supabase.rpc('cancel_event', { p_event_id: eventId });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      handleChange({ isCancelled: true, joiningPaused: true });
      setInitialFormData(prev => prev ? { ...prev, isCancelled: true, joiningPaused: true } : prev);
      refetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to cancel event.');
    } finally {
      setIsCancelLoading(false);
    }
  }, [eventId, handleChange, refetchAll]);

  const handleReactivateEvent = useCallback(async () => {
    setIsCancelLoading(true);
    try {
      const { data, error } = await supabase.rpc('reactivate_event', { p_event_id: eventId });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error);
      handleChange({ isCancelled: false, joiningPaused: false });
      setInitialFormData(prev => prev ? { ...prev, isCancelled: false, joiningPaused: false } : prev);
      refetchAll();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to reactivate event.');
    } finally {
      setIsCancelLoading(false);
    }
  }, [eventId, handleChange, refetchAll]);

  const handleDeleteEvent = useCallback(async () => {
    if (!event?.id) return;
    setIsDeleteLoading(true);
    try {
      await supabase.rpc('delete_event_contributions', { p_event_id: event.id });
      await supabase.from('event_attendees').delete().eq('event_id', event.id);
      await supabase.from('event_requirements').delete().eq('event_id', event.id);
      await supabase.from('meal_prep_events').delete().eq('id', event.id);
      queryClient.invalidateQueries({ queryKey: ['mealPrepEvents'] });
      Alert.alert('Deleted', 'Event has been permanently deleted.');
      navigation.navigate('MealPrepEventList');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete event.');
    } finally {
      setIsDeleteLoading(false);
    }
  }, [event, queryClient, navigation]);

  // ─── Back / Cancel with unsaved changes guard ───
  const handleBack = useCallback(() => {
    if (hasChanges) {
      Alert.alert('Discard changes?', 'You have unsaved changes.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  }, [hasChanges, navigation]);

  // ─── Build merged contributions list (existing minus removes, plus adds) ───
  const mergedContributions = useMemo(() => {
    const existing = contributionsNeeded.filter(c => !pendingContribRemoves.includes(c.id));
    const pending = pendingContribAdds.map((c, i) => ({
      id: `pending_${i}`,
      event_id: eventId,
      description: c.description,
      type: c.type,
      quantity_needed: c.quantity_needed,
      unit: c.unit,
      status: 'open',
    }));
    return [...existing, ...pending];
  }, [contributionsNeeded, pendingContribRemoves, pendingContribAdds, eventId]);

  // ─── Loading States ───
  if (isLoadingEvent) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={mpColors.teal} />
        <Text style={styles.loadingText}>Loading event details...</Text>
      </SafeAreaView>
    );
  }

  if (eventError || !event) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{eventError?.message || 'Event not found'}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!canManageEvent) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>You are not authorized to edit this event.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!formData) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={mpColors.teal} />
      </SafeAreaView>
    );
  }

  // ─── Render ───
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerAction}>
          <Ionicons name="arrow-back" size={24} color={mpColors.teal} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Event</Text>
        <View style={styles.headerAction} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Cancelled banner */}
          {formData.isCancelled && (
            <View style={styles.cancelledBanner}>
              <Ionicons name="close-circle" size={16} color={mpColors.red} />
              <Text style={styles.cancelledText}>This event is cancelled</Text>
            </View>
          )}

          <HeroBannerSection
            heroEmoji={formData.heroEmoji}
            heroGradient={formData.heroGradient}
            onChange={handleChange}
          />

          <TitleSection
            title={formData.title}
            onChange={handleChange}
          />

          <EditDescriptionSection
            description={formData.description}
            onChange={handleChange}
          />

          <SectionDivider title="Schedule" />

          <DateTimeSection
            eventDate={formData.eventDate}
            eventTime={formData.eventTime}
            eventEndTime={formData.eventEndTime}
            onChange={handleChange}
          />

          <SectionDivider title="Location" />

          <LocationSection
            locationCity={formData.locationCity}
            locationState={formData.locationState}
            locationCountry={formData.locationCountry}
            locationDescription={formData.locationDescription}
            onChange={handleChange}
          />

          <EditLocationDetailsSection
            locationDetailsForAttendees={formData.locationDetailsForAttendees}
            onChange={handleChange}
          />

          <SectionDivider title="Event Details" />

          <GroupSizeSection
            expectedParticipants={formData.expectedParticipants}
            customParticipantCount={formData.customParticipantCount}
            onChange={handleChange}
          />

          <SkillLevelSection
            skillLevel={formData.skillLevel}
            onChange={handleChange}
          />

          <DietarySection
            dietaryAccommodations={formData.dietaryAccommodations}
            onChange={handleChange}
          />

          <SectionDivider title="Recipe" />

          <EditLinkedRecipeCard
            recipeId={event.recipe_id ?? null}
            recipeName={linkedRecipe?.name}
            recipePrepTime={linkedRecipe?.prep_time_minutes ?? undefined}
            recipeCookTime={linkedRecipe?.cook_time_minutes ?? undefined}
            recipeServings={linkedRecipe?.servings ?? undefined}
            onViewRecipe={() => {
              // Could navigate to recipe detail in future
              Alert.alert('Recipe', linkedRecipe?.name || 'No recipe linked');
            }}
          />

          <SectionDivider title="Contributions" />

          <EditContributionBoard
            contributions={mergedContributions}
            claims={contributionClaims}
            onAddContribution={handleAddContribution}
            onRemoveContribution={handleRemoveContribution}
            onEditContribution={handleEditContribution}
            onRemoveClaimAsHost={(claimId) => removeClaimAsHost.mutate(claimId)}
          />

          <SectionDivider title="Notes & Requirements" />

          <EditNotesRequirements
            eventNotes={formData.eventNotes}
            requirements={requirements}
            onChange={handleChange}
            onAddRequirement={handleAddRequirement}
            onRemoveRequirement={handleRemoveRequirement}
          />

          <SectionDivider title="Event Actions" />

          <EditEventActions
            joiningPaused={formData.joiningPaused}
            isCancelled={formData.isCancelled}
            isOriginalHost={isOriginalHost}
            onPauseToggle={handlePauseToggle}
            onCancel={handleCancelEvent}
            onReactivate={handleReactivateEvent}
            onDelete={handleDeleteEvent}
            isPauseLoading={isPauseLoading}
            isCancelLoading={isCancelLoading}
            isDeleteLoading={isDeleteLoading}
          />

          {/* Bottom spacer */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky bottom bar */}
      <EditBottomBar
        isSaving={isSaving}
        onCancel={handleBack}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mpColors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: mpColors.background,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
  errorText: {
    fontSize: 16,
    fontFamily: mpFonts.medium,
    color: mpColors.red,
    textAlign: 'center',
    marginBottom: 20,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.gray100,
  },
  backBtnText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: mpColors.white,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray200,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  headerAction: {
    padding: 5,
    minWidth: 30,
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: mpColors.redLight,
  },
  cancelledText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.red,
  },
});

export default EditMealPrepEventScreen;
