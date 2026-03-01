import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mpColors, mpFonts, mpSpacing } from '../../../constants/mealPrepTheme';
import { EventAttendee } from '../hooks/useEventDetail';

interface DetailAttendeesRowProps {
  attendees: EventAttendee[];
  hostName?: string;
  maxAttendees?: number | null;
}

const AVATAR_COLORS = [mpColors.teal, mpColors.coral, mpColors.purple, mpColors.blue, mpColors.green, mpColors.amber];

export default function DetailAttendeesRow({ attendees, hostName, maxAttendees }: DetailAttendeesRowProps) {
  const spotsLeft = maxAttendees ? Math.max(0, maxAttendees - attendees.length) : null;

  return (
    <View style={styles.container}>
      <View style={styles.avatars}>
        {attendees.slice(0, 5).map((att, i) => {
          const name = att.profiles?.name || att.profiles?.username || 'U';
          const initial = name.charAt(0).toUpperCase();
          return (
            <View key={att.id} style={[styles.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i > 0 ? -8 : 0 }]}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
          );
        })}
        {attendees.length > 5 && (
          <View style={[styles.avatar, { backgroundColor: mpColors.gray300, marginLeft: -8 }]}>
            <Text style={styles.avatarText}>+{attendees.length - 5}</Text>
          </View>
        )}
      </View>
      <Text style={styles.text}>
        {hostName ? `${hostName} is hosting` : `${attendees.length} attending`}
        {spotsLeft !== null ? ` \u2022 ${spotsLeft} spots left` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
    gap: 10,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: mpColors.white,
  },
  avatarText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  text: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    flex: 1,
  },
});
