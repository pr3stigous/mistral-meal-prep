import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../../constants/mealPrepTheme';

interface Requirement {
  id: string;
  description: string;
  type: string;
}

interface Props {
  eventNotes?: string;
  requirements: Requirement[];
}

export default function DetailNotesRequirements({ eventNotes, requirements }: Props) {
  const hasNotes = !!eventNotes?.trim();
  const hasRequirements = requirements.length > 0;

  if (!hasNotes && !hasRequirements) return null;

  const getTypeBadgeStyle = (type: string) => {
    if (type === 'action_required') {
      return { bg: mpColors.amberLight, text: mpColors.amber };
    }
    return { bg: mpColors.tealLight, text: mpColors.teal };
  };

  return (
    <View style={styles.container}>
      {/* Notes */}
      {hasNotes && (
        <View style={styles.notesCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={16} color={mpColors.gray500} />
            <Text style={styles.sectionTitle}>Notes</Text>
          </View>
          <Text style={styles.notesText}>{eventNotes}</Text>
        </View>
      )}

      {/* Requirements */}
      {hasRequirements && (
        <View style={styles.requirementsCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="clipboard-outline" size={16} color={mpColors.gray500} />
            <Text style={styles.sectionTitle}>Requirements</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{requirements.length}</Text>
            </View>
          </View>
          {requirements.map(req => {
            const badge = getTypeBadgeStyle(req.type);
            return (
              <View key={req.id} style={styles.reqRow}>
                <View style={[styles.reqTypeBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.reqTypeBadgeText, { color: badge.text }]}>
                    {req.type === 'action_required' ? 'Action' : 'Bring'}
                  </Text>
                </View>
                <Text style={styles.reqDesc} numberOfLines={2}>{req.description}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
    gap: 12,
  },
  notesCard: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    padding: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
  },
  notesText: {
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray600,
    lineHeight: 20,
  },
  requirementsCard: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    padding: 14,
  },
  countBadge: {
    backgroundColor: mpColors.gray100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  countText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray400,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray100,
  },
  reqTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  reqTypeBadgeText: {
    fontSize: 10,
    fontFamily: mpFonts.semiBold,
    letterSpacing: 0.3,
  },
  reqDesc: {
    flex: 1,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
});
