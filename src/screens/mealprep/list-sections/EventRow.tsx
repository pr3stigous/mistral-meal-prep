import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';

interface EventRowProps {
  event: MealPrepEvent;
  onPress: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  planning: { bg: mpColors.tealLight, text: mpColors.tealDark, label: 'Planning' },
  active: { bg: mpColors.greenLight, text: '#166534', label: 'Active' },
  open_for_registration: { bg: mpColors.greenLight, text: '#166534', label: 'Open' },
  completed: { bg: mpColors.gray100, text: mpColors.gray500, label: 'Completed' },
  cancelled: { bg: mpColors.redLight, text: mpColors.red, label: 'Cancelled' },
};

export default function EventRow({ event, onPress }: EventRowProps) {
  const dateObj = event.event_date ? new Date(event.event_date + 'T00:00:00') : null;
  const dayNum = dateObj ? dateObj.getDate() : '';
  const monthAbbr = dateObj ? dateObj.toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';

  const timeStr = event.event_time
    ? new Date(`2000-01-01T${event.event_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  const statusStyle = STATUS_STYLES[event.status] || STATUS_STYLES.planning;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      {/* Date block */}
      <View style={styles.dateBlock}>
        <Text style={styles.dateMonth}>{monthAbbr}</Text>
        <Text style={styles.dateDay}>{dayNum}</Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={mpColors.gray400} />
          <Text style={styles.metaText} numberOfLines={1}>
            {event.location_city || 'TBD'}{timeStr ? ` \u00B7 ${timeStr}` : ''}
          </Text>
        </View>
      </View>

      {/* Status badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
        <Text style={[styles.statusText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={mpColors.gray300} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.button,
    padding: 12,
    marginBottom: 10,
    ...mpShadows.xs,
  },
  dateBlock: {
    width: 46,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: mpColors.tealMist,
    marginRight: 12,
  },
  dateMonth: {
    fontSize: 10,
    fontFamily: mpFonts.bold,
    color: mpColors.teal,
    textTransform: 'uppercase',
  },
  dateDay: {
    fontSize: 20,
    fontFamily: mpFonts.bold,
    color: mpColors.tealDark,
    lineHeight: 24,
  },
  body: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontFamily: mpFonts.bold,
  },
});
