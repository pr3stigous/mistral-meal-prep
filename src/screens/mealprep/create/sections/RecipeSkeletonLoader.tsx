import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { mpColors, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';

export default function RecipeSkeletonLoader() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const Shimmer = ({ style }: { style: any }) => (
    <Animated.View style={[styles.shimmer, style, { opacity }]} />
  );

  return (
    <View style={styles.container}>
      {/* Recipe card skeleton */}
      <View style={styles.card}>
        <Shimmer style={styles.cardTitle} />
        <Shimmer style={styles.cardDesc} />
        <View style={styles.cardStats}>
          <Shimmer style={styles.cardStat} />
          <Shimmer style={styles.cardStat} />
          <Shimmer style={styles.cardStat} />
          <Shimmer style={styles.cardStat} />
        </View>
      </View>

      {/* Contribution skeleton */}
      <View style={styles.card}>
        <Shimmer style={styles.cardTitle} />
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={styles.listRow}>
            <Shimmer style={styles.listDot} />
            <Shimmer style={styles.listLine} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingTop: 8,
  },
  shimmer: {
    backgroundColor: mpColors.gray200,
    borderRadius: 6,
  },
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    width: '60%',
    height: 16,
  },
  cardDesc: {
    width: '90%',
    height: 12,
  },
  cardStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  cardStat: {
    width: 50,
    height: 32,
    borderRadius: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listLine: {
    flex: 1,
    height: 12,
  },
});
