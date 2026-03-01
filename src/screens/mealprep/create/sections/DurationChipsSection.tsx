import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';

interface DurationChipsSectionProps {
  estimatedDurationMinutes: number;
  onChange: (updates: Partial<EventFormData>) => void;
}

const PRESETS = [
  { value: 60, label: '1 hr' },
  { value: 120, label: '2 hrs' },
  { value: 180, label: '3 hrs' },
];

export default function DurationChipsSection({ estimatedDurationMinutes, onChange }: DurationChipsSectionProps) {
  const isCustom = !PRESETS.some(p => p.value === estimatedDurationMinutes);
  const [showCustom, setShowCustom] = useState(isCustom);
  const [customText, setCustomText] = useState(isCustom ? estimatedDurationMinutes.toString() : '');

  const handlePreset = (value: number) => {
    setShowCustom(false);
    setCustomText('');
    onChange({ estimatedDurationMinutes: value });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Duration</Text>
      <View style={styles.chips}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.value}
            style={[styles.chip, estimatedDurationMinutes === p.value && !showCustom && styles.chipActive]}
            onPress={() => handlePreset(p.value)}
          >
            <Text style={[styles.chipText, estimatedDurationMinutes === p.value && !showCustom && styles.chipTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, showCustom && styles.chipActive]}
          onPress={() => {
            setShowCustom(true);
            setCustomText(estimatedDurationMinutes.toString());
          }}
        >
          <Text style={[styles.chipText, showCustom && styles.chipTextActive]}>Custom</Text>
        </TouchableOpacity>
      </View>
      {showCustom && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            placeholder="Minutes"
            placeholderTextColor={mpColors.gray400}
            keyboardType="number-pad"
            value={customText}
            onChangeText={(t) => {
              const cleaned = t.replace(/[^0-9]/g, '');
              setCustomText(cleaned);
              const n = parseInt(cleaned, 10);
              if (!isNaN(n) && n > 0) onChange({ estimatedDurationMinutes: n });
            }}
          />
          <Text style={styles.customLabel}>minutes</Text>
        </View>
      )}
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
    gap: 8,
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
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  customInput: {
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 100,
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  customLabel: {
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
});
