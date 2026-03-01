import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mpColors, mpFonts, mpSpacing } from '../../../../constants/mealPrepTheme';

interface SectionDividerProps {
  title?: string;
}

export default function SectionDivider({ title }: SectionDividerProps) {
  return (
    <View style={styles.container}>
      {title ? (
        <Text style={styles.title}>{title}</Text>
      ) : (
        <View style={styles.line} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: mpSpacing.md,
    paddingHorizontal: mpSpacing.lg,
  },
  line: {
    height: 1,
    backgroundColor: mpColors.gray200,
  },
  title: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
