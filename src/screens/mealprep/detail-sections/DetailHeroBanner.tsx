import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { mpColors, mpFonts, mpRadii } from '../../../constants/mealPrepTheme';
import { MealPrepEvent } from '../../../lib/types';

interface DetailHeroBannerProps {
  event: MealPrepEvent;
  canManage: boolean;
}

export default function DetailHeroBanner({ event, canManage }: DetailHeroBannerProps) {
  const emoji = event.hero_emoji || '🍳';
  const gradient = event.hero_gradient || ['#FFF6E5', '#FFECD2'];
  const status = (event as any).status || 'planning';

  return (
    <LinearGradient colors={gradient} style={styles.banner}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.statusBadge}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
      {canManage && (
        <View style={styles.hostBadge}>
          <Text style={styles.hostBadgeText}>★ Host</Text>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emoji: {
    fontSize: 64,
  },
  statusBadge: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    backgroundColor: mpColors.tealMist,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: mpRadii.pill,
  },
  statusText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.tealDark,
    textTransform: 'capitalize',
  },
  hostBadge: {
    position: 'absolute',
    top: 12,
    right: 16,
    backgroundColor: mpColors.amberLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: mpRadii.pill,
  },
  hostBadgeText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
  },
});
