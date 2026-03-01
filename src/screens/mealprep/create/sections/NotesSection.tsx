import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';

interface NotesSectionProps {
  eventNotes: string;
  onChange: (updates: Partial<EventFormData>) => void;
}

const SUGGESTIONS = ['Parking available', 'BYOB', 'Bring containers', 'Kid-friendly', 'Pet-free zone'];

export default function NotesSection({ eventNotes, onChange }: NotesSectionProps) {
  const addSuggestion = (text: string) => {
    const separator = eventNotes.trim() ? '\n' : '';
    onChange({ eventNotes: eventNotes + separator + text });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Notes for Guests</Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s} style={styles.suggestionChip} onPress={() => addSuggestion(s)}>
            <Text style={styles.suggestionText}>+ {s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.textarea}
        placeholder="Anything guests should know..."
        placeholderTextColor={mpColors.gray400}
        value={eventNotes}
        onChangeText={(t) => onChange({ eventNotes: t })}
        multiline
        numberOfLines={4}
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
    marginBottom: 8,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  suggestionChip: {
    backgroundColor: mpColors.gray100,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
  },
  suggestionText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  textarea: {
    backgroundColor: mpColors.white,
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
