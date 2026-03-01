import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { useEventComments } from '../../hooks/useEventComments';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'ReplyToComment'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'ReplyToComment'>;

const MAX_CHARS = 500;

const ReplyToCommentScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { eventId, parentCommentId, parentAuthor, parentContent } = route.params;
  const { addComment, isAddingComment } = useEventComments(eventId);

  const [content, setContent] = useState('');

  const handlePost = async () => {
    if (!content.trim()) return;

    try {
      await addComment({ content: content.trim(), parentId: parentCommentId });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to post reply. Please try again.');
    }
  };

  const handleCancel = () => {
    if (content.trim()) {
      Alert.alert(
        'Discard Reply?',
        'Your reply will not be saved.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const charsRemaining = MAX_CHARS - content.length;
  const canPost = content.trim().length > 0 && !isAddingComment;

  // Truncate parent content if too long
  const truncatedParentContent = parentContent.length > 150
    ? parentContent.substring(0, 150) + '...'
    : parentContent;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reply</Text>
          <TouchableOpacity
            onPress={handlePost}
            style={[styles.headerButton, !canPost && styles.disabledButton]}
            disabled={!canPost}
          >
            {isAddingComment ? (
              <ActivityIndicator size="small" color="#3fa6a6" />
            ) : (
              <Text style={[styles.postText, !canPost && styles.disabledText]}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Parent comment preview */}
        <View style={styles.parentPreview}>
          <Text style={styles.replyingToLabel}>Replying to</Text>
          <View style={styles.parentCard}>
            <Text style={styles.parentAuthor}>{parentAuthor}</Text>
            <Text style={styles.parentContent}>{truncatedParentContent}</Text>
          </View>
        </View>

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Write your reply..."
            placeholderTextColor="#8E8E93"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={MAX_CHARS}
            autoFocus
            textAlignVertical="top"
          />
        </View>

        {/* Character count */}
        <View style={styles.footer}>
          <Text style={[
            styles.charCount,
            charsRemaining < 50 && styles.charCountWarning,
            charsRemaining < 0 && styles.charCountError,
          ]}>
            {charsRemaining} characters remaining
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  cancelText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  postText: {
    fontSize: 16,
    color: '#3fa6a6',
    fontWeight: '600',
    textAlign: 'right',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#C7C7CC',
  },
  parentPreview: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  replyingToLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
  },
  parentCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3fa6a6',
  },
  parentAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  parentContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    lineHeight: 24,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  charCount: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'right',
  },
  charCountWarning: {
    color: '#FF9500',
  },
  charCountError: {
    color: '#FF3B30',
  },
});

export default ReplyToCommentScreen;
