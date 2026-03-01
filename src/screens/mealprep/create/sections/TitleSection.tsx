import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';

interface TitleSectionProps {
  title: string;
  onChange: (updates: Partial<EventFormData>) => void;
  error?: string;
}

const MAX_TITLE_LENGTH = 80;

export default function TitleSection({ title, onChange, error }: TitleSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Event Title</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholder="e.g. Sunday Brisket Cook"
        placeholderTextColor={mpColors.gray400}
        value={title}
        onChangeText={(text) => onChange({ title: text.slice(0, MAX_TITLE_LENGTH) })}
        maxLength={MAX_TITLE_LENGTH}
      />
      <View style={styles.footer}>
        {error ? <Text style={styles.errorText}>{error}</Text> : <View />}
        <Text style={styles.counter}>{title.length}/{MAX_TITLE_LENGTH}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    marginBottom: 8,
  },
  input: {
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  inputError: {
    borderColor: mpColors.red,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  counter: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
  },
  errorText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.red,
  },
});
