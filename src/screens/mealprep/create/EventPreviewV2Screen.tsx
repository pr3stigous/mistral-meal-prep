import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useAuth } from '../../../AuthContext';
import { supabase } from '../../../lib/supabase';
import { useEventDraft } from '../useEventDraft';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import {
  EventFormData,
  getInitialEventFormData,
  fromEventDraftData,
  toEventDraftData,
  validateEventForm,
  computeStepCompleted,
} from '../../../lib/eventFormTypes';
import { MealPrepEvent } from '../../../lib/types';
import { multiRecipeToContributions } from '../../../lib/eventWizardTypes';
import {
  LinkedRecipe,
  FullRecipe,
  EventContributionNeeded,
} from '../hooks/useEventDetail';
import { generateEventInviteToken, inviteToEvent } from '../../../services/mealPrepInviteService';

// Detail section components (reused in guest perspective)
import DetailHeroBanner from '../detail-sections/DetailHeroBanner';
import DetailEventInfo from '../detail-sections/DetailEventInfo';
import DetailMetaGrid from '../detail-sections/DetailMetaGrid';
import DetailRecipeCard from '../detail-sections/DetailRecipeCard';
import DetailContributionBoard from '../detail-sections/DetailContributionBoard';
import HostPackageSection from '../../../components/mealprep/HostPackageSection';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'EventPreviewV2'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'EventPreviewV2'>;

// =====================================================
// TYPES
// =====================================================

interface GeneratedContribution {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  type: 'ingredient' | 'equipment';
  substitution_note?: string | null;
}

interface RecipeManifestItem {
  input_recipe: string;
  handling: 'kept_separate' | 'merged_with' | 'used_as_component';
  merged_into?: string | null;
  merge_reason?: string | null;
  component_of?: string | null;
  component_usage?: string | null;
  prep_timeline_steps: number;
  common_mistakes_count: number;
}

interface CrossRecipeNote {
  type: 'component_relationship' | 'shared_technique' | 'timing_dependency' | 'conflict_warning';
  affected_recipes: string[];
  note: string;
  shopping_impact?: string | null;
}

interface EventPackageResult {
  contributions: GeneratedContribution[];
  host_package: any;
  recipe_manifest?: RecipeManifestItem[];
  cross_recipe_notes?: CrossRecipeNote[];
}

// =====================================================
// MOCK DATA BUILDERS
// =====================================================

const getMaxParticipants = (range: string, customCount?: number): number => {
  if (range === 'custom' && customCount && customCount > 0) return customCount;
  switch (range) {
    case '2-4': return 4;
    case '5-8': return 8;
    case '9-12': return 12;
    case '13+': return 20;
    default: return 8;
  }
};

function buildMockEvent(form: EventFormData, userId: string): MealPrepEvent {
  return {
    id: 'preview',
    host_user_id: userId,
    title: form.title,
    description: form.parsedRecipe?.description || form.eventNotes || null,
    event_date: form.eventDate,
    event_time: form.eventTime,
    estimated_duration_minutes: null,
    event_end_time: form.eventEndTime || null,
    expected_participants: form.expectedParticipants,
    max_participants: getMaxParticipants(form.expectedParticipants),
    recipe_id: form.recipeId ? parseInt(form.recipeId, 10) : null,
    status: 'planning',
    location_city: form.locationCity,
    location_state: form.locationState || null,
    location_country: form.locationCountry || 'USA',
    address_visibility: form.addressVisibility || 'after_rsvp',
    dietary_accommodations: form.dietaryAccommodations.length > 0 ? form.dietaryAccommodations : null,
    skill_level: form.skillLevel || null,
    hero_emoji: form.heroEmoji,
    hero_gradient: form.heroGradient,
    host_package: null,
    invite_token: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as MealPrepEvent;
}

/** Strip any parenthetical text from LLM-generated names as a safety net */
function cleanIngredientName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, '').trim();
}

function buildContributionsFromPackage(
  generated: GeneratedContribution[]
): EventContributionNeeded[] {
  return generated.map((c, i) => ({
    id: `gen-${i}`,
    event_id: 'preview',
    description: cleanIngredientName(c.name),
    type: c.type,
    quantity_needed: c.quantity,
    unit: c.unit || '',
    status: 'open',
    notes: c.substitution_note || null,
  }));
}

/** Build contributions directly from recipe ingredients (no LLM needed) */
function buildContributionsFromRecipe(
  parsedRecipe: EventFormData['parsedRecipe']
): EventContributionNeeded[] {
  if (!parsedRecipe) return [];
  const items: EventContributionNeeded[] = [];

  // Add ingredients
  (parsedRecipe.ingredients || []).forEach((ing, i) => {
    items.push({
      id: `recipe-ing-${i}`,
      event_id: 'preview',
      description: ing.name,
      type: 'ingredient',
      quantity_needed: ing.quantity || 1,
      unit: ing.unit || '',
      status: 'open',
      notes: null,
    });
  });

  // Add equipment
  (parsedRecipe.equipmentNeeded || []).forEach((eq, i) => {
    const eqName = typeof eq === 'string' ? eq : (eq as any).item || String(eq);
    items.push({
      id: `recipe-eq-${i}`,
      event_id: 'preview',
      description: eqName,
      type: 'equipment',
      quantity_needed: 1,
      unit: '',
      status: 'open',
      notes: null,
    });
  });

  return items;
}

