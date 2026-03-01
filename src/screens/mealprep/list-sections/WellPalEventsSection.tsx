import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mpColors, mpFonts } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';
import EventRow from './EventRow';

interface WellPalEventsSectionProps {
  events: MealPrepEvent[];
  onEventPress: (eventId: string) => void;
}

export default function WellPalEventsSection({ events, onEventPress }: WellPalEventsSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>WellPal Events</Text>
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No events from your WellPals yet</Text>
          <Text style={styles.emptySubtext}>When friends host events, they'll appear here</Text>
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
  },
  emptyText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
  },
});
