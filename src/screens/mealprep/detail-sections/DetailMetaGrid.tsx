import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';

interface DetailMetaGridProps {
  event: MealPrepEvent;
  isApproved: boolean;
  canManage: boolean;
  attendeeStatus?: string | null;
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTime = (timeStr: string | null) => {
  if (!timeStr) return 'TBD';
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(); d.setHours(h, m);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export default function DetailMetaGrid({ event, isApproved, canManage, attendeeStatus }: DetailMetaGridProps) {
  const showFullLocation = isApproved || canManage || event.address_visibility === 'now';
  const locationNote = attendeeStatus === 'pending' ? 'visible after approval' : 'visible after RSVP';
  const location = showFullLocation
    ? [event.location, (event as any).location_city, (event as any).location_state].filter(Boolean).join(', ') || 'No location set'
    : (event as any).location_city || locationNote;

  const rows = [
    {
      icon: 'calendar-outline' as const,
      iconBg: mpColors.coralLight,
      iconColor: mpColors.coral,
      label: 'Date',
      value: formatDate(event.event_date),
    },
    {
      icon: 'time-outline' as const,
      iconBg: mpColors.purpleLight,
      iconColor: mpColors.purple,
      label: 'Time',
      value: `${formatTime(event.event_time)}${event.event_end_time ? ` \u2013 ${formatTime(event.event_end_time)}` : ''}`,
    },
    {
      icon: 'location-outline' as const,
      iconBg: mpColors.blueLight,
      iconColor: mpColors.blue,
      label: 'Location',
      value: location,
      note: !showFullLocation ? locationNote : undefined,
    },
    {
      icon: 'people-outline' as const,
      iconBg: mpColors.greenLight,
      iconColor: mpColors.green,
      label: 'Group',
      value: event.expected_participants || 'Open',
    },
  ];

  return (
    <View style={styles.container}>
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.iconBox, { backgroundColor: row.iconBg }]}>
            <Ionicons name={row.icon} size={18} color={row.iconColor} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.label}>{row.label}</Text>
            <Text style={styles.value}>{row.value}</Text>
            {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.button,
    padding: 12,
    ...mpShadows.xs,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
  },
  value: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginTop: 1,
  },
  note: {
    fontSize: 11,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
