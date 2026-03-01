import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData, ParticipantRange } from '../../../../lib/eventFormTypes';

interface GroupSizeSectionProps {
  expectedParticipants: ParticipantRange;
  customParticipantCount?: number;
  onChange: (updates: Partial<EventFormData>) => void;
}

const PRESET_OPTIONS: { value: ParticipantRange; label: string }[] = [
  { value: '2-4', label: '2-4' },
  { value: '5-8', label: '5-8' },
  { value: '9-12', label: '9-12' },
];

export default function GroupSizeSection({ expectedParticipants, customParticipantCount, onChange }: GroupSizeSectionProps) {
  const isCustom = expectedParticipants === 'custom';
  const [customInput, setCustomInput] = useState(
    customParticipantCount ? String(customParticipantCount) : ''
  );

  const handleCustomPress = () => {
    onChange({ expectedParticipants: 'custom' as ParticipantRange });
  };

  const handleCustomChange = (text: string) => {
    // Allow only digits
    const digits = text.replace(/[^0-9]/g, '');
    setCustomInput(digits);
    const num = parseInt(digits, 10);
    if (!isNaN(num) && num > 0) {
      onChange({ customParticipantCount: num });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Group Size</Text>
      <View style={styles.chips}>
        {PRESET_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.chip, expectedParticipants === opt.value && styles.chipActive]}
            onPress={() => onChange({ expectedParticipants: opt.value, customParticipantCount: undefined })}
          >
            <Text style={[styles.chipText, expectedParticipants === opt.value && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.chip, isCustom && styles.chipActive]}
          onPress={handleCustomPress}
        >
          <Text style={[styles.chipText, isCustom && styles.chipTextActive]}>
            Custom
          </Text>
        </TouchableOpacity>
      </View>
      {isCustom && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.customInput}
            value={customInput}
            onChangeText={handleCustomChange}
            placeholder="Enter number of guests"
            placeholderTextColor={mpColors.gray400}
            keyboardType="number-pad"
            maxLength={3}
            autoFocus
          />
          {customInput ? (
            <Text style={styles.customHint}>{customInput} people</Text>
          ) : null}
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
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    backgroundColor: mpColors.white,
  },
  customHint: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
  },
});
