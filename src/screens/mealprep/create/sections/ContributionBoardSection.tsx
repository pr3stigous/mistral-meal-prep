import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../../constants/mealPrepTheme';
import { EventFormData, ContributionItem } from '../../../../lib/eventFormTypes';
import ContributionRow from '../../../../components/mealprep/ContributionRow';

interface ContributionBoardSectionProps {
  contributions: ContributionItem[];
  onChange: (updates: Partial<EventFormData>) => void;
}

const CATEGORY_LABELS: Record<string, { label: string; emoji: string }> = {
  proteins: { label: 'Protein', emoji: '\uD83E\uDD69' },
  produce: { label: 'Produce', emoji: '\uD83E\uDD66' },
  dairy: { label: 'Dairy', emoji: '\uD83E\uDDC8' },
  pantry: { label: 'Pantry', emoji: '\uD83E\uDDC2' },
  frozen: { label: 'Frozen', emoji: '\u2744\uFE0F' },
  other: { label: 'Other', emoji: '\uD83D\uDCE6' },
  equipment: { label: 'Equipment', emoji: '\uD83C\uDF73' },
};

const MAX_VISIBLE = 8;

export default function ContributionBoardSection({ contributions, onChange }: ContributionBoardSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (contributions.length === 0) return null;

  const toggleOwnership = (id: string) => {
    const updated = contributions.map(c => {
      if (c.id !== id) return c;
      return {
        ...c,
        ownership: c.ownership === 'host_provides' ? 'needs_volunteer' as const : 'host_provides' as const,
      };
    });
    onChange({ contributions: updated });
  };

  // Group by category
  const grouped = contributions.reduce<Record<string, ContributionItem[]>>((acc, item) => {
    const key = item.category;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const categories = Object.keys(grouped);
  const totalItems = contributions.length;
  const shouldCollapse = totalItems > MAX_VISIBLE && !expanded;

  // Flatten for display
  let displayItems: { type: 'header'; category: string } | { type: 'item'; item: ContributionItem }[] = [];
  let count = 0;
  for (const cat of categories) {
    displayItems.push({ type: 'header', category: cat } as any);
    for (const item of grouped[cat]) {
      if (shouldCollapse && count >= MAX_VISIBLE) break;
      displayItems.push({ type: 'item', item } as any);
      count++;
    }
    if (shouldCollapse && count >= MAX_VISIBLE) break;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Contribution Board</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>auto-generated</Text>
        </View>
      </View>

      <View style={styles.card}>
        {displayItems.map((entry, idx) => {
          if ((entry as any).type === 'header') {
            const cat = (entry as any).category;
            const info = CATEGORY_LABELS[cat] || { label: cat, emoji: '' };
            return (
              <View key={`h-${cat}`} style={styles.categoryHeader}>
                <Text style={styles.categoryEmoji}>{info.emoji}</Text>
                <Text style={styles.categoryLabel}>{info.label}</Text>
                <Text style={styles.categoryCount}>({grouped[cat].length})</Text>
              </View>
            );
          }
          const { item } = entry as any;
          return (
            <ContributionRow
              key={item.id}
              name={item.name}
              quantity={item.quantity}
              unit={item.unit}
              mode="create"
              ownership={item.ownership}
              onToggleOwnership={() => toggleOwnership(item.id)}
            />
          );
        })}

        {totalItems > MAX_VISIBLE && (
          <TouchableOpacity style={styles.expandButton} onPress={() => setExpanded(!expanded)}>
            <Text style={styles.expandText}>
              {expanded ? 'Show less' : `Show all ${totalItems} items`}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={mpColors.teal}
            />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.hint}>Tap to toggle status. Guests can claim "Need help" items.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
  },
  badge: {
    backgroundColor: mpColors.tealMist,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: mpFonts.medium,
    color: mpColors.tealDark,
  },
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    overflow: 'hidden',
    ...mpShadows.sm,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: mpColors.gray50,
  },
  categoryEmoji: {
    fontSize: 14,
  },
  categoryLabel: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  categoryCount: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray100,
  },
  expandText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
  },
  hint: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginTop: 8,
  },
});
