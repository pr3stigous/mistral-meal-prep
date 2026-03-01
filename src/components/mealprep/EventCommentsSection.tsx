import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { useEventComments, Comment } from '../../hooks/useEventComments';
import CommentCard from './CommentCard';

interface EventCommentsSectionProps {
  eventId: string;
  isParticipant: boolean; // user is approved to attend (includes hosts)
  canManageEvent: boolean; // host or co-host
  commentsRestrictedToHosts: boolean;
  onToggleRestriction?: (restricted: boolean) => void;
}

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList>;

const MAX_VISIBLE_COMMENTS = 5;
const MAX_VISIBLE_REPLIES = 2;

const EventCommentsSection: React.FC<EventCommentsSectionProps> = ({
  eventId,
  isParticipant,
  canManageEvent,
  commentsRestrictedToHosts,
  onToggleRestriction,
}) => {
  const navigation = useNavigation<NavigationProp>();
  const { comments, isLoading, error, toggleLike, refetch, deleteComment } = useEventComments(eventId);
  const [expanded, setExpanded] = useState(false);

  // Local state for optimistic toggle updates
  const [localRestricted, setLocalRestricted] = useState(commentsRestrictedToHosts);

  // Sync local state when prop changes (e.g., after server refetch)
  useEffect(() => {
    setLocalRestricted(commentsRestrictedToHosts);
  }, [commentsRestrictedToHosts]);

  const handleToggleRestriction = (value: boolean) => {
    // Optimistically update local state immediately
    setLocalRestricted(value);
    // Then trigger the server update
    onToggleRestriction?.(value);
  };

  // Determine commenting permissions
  // - canComment: can add new comments or reply
  // - Hosts can always comment
  // - Participants can comment unless restricted to hosts only
  // - Non-participants cannot comment
  const canComment = canManageEvent || (isParticipant && !localRestricted);
  const totalComments = comments.reduce(
    (count, comment) => count + 1 + comment.replies.length,
    0
  );
  const visibleComments = expanded ? comments : comments.slice(0, MAX_VISIBLE_COMMENTS);
  const hasMoreComments = comments.length > MAX_VISIBLE_COMMENTS && !expanded;

  const handleLike = async (commentId: string, isLiked: boolean) => {
    try {
      await toggleLike(commentId, isLiked);
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment(commentId);
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleReply = (comment: Comment) => {
    navigation.navigate('ReplyToComment', {
      eventId,
      parentCommentId: comment.id,
      parentAuthor: comment.author_name || 'Anonymous',
      parentContent: comment.message_content,
    });
  };

  const handleAddComment = () => {
    navigation.navigate('AddComment', { eventId });
  };

  const handleViewAllReplies = (comment: Comment) => {
    // For now, just expand all - could navigate to a thread view in future
    setExpanded(true);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#3fa6a6" />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Comments</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load comments</Text>
          <TouchableOpacity onPress={() => refetch()}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Comments</Text>
          {totalComments > 0 && (
            <Text style={styles.commentCount}>({totalComments})</Text>
          )}
        </View>

        {/* Host control for restricting comments */}
        {canManageEvent && onToggleRestriction && (
          <View style={styles.restrictToggle}>
            <Text style={styles.restrictLabel}>Hosts only</Text>
            <Switch
              value={localRestricted}
              onValueChange={handleToggleRestriction}
              trackColor={{ false: '#E5E5EA', true: '#3fa6a6' }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E5E5EA"
            />
          </View>
        )}
      </View>

      {/* Comments list */}
      {comments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={32} color="#C7C7CC" />
          <Text style={styles.emptyText}>No comments yet</Text>
          {canComment && (
            <Text style={styles.emptySubtext}>Be the first to comment!</Text>
          )}
        </View>
      ) : (
        <View style={styles.commentsList}>
          {visibleComments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              onLike={handleLike}
              onReply={handleReply}
              onDelete={canManageEvent ? handleDelete : undefined}
              canInteract={canComment}
              canDelete={canManageEvent}
              maxReplies={MAX_VISIBLE_REPLIES}
              onViewAllReplies={handleViewAllReplies}
            />
          ))}

          {/* See all comments button */}
          {hasMoreComments && (
            <TouchableOpacity
              style={styles.seeAllButton}
              onPress={() => setExpanded(true)}
            >
              <Text style={styles.seeAllText}>
                See all {comments.length} comments
              </Text>
              <Ionicons name="chevron-down" size={16} color="#3fa6a6" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Add Comment button - only show if user can comment */}
      {canComment && (
        <TouchableOpacity style={styles.addCommentButton} onPress={handleAddComment}>
          <Ionicons name="add-circle-outline" size={20} color="#3fa6a6" />
          <Text style={styles.addCommentText}>Add Comment</Text>
        </TouchableOpacity>
      )}

      {/* Message when user cannot comment */}
      {!canComment && (
        <View style={styles.restrictedMessage}>
          <Ionicons name="lock-closed-outline" size={14} color="#8E8E93" />
          <Text style={styles.restrictedText}>
            {!isParticipant
              ? 'Only participants can add comments'
              : 'Only hosts can comment on this event'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  commentCount: {
    fontSize: 15,
    color: '#8E8E93',
  },
  restrictToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restrictLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  loadingContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorContainer: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    marginBottom: 8,
  },
  retryText: {
    fontSize: 14,
    color: '#3fa6a6',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#C7C7CC',
    marginTop: 4,
  },
  commentsList: {
    // Comments go here
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: '#3fa6a6',
    fontWeight: '500',
  },
  addCommentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 6,
  },
  addCommentText: {
    fontSize: 15,
    color: '#3fa6a6',
    fontWeight: '500',
  },
  restrictedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    gap: 6,
  },
  restrictedText: {
    fontSize: 13,
    color: '#8E8E93',
  },
});

export default EventCommentsSection;
