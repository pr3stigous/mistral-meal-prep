import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';

interface SelectedCountBannerProps {
  count: number;
  maxCount: number;
  libraryCount: number;
  importedCount: number;
}

export default function SelectedCountBanner({
  count,
  maxCount,
  libraryCount,
  importedCount,
}: SelectedCountBannerProps) {
  if (count === 0) return null;

  const rightText = libraryCount > 0 && importedCount > 0
    ? `${libraryCount} saved \u00B7 ${importedCount} imported`
    : `${maxCount} max`;

  return (
    <View style={styles.banner}>
      <Text style={styles.countText}>
        {count} selected
      </Text>
      <Text style={styles.rightText}>{rightText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: mpColors.tealMist,
    borderRadius: mpRadii.sm,
    paddingHorizontal: mpSpacing.md,
    paddingVertical: mpSpacing.sm,
    marginBottom: mpSpacing.sm,
  },
  countText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.tealDark,
  },
  rightText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.tealDark,
  },
});
