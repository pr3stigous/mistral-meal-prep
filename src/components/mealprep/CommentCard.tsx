import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Comment } from '../../hooks/useEventComments';

interface CommentCardProps {
  comment: Comment;
  onLike: (commentId: string, isLiked: boolean) => void;
  onReply: (comment: Comment) => void;
  onDelete?: (commentId: string) => void;
  isNested?: boolean;
  canInteract?: boolean; // false when comments restricted to hosts
  canDelete?: boolean; // true for hosts/co-hosts
  maxReplies?: number;
  onViewAllReplies?: (comment: Comment) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  onLike,
  onReply,
  onDelete,
  isNested = false,
  canInteract = true,
  canDelete = false,
  maxReplies = 2,
  onViewAllReplies,
}) => {
  const handleDelete = () => {
    Alert.alert(
      'Delete Comment',
      'Are you sure you want to delete this comment?' + (comment.replies.length > 0 ? ' This will also delete all replies.' : ''),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(comment.id),
        },
      ]
    );
  };
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const authorName = comment.author_name || 'Anonymous';
  const initial = authorName.charAt(0).toUpperCase();
  const visibleReplies = comment.replies.slice(0, maxReplies);
  const hiddenRepliesCount = comment.replies.length - maxReplies;

  return (
    <View style={[styles.container, isNested && styles.nestedContainer]}>
      {/* Main comment */}
      <View style={styles.commentRow}>
        <View style={[styles.avatar, isNested && styles.smallAvatar]}>
          <Text style={[styles.avatarText, isNested && styles.smallAvatarText]}>
            {initial}
          </Text>
        </View>
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <Text style={styles.authorName}>{authorName}</Text>
            <Text style={styles.timestamp}>{formatRelativeTime(comment.created_at)}</Text>
          </View>
          <Text style={styles.messageContent}>{comment.message_content}</Text>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onLike(comment.id, comment.user_has_liked)}
            >
              <Ionicons
                name={comment.user_has_liked ? 'heart' : 'heart-outline'}
                size={16}
                color={comment.user_has_liked ? '#FF3B30' : '#8E8E93'}
              />
              {comment.likes_count > 0 && (
                <Text style={[
                  styles.actionText,
                  comment.user_has_liked && styles.likedText
                ]}>
                  {comment.likes_count}
                </Text>
              )}
            </TouchableOpacity>

            {canInteract && !isNested && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onReply(comment)}
              >
                <Ionicons name="chatbubble-outline" size={14} color="#8E8E93" />
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>
            )}

            {canDelete && onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={14} color="#FF3B30" />
                <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Nested replies */}
      {!isNested && visibleReplies.length > 0 && (
        <View style={styles.repliesContainer}>
          {visibleReplies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              onLike={onLike}
              onReply={onReply}
              onDelete={onDelete}
              isNested={true}
              canInteract={canInteract}
              canDelete={canDelete}
            />
          ))}

          {hiddenRepliesCount > 0 && onViewAllReplies && (
            <TouchableOpacity
              style={styles.viewMoreReplies}
              onPress={() => onViewAllReplies(comment)}
            >
              <Text style={styles.viewMoreText}>
                View {hiddenRepliesCount} more {hiddenRepliesCount === 1 ? 'reply' : 'replies'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  nestedContainer: {
    marginBottom: 12,
    marginLeft: 0,
  },
  commentRow: {
    flexDirection: 'row',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3fa6a6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  smallAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8E8E93',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  smallAvatarText: {
    fontSize: 12,
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  messageContent: {
    fontSize: 14,
    color: '#1C1C1E',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  likedText: {
    color: '#FF3B30',
  },
  deleteText: {
    color: '#FF3B30',
  },
  repliesContainer: {
    marginLeft: 46, // avatar width + margin
    marginTop: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#E5E5EA',
  },
  viewMoreReplies: {
    paddingVertical: 8,
  },
  viewMoreText: {
    fontSize: 13,
    color: '#3fa6a6',
    fontWeight: '500',
  },
});

export default CommentCard;
