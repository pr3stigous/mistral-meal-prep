import React, { createContext, useState, useContext, ReactNode, useCallback, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import {
  WizardStep,
  WizardState,
  WizardActions,
  EventDraftData,
  Step1Data,
  Step2Data,
  Step3Data,
  Step4Data,
  EventDraft,
  EventTemplate,
  getInitialStep1Data,
  getInitialStep3Data,
  getInitialStep4Data,
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  ingredientsToContributions,
} from '../../lib/eventWizardTypes';

interface EventWizardContextType {
  state: WizardState;
  actions: WizardActions;
}

const EventWizardContext = createContext<EventWizardContextType | undefined>(undefined);

export const useEventWizard = () => {
  const context = useContext(EventWizardContext);
  if (context === undefined) {
    throw new Error('useEventWizard must be used within an EventWizardProvider');
  }
  return context;
};

interface EventWizardProviderProps {
  children: ReactNode;
  initialDraftId?: string;
  initialTemplateId?: string;
}

export const EventWizardProvider: React.FC<EventWizardProviderProps> = ({
  children,
  initialDraftId,
  initialTemplateId,
}) => {
  const { user } = useAuth();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<WizardState>({
    currentStep: 1,
    draftId: initialDraftId || null,
    isLoading: false,
    isSaving: false,
    error: null,
    data: {},
    validationErrors: {},
  });

  // Debounced auto-save
  const scheduleSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      // Will be handled by saveDraft action
    }, 2000);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Load initial draft or apply template on mount
  useEffect(() => {
    if (initialDraftId) {
      loadDraft(initialDraftId);
    } else if (initialTemplateId) {
      applyTemplate(initialTemplateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId, initialTemplateId]);

  const setStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  const updateStep1 = useCallback((data: Partial<Step1Data>) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        step1: { ...(prev.data.step1 || getInitialStep1Data()), ...data },
      },
    }));
    scheduleSave();
  }, [scheduleSave]);

  const updateStep2 = useCallback((data: Partial<Step2Data>) => {
    setState(prev => {
      const newStep2 = { ...prev.data.step2, ...data };
      let newStep4 = prev.data.step4;

      // If recipe was parsed, auto-generate contributions
      if (data.parsedRecipe && !prev.data.step2?.parsedRecipe) {
        const contributions = ingredientsToContributions(
          data.parsedRecipe.ingredients,
          data.parsedRecipe.equipmentNeeded
        );
        newStep4 = {
          ...(prev.data.step4 || getInitialStep4Data()),
          contributions,
        };

        // Also auto-fill skill level in step 3
        const newStep3 = {
          ...(prev.data.step3 || getInitialStep3Data()),
          skillLevel: data.parsedRecipe.skillLevel,
        };

        return {
          ...prev,
          data: {
            ...prev.data,
            step2: newStep2,
            step3: newStep3,
            step4: newStep4,
          },
        };
      }

      return {
        ...prev,
        data: {
          ...prev.data,
          step2: newStep2,
        },
      };
    });
    scheduleSave();
  }, [scheduleSave]);

  const updateStep3 = useCallback((data: Partial<Step3Data>) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        step3: { ...(prev.data.step3 || getInitialStep3Data()), ...data },
      },
    }));
    scheduleSave();
  }, [scheduleSave]);

  const updateStep4 = useCallback((data: Partial<Step4Data>) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        step4: { ...(prev.data.step4 || getInitialStep4Data()), ...data },
      },
    }));
    scheduleSave();
  }, [scheduleSave]);

  const saveDraft = useCallback(async () => {
    if (!user) return;

    setState(prev => ({ ...prev, isSaving: true, error: null }));

    try {
      const draftData = {
        user_id: user.id,
        step_completed: state.currentStep,
        draft_data: state.data,
        updated_at: new Date().toISOString(),
      };

      if (state.draftId) {
        // Update existing draft
        const { error } = await supabase
          .from('event_drafts')
          .update(draftData)
          .eq('id', state.draftId);

        if (error) throw error;
      } else {
        // Create new draft
        const { data, error } = await supabase
          .from('event_drafts')
          .insert(draftData)
          .select('id')
          .single();

        if (error) throw error;
        setState(prev => ({ ...prev, draftId: data.id }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save draft';
      setState(prev => ({ ...prev, error: message }));
      console.error('Error saving draft:', error);
    } finally {
      setState(prev => ({ ...prev, isSaving: false }));
    }
  }, [user, state.currentStep, state.data, state.draftId]);

  const loadDraft = useCallback(async (draftId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase
        .from('event_drafts')
        .select('*')
        .eq('id', draftId)
        .single();

      if (error) throw error;

      const draft = data as {
        id: string;
        user_id: string;
        step_completed: number;
        draft_data: EventDraftData;
        created_at: string;
        updated_at: string;
      };

      setState(prev => ({
        ...prev,
        draftId: draft.id,
        currentStep: (draft.step_completed as WizardStep) || 1,
        data: draft.draft_data || {},
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load draft';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      console.error('Error loading draft:', error);
    }
  }, []);

  const createDraft = useCallback(async (): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const initialData: EventDraftData = {
        step1: getInitialStep1Data(),
        step3: getInitialStep3Data(),
        step4: getInitialStep4Data(),
      };

      const { data, error } = await supabase
        .from('event_drafts')
        .insert({
          user_id: user.id,
          step_completed: 1,
          draft_data: initialData,
        })
        .select('id')
        .single();

      if (error) throw error;

      setState(prev => ({
        ...prev,
        draftId: data.id,
        data: initialData,
        isLoading: false,
      }));

      return data.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create draft';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      throw error;
    }
  }, [user]);

  const deleteDraft = useCallback(async () => {
    if (!state.draftId) return;

    try {
      const { error } = await supabase
        .from('event_drafts')
        .delete()
        .eq('id', state.draftId);

      if (error) throw error;

      setState(prev => ({
        ...prev,
        draftId: null,
        data: {},
        currentStep: 1,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete draft';
      setState(prev => ({ ...prev, error: message }));
      console.error('Error deleting draft:', error);
    }
  }, [state.draftId]);

  const publishEvent = useCallback(async (): Promise<string> => {
    if (!user) throw new Error('User not authenticated');

    // Validate all steps
    const step1Validation = validateStep1(state.data.step1 || {});
    const step2Validation = validateStep2(state.data.step2 || {});
    const step3Validation = validateStep3(state.data.step3 || {});
    const step4Validation = validateStep4(state.data.step4 || {});

    const allErrors = {
      ...step1Validation.errors,
      ...step2Validation.errors,
      ...step3Validation.errors,
      ...step4Validation.errors,
    };

    if (Object.keys(allErrors).length > 0) {
      setState(prev => ({ ...prev, validationErrors: allErrors }));
      throw new Error('Please complete all required fields');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { step1, step2, step3, step4 } = state.data;

      // Create the event
      const eventData = {
        host_user_id: user.id,
        title: step1!.title,
        event_date: step1!.eventDate,
        event_time: step1!.eventTime,
        estimated_duration_minutes: step1!.estimatedDurationMinutes,
        expected_participants: step1!.expectedParticipants,
        recipe_id: step2?.recipeId ? parseInt(step2.recipeId, 10) : null,
        description: step2?.parsedRecipe?.description || step3?.eventNotes || null,
        location_city: step3!.locationCity,
        location_state: step3?.locationState || null,
        location_country: step3?.locationCountry || 'USA',
        location_zip: step3?.locationZip || null,
        location_general_description: step3?.locationDescription || null,
        latitude: step3?.latitude || null,
        longitude: step3?.longitude || null,
        address_visibility: step3!.addressVisibility,
        dietary_accommodations: step3?.dietaryAccommodations?.length ? step3.dietaryAccommodations : null,
        skill_level: step3?.skillLevel || null,
        status: 'planning',
        max_participants: getMaxParticipantsFromRange(step1!.expectedParticipants),
      };

      const { data: event, error: eventError } = await supabase
        .from('meal_prep_events')
        .insert(eventData)
        .select('id')
        .single();

      if (eventError) throw eventError;
      const eventId = event.id;

      // Auto-add host as participant
      await supabase.from('event_attendees').insert({
        event_id: eventId,
        user_id: user.id,
        role: 'participant',
        registration_status: 'approved',
      });

      // Add contributions
      if (step4?.contributions && step4.contributions.length > 0) {
        const contributionsToInsert = step4.contributions
          .filter(c => c.ownership === 'needs_volunteer')
          .map(c => ({
            event_id: eventId,
            description: `${c.name}${c.quantity > 1 ? ` (${c.quantity} ${c.unit})` : ''}`,
            type: c.category === 'equipment' ? 'equipment' : 'ingredient',
            quantity_needed: c.quantity,
          }));

        if (contributionsToInsert.length > 0) {
          await supabase.from('event_contributions_needed').insert(contributionsToInsert);
        }
      }

      // Add invites (create pending attendees)
      if (step4?.invitedUserIds && step4.invitedUserIds.length > 0) {
        const invitesToInsert = step4.invitedUserIds.map(userId => ({
          event_id: eventId,
          user_id: userId,
          role: 'participant',
          registration_status: 'pending',
        }));

        await supabase.from('event_attendees').insert(invitesToInsert);
      }

      // Add co-host if specified
      if (step4?.coHostUserId) {
        await supabase.from('event_attendees').insert({
          event_id: eventId,
          user_id: step4.coHostUserId,
          role: 'co-leader',
          registration_status: 'approved',
        });
      }

      // Delete the draft
      if (state.draftId) {
        await supabase.from('event_drafts').delete().eq('id', state.draftId);
      }

      setState(prev => ({ ...prev, isLoading: false }));
      return eventId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish event';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      throw error;
    }
  }, [user, state.data, state.draftId]);

  const applyTemplate = useCallback(async (templateId: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase
        .from('event_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;

      const template = data as EventTemplate;
      const templateData = template.templateData;

      // Apply template to step 1 and step 3
      const step1Data: Step1Data = {
        ...getInitialStep1Data(),
        estimatedDurationMinutes: templateData.estimatedDurationMinutes,
        expectedParticipants: templateData.expectedParticipants,
      };

      const step3Data: Step3Data = {
        ...getInitialStep3Data(),
        skillLevel: templateData.skillLevel,
        dietaryAccommodations: templateData.dietaryAccommodations || [],
      };

      setState(prev => ({
        ...prev,
        data: {
          ...prev.data,
          step1: step1Data,
          step3: step3Data,
        },
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply template';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      console.error('Error applying template:', error);
    }
  }, []);

  const setValidationError = useCallback((field: string, error: string | null) => {
    setState(prev => {
      const newErrors = { ...prev.validationErrors };
      if (error) {
        newErrors[field] = error;
      } else {
        delete newErrors[field];
      }
      return { ...prev, validationErrors: newErrors };
    });
  }, []);

  const clearErrors = useCallback(() => {
    setState(prev => ({ ...prev, validationErrors: {}, error: null }));
  }, []);

  const actions: WizardActions = useMemo(
    () => ({
      setStep,
      updateStep1,
      updateStep2,
      updateStep3,
      updateStep4,
      saveDraft,
      loadDraft,
      createDraft,
      deleteDraft,
      publishEvent,
      applyTemplate,
      setValidationError,
      clearErrors,
    }),
    [
      setStep,
      updateStep1,
      updateStep2,
      updateStep3,
      updateStep4,
      saveDraft,
      loadDraft,
      createDraft,
      deleteDraft,
      publishEvent,
      applyTemplate,
      setValidationError,
      clearErrors,
    ]
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <EventWizardContext.Provider value={value}>
      {children}
    </EventWizardContext.Provider>
  );
};

// Helper function to get max participants from range
function getMaxParticipantsFromRange(range: string): number {
  switch (range) {
    case '2-4':
      return 4;
    case '5-8':
      return 8;
    case '9-12':
      return 12;
    case '13+':
      return 20; // Default max for large groups
    default:
      return 8;
  }
}
