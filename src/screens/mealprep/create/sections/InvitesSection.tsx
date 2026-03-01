import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';
import { useFriends } from '../../../../hooks/useFriends';

interface InvitesSectionProps {
  invitedUserIds: string[];
  onChange: (updates: Partial<EventFormData>) => void;
}

export default function InvitesSection({ invitedUserIds, onChange }: InvitesSectionProps) {
  const { useAcceptedFriends } = useFriends();
  const { data: friends = [] } = useAcceptedFriends();

  const toggleInvite = (userId: string) => {
    const next = invitedUserIds.includes(userId)
      ? invitedUserIds.filter(id => id !== userId)
      : [...invitedUserIds, userId];
    onChange({ invitedUserIds: next });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Invite WellPals</Text>
      <Text style={styles.sublabel}>Tap to invite. They'll be auto-approved.</Text>

      {friends.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={28} color={mpColors.gray300} />
          <Text style={styles.emptyText}>No friends yet. You can invite people after publishing via share link.</Text>
        </View>
      ) : (
        <View style={styles.chipContainer}>
          {friends.map((friend: any) => {
            const friendId = friend.friend_user_id || friend.user_id;
            const friendName = friend.profiles?.name || friend.name || 'Friend';
            const isInvited = invitedUserIds.includes(friendId);
            const initial = friendName.charAt(0).toUpperCase();
            return (
              <TouchableOpacity
                key={friendId}
                style={[styles.chip, isInvited && styles.chipActive]}
                onPress={() => toggleInvite(friendId)}
              >
                <View style={[styles.avatar, isInvited && styles.avatarActive]}>
                  <Text style={[styles.avatarText, isInvited && styles.avatarTextActive]}>{initial}</Text>
                </View>
                <Text style={[styles.chipName, isInvited && styles.chipNameActive]} numberOfLines={1}>
                  {friendName}
                </Text>
                {isInvited && (
                  <Ionicons name="checkmark-circle" size={16} color={mpColors.teal} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {invitedUserIds.length > 0 && (
        <Text style={styles.countText}>{invitedUserIds.length} invited</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    marginBottom: 2,
  },
  sublabel: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginBottom: 10,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingRight: 12,
  },
  chipActive: {
    borderColor: mpColors.teal,
    backgroundColor: mpColors.tealMist,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: mpColors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: {
    backgroundColor: mpColors.teal,
  },
  avatarText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  avatarTextActive: {
    color: mpColors.white,
  },
  chipName: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray700,
    maxWidth: 100,
  },
  chipNameActive: {
    color: mpColors.tealDark,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    textAlign: 'center',
  },
  countText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
    marginTop: 8,
  },
});
