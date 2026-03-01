import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mpColors, mpFonts, mpSpacing } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';

interface DetailEventInfoProps {
  event: MealPrepEvent;
}

export default function DetailEventInfo({ event }: DetailEventInfoProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event.title}</Text>
      {event.description ? (
        <Text style={styles.description}>{event.description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  title: {
    fontSize: 22,
    fontFamily: mpFonts.bold,
    color: mpColors.gray900,
  },
  description: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    lineHeight: 18,
    marginTop: 4,
  },
});
