import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';

interface DetailCapacityCardProps {
  participantCount: number;
  pickupOnlyCount: number;
  maxParticipants: number | null;
  pendingCount: number;
}

export default function DetailCapacityCard({ participantCount, pickupOnlyCount, maxParticipants, pendingCount }: DetailCapacityCardProps) {
  const total = participantCount + pickupOnlyCount;
  const max = maxParticipants || 8;
  const progressPct = Math.min((total / max) * 100, 100);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="people" size={18} color={mpColors.teal} />
          <Text style={styles.title}>Capacity</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Participants</Text>
          <Text style={styles.value}>{participantCount} / {max}</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>
        {pendingCount > 0 && (
          <View style={styles.pendingRow}>
            <Text style={styles.pendingLabel}>Pending requests</Text>
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 16,
    ...mpShadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
  value: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  progressBar: {
    height: 6,
    backgroundColor: mpColors.gray100,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: mpColors.teal,
    borderRadius: 3,
  },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  pendingLabel: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
  pendingBadge: {
    backgroundColor: mpColors.amberLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  pendingBadgeText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
  },
});
