import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';

export interface Comment {
  id: string;
  event_id: string;
  user_id: string;
  message_content: string;
  created_at: string;
  parent_id: string | null;
  author_name: string | null;
  likes_count: number;
  user_has_liked: boolean;
  replies: Comment[];
}

export const useEventComments = (eventId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch comments via SECURITY DEFINER RPC
  const fetchComments = async (): Promise<Comment[]> => {
    if (!eventId) return [];

    const { data, error } = await supabase.rpc('get_event_comments', {
      p_event_id: eventId,
    });

    if (error) throw error;

    // RPC returns jsonb — check for error response
    if (data && typeof data === 'object' && 'error' in data) {
      throw new Error((data as any).error);
    }

    const rawComments: Comment[] = ((data as any[]) || []).map((c: any) => ({
      id: c.id,
      event_id: c.event_id,
      user_id: c.user_id,
      message_content: c.message_content,
      created_at: c.created_at,
      parent_id: c.parent_id,
      author_name: c.author_name || null,
      likes_count: c.likes_count || 0,
      user_has_liked: c.user_has_liked || false,
      replies: [],
    }));

    // Build tree structure: nest replies under parent comments
    const commentMap = new Map<string, Comment>();
    const topLevelComments: Comment[] = [];

    // First pass: create map
    rawComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Second pass: build tree
    rawComments.forEach(comment => {
      const commentNode = commentMap.get(comment.id)!;
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies.push(commentNode);
        }
      } else {
        topLevelComments.push(commentNode);
      }
    });

    // Sort replies by created_at ascending (oldest first)
    topLevelComments.forEach(comment => {
      comment.replies.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    return topLevelComments;
  };

  const {
    data: comments = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Comment[], Error>({
    queryKey: ['eventComments', eventId],
    queryFn: fetchComments,
    enabled: !!eventId,
  });

  // Add comment via RPC
  const addCommentMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: string }) => {
      if (!user?.id || !eventId) throw new Error('Missing user or event');

      const { data, error } = await supabase.rpc('add_event_comment', {
        p_event_id: eventId,
        p_content: content,
        p_parent_id: parentId || null,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventComments', eventId] });
    },
  });

  // Delete comment via RPC
  const deleteCommentMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase.rpc('delete_event_comment', {
        p_comment_id: messageId,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventComments', eventId] });
    },
  });

  // Like via RPC
  const likeMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase.rpc('like_event_comment', {
        p_message_id: messageId,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventComments', eventId] });
    },
  });

  // Unlike via RPC
  const unlikeMutation = useMutation({
    mutationFn: async (messageId: string) => {
      const { data, error } = await supabase.rpc('unlike_event_comment', {
        p_message_id: messageId,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventComments', eventId] });
    },
  });

  // Toggle like
  const toggleLike = async (messageId: string, currentlyLiked: boolean) => {
    if (currentlyLiked) {
      await unlikeMutation.mutateAsync(messageId);
    } else {
      await likeMutation.mutateAsync(messageId);
    }
  };

  return {
    comments,
    isLoading,
    error,
    refetch,
    toggleLike,
    addComment: addCommentMutation.mutateAsync,
    isAddingComment: addCommentMutation.isPending,
    isTogglingLike: likeMutation.isPending || unlikeMutation.isPending,
    deleteComment: deleteCommentMutation.mutateAsync,
    isDeletingComment: deleteCommentMutation.isPending,
  };
};
