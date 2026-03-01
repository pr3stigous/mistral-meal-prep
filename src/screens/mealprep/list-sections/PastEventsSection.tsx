import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';
import EventRow from './EventRow';

interface PastEventsSectionProps {
  events: MealPrepEvent[];
  userId: string;
  onEventPress: (eventId: string) => void;
}

export default function PastEventsSection({ events, userId, onEventPress }: PastEventsSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Past Events</Text>
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={28} color={mpColors.gray300} />
          <Text style={styles.emptyText}>No past events yet</Text>
          <Text style={styles.emptySubtext}>Your completed events will appear here</Text>
        </View>
      ) : (
        events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            onPress={() => onEventPress(event.id)}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 6,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
  },
});
