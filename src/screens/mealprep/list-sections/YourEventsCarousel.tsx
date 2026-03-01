import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { mpColors, mpFonts } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';
import FeaturedEventCard from './FeaturedEventCard';

interface EventWithRole extends MealPrepEvent {
  _role: 'host' | 'attending';
  _attendeeNames: string[];
}

interface YourEventsCarouselProps {
  events: EventWithRole[];
  onEventPress: (eventId: string) => void;
}

export default function YourEventsCarousel({ events, onEventPress }: YourEventsCarouselProps) {
  if (events.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Your Events</Text>
      </View>
      <FlatList
        data={events}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeaturedEventCard
            event={item}
            role={item._role}
            attendeeNames={item._attendeeNames}
            onPress={() => onEventPress(item.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  list: {
    paddingHorizontal: 20,
  },
});