/** Use the upper end of each range (matches edge function logic) */
function getGroupTargetCount(range: string, customCount?: number): number {
  if (range === 'custom' && customCount && customCount > 0) return customCount;
  switch (range) {
    case '2-4': return 4;
    case '5-8': return 8;
    case '9-12': return 12;
    case '13+': return 16;
    default: return 8;
  }
}

/** Determine if we need full LLM package (scaling + dietary) or just host package */
function needsFullPackage(form: EventFormData): boolean {
  const recipeServings = form.parsedRecipe?.servings || 4;
  const targetCount = getGroupTargetCount(form.expectedParticipants, form.customParticipantCount);
  const scaleFactor = targetCount / recipeServings;
  const hasDietaryAccommodations = form.dietaryAccommodations.length > 0;

  // Need full package when scaling is required or dietary substitutions are needed
  return scaleFactor !== 1.0 || hasDietaryAccommodations;
}

/** Multi-recipe variant: check if ANY recipe needs scaling, or if dietary accommodations exist */
function needsMultiRecipeFullPackage(form: EventFormData): boolean {
  if (!form.recipeMenu || form.recipeMenu.length < 2) return false;
  const targetCount = getGroupTargetCount(form.expectedParticipants, form.customParticipantCount);
  const hasDietaryAccommodations = form.dietaryAccommodations.length > 0;
  if (hasDietaryAccommodations) return true;
  // Check if any recipe needs scaling
  return form.recipeMenu.some(item => {
    const servings = item.parsedRecipe.servings || 4;
    return targetCount / servings !== 1.0;
  });
}

function buildMockLinkedRecipe(
  parsedRecipe: EventFormData['parsedRecipe']
): LinkedRecipe | null {
  if (!parsedRecipe) return null;
  return {
    id: 0,
    name: parsedRecipe.name,
    prep_time_minutes: parsedRecipe.prepTimeMinutes || null,
    cook_time_minutes: parsedRecipe.cookTimeMinutes || null,
    servings: parsedRecipe.servings || null,
    image_url: null,
    meal_prep_score: parsedRecipe.mealPrepScore || null,
  } as LinkedRecipe;
}

function buildMockFullRecipe(
  parsedRecipe: EventFormData['parsedRecipe']
): FullRecipe | null {
  if (!parsedRecipe) return null;
  return {
    id: 0,
    name: parsedRecipe.name,
    description: parsedRecipe.description || null,
    prep_time_minutes: parsedRecipe.prepTimeMinutes || null,
    cook_time_minutes: parsedRecipe.cookTimeMinutes || null,
    servings: parsedRecipe.servings || null,
    image_url: null,
    ingredients: (parsedRecipe.ingredients || []).map(i => ({
      name: i.name,
      quantity: i.quantity || 0,
      unit: i.unit || '',
      category: i.category || 'other',
    })),
    instructions: parsedRecipe.instructions || null,
    nutritional_info: parsedRecipe.nutritionalInfo
      ? {
          calories: parsedRecipe.nutritionalInfo.calories || 0,
          protein_g: parsedRecipe.nutritionalInfo.proteinG || 0,
          carbs_g: parsedRecipe.nutritionalInfo.carbsG || 0,
          fat_g: parsedRecipe.nutritionalInfo.fatG || 0,
        }
      : null,
    tags: parsedRecipe.tags || null,
    skill_level: parsedRecipe.skillLevel || undefined,
    meal_prep_score: parsedRecipe.mealPrepScore || undefined,
    meal_prep_score_explanation: parsedRecipe.mealPrepScoreExplanation || undefined,
    equipment_needed: parsedRecipe.equipmentNeeded || undefined,
    source_url: parsedRecipe.sourceUrl || undefined,
  };
}

// =====================================================
// VALIDATION CHECKLIST
// =====================================================

interface ChecklistItem {
  label: string;
  passed: boolean;
}

function getChecklist(form: EventFormData, hasPackage: boolean): ChecklistItem[] {
  const isMulti = (form.recipeMenu?.length ?? 0) >= 2;
  return [
    { label: 'Event title', passed: !!form.title?.trim() },
    { label: 'Date & time', passed: !!form.eventDate && !!form.eventTime },
    { label: 'Recipe prepped', passed: !!form.parsedRecipe || isMulti },
    { label: 'Event package generated', passed: hasPackage },
    { label: 'Location', passed: !!form.locationCity?.trim() },
    {
      label: 'Group size & skill',
      passed: !!form.expectedParticipants && !!form.skillLevel,
    },
  ];
}

// =====================================================
// SCREEN
// =====================================================

