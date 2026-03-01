import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../constants/mealPrepTheme';

interface DetailDeleteEventProps {
  onDelete: () => void;
  isDeleting: boolean;
}

export default function DetailDeleteEvent({ onDelete, isDeleting }: DetailDeleteEventProps) {
  const handlePress = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.button} onPress={handlePress} disabled={isDeleting}>
        {isDeleting ? (
          <ActivityIndicator size="small" color={mpColors.red} />
        ) : (
          <>
            <Ionicons name="trash-outline" size={16} color={mpColors.red} />
            <Text style={styles.text}>Delete Event</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.xxl,
    paddingBottom: mpSpacing.xxl,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.red,
  },
  text: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.red,
  },
});
