import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

// Types
type EventChatScreenRouteProp = RouteProp<MealPrepStackParamList, 'EventChat'>;
type EventChatScreenNavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'EventChat'>;

interface Comment {
  id: string;
  event_id: string;
  user_id: string;
  message_content: string;
  created_at: string;
  profiles?: { name: string | null } | null;
}

// Expected type for the RPC response items
interface EventMessageRpcResponse {
  id: string;
  event_id: string;
  user_id: string;
  message_content: string;
  created_at: string;
  profile_name: string | null;
}

// Fetch function using RPC
const fetchComments = async (eventId: string): Promise<Comment[]> => {
  if (!eventId) return [];
  const { data, error } = await supabase.rpc('get_event_messages_with_profile', {
    p_event_id: eventId,
  });

  if (error) {
    console.error('Error fetching comments via RPC:', error);
    throw new Error(error.message);
  }

  const commentsData = data as EventMessageRpcResponse[] | null;

  return (
    commentsData?.map((m) => ({
      id: m.id,
      event_id: m.event_id,
      user_id: m.user_id,
      message_content: m.message_content,
      created_at: m.created_at,
      profiles: m.profile_name ? { name: m.profile_name } : null,
    })) || []
  );
};

const EventChatScreen = () => {
  const route = useRoute<EventChatScreenRouteProp>();
  const navigation = useNavigation<EventChatScreenNavigationProp>();
  const { eventId, eventTitle } = route.params;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  const [newCommentContent, setNewCommentContent] = useState('');
  const [userProfile, setUserProfile] = useState<{ name: string | null } | null>(null);

  // Set header title
  useEffect(() => {
    navigation.setOptions({ title: 'Comments' });
  }, [navigation]);

  // Fetch current user's profile to check if they have a name
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setUserProfile(data);
      }
    };
    fetchUserProfile();
  }, [user]);

  const { data: comments = [], isLoading, error, refetch } = useQuery<Comment[], Error>({
    queryKey: ['eventComments', eventId],
    queryFn: () => fetchComments(eventId),
    enabled: !!eventId,
  });

  const postCommentMutation = useMutation<any, Error, { content: string }>({
    mutationFn: async ({ content }) => {
      if (!user || !eventId) throw new Error('User or event ID missing');
      const { data: newCommentData, error: insertError } = await supabase
        .from('event_messages')
        .insert({
          event_id: eventId,
          user_id: user.id,
          message_content: content,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (!newCommentData) throw new Error('Failed to post comment, no data returned.');
      return newCommentData;
    },
    onSuccess: () => {
      setNewCommentContent('');
      Keyboard.dismiss();
      queryClient.invalidateQueries({ queryKey: ['eventComments', eventId] });
    },
    onError: (err) => {
      Alert.alert('Error', `Failed to post comment: ${err.message}`);
    },
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!eventId) return;

    const channel = supabase
      .channel(`event-comments-${eventId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'event_messages',
        filter: `event_id=eq.${eventId}`
      },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['eventComments', eventId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, queryClient]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handlePostComment = () => {
    if (!userProfile?.name || userProfile.name.trim() === '') {
      Alert.alert(
        'Profile Incomplete',
        'Please set your name in your profile before posting comments.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (newCommentContent.trim()) {
      postCommentMutation.mutate({ content: newCommentContent.trim() });
    }
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderCommentItem = ({ item }: { item: Comment }) => {
    const isCurrentUser = item.user_id === user?.id;
    const userName = item.profiles?.name || 'Anonymous';
    const initial = userName.charAt(0).toUpperCase();

    return (
      <View style={styles.commentCard}>
        <View style={styles.commentHeader}>
          <View style={[styles.avatar, isCurrentUser && styles.currentUserAvatar]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.commentMeta}>
            <Text style={styles.authorName}>
              {userName}
              {isCurrentUser && <Text style={styles.youBadge}> (You)</Text>}
            </Text>
            <Text style={styles.timestamp}>{formatRelativeTime(item.created_at)}</Text>
          </View>
        </View>
        <Text style={styles.commentContent}>{item.message_content}</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <ActivityIndicator size="large" color="#3fa6a6" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered} edges={['bottom']}>
        <Text style={styles.errorText}>Error loading comments: {error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Sort comments by created_at descending (newest first) for feed-style
  const sortedComments = comments ? [...comments].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ) : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {/* Comment Input at Top */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newCommentContent}
            onChangeText={setNewCommentContent}
            placeholder="Write a comment..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            onPress={handlePostComment}
            style={[styles.postButton, !newCommentContent.trim() && styles.postButtonDisabled]}
            disabled={postCommentMutation.isPending || !newCommentContent.trim()}
          >
            {postCommentMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Comments Feed */}
        {sortedComments.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color="#C7C7CC" />
            <Text style={styles.emptyStateTitle}>No comments yet</Text>
            <Text style={styles.emptyStateText}>Be the first to share something with the group!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={sortedComments}
            renderItem={renderCommentItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.commentsListContainer}
            showsVerticalScrollIndicator={false}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3fa6a6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginRight: 10,
    color: '#1C1C1E',
  },
  postButton: {
    backgroundColor: '#3fa6a6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  postButtonDisabled: {
    opacity: 0.5,
  },
  postButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  commentsListContainer: {
    padding: 12,
    paddingBottom: 20,
  },
  commentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8E8E93',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  currentUserAvatar: {
    backgroundColor: '#3fa6a6',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  commentMeta: {
    flex: 1,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  youBadge: {
    fontWeight: '400',
    color: '#3fa6a6',
  },
  timestamp: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  commentContent: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 21,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
  },
});

export default EventChatScreen;
