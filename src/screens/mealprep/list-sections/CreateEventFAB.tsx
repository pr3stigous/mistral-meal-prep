import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpRadii } from '../../../constants/mealPrepTheme';

interface CreateEventFABProps {
  onPress: () => void;
}

export default function CreateEventFAB({ onPress }: CreateEventFABProps) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="add" size={24} color={mpColors.white} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: mpRadii.card,
    backgroundColor: mpColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: mpColors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
});
