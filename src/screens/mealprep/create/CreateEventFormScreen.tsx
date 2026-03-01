import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useAuth } from '../../../AuthContext';
import { supabase } from '../../../lib/supabase';
import { useEventDraft } from '../useEventDraft';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import {
  EventFormData,
  getInitialEventFormData,
  toEventDraftData,
  fromEventDraftData,
  validateEventForm,
  computeStepCompleted,
} from '../../../lib/eventFormTypes';
// Publish logic moved to EventPreviewV2Screen

// Section components
import HeroBannerSection from './sections/HeroBannerSection';
import TitleSection from './sections/TitleSection';
import DateTimeSection from './sections/DateTimeSection';
import RecipeSection from './sections/RecipeSection';
import GroupSizeSection from './sections/GroupSizeSection';
import SkillLevelSection from './sections/SkillLevelSection';
import LocationSection from './sections/LocationSection';
import DietarySection from './sections/DietarySection';
import NotesSection from './sections/NotesSection';
import InvitesSection from './sections/InvitesSection';
import SectionDivider from './sections/SectionDivider';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'CreateEventForm'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'CreateEventForm'>;

export default function CreateEventFormScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const draftId = route.params?.draftId;
  const { user } = useAuth();

  const { useDraft, createDraft, updateDraft, deleteDraft } = useEventDraft();
  const { data: existingDraft, isLoading: isDraftLoading } = useDraft(draftId || null);

  const [formData, setFormData] = useState<EventFormData>(getInitialEventFormData());
  const [activeDraftId, setActiveDraftId] = useState<string | null>(draftId || null);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  // Load draft
  useEffect(() => {
    if (existingDraft?.draftData) {
      const loaded = fromEventDraftData(existingDraft.draftData);
      setFormData(prev => ({ ...prev, ...loaded }));
    }
  }, [existingDraft]);

  // Create a draft if none exists
  useEffect(() => {
    if (!draftId && !activeDraftId && user) {
      createDraft({}).then(draft => {
        setActiveDraftId(draft.id);
      }).catch(console.error);
    }
  }, [draftId, activeDraftId, user]);

  // Debounced auto-save
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const id = activeDraftId || draftId;
      if (!id) return;
      const draftData = toEventDraftData(formDataRef.current);
      const step = computeStepCompleted(formDataRef.current);
      updateDraft({ draftId: id, stepCompleted: step, draftData }).catch(console.error);
    }, 5000);
  }, [activeDraftId, draftId, updateDraft]);

  const handleChange = useCallback((updates: Partial<EventFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    // Clear related errors
    setErrors(prev => {
      const next = { ...prev };
      Object.keys(updates).forEach(key => delete next[key]);
      return next;
    });
    scheduleSave();
  }, [scheduleSave]);

  const handleSaveDraft = async () => {
    const id = activeDraftId || draftId;
    if (!id) return;
    try {
      const draftData = toEventDraftData(formData);
      const step = computeStepCompleted(formData);
      await updateDraft({ draftId: id, stepCompleted: step, draftData });
      Alert.alert('Draft Saved', 'Your event has been saved. You can continue editing anytime.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save draft.');
    }
  };

  const handlePreview = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in.');
      return;
    }

    const validation = validateEventForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      const firstError = Object.values(validation.errors)[0];
      Alert.alert('Missing Info', firstError);
      return;
    }

    // Force-save draft before navigating to preview
    const id = activeDraftId || draftId;
    if (id) {
      setIsSaving(true);
      try {
        const draftData = toEventDraftData(formData);
        const step = computeStepCompleted(formData);
        await updateDraft({ draftId: id, stepCompleted: step, draftData });
      } catch {
        Alert.alert('Error', 'Failed to save draft before preview.');
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
      navigation.navigate('EventPreviewV2', { draftId: id });
    }
  };

  if (isDraftLoading && draftId) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={mpColors.teal} />
      </SafeAreaView>
    );
  }

  const hasRecipes = !!formData.parsedRecipe || (formData.recipeMenu?.length ?? 0) >= 2;
  const canPreview = hasRecipes && !formData.isRecipeLoading && !isSaving;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <HeroBannerSection
            heroEmoji={formData.heroEmoji}
            heroGradient={formData.heroGradient}
            onChange={handleChange}
          />

          <TitleSection
            title={formData.title}
            onChange={handleChange}
            error={errors.title}
          />

          <DateTimeSection
            eventDate={formData.eventDate}
            eventTime={formData.eventTime}
            eventEndTime={formData.eventEndTime}
            onChange={handleChange}
          />

          <SectionDivider title={
            formData.recipeMenu && formData.recipeMenu.length >= 2
              ? `Recipes (${formData.recipeMenu.length})`
              : 'Recipe'
          } />

          <RecipeSection
            recipeSource={formData.recipeSource}
            recipeId={formData.recipeId}
            parsedRecipe={formData.parsedRecipe}
            isRecipeLoading={formData.isRecipeLoading}
            recipeMenu={formData.recipeMenu}
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

          <SectionDivider title="Location" />

          <LocationSection
            locationCity={formData.locationCity}
            locationState={formData.locationState}
            locationCountry={formData.locationCountry}
            locationDescription={formData.locationDescription}
            onChange={handleChange}
            error={errors.locationCity}
          />

          <SectionDivider title="Additional" />

          <DietarySection
            dietaryAccommodations={formData.dietaryAccommodations}
            onChange={handleChange}
          />

          <NotesSection
            eventNotes={formData.eventNotes}
            onChange={handleChange}
          />

          <SectionDivider title="Invites" />

          <InvitesSection
            invitedUserIds={formData.invitedUserIds}
            onChange={handleChange}
          />

          {/* Bottom spacing for keyboard / bottom bar */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.saveDraftButton} onPress={handleSaveDraft}>
          <Text style={styles.saveDraftText}>Save Draft</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.publishButton, !canPreview && styles.publishButtonDisabled]}
          onPress={handlePreview}
          disabled={!canPreview}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={mpColors.white} />
          ) : (
            <Text style={styles.publishButtonText}>Preview Event</Text>
          )}
        </TouchableOpacity>
      </View>
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
  scrollView: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    paddingHorizontal: mpSpacing.lg,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: mpColors.white,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray200,
    ...mpShadows.md,
  },
  saveDraftButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray300,
    backgroundColor: mpColors.white,
  },
  saveDraftText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  publishButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  publishButtonDisabled: {
    opacity: 0.5,
  },
  publishButtonText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
