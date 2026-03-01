import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { EventDraft, EventDraftData, EventTemplate } from '../../lib/eventWizardTypes';

// Database row types
interface EventDraftRow {
  id: string;
  user_id: string;
  step_completed: number;
  draft_data: EventDraftData;
  created_at: string;
  updated_at: string;
}

interface EventTemplateRow {
  id: string;
  name: string;
  description: string | null;
  template_data: EventTemplate['templateData'];
  is_system: boolean;
  user_id: string | null;
  created_at: string;
}

// Transform database row to app type
function transformDraft(row: EventDraftRow): EventDraft {
  return {
    id: row.id,
    userId: row.user_id,
    stepCompleted: row.step_completed,
    draftData: row.draft_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function transformTemplate(row: EventTemplateRow): EventTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    templateData: row.template_data,
    isSystem: row.is_system,
    userId: row.user_id,
    createdAt: row.created_at,
  };
}

export const useEventDraft = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  // Fetch user's existing drafts
  const useDrafts = () => {
    return useQuery<EventDraft[], Error>({
      queryKey: ['eventDrafts', userId],
      queryFn: async () => {
        if (!userId) return [];
        const { data, error } = await supabase
          .from('event_drafts')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });

        if (error) throw new Error(`Failed to fetch drafts: ${error.message}`);
        return (data || []).map(transformDraft);
      },
      enabled: !!userId,
    });
  };

  // Fetch a specific draft by ID
  const useDraft = (draftId: string | null) => {
    return useQuery<EventDraft | null, Error>({
      queryKey: ['eventDraft', draftId],
      queryFn: async () => {
        if (!draftId) return null;
        const { data, error } = await supabase
          .from('event_drafts')
          .select('*')
          .eq('id', draftId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw new Error(`Failed to fetch draft: ${error.message}`);
        }
        return data ? transformDraft(data) : null;
      },
      enabled: !!draftId,
    });
  };

  // Create a new draft
  const createDraftMutation = useMutation({
    mutationFn: async (initialData?: Partial<EventDraftData>) => {
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('event_drafts')
        .insert({
          user_id: userId,
          step_completed: 0,
          draft_data: initialData || {},
        })
        .select('*')
        .single();

      if (error) throw new Error(`Failed to create draft: ${error.message}`);
      return transformDraft(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventDrafts', userId] });
    },
  });

  // Update an existing draft
  const updateDraftMutation = useMutation({
    mutationFn: async ({
      draftId,
      stepCompleted,
      draftData,
    }: {
      draftId: string;
      stepCompleted?: number;
      draftData: Partial<EventDraftData>;
    }) => {
      const updatePayload: {
        draft_data?: EventDraftData;
        step_completed?: number;
        updated_at: string;
      } = {
        updated_at: new Date().toISOString(),
      };

      // Fetch current draft to merge data
      const { data: currentDraft, error: fetchError } = await supabase
        .from('event_drafts')
        .select('draft_data')
        .eq('id', draftId)
        .single();

      if (fetchError) throw new Error(`Failed to fetch draft: ${fetchError.message}`);

      updatePayload.draft_data = {
        ...(currentDraft?.draft_data || {}),
        ...draftData,
      };

      if (stepCompleted !== undefined) {
        updatePayload.step_completed = stepCompleted;
      }

      const { data, error } = await supabase
        .from('event_drafts')
        .update(updatePayload)
        .eq('id', draftId)
        .select('*')
        .single();

      if (error) throw new Error(`Failed to update draft: ${error.message}`);
      return transformDraft(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eventDrafts', userId] });
      queryClient.invalidateQueries({ queryKey: ['eventDraft', data.id] });
    },
  });

  // Delete a draft
  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const { error } = await supabase
        .from('event_drafts')
        .delete()
        .eq('id', draftId);

      if (error) throw new Error(`Failed to delete draft: ${error.message}`);
      return draftId;
    },
    onSuccess: (draftId) => {
      queryClient.invalidateQueries({ queryKey: ['eventDrafts', userId] });
      queryClient.removeQueries({ queryKey: ['eventDraft', draftId] });
    },
  });

  // Fetch available templates (system + user's custom)
  const useTemplates = () => {
    return useQuery<EventTemplate[], Error>({
      queryKey: ['eventTemplates', userId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('event_templates')
          .select('*')
          .or(`is_system.eq.true,user_id.eq.${userId || 'null'}`)
          .order('is_system', { ascending: false })
          .order('name', { ascending: true });

        if (error) throw new Error(`Failed to fetch templates: ${error.message}`);
        return (data || []).map(transformTemplate);
      },
      enabled: true, // Templates should be available even without user
    });
  };

  // Fetch a specific template by ID
  const useTemplate = (templateId: string | null) => {
    return useQuery<EventTemplate | null, Error>({
      queryKey: ['eventTemplate', templateId],
      queryFn: async () => {
        if (!templateId) return null;
        const { data, error } = await supabase
          .from('event_templates')
          .select('*')
          .eq('id', templateId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw new Error(`Failed to fetch template: ${error.message}`);
        }
        return data ? transformTemplate(data) : null;
      },
      enabled: !!templateId,
    });
  };

  // Create a custom template from current draft
  const createTemplateMutation = useMutation({
    mutationFn: async ({
      name,
      description,
      templateData,
    }: {
      name: string;
      description?: string;
      templateData: EventTemplate['templateData'];
    }) => {
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('event_templates')
        .insert({
          name,
          description,
          template_data: templateData,
          is_system: false,
          user_id: userId,
        })
        .select('*')
        .single();

      if (error) throw new Error(`Failed to create template: ${error.message}`);
      return transformTemplate(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventTemplates', userId] });
    },
  });

  // Check if user has any existing drafts (for recovery prompt)
  const useHasExistingDraft = () => {
    return useQuery<boolean, Error>({
      queryKey: ['hasEventDraft', userId],
      queryFn: async () => {
        if (!userId) return false;
        const { count, error } = await supabase
          .from('event_drafts')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);

        if (error) throw new Error(`Failed to check drafts: ${error.message}`);
        return (count || 0) > 0;
      },
      enabled: !!userId,
    });
  };

  // Get the most recent draft
  const useMostRecentDraft = () => {
    return useQuery<EventDraft | null, Error>({
      queryKey: ['mostRecentEventDraft', userId],
      queryFn: async () => {
        if (!userId) return null;
        const { data, error } = await supabase
          .from('event_drafts')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw new Error(`Failed to fetch draft: ${error.message}`);
        }
        return data ? transformDraft(data) : null;
      },
      enabled: !!userId,
    });
  };

  return {
    // Draft queries
    useDrafts,
    useDraft,
    useHasExistingDraft,
    useMostRecentDraft,

    // Draft mutations
    createDraft: createDraftMutation.mutateAsync,
    updateDraft: updateDraftMutation.mutateAsync,
    deleteDraft: deleteDraftMutation.mutateAsync,
    isCreating: createDraftMutation.isPending,
    isUpdating: updateDraftMutation.isPending,
    isDeleting: deleteDraftMutation.isPending,

    // Template queries
    useTemplates,
    useTemplate,

    // Template mutations
    createTemplate: createTemplateMutation.mutateAsync,
    isCreatingTemplate: createTemplateMutation.isPending,
  };
};
