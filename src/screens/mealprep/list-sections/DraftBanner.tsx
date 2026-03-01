import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';
import { EventDraft } from '../../../lib/eventWizardTypes';

interface DraftBannerProps {
  drafts: EventDraft[];
  onResume: (draftId: string) => void;
  onDelete: (draftId: string) => void;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function DraftBanner({ drafts, onResume, onDelete }: DraftBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (drafts.length === 0) return null;

  const handleDelete = (draft: EventDraft) => {
    const title = draft.draftData?.step1?.title || 'Untitled Event';
    Alert.alert(
      'Delete Draft',
      `Delete "${title}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(draft.id) },
      ]
    );
  };

  // Collapsed: show summary banner
  if (!expanded) {
    const latestTitle = drafts[0]?.draftData?.step1?.title || 'Untitled Event';
    return (
      <TouchableOpacity style={styles.banner} onPress={() => setExpanded(true)} activeOpacity={0.7}>
        <View style={styles.iconBox}>
          <Ionicons name="document-text-outline" size={18} color={mpColors.amber} />
        </View>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerLabel}>
            {drafts.length === 1 ? 'You have a draft' : `You have ${drafts.length} drafts`}
          </Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>{latestTitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={mpColors.amber} />
      </TouchableOpacity>
    );
  }

  // Expanded: show all drafts
  return (
    <View style={styles.expandedContainer}>
      <TouchableOpacity style={styles.expandedHeader} onPress={() => setExpanded(false)} activeOpacity={0.7}>
        <Text style={styles.expandedHeaderTitle}>Your Drafts ({drafts.length})</Text>
        <Ionicons name="chevron-up" size={18} color={mpColors.amber} />
      </TouchableOpacity>

      {drafts.map((draft) => {
        const title = draft.draftData?.step1?.title || 'Untitled Event';
        const edited = timeAgo(draft.updatedAt);
        return (
          <View key={draft.id} style={styles.draftRow}>
            <TouchableOpacity style={styles.draftRowContent} onPress={() => onResume(draft.id)} activeOpacity={0.7}>
              <View style={styles.draftIconBox}>
                <Ionicons name="document-text-outline" size={16} color={mpColors.amber} />
              </View>
              <View style={styles.draftInfo}>
                <Text style={styles.draftTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.draftMeta}>{edited}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={mpColors.gray300} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(draft)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color={mpColors.gray400} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Collapsed banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    backgroundColor: mpColors.amberLight,
    borderRadius: mpRadii.card,
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderStyle: 'dashed',
    ...mpShadows.xs,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: mpColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bannerContent: {
    flex: 1,
  },
  bannerLabel: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: '#92400E',
  },

  // Expanded list
  expandedContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: mpColors.amberLight,
    borderRadius: mpRadii.card,
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  expandedHeaderTitle: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: '#92400E',
  },
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FCD34D',
  },
  draftRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 6,
  },
  draftIconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
    backgroundColor: mpColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  draftInfo: {
    flex: 1,
  },
  draftTitle: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: '#92400E',
  },
  draftMeta: {
    fontSize: 11,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginTop: 1,
  },
  deleteBtn: {
    padding: 6,
  },
});
