import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';
import { SkillLevel } from '../../../../lib/types';

interface SkillLevelSectionProps {
  skillLevel: SkillLevel | null;
  onChange: (updates: Partial<EventFormData>) => void;
}

const OPTIONS: { value: SkillLevel; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export default function SkillLevelSection({ skillLevel, onChange }: SkillLevelSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Skill Level</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, skillLevel === opt.value && styles.chipActive]}
            onPress={() => onChange({ skillLevel: opt.value })}
          >
            <Text style={[styles.chipText, skillLevel === opt.value && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: mpSpacing.lg,
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
    gap: 8,
    paddingRight: mpSpacing.lg,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  chipTextActive: {
    color: mpColors.tealDark,
  },
});
