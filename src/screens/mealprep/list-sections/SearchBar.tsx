import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';

interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={16} color={mpColors.gray400} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder="Search events..."
        placeholderTextColor={mpColors.gray400}
        value={value}
        onChangeText={onChange}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color={mpColors.gray400} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.button,
    borderWidth: 1.5,
    borderColor: mpColors.gray200,
    ...mpShadows.xs,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
    padding: 0,
  },
});
