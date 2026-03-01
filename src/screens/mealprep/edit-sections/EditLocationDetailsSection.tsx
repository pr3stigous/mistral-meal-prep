import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../../constants/mealPrepTheme';
import { EditEventFormData } from '../../../lib/eventFormTypes';

interface Props {
  locationDetailsForAttendees: string;
  onChange: (updates: Partial<EditEventFormData>) => void;
}

export default function EditLocationDetailsSection({ locationDetailsForAttendees, onChange }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="location-outline" size={18} color={mpColors.gray600} />
        <Text style={styles.label}>Location Details for Attendees</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>POST-PUBLISH</Text>
        </View>
      </View>
      <Text style={styles.hint}>Only visible to approved attendees</Text>
      <TextInput
        style={styles.input}
        value={locationDetailsForAttendees}
        onChangeText={(text) => onChange({ locationDetailsForAttendees: text })}
        placeholder="e.g., Apartment buzzer #123, park by the red bench"
        placeholderTextColor={mpColors.gray400}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    flex: 1,
  },
  badge: {
    backgroundColor: mpColors.purpleLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: mpFonts.semiBold,
    color: mpColors.purple,
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginBottom: mpSpacing.sm,
  },
  input: {
    backgroundColor: mpColors.gray50,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    minHeight: 80,
  },
});
