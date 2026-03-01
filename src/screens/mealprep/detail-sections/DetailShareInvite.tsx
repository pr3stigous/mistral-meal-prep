import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../constants/mealPrepTheme';
import { inviteToEvent, inviteToEventByEmail } from '../../../services/mealPrepInviteService';
import { useFriends } from '../../../hooks/useFriends';
import { useAuth } from '../../../AuthContext';
import { EventAttendee } from '../hooks/useEventDetail';

interface DetailShareInviteProps {
  eventId: string;
  inviteToken: string | null | undefined;
  existingAttendees: EventAttendee[];
  onInviteSent: () => void;
}

export default function DetailShareInvite({ eventId, inviteToken, existingAttendees, onInviteSent }: DetailShareInviteProps) {
  const { user } = useAuth();
  const { useAcceptedFriends } = useFriends();
  const { data: friends = [] } = useAcceptedFriends();
  const [emailInput, setEmailInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());
  const [invitingFriendId, setInvitingFriendId] = useState<string | null>(null);

  const existingUserIds = new Set(existingAttendees.map(a => a.user_id));
  const availableFriends = friends.filter((f: any) => {
    const fId = f.friend_user_id || f.user_id;
    return !existingUserIds.has(fId) && !invitedFriendIds.has(fId);
  });

  const getFriendlyError = (error?: string): string => {
    if (!error) return 'Something went wrong. Please try again.';
    if (error.includes('Event not found')) return 'This event no longer exists.';
    if (error.includes('Only the host or co-leader')) return 'You don\'t have permission to invite people to this event.';
    if (error.includes('JWT') || error.includes('auth') || error.includes('not authenticated'))
      return 'Your session expired. Please close and reopen the app.';
    if (error.includes('network') || error.includes('fetch') || error.includes('Failed to fetch'))
      return 'No internet connection. Please check your network and try again.';
    return error;
  };

  const handleInviteFriend = async (friendId: string) => {
    if (!user?.id || invitingFriendId) return;
    setInvitingFriendId(friendId);
    try {
      const result = await inviteToEvent(user.id, eventId, [friendId]);
      if (result.success) {
        // Remove chip even if already invited (they're already in the event)
        setInvitedFriendIds(prev => new Set(prev).add(friendId));
        if (result.alreadyInvited) {
          Alert.alert('Already Invited', 'This person has already been invited to the event.');
        }
        onInviteSent();
      } else {
        Alert.alert('Invite Failed', getFriendlyError(result.error));
      }
    } catch (err: any) {
      Alert.alert('Invite Failed', getFriendlyError(err?.message));
    } finally {
      setInvitingFriendId(null);
    }
  };

  const handleEmailInvite = async () => {
    if (!emailInput.trim() || !user?.id) return;
    setIsSending(true);
    try {
      await inviteToEventByEmail(user.id, eventId, emailInput.trim());
      Alert.alert('Sent!', `Invitation sent to ${emailInput.trim()}`);
      setEmailInput('');
    } catch {
      Alert.alert('Error', 'Failed to send email invite.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Share & Invite</Text>

      {/* Friend chips */}
      {availableFriends.length > 0 && (
        <View style={styles.friendChips}>
          {availableFriends.slice(0, 8).map((friend: any) => {
            const fId = friend.friend_user_id || friend.user_id;
            const fName = friend.profiles?.name || friend.name || 'Friend';
            const initial = fName.charAt(0).toUpperCase();
            const isInviting = invitingFriendId === fId;
            return (
              <TouchableOpacity
                key={fId}
                style={[styles.friendChip, isInviting && styles.friendChipDisabled]}
                onPress={() => handleInviteFriend(fId)}
                disabled={isInviting}
              >
                {isInviting ? (
                  <ActivityIndicator size="small" color={mpColors.teal} style={{ width: 24, height: 24 }} />
                ) : (
                  <View style={styles.friendAvatar}>
                    <Text style={styles.friendAvatarText}>{initial}</Text>
                  </View>
                )}
                <Text style={styles.friendName} numberOfLines={1}>{fName}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Email invite */}
      <View style={styles.emailRow}>
        <TextInput
          style={styles.emailInput}
          placeholder="Invite by email..."
          placeholderTextColor={mpColors.gray400}
          value={emailInput}
          onChangeText={setEmailInput}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TouchableOpacity
          style={[styles.sendButton, (!emailInput.trim() || isSending) && styles.sendButtonDisabled]}
          onPress={handleEmailInvite}
          disabled={!emailInput.trim() || isSending}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.emailHint}>They'll get an invitation to join Wellbody and this event</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 12,
  },
  friendChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  friendChipDisabled: {
    opacity: 0.6,
  },
  friendAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: mpColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  friendName: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray700,
    maxWidth: 80,
  },
  emailRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  emailInput: {
    flex: 1,
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  sendButton: {
    backgroundColor: mpColors.teal,
    paddingHorizontal: 16,
    borderRadius: mpRadii.input,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  emailHint: {
    fontSize: 11,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginBottom: 14,
  },
});
