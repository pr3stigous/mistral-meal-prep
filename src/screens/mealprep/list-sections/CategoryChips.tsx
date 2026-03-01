import React from 'react';
import { ScrollView, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { mpColors, mpFonts, mpRadii } from '../../../constants/mealPrepTheme';

const CATEGORIES = [
  { label: 'All', emoji: '' },
  { label: 'Mexican', emoji: '\u{1F32E}' },
  { label: 'BBQ', emoji: '\u{1F356}' },
  { label: 'Vegan', emoji: '\u{1F957}' },
  { label: 'Asian', emoji: '\u{1F35C}' },
  { label: 'Italian', emoji: '\u{1F35D}' },
  { label: 'Indian', emoji: '\u{1F35B}' },
  { label: 'Comfort', emoji: '\u{1F372}' },
];

interface CategoryChipsProps {
  selected: string;
  onSelect: (category: string) => void;
}

export default function CategoryChips({ selected, onSelect }: CategoryChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {CATEGORIES.map((cat) => {
        const isActive = selected === cat.label;
        return (
          <TouchableOpacity
            key={cat.label}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onSelect(cat.label)}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {cat.emoji ? `${cat.emoji} ${cat.label}` : cat.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: mpRadii.pill,
    backgroundColor: mpColors.white,
    borderWidth: 1.5,
    borderColor: mpColors.gray200,
  },
  chipActive: {
    backgroundColor: mpColors.teal,
    borderColor: mpColors.teal,
  },
  chipText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  chipTextActive: {
    color: mpColors.white,
  },
});
