import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows, mpGradients } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';

const AVATAR_COLORS = [mpColors.teal, mpColors.coral, mpColors.purple, mpColors.blue, mpColors.amber, mpColors.green];

interface FeaturedEventCardProps {
  event: MealPrepEvent;
  role: 'host' | 'attending';
  attendeeNames?: string[];
  onPress: () => void;
}

export default function FeaturedEventCard({ event, role, attendeeNames = [], onPress }: FeaturedEventCardProps) {
  const gradient = event.hero_gradient && event.hero_gradient.length >= 2
    ? event.hero_gradient
    : mpGradients.warm;
  const emoji = event.hero_emoji || '\u{1F373}';

  // Parse date
  const dateObj = event.event_date ? new Date(event.event_date + 'T00:00:00') : null;
  const dayNum = dateObj ? dateObj.getDate() : '';
  const monthAbbr = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';

  // Format time
  const timeStr = event.event_time
    ? new Date(`2000-01-01T${event.event_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  const skillLevel = event.skill_level;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <LinearGradient colors={gradient as [string, string]} style={styles.imageArea}>
        <Text style={styles.emoji}>{emoji}</Text>
        {/* Date pill */}
        {dateObj && (
          <View style={styles.datePill}>
            <Text style={styles.datePillDay}>{dayNum}</Text>
            <Text style={styles.datePillMonth}>{monthAbbr}</Text>
          </View>
        )}
        {/* Role pill */}
        <View style={[styles.rolePill, role === 'host' ? styles.rolePillHost : styles.rolePillAttending]}>
          <Text style={styles.rolePillText}>
            {role === 'host' ? 'HOSTING' : 'ATTENDING'}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={mpColors.gray400} />
          <Text style={styles.metaText} numberOfLines={1}>
            {event.location_city || 'TBD'}{timeStr ? ` \u00B7 ${timeStr}` : ''}
          </Text>
        </View>

        <View style={styles.footer}>
          {/* Attendee dots */}
          <View style={styles.attendeeDots}>
            {attendeeNames.slice(0, 4).map((name, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i === 0 ? 0 : -6 },
                ]}
              >
                <Text style={styles.dotText}>{(name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            ))}
            {attendeeNames.length > 4 && (
              <View style={[styles.dot, styles.dotMore, { marginLeft: -6 }]}>
                <Text style={styles.dotMoreText}>+{attendeeNames.length - 4}</Text>
              </View>
            )}
          </View>

          {/* Skill tag */}
          {skillLevel && (
            <View style={[
              styles.skillTag,
              skillLevel === 'beginner' ? styles.skillBeginner
                : skillLevel === 'intermediate' ? styles.skillIntermediate
                : styles.skillAdvanced,
            ]}>
              <Text style={[
                styles.skillTagText,
                skillLevel === 'beginner' ? styles.skillBeginnerText
                  : skillLevel === 'intermediate' ? styles.skillIntermediateText
                  : styles.skillAdvancedText,
              ]}>
                {skillLevel.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 200,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    borderWidth: 1.5,
    borderColor: 'rgba(63, 166, 166, 0.12)',
    overflow: 'hidden',
    ...mpShadows.sm,
  },
  imageArea: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emoji: {
    fontSize: 36,
  },
  datePill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  datePillDay: {
    fontSize: 16,
    fontFamily: mpFonts.bold,
    color: mpColors.tealDark,
    lineHeight: 18,
  },
  datePillMonth: {
    fontSize: 11,
    fontFamily: mpFonts.bold,
    color: mpColors.gray700,
    lineHeight: 13,
  },
  rolePill: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  rolePillHost: {
    backgroundColor: 'rgba(230, 147, 10, 0.9)',
  },
  rolePillAttending: {
    backgroundColor: 'rgba(63, 166, 166, 0.9)',
  },
  rolePillText: {
    fontSize: 9,
    fontFamily: mpFonts.bold,
    color: mpColors.white,
    letterSpacing: 0.5,
  },
  body: {
    padding: 10,
  },
  title: {
    fontSize: 14,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attendeeDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: mpColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    fontSize: 9,
    fontFamily: mpFonts.bold,
    color: mpColors.white,
  },
  dotMore: {
    backgroundColor: mpColors.gray300,
  },
  dotMoreText: {
    fontSize: 8,
    fontFamily: mpFonts.bold,
    color: mpColors.white,
  },
  skillTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  skillBeginner: { backgroundColor: mpColors.greenLight },
  skillIntermediate: { backgroundColor: mpColors.amberLight },
  skillAdvanced: { backgroundColor: mpColors.coralLight },
  skillTagText: {
    fontSize: 10,
    fontFamily: mpFonts.bold,
  },
  skillBeginnerText: { color: '#166534' },
  skillIntermediateText: { color: '#92400E' },
  skillAdvancedText: { color: '#991B1B' },
});
