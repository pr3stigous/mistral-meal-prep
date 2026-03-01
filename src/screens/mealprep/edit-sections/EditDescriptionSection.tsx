import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../../constants/mealPrepTheme';
import { EditEventFormData } from '../../../lib/eventFormTypes';

interface Props {
  description: string;
  onChange: (updates: Partial<EditEventFormData>) => void;
}

export default function EditDescriptionSection({ description, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={(text) => onChange({ description: text })}
        placeholder="Describe your event..."
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
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
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
    minHeight: 100,
  },
});