export default function EventPreviewV2Screen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId } = route.params;
  const { user } = useAuth();

  const { useDraft, updateDraft, deleteDraft } = useEventDraft();
  const { data: draft, isLoading: isDraftLoading } = useDraft(draftId);

  const [isPublishing, setIsPublishing] = useState(false);

  // Event package generation state
  const [eventPackage, setEventPackage] = useState<EventPackageResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Block iOS swipe-back gesture during generation
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !isGenerating });
  }, [isGenerating, navigation]);

  // Build form data from draft
  const formData = useMemo<EventFormData>(() => {
    if (!draft?.draftData) return getInitialEventFormData();
    const loaded = fromEventDraftData(draft.draftData);
    return { ...getInitialEventFormData(), ...loaded };
  }, [draft]);

  // Build mock data for detail components
  const mockEvent = useMemo(
    () => buildMockEvent(formData, user?.id || ''),
    [formData, user]
  );
  const mockLinkedRecipe = useMemo(
    () => buildMockLinkedRecipe(formData.parsedRecipe),
    [formData.parsedRecipe]
  );
  const mockFullRecipe = useMemo(
    () => buildMockFullRecipe(formData.parsedRecipe),
    [formData.parsedRecipe]
  );

  // Multi-recipe detection
  const isMultiRecipe = (formData.recipeMenu?.length ?? 0) >= 2;

  // Build multi-recipe linked recipes for preview cards
  const mockMultiRecipes = useMemo(() => {
    if (!isMultiRecipe || !formData.recipeMenu) return [];
    return formData.recipeMenu.map(item => ({
      linked: buildMockLinkedRecipe(item.parsedRecipe),
      full: buildMockFullRecipe(item.parsedRecipe),
    })).filter(r => r.linked !== null);
  }, [isMultiRecipe, formData.recipeMenu]);

  // Build multi-recipe contributions client-side (no LLM needed)
  const multiRecipeContributions = useMemo<EventContributionNeeded[]>(() => {
    if (!isMultiRecipe || !formData.recipeMenu) return [];
    const contribs = multiRecipeToContributions(formData.recipeMenu);
    return contribs.map((c, i) => ({
      id: `multi-${i}`,
      event_id: 'preview',
      description: c.name,
      type: (c.category === 'equipment' ? 'equipment' : 'ingredient') as 'ingredient' | 'equipment',
      quantity_needed: c.quantity,
      unit: c.unit || '',
      status: 'open',
      notes: null,
    }));
  }, [isMultiRecipe, formData.recipeMenu]);

  // Build contributions from generated package
  const generatedContributions = useMemo(
    () => eventPackage ? buildContributionsFromPackage(eventPackage.contributions) : [],
    [eventPackage]
  );

  const checklist = useMemo(
    () => getChecklist(formData, !!eventPackage),
    [formData, eventPackage]
  );

  // =====================================================
  // PACKAGE CACHING — compare "package-relevant" fields
  // =====================================================
  const PACKAGE_RELEVANT_KEYS = [
    'recipeId', 'expectedParticipants', 'customParticipantCount',
    'dietaryAccommodations', 'skillLevel',
  ] as const;

  const getPackageFingerprint = useCallback((form: EventFormData): string => {
    const relevant: Record<string, any> = {};
    for (const key of PACKAGE_RELEVANT_KEYS) {
      relevant[key] = (form as any)[key];
    }
    // Include multi-recipe IDs in fingerprint so cache invalidates on recipe changes
    if (form.recipeMenu) {
      relevant.recipeMenuIds = form.recipeMenu.map(r => r.recipeId).sort();
    }
    return JSON.stringify(relevant);
  }, []);

  const retryCountRef = useRef(0);
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 2000;

  // Generate event package (with auto-retry + cache check + two-mode support)
  const generatePackage = useCallback(async (isRetry = false) => {
    if (!formData.parsedRecipe || !user?.id) return;

    // Check cache BEFORE making API call (avoids race condition with separate useEffect)
    if (!isRetry && draft?.draftData) {
      const cached = (draft.draftData as any)?.cachedEventPackage;
      if (cached?.package && cached?.fingerprint) {
        const currentFingerprint = getPackageFingerprint(formData);
        if (cached.fingerprint === currentFingerprint) {
          // Package-relevant fields haven't changed — reuse cached package
          setEventPackage(cached.package);
          return;
        }
      }
    }

    if (!isRetry) retryCountRef.current = 0;
    setIsGenerating(true);
    setGenerateError(null);

    // Determine mode: if no scaling and no dietary accommodations, build contributions
    // from recipe directly and only ask LLM for the host package
    const useFullPackage = needsFullPackage(formData);
    const mode = useFullPackage ? 'full_package' : 'host_package_only';

    console.log(`[EventPreview] Package mode: ${mode} (full=${useFullPackage})`);

    try {
      // Build a clean, minimal recipe payload to avoid oversized requests
      const recipePayload = {
        name: formData.parsedRecipe.name,
        description: formData.parsedRecipe.description
          ? formData.parsedRecipe.description.substring(0, 500)
          : undefined,
        servings: formData.parsedRecipe.servings,
        prep_time_minutes: formData.parsedRecipe.prepTimeMinutes,
        cook_time_minutes: formData.parsedRecipe.cookTimeMinutes,
        skill_level: formData.parsedRecipe.skillLevel,
        ingredients: (formData.parsedRecipe.ingredients || []).map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
        })),
        instructions: formData.parsedRecipe.instructions,
        equipment_needed: formData.parsedRecipe.equipmentNeeded,
        author_tips: formData.parsedRecipe.authorTips,
      };

      const requestBody = {
        recipe: recipePayload,
        event_details: {
          event_date: formData.eventDate,
          event_time: formData.eventTime,
          expected_participants: formData.expectedParticipants,
          custom_participant_count: formData.customParticipantCount,
          dietary_accommodations: formData.dietaryAccommodations,
          skill_level: formData.skillLevel,
        },
        user_id: user.id,
        mode,
      };

      const bodySize = JSON.stringify(requestBody).length;
      console.log(`[EventPreview] Request body size: ${bodySize} bytes`);

      const { data, error } = await supabase.functions.invoke('generate-event-package', {
        body: requestBody,
      });

      if (error) throw error;

      if (data?.success) {
        let pkg: EventPackageResult;

        if (mode === 'host_package_only') {
          // Build contributions from recipe ingredients directly (no LLM)
          const recipeContribs = buildContributionsFromRecipe(formData.parsedRecipe);
          pkg = {
            contributions: recipeContribs.map(c => ({
              name: c.description,
              quantity: c.quantity_needed,
              unit: c.unit || '',
              category: 'other',
              type: c.type as 'ingredient' | 'equipment',
              substitution_note: null,
            })),
            host_package: data.host_package || null,
          };
        } else {
          // Full package — contributions from LLM
          pkg = {
            contributions: data.contributions || [],
            host_package: data.host_package || null,
          };
        }

        setEventPackage(pkg);

        // Cache package in draft data for reuse
        const fingerprint = getPackageFingerprint(formData);
        const draftData = toEventDraftData(formData);
        updateDraft({
          draftId,
          stepCompleted: computeStepCompleted(formData),
          draftData: { ...draftData, cachedEventPackage: { package: pkg, fingerprint } } as any,
        }).catch(console.error);
      } else {
        throw new Error(data?.error || data?.message || 'Failed to generate event package');
      }
    } catch (err: any) {
      // Extract detailed error info from FunctionsHttpError
      let errorDetail = '';
      try {
        const ctx = err?.context;
        if (ctx) {
          const status = ctx.status || ctx.statusCode || 'unknown';
          const statusText = ctx.statusText || '';
          errorDetail = `HTTP ${status} ${statusText}`;
          // Try to read body
          if (typeof ctx.json === 'function') {
            const body = await ctx.json().catch(() => null);
            if (body) errorDetail += ` | ${JSON.stringify(body)}`;
          } else if (typeof ctx.text === 'function') {
            const body = await ctx.text().catch(() => '');
            if (body) errorDetail += ` | ${body}`;
          }
        }
      } catch (_) { /* ignore parse errors */ }
      console.error('Event package generation failed:', err?.message, errorDetail);
      const msg = err?.message || errorDetail || 'Failed to generate event package';
      const isRateLimited = msg.includes('RATE_LIMITED') || errorDetail.includes('RATE_LIMITED');

      // Auto-retry for non-rate-limit errors (network drops, app backgrounding)
      if (!isRateLimited && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        console.log(`[generate-event-package] Retrying (${retryCountRef.current}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return generatePackage(true);
      }

      setGenerateError(isRateLimited
        ? 'Daily limit reached. Try again tomorrow.'
        : 'Something went wrong generating your event package. Please try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  }, [formData, user?.id, draftId, draft, getPackageFingerprint, updateDraft]);

  // Generate multi-recipe package (with auto-retry + cache check)
  const generateMultiPackage = useCallback(async (isRetry = false) => {
    if (!formData.recipeMenu || formData.recipeMenu.length < 2 || !user?.id) return;

    // Check cache BEFORE making API call
    if (!isRetry && draft?.draftData) {
      const cached = (draft.draftData as any)?.cachedEventPackage;
      if (cached?.package && cached?.fingerprint) {
        const currentFingerprint = getPackageFingerprint(formData);
        if (cached.fingerprint === currentFingerprint) {
          setEventPackage(cached.package);
          return;
        }
      }
    }

    if (!isRetry) retryCountRef.current = 0;
    setIsGenerating(true);
    setGenerateError(null);

    const useFullPackage = needsMultiRecipeFullPackage(formData);
    const mode = useFullPackage ? 'full_package' : 'host_package_only';

    console.log(`[EventPreview] Multi-recipe package mode: ${mode} (full=${useFullPackage}), ${formData.recipeMenu.length} recipes`);

    try {
      // Build clean recipe payloads
      const recipesPayload = formData.recipeMenu.map(item => ({
        name: item.parsedRecipe.name,
        description: item.parsedRecipe.description
          ? item.parsedRecipe.description.substring(0, 500)
          : undefined,
        servings: item.parsedRecipe.servings,
        prep_time_minutes: item.parsedRecipe.prepTimeMinutes,
        cook_time_minutes: item.parsedRecipe.cookTimeMinutes,
        skill_level: item.parsedRecipe.skillLevel,
        ingredients: (item.parsedRecipe.ingredients || []).map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          category: i.category,
        })),
        instructions: item.parsedRecipe.instructions,
        equipment_needed: item.parsedRecipe.equipmentNeeded,
        author_tips: item.parsedRecipe.authorTips,
      }));

      const requestBody = {
        recipes: recipesPayload,
        event_details: {
          event_date: formData.eventDate,
          event_time: formData.eventTime,
          expected_participants: formData.expectedParticipants,
          custom_participant_count: formData.customParticipantCount,
          dietary_accommodations: formData.dietaryAccommodations,
          skill_level: formData.skillLevel,
        },
        user_id: user.id,
        mode,
      };

      const bodySize = JSON.stringify(requestBody).length;
      console.log(`[EventPreview] Multi-recipe request body size: ${bodySize} bytes`);

      const { data, error } = await supabase.functions.invoke('generate-multi-recipe-package', {
        body: requestBody,
      });

      if (error) throw error;

      if (data?.success) {
        let pkg: EventPackageResult;

        if (mode === 'host_package_only') {
          // Build contributions from recipes directly (client-side, no LLM)
          const clientContribs = multiRecipeToContributions(formData.recipeMenu);
          pkg = {
            contributions: clientContribs.map(c => ({
              name: c.name,
              quantity: c.quantity,
              unit: c.unit || '',
              category: c.category,
              type: (c.category === 'equipment' ? 'equipment' : 'ingredient') as 'ingredient' | 'equipment',
              substitution_note: null,
            })),
            host_package: data.host_package || null,
            recipe_manifest: data.recipe_manifest || undefined,
            cross_recipe_notes: data.cross_recipe_notes || undefined,
          };
        } else {
          // Full package — contributions from LLM
          pkg = {
            contributions: data.contributions || [],
            host_package: data.host_package || null,
            recipe_manifest: data.recipe_manifest || undefined,
            cross_recipe_notes: data.cross_recipe_notes || undefined,
          };
        }

        setEventPackage(pkg);

        // Cache package in draft data for reuse
        const fingerprint = getPackageFingerprint(formData);
        const draftData = toEventDraftData(formData);
        updateDraft({
          draftId,
          stepCompleted: computeStepCompleted(formData),
          draftData: { ...draftData, cachedEventPackage: { package: pkg, fingerprint } } as any,
        }).catch(console.error);
      } else {
        throw new Error(data?.error || data?.message || 'Failed to generate multi-recipe package');
      }
    } catch (err: any) {
      let errorDetail = '';
      try {
        const ctx = err?.context;
        if (ctx) {
          const status = ctx.status || ctx.statusCode || 'unknown';
          const statusText = ctx.statusText || '';
          errorDetail = `HTTP ${status} ${statusText}`;
          if (typeof ctx.json === 'function') {
            const body = await ctx.json().catch(() => null);
            if (body) errorDetail += ` | ${JSON.stringify(body)}`;
          } else if (typeof ctx.text === 'function') {
            const body = await ctx.text().catch(() => '');
            if (body) errorDetail += ` | ${body}`;
          }
        }
      } catch (_) { /* ignore parse errors */ }
      console.error('Multi-recipe package generation failed:', err?.message, errorDetail);
      const msg = err?.message || errorDetail || 'Failed to generate multi-recipe package';
      const isRateLimited = msg.includes('RATE_LIMITED') || errorDetail.includes('RATE_LIMITED');

      // Auto-retry for non-rate-limit errors
      if (!isRateLimited && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        console.log(`[generate-multi-recipe-package] Retrying (${retryCountRef.current}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        return generateMultiPackage(true);
      }

      setGenerateError(isRateLimited
        ? 'Daily limit reached. Try again tomorrow.'
        : 'Something went wrong generating your meal plan package. Please try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  }, [formData, user?.id, draftId, draft, getPackageFingerprint, updateDraft]);

  // Auto-trigger single-recipe package generation
  useEffect(() => {
    if (isMultiRecipe) return;
    if (!isDraftLoading && formData.parsedRecipe && user?.id && !eventPackage && !isGenerating) {
      generatePackage();
    }
  }, [isDraftLoading, formData.parsedRecipe, user?.id, isMultiRecipe]);

  // Auto-trigger multi-recipe package generation
  useEffect(() => {
    if (!isMultiRecipe) return;
    if (!isDraftLoading && formData.recipeMenu && user?.id && !eventPackage && !isGenerating) {
      generateMultiPackage();
    }
  }, [isDraftLoading, formData.recipeMenu, user?.id, isMultiRecipe]);

  const handlePublish = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to publish an event.');
      return;
    }

    const validation = validateEventForm(formData);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      Alert.alert('Missing Info', firstError);
      return;
    }

    setIsPublishing(true);
    try {
      // 1. Create event (with host_package if available)
      const eventPayload: any = {
        host_user_id: user.id,
        title: formData.title,
        event_date: formData.eventDate,
        event_time: formData.eventTime,
        event_end_time: formData.eventEndTime || null,
        expected_participants: formData.expectedParticipants === 'custom' ? '13+' : formData.expectedParticipants,
        recipe_id: isMultiRecipe ? null : (formData.recipeId ? parseInt(formData.recipeId, 10) : null),
        description: isMultiRecipe
          ? (formData.eventNotes || `Meal plan with ${formData.recipeMenu!.length} recipes`)
          : (formData.parsedRecipe?.description || formData.eventNotes || null),
        location_city: formData.locationCity,
        location_state: formData.locationState || null,
        location_country: formData.locationCountry || 'USA',
        location_zip: formData.locationZip || null,
        location_general_description: formData.locationDescription || null,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
        address_visibility: formData.addressVisibility || 'after_rsvp',
        dietary_accommodations:
          formData.dietaryAccommodations.length > 0
            ? formData.dietaryAccommodations
            : null,
        skill_level: formData.skillLevel || null,
        status: 'planning',
        max_participants: formData.expectedParticipants === 'custom'
          ? (formData.customParticipantCount || 20)
          : getMaxParticipants(formData.expectedParticipants),
        hero_emoji: formData.heroEmoji,
        hero_gradient: formData.heroGradient,
        event_notes: formData.eventNotes?.trim() || null,
      };

      // Save pre-generated host package directly (no async LLM call at publish)
      if (eventPackage?.host_package) {
        eventPayload.host_package = eventPackage.host_package;
      }

      const { data: event, error: eventError } = await supabase
        .from('meal_prep_events')
        .insert(eventPayload)
        .select('id')
        .single();

      if (eventError) throw eventError;
      const eventId = event.id;

      // 2. Auto-add host as participant
      const { error: hostError } = await supabase.from('event_attendees').insert({
        event_id: eventId,
        user_id: user.id,
        role: 'participant',
        registration_status: 'approved',
      });
      if (hostError) throw hostError;

      // 3. Insert event_recipes for multi-recipe events
      if (isMultiRecipe && formData.recipeMenu) {
        const recipesPayload = formData.recipeMenu.map(item => ({
          recipe_id: parseInt(item.recipeId, 10),
          sort_order: item.sortOrder,
          label: item.label || null,
          color_index: item.colorIndex,
        }));
        const { error: erError } = await supabase.rpc('insert_event_recipes', {
          p_event_id: eventId,
          p_recipes: recipesPayload,
        });
        if (erError) {
          console.error('Failed to insert event_recipes:', erError);
        }
      }

      // 4. Add contributions (via SECURITY DEFINER RPC to bypass RLS)
      if (eventPackage && eventPackage.contributions.length > 0) {
        // Use LLM-generated contributions (works for both single and multi-recipe)
        const contribs = eventPackage.contributions.map(c => ({
          description: cleanIngredientName(c.name),
          type: c.type === 'equipment' ? 'equipment' : 'ingredient',
          quantity_needed: c.quantity,
          unit: c.unit || null,
          notes: c.substitution_note || null,
        }));

        const { data: contribResult, error: contribRpcError } = await supabase.rpc('insert_event_contributions', {
          p_event_id: eventId,
          p_contributions: contribs,
        });
        if (contribRpcError) {
          console.error('Failed to insert contributions:', contribRpcError);
        } else if (contribResult && !contribResult.success) {
          console.error('Failed to insert contributions:', contribResult.error);
        }
      } else if (isMultiRecipe && formData.recipeMenu) {
        // Fallback: multi-recipe client-side contributions if LLM failed
        const multiContribs = multiRecipeToContributions(formData.recipeMenu);
        const contribs = multiContribs.map(c => ({
          description: c.name,
          type: c.category === 'equipment' ? 'equipment' : 'ingredient',
          quantity_needed: c.quantity,
          unit: c.unit || null,
          notes: null,
        }));
        if (contribs.length > 0) {
          const { data: contribResult, error: contribRpcError } = await supabase.rpc('insert_event_contributions', {
            p_event_id: eventId,
            p_contributions: contribs,
          });
          if (contribRpcError) {
            console.error('Failed to insert contributions:', contribRpcError);
          } else if (contribResult && !contribResult.success) {
            console.error('Failed to insert contributions:', contribResult.error);
          }
        }
      }

      // 5. Generate invite token
      await generateEventInviteToken(eventId).catch(err =>
        console.error('Failed to generate invite token:', err)
      );

      // 6. Send targeted invites
      if (formData.invitedUserIds.length > 0) {
        await inviteToEvent(user.id, eventId, formData.invitedUserIds).catch(err =>
          console.error('Failed to send invites:', err)
        );
      }

      // 7. Add co-host
      if (formData.coHostUserId) {
        const { error: coHostError } = await supabase.from('event_attendees').insert({
          event_id: eventId,
          user_id: formData.coHostUserId,
          role: 'co-leader',
          registration_status: 'approved',
        });
        if (coHostError) {
          console.error('Failed to add co-host:', coHostError);
        }
      }

      // 8. If no package was generated at preview time, fire async fallback
      if (!eventPackage?.host_package) {
        if (isMultiRecipe && formData.recipeMenu) {
          // Multi-recipe async fallback
          const recipesPayload = formData.recipeMenu.map(item => ({
            name: item.parsedRecipe.name,
            description: item.parsedRecipe.description?.substring(0, 500),
            servings: item.parsedRecipe.servings,
            prep_time_minutes: item.parsedRecipe.prepTimeMinutes,
            cook_time_minutes: item.parsedRecipe.cookTimeMinutes,
            skill_level: item.parsedRecipe.skillLevel,
            ingredients: (item.parsedRecipe.ingredients || []).map((i: any) => ({
              name: i.name, quantity: i.quantity, unit: i.unit, category: i.category,
            })),
            instructions: item.parsedRecipe.instructions,
            equipment_needed: item.parsedRecipe.equipmentNeeded,
            author_tips: item.parsedRecipe.authorTips,
          }));
          supabase.functions.invoke('generate-multi-recipe-package', {
            body: {
              recipes: recipesPayload,
              event_details: {
                event_date: formData.eventDate,
                event_time: formData.eventTime,
                expected_participants: formData.expectedParticipants,
                custom_participant_count: formData.customParticipantCount,
                dietary_accommodations: formData.dietaryAccommodations,
                skill_level: formData.skillLevel,
              },
              user_id: user.id,
              mode: 'host_package_only',
            },
          }).then(async ({ data: hpData }) => {
            if (hpData?.success && hpData?.host_package) {
              await supabase
                .from('meal_prep_events')
                .update({ host_package: hpData.host_package })
                .eq('id', eventId);
            }
          }).catch(err => console.error('Fallback multi-recipe host package failed:', err));
        } else if (formData.recipeId && formData.parsedRecipe) {
          // Single-recipe async fallback
          supabase.functions.invoke('generate-host-package', {
            body: {
              recipe: {
                name: formData.parsedRecipe.name,
                description: formData.parsedRecipe.description,
                servings: formData.parsedRecipe.servings,
                prep_time_minutes: formData.parsedRecipe.prepTimeMinutes,
                cook_time_minutes: formData.parsedRecipe.cookTimeMinutes,
                skill_level: formData.parsedRecipe.skillLevel,
                ingredients: formData.parsedRecipe.ingredients,
                instructions: formData.parsedRecipe.instructions,
                equipment_needed: formData.parsedRecipe.equipmentNeeded,
              },
              event_details: {
                event_date: formData.eventDate,
                event_time: formData.eventTime,
                expected_participants: formData.expectedParticipants,
                dietary_accommodations: formData.dietaryAccommodations,
              },
              user_id: user.id,
            },
          }).then(async ({ data: hpData }) => {
            if (hpData?.success && hpData?.host_package) {
              await supabase
                .from('meal_prep_events')
                .update({ host_package: hpData.host_package })
                .eq('id', eventId);
            }
          }).catch(err => console.error('Fallback host package failed:', err));
        }
      }

      // 9. Delete draft
      await deleteDraft(draftId).catch(console.error);

      // 10. Navigate to published event
      Alert.alert('Event Created!', 'Your meal prep event has been published.', [
        {
          text: 'View Event',
          onPress: () => {
            navigation.reset({
              index: 1,
              routes: [
                { name: 'MealPrepEventList' },
                { name: 'MealPrepEventDetail', params: { eventId } },
              ],
            });
          },
        },
      ]);
    } catch (error: any) {
      console.error('Publish error:', error);
      Alert.alert('Error', error.message || 'Failed to publish event.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isDraftLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={mpColors.teal} />
      </SafeAreaView>
    );
  }

  const hasRecipe = !!formData.parsedRecipe || isMultiRecipe;
  const hasPackage = !!eventPackage && eventPackage.contributions.length > 0;
  const canPublish = validateEventForm(formData).isValid && (!hasRecipe || hasPackage);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.backButton, isGenerating && styles.backButtonDisabled]}
          onPress={() => !isGenerating && navigation.goBack()}
          disabled={isGenerating}
        >
          <Ionicons name="arrow-back" size={20} color={isGenerating ? mpColors.gray300 : mpColors.gray700} />
          <Text style={[styles.backText, isGenerating && styles.backTextDisabled]}>Edit</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Preview</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Preview banner */}
      <View style={styles.previewBanner}>
        <Ionicons name="eye-outline" size={16} color={mpColors.teal} />
        <Text style={styles.previewBannerText}>
          This is how guests will see your event
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Reuse detail section components in guest perspective */}
        <DetailHeroBanner event={mockEvent} canManage={false} />
        <DetailEventInfo event={mockEvent} />
        <DetailMetaGrid
          event={mockEvent}
          isApproved={true}
          canManage={false}
        />

        {isMultiRecipe ? (
          mockMultiRecipes.map((r, i) => (
            <DetailRecipeCard
              key={`multi-recipe-${i}`}
              linkedRecipe={r.linked!}
              fullRecipe={r.full}
            />
          ))
        ) : mockLinkedRecipe ? (
          <DetailRecipeCard
            linkedRecipe={mockLinkedRecipe}
            fullRecipe={mockFullRecipe}
          />
        ) : null}

        {/* Contribution Board */}
        {isGenerating ? (
          <View style={styles.shimmerSection}>
            <Text style={styles.shimmerTitle}>Contribution Board</Text>
            <View style={styles.shimmerCard}>
              <ActivityIndicator size="small" color={mpColors.teal} />
              <Text style={styles.shimmerText}>
                {isMultiRecipe
                  ? `Generating contributions for ${formData.recipeMenu?.length || 0} recipes...`
                  : `Generating scaled contributions for ${formData.expectedParticipants === 'custom' ? `${formData.customParticipantCount || '?'}` : formData.expectedParticipants} people...`
                }
              </Text>
            </View>
          </View>
        ) : generateError ? (
          <View style={styles.shimmerSection}>
            <Text style={styles.shimmerTitle}>Contribution Board</Text>
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={24} color={mpColors.red} />
              <Text style={styles.errorCardText}>{generateError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={isMultiRecipe ? generateMultiPackage : generatePackage}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : generatedContributions.length > 0 ? (
          <DetailContributionBoard
            contributions={generatedContributions}
            claims={[]}
            isApproved={false}
            canManage={false}
            isPending={false}
            onClaim={() => {}}
            onUnclaim={() => {}}
          />
        ) : isMultiRecipe && multiRecipeContributions.length > 0 ? (
          /* Fallback: show client-side contributions if LLM hasn't run yet */
          <DetailContributionBoard
            contributions={multiRecipeContributions}
            claims={[]}
            isApproved={false}
            canManage={false}
            isPending={false}
            onClaim={() => {}}
            onUnclaim={() => {}}
          />
        ) : null}

        {/* Host Package */}
        {isGenerating ? (
          <View style={styles.shimmerSection}>
            <Text style={styles.shimmerTitle}>Host Package</Text>
            <View style={styles.shimmerCard}>
              <ActivityIndicator size="small" color={mpColors.teal} />
              <Text style={styles.shimmerText}>
                {isMultiRecipe
                  ? `Building unified shopping list and cross-recipe prep timeline for ${formData.recipeMenu?.length || 0} recipes...`
                  : 'Building your shopping list, timeline, and equipment checklist...'
                }
              </Text>
            </View>
          </View>
        ) : eventPackage?.host_package ? (
          <View style={styles.hostPackageWrapper}>
            <HostPackageSection
              hostPackage={eventPackage.host_package}
              isHost={true}
              recipeManifest={eventPackage.recipe_manifest}
              crossRecipeNotes={eventPackage.cross_recipe_notes}
            />
          </View>
        ) : null}

        {/* Comments placeholder */}
        <View style={styles.placeholderSection}>
          <View style={styles.placeholderContent}>
            <Ionicons
              name="chatbubble-outline"
              size={24}
              color={mpColors.gray300}
            />
            <Text style={styles.placeholderTitle}>
              Comments will appear here
            </Text>
            <Text style={styles.placeholderSubtitle}>
              Guests can comment after joining
            </Text>
          </View>
        </View>

        {/* Share & Invite placeholder */}
        <View style={styles.placeholderSection}>
          <View style={styles.placeholderContent}>
            <Ionicons
              name="share-social-outline"
              size={24}
              color={mpColors.gray300}
            />
            <Text style={styles.placeholderTitle}>
              Sharing unlocks after publish
            </Text>
            <Text style={styles.placeholderSubtitle}>
              You'll be able to invite WellPals and share a link
            </Text>
          </View>
        </View>

        {/* Ready to Publish checklist */}
        <View style={styles.checklistContainer}>
          <Text style={styles.checklistTitle}>Ready to Publish</Text>
          {checklist.map((item, i) => (
            <View key={i} style={styles.checklistRow}>
              <Ionicons
                name={item.passed ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={item.passed ? mpColors.green : mpColors.gray300}
              />
              <Text
                style={[
                  styles.checklistLabel,
                  !item.passed && styles.checklistLabelIncomplete,
                ]}
              >
                {item.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.editButton, isGenerating && styles.editButtonDisabled]}
          onPress={() => !isGenerating && navigation.goBack()}
          disabled={isGenerating}
        >
          <Text style={[styles.editButtonText, isGenerating && styles.editButtonTextDisabled]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.publishButton,
            (!canPublish || isPublishing || isGenerating) && styles.publishButtonDisabled,
          ]}
          onPress={handlePublish}
          disabled={!canPublish || isPublishing || isGenerating}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color={mpColors.white} />
          ) : (
            <Text style={styles.publishButtonText}>
              {isGenerating ? 'Generating...' : generateError && hasRecipe ? 'Package Required' : 'Publish Event'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// =====================================================
// STYLES
// =====================================================

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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: mpSpacing.lg,
    paddingVertical: 12,
    backgroundColor: mpColors.white,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray200,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 60,
  },
  backText: {
    fontSize: 15,
    fontFamily: mpFonts.medium,
    color: mpColors.gray700,
  },
  backButtonDisabled: {
    opacity: 0.4,
  },
  backTextDisabled: {
    color: mpColors.gray300,
  },
  topBarTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  previewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: mpColors.tealMist,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.tealLight,
  },
  previewBannerText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
  },
  scrollView: {
    flex: 1,
  },
  // Shimmer / loading state for generated sections
  shimmerSection: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  shimmerTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 8,
  },
  shimmerCard: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    ...mpShadows.xs,
  },
  shimmerText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
    textAlign: 'center',
  },
  // Error state
  errorCard: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorCardText: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.red,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
    marginTop: 4,
  },
  retryButtonText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  // Host package wrapper
  hostPackageWrapper: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  // Placeholder sections
  placeholderSection: {
    marginHorizontal: mpSpacing.lg,
    marginTop: mpSpacing.md,
    borderRadius: mpRadii.card,
    borderWidth: 1.5,
    borderColor: mpColors.gray200,
    borderStyle: 'dashed',
    backgroundColor: mpColors.white,
  },
  placeholderContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: mpSpacing.lg,
  },
  placeholderTitle: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray400,
    marginTop: 8,
  },
  placeholderSubtitle: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray300,
    marginTop: 2,
  },
  // Checklist
  checklistContainer: {
    marginHorizontal: mpSpacing.lg,
    marginTop: mpSpacing.lg,
    padding: mpSpacing.lg,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    ...mpShadows.xs,
  },
  checklistTitle: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 12,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  checklistLabel: {
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray700,
  },
  checklistLabelIncomplete: {
    color: mpColors.gray400,
  },
  // Bottom bar
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
  editButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray300,
    backgroundColor: mpColors.white,
  },
  editButtonText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  editButtonDisabled: {
    opacity: 0.4,
  },
  editButtonTextDisabled: {
    color: mpColors.gray300,
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
