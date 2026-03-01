import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mpColors, mpFonts } from '../../../constants/mealPrepTheme';

export default function ListPageTitle() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>Find your next cook session</Text>
      <Text style={styles.title}>Meal Prep Events</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray400,
    marginBottom: 2,
  },
  title: {
    fontSize: 22,
    fontFamily: mpFonts.bold,
    color: mpColors.gray900,
  },
});
