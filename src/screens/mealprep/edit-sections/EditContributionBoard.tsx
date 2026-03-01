import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, ActionSheetIOS, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import { EventContributionNeeded, EventContributionClaim } from '../hooks/useEventDetail';

type ClaimStatus = 'unclaimed' | 'partial' | 'full';

interface ContribWithStatus {
  contrib: EventContributionNeeded;
  totalClaimed: number;
  needed: number;
  remaining: number;
  percent: number;
  status: ClaimStatus;
  claims: EventContributionClaim[];
}

interface Props {
  contributions: EventContributionNeeded[];
  claims: EventContributionClaim[];
  onAddContribution: (c: { description: string; type: string; quantity_needed: number | null; unit: string }) => void;
  onRemoveContribution: (contributionId: string) => void;
  onEditContribution: (contributionId: string, updates: { quantity_needed?: number; unit?: string }) => void;
  onRemoveClaimAsHost: (claimId: string) => void;
}

const UNIT_CHIPS = ['items', 'cups', 'lbs', 'oz', 'grams', 'pieces'];
const TYPE_CHIPS = ['ingredient', 'equipment', 'other_help'];

const AVATAR_COLORS = [
  '#3fa6a6', '#E6930A', '#E8725C', '#3B82F6', '#8B5CF6',
  '#34C759', '#EC4899', '#F59E0B', '#6366F1', '#14B8A6',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const formatQuantity = (n: number) => {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
};

const formatTypeLabel = (type: string): string =>
  type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Category grouping for contributions
const CATEGORY_MAP: Record<string, string> = {
  ingredient: 'Ingredients',
  equipment: 'Equipment',
  money_off_app: 'Financial',
  other_help: 'Other',
};

export default function EditContributionBoard({
  contributions,
  claims,
  onAddContribution,
  onRemoveContribution,
  onEditContribution,
  onRemoveClaimAsHost,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newUnit, setNewUnit] = useState('items');
  const [newType, setNewType] = useState('ingredient');

  const getClaimsForContrib = (contribId: string) =>
    claims.filter(c => c.contribution_needed_id === contribId);

  const sortedItems: ContribWithStatus[] = useMemo(() => {
    const items = contributions.map(contrib => {
      const contribClaims = claims.filter(c => c.contribution_needed_id === contrib.id);
      const totalClaimed = contribClaims.reduce((sum, c) => sum + c.quantity_claimed, 0);
      const needed = contrib.quantity_needed || 1;
      const remaining = Math.max(0, needed - totalClaimed);
      const percent = Math.min(1, needed > 0 ? totalClaimed / needed : 0);
      let status: ClaimStatus = 'unclaimed';
      if (totalClaimed > 0 && remaining > 0) status = 'partial';
      else if (totalClaimed > 0 && remaining <= 0) status = 'full';
      return { contrib, totalClaimed, needed, remaining, percent, status, claims: contribClaims };
    });

    const order: Record<ClaimStatus, number> = { unclaimed: 0, partial: 1, full: 2 };
    items.sort((a, b) => order[a.status] - order[b.status]);
    return items;
  }, [contributions, claims]);

  // Summary stats
  const fullyCoveredCount = sortedItems.filter(i => i.status === 'full').length;
  const totalCount = sortedItems.length;
  const overallPercent = totalCount > 0 ? Math.round((fullyCoveredCount / totalCount) * 100) : 0;
  const allCovered = fullyCoveredCount === totalCount && totalCount > 0;

  const handleAdd = () => {
    if (!newName.trim()) {
      Alert.alert('Missing Info', 'Please enter a name for the contribution.');
      return;
    }
    const qty = newQty.trim() ? parseFloat(newQty) : null;
    if (newQty.trim() && (isNaN(qty!) || qty! <= 0)) {
      Alert.alert('Invalid Quantity', 'Please enter a valid number.');
      return;
    }
    onAddContribution({
      description: newName.trim(),
      type: newType,
      quantity_needed: qty,
      unit: newUnit,
    });
    setNewName('');
    setNewQty('');
    setNewUnit('items');
    setShowAddForm(false);
  };

  const handleItemMenu = (item: ContribWithStatus) => {
    const hasClaims = item.claims.length > 0;
    const options = ['Edit Quantity', 'Remove Item', 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) handleEditQuantity(item);
          else if (idx === 1) handleRemoveItem(item, hasClaims);
        }
      );
    } else {
      Alert.alert(item.contrib.description, 'Choose an action', [
        { text: 'Edit Quantity', onPress: () => handleEditQuantity(item) },
        { text: 'Remove Item', style: 'destructive', onPress: () => handleRemoveItem(item, hasClaims) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleEditQuantity = (item: ContribWithStatus) => {
    const minQty = item.totalClaimed;
    Alert.prompt?.(
      'Edit Quantity',
      `Current: ${formatQuantity(item.needed)}${item.contrib.unit ? ` ${item.contrib.unit}` : ''}${minQty > 0 ? `\nMinimum: ${formatQuantity(minQty)} (already claimed)` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: (value?: string) => {
            const newVal = parseFloat(value || '');
            if (isNaN(newVal) || newVal <= 0) {
              Alert.alert('Invalid', 'Please enter a valid positive number.');
              return;
            }
            if (newVal < minQty) {
              Alert.alert('Cannot Reduce', `There are ${formatQuantity(minQty)} already claimed. Remove claims first.`);
              return;
            }
            onEditContribution(item.contrib.id, { quantity_needed: newVal });
          },
        },
      ],
      'plain-text',
      String(item.needed)
    );
    // Fallback for Android (no Alert.prompt)
    if (!Alert.prompt) {
      onEditContribution(item.contrib.id, { quantity_needed: item.needed });
    }
  };

  const handleRemoveItem = (item: ContribWithStatus, hasClaims: boolean) => {
    if (hasClaims) {
      Alert.alert('Cannot Remove', 'This item has claims from attendees. Remove all claims first before deleting.');
      return;
    }
    onRemoveContribution(item.contrib.id);
  };

  return (
    <View style={styles.container}>
      {/* Header row with summary badge */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Contribution Board</Text>
        {totalCount > 0 && (
          <View style={[styles.summaryBadge, allCovered && styles.summaryBadgeDone]}>
            <Text style={[styles.summaryBadgeText, allCovered && styles.summaryBadgeTextDone]}>
              {fullyCoveredCount}/{totalCount} covered
            </Text>
          </View>
        )}
      </View>

      {/* Summary progress bar */}
      {totalCount > 0 && (
        <View style={styles.summaryBarRow}>
          <View style={styles.summaryTrack}>
            <View
              style={[
                styles.summaryFill,
                { width: `${overallPercent}%`, backgroundColor: allCovered ? mpColors.green : mpColors.teal },
              ]}
            />
          </View>
          <Text style={styles.summaryPercent}>{overallPercent}%</Text>
        </View>
      )}

      {/* Item list */}
      {totalCount > 0 && (
        <View style={styles.card}>
          {sortedItems.map(item => {
            const { contrib, totalClaimed, needed, remaining, percent, status } = item;
            const unitLabel = contrib.unit ? ` ${contrib.unit}` : '';

            const borderColor =
              status === 'full' ? mpColors.green
              : status === 'partial' ? mpColors.amber
              : 'transparent';

            const itemBg =
              status === 'full' ? { backgroundColor: mpColors.greenLight }
              : status === 'partial' ? { backgroundColor: mpColors.amberLight }
              : undefined;

            return (
              <View key={contrib.id} style={[styles.itemRow, itemBg, { borderLeftWidth: 3, borderLeftColor: borderColor }]}>
                <View style={styles.itemInfo}>
                  {/* Name row */}
                  <View style={styles.itemNameRow}>
                    {status === 'full' && (
                      <Ionicons name="checkmark-circle" size={16} color={mpColors.green} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[styles.itemName, status === 'full' && { color: mpColors.gray500 }]} numberOfLines={2}>
                      {contrib.description}
                    </Text>
                  </View>

                  {/* Claimed meta */}
                  <Text style={styles.itemMeta}>
                    {formatQuantity(totalClaimed)}/{formatQuantity(needed)}{unitLabel} claimed
                  </Text>

                  {/* Claimer pills with remove (X) */}
                  {item.claims.length > 0 && (
                    <View style={styles.claimerList}>
                      {item.claims.map(claim => {
                        const name = claim.user_name || 'Someone';
                        const initial = name.charAt(0).toUpperCase();
                        const color = getAvatarColor(name);
                        return (
                          <View key={claim.id} style={styles.claimerRow}>
                            <View style={[styles.claimerAvatar, { backgroundColor: color }]}>
                              <Text style={styles.claimerInitial}>{initial}</Text>
                            </View>
                            <Text style={styles.claimerName} numberOfLines={1}>{name}</Text>
                            <Text style={styles.claimerQty}>
                              {formatQuantity(claim.quantity_claimed)}{unitLabel}
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                Alert.alert(
                                  'Remove Claim',
                                  `Remove ${name}'s claim of ${formatQuantity(claim.quantity_claimed)}${unitLabel}?`,
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Remove', style: 'destructive', onPress: () => onRemoveClaimAsHost(claim.id) },
                                  ]
                                );
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close-circle" size={16} color={mpColors.gray400} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Progress bar */}
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.round(percent * 100)}%`, backgroundColor: status === 'full' ? mpColors.green : mpColors.teal },
                      ]}
                    />
                  </View>

                  {status === 'partial' && (
                    <Text style={styles.stillNeededText}>
                      {formatQuantity(remaining)}{unitLabel} still needed
                    </Text>
                  )}
                </View>

                {/* Three-dot menu */}
                <TouchableOpacity onPress={() => handleItemMenu(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-vertical" size={18} color={mpColors.gray400} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Add Item button / inline form */}
      {showAddForm ? (
        <View style={styles.addForm}>
          <TextInput
            style={styles.addInput}
            value={newName}
            onChangeText={setNewName}
            placeholder="Item name (e.g., Large onions)"
            placeholderTextColor={mpColors.gray400}
            autoFocus
          />
          <View style={styles.addRow}>
            <TextInput
              style={[styles.addInput, { flex: 1 }]}
              value={newQty}
              onChangeText={setNewQty}
              placeholder="Qty"
              placeholderTextColor={mpColors.gray400}
              keyboardType="decimal-pad"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 2 }}>
              <View style={styles.chipRow}>
                {UNIT_CHIPS.map(u => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.chip, newUnit === u && styles.chipActive]}
                    onPress={() => setNewUnit(u)}
                  >
                    <Text style={[styles.chipText, newUnit === u && styles.chipTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
          <View style={styles.chipRow}>
            {TYPE_CHIPS.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, newType === t && styles.chipActive]}
                onPress={() => setNewType(t)}
              >
                <Text style={[styles.chipText, newType === t && styles.chipTextActive]}>{formatTypeLabel(t)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addFormActions}>
            <TouchableOpacity style={styles.addFormCancel} onPress={() => { setShowAddForm(false); setNewName(''); setNewQty(''); }}>
              <Text style={styles.addFormCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addFormConfirm} onPress={handleAdd}>
              <Text style={styles.addFormConfirmText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addButton} onPress={() => setShowAddForm(true)}>
          <Ionicons name="add" size={18} color={mpColors.teal} />
          <Text style={styles.addButtonText}>Add Item</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  summaryBadge: {
    backgroundColor: mpColors.tealLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  summaryBadgeDone: { backgroundColor: mpColors.greenLight },
  summaryBadgeText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
  summaryBadgeTextDone: { color: mpColors.green },
  summaryBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  summaryTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: mpColors.gray100,
    overflow: 'hidden',
  },
  summaryFill: { height: '100%', borderRadius: 2 },
  summaryPercent: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray400,
    minWidth: 30,
    textAlign: 'right',
  },
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    overflow: 'hidden',
    ...mpShadows.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray100,
    backgroundColor: mpColors.white,
  },
  itemInfo: { flex: 1, marginRight: 10 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center' },
  itemName: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
    flexShrink: 1,
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginTop: 2,
  },
  claimerList: { marginTop: 4, gap: 3 },
  claimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  claimerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimerInitial: {
    fontSize: 10,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  claimerName: {
    flex: 1,
    fontSize: 11,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
  claimerQty: {
    fontSize: 11,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: mpColors.gray100,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 1.5 },
  stillNeededText: {
    fontSize: 11,
    fontFamily: mpFonts.medium,
    color: mpColors.amber,
    marginTop: 3,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 12,
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: mpColors.teal,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
  addForm: {
    marginTop: 12,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 14,
    gap: 10,
    ...mpShadows.sm,
  },
  addInput: {
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  addRow: { flexDirection: 'row', gap: 8 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    backgroundColor: mpColors.white,
  },
  chipActive: {
    backgroundColor: mpColors.tealMist,
    borderColor: mpColors.teal,
  },
  chipText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  chipTextActive: {
    color: mpColors.teal,
  },
  addFormActions: {
    flexDirection: 'row',
    gap: 10,
  },
  addFormCancel: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  addFormCancelText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  addFormConfirm: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  addFormConfirmText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
