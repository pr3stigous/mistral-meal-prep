import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';
import { DIETARY_OPTIONS } from '../../../../lib/eventWizardTypes';

interface DietarySectionProps {
  dietaryAccommodations: string[];
  onChange: (updates: Partial<EventFormData>) => void;
}

export default function DietarySection({ dietaryAccommodations, onChange }: DietarySectionProps) {
  const toggle = (value: string) => {
    const next = dietaryAccommodations.includes(value)
      ? dietaryAccommodations.filter(d => d !== value)
      : [...dietaryAccommodations, value];
    onChange({ dietaryAccommodations: next });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Dietary Accommodations</Text>
      <View style={styles.chips}>
        {DIETARY_OPTIONS.map(opt => {
          const isSelected = dietaryAccommodations.includes(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[styles.chip, isSelected && styles.chipActive]}
              onPress={() => toggle(opt)}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: mpRadii.pill,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    backgroundColor: mpColors.white,
  },
  chipActive: {
    backgroundColor: mpColors.tealMist,
    borderColor: mpColors.teal,
  },
  chipText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: mpColors.tealDark,
  },
});
