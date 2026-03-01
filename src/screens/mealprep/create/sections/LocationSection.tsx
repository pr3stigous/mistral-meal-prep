import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';

interface LocationSectionProps {
  locationCity: string;
  locationState: string;
  locationCountry: string;
  locationDescription: string;
  onChange: (updates: Partial<EventFormData>) => void;
  error?: string;
}

export default function LocationSection({
  locationCity,
  locationState,
  locationCountry,
  locationDescription,
  onChange,
  error,
}: LocationSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Location</Text>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={mpColors.gray400} style={styles.searchIcon} />
        <TextInput
          style={[styles.input, styles.searchInput, error ? styles.inputError : null]}
          placeholder="City *"
          placeholderTextColor={mpColors.gray400}
          value={locationCity}
          onChangeText={(t) => onChange({ locationCity: t })}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="State / Province"
          placeholderTextColor={mpColors.gray400}
          value={locationState}
          onChangeText={(t) => onChange({ locationState: t })}
        />
        <TextInput
          style={[styles.input, styles.halfInput]}
          placeholder="Country"
          placeholderTextColor={mpColors.gray400}
          value={locationCountry}
          onChangeText={(t) => onChange({ locationCountry: t })}
        />
      </View>

      <TextInput
        style={[styles.input, styles.descInput]}
        placeholder="Address or description (optional)"
        placeholderTextColor={mpColors.gray400}
        value={locationDescription}
        onChangeText={(t) => onChange({ locationDescription: t })}
        multiline
        numberOfLines={2}
      />
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 1,
  },
  input: {
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingLeft: 38,
  },
  inputError: {
    borderColor: mpColors.red,
  },
  errorText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.red,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  descInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
});
