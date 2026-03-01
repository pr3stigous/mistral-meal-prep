import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts } from '../../constants/mealPrepTheme';

interface PrepScoreCubesProps {
  score: number; // 1-5
  size?: number;
  showLabel?: boolean;
}

export default function PrepScoreCubes({ score, size = 20, showLabel = true }: PrepScoreCubesProps) {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map(i => (
        <Ionicons
          key={i}
          name={i <= score ? 'cube' : 'cube-outline'}
          size={size}
          color={i <= score ? mpColors.teal : mpColors.gray300}
        />
      ))}
      {showLabel && (
        <Text style={styles.label}>{score}/5</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    marginLeft: 6,
  },
});
