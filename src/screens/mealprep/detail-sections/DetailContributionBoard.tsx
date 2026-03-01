import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import { EventContributionNeeded, EventContributionClaim } from '../hooks/useEventDetail';
import { useAuth } from '../../../AuthContext';

type ClaimStatus = 'unclaimed' | 'partial' | 'full';

interface ContribWithStatus {
  contrib: EventContributionNeeded;
  totalClaimed: number;
  needed: number;
  remaining: number;
  percent: number;
  status: ClaimStatus;
}

interface DetailContributionBoardProps {
  contributions: EventContributionNeeded[];
  claims: EventContributionClaim[];
  isApproved: boolean;
  canManage: boolean;
  isPending: boolean;
  isPreview?: boolean;
  previewCount?: number;
  onClaim: (contributionId: string, quantity: number) => void;
  onUnclaim: (claimId: string) => void;
}

const AVATAR_COLORS = [
  '#3fa6a6', '#E6930A', '#E8725C', '#3B82F6', '#8B5CF6',
  '#34C759', '#EC4899', '#F59E0B', '#6366F1', '#14B8A6',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const MAX_VISIBLE_CLAIMERS = 3;

function ClaimerList({
  claims,
  unit,
  isExpanded,
  onToggle,
  formatQuantity,
}: {
  claims: EventContributionClaim[];
  unit: string;
  isExpanded: boolean;
  onToggle: () => void;
  formatQuantity: (n: number) => string;
}) {
  const visibleClaims = isExpanded ? claims : claims.slice(0, MAX_VISIBLE_CLAIMERS);
  const hiddenCount = claims.length - MAX_VISIBLE_CLAIMERS;
  const unitLabel = unit || '';

  return (
    <View style={styles.claimerList}>
      {visibleClaims.map(claim => {
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
              {formatQuantity(claim.quantity_claimed)}{unitLabel ? ` ${unitLabel}` : ''}
            </Text>
          </View>
        );
      })}
      {hiddenCount > 0 && !isExpanded && (
        <TouchableOpacity onPress={onToggle} style={styles.claimerToggle}>
          <Text style={styles.claimerToggleText}>+{hiddenCount} more</Text>
        </TouchableOpacity>
      )}
      {isExpanded && hiddenCount > 0 && (
        <TouchableOpacity onPress={onToggle} style={styles.claimerToggle}>
          <Text style={styles.claimerToggleText}>show less</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function DetailContributionBoard({
  contributions,
  claims,
  isApproved,
  canManage,
  isPending,
  isPreview,
  previewCount,
  onClaim,
  onUnclaim,
}: DetailContributionBoardProps) {
  const { user } = useAuth();
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedContrib, setSelectedContrib] = useState<EventContributionNeeded | null>(null);
  const [claimQty, setClaimQty] = useState('1');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const getClaimsForContrib = (contribId: string) =>
    claims.filter(c => c.contribution_needed_id === contribId);

  const getUserClaim = (contribId: string) =>
    claims.find(c => c.contribution_needed_id === contribId && c.user_id === user?.id);

  // Compute per-item stats and sort by status — must be above early returns
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
      return { contrib, totalClaimed, needed, remaining, percent, status };
    });

    const order: Record<ClaimStatus, number> = { unclaimed: 0, partial: 1, full: 2 };
    items.sort((a, b) => order[a.status] - order[b.status]);
    return items;
  }, [contributions, claims]);

  // Pre-RSVP preview teaser (invite link, not yet joined)
  if (isPreview) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Contribution Board</Text>
          {(previewCount ?? 0) > 0 && (
            <View style={styles.neededBadge}>
              <Text style={styles.neededBadgeText}>{previewCount} items</Text>
            </View>
          )}
        </View>
        <View style={styles.previewCard}>
          <Ionicons name="hand-left-outline" size={24} color={mpColors.gray300} />
          <Text style={styles.previewCardText}>Join to see what's needed</Text>
          <Text style={styles.previewCardSubtext}>Claim items to bring after you're approved</Text>
        </View>
      </View>
    );
  }

  if (contributions.length === 0) return null;

  const canInteract = isApproved || canManage;

  // Locked state for pending users
  if (isPending) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Contribution Board</Text>
        <View style={styles.lockedCard}>
          <Ionicons name="lock-closed-outline" size={24} color={mpColors.gray400} />
          <Text style={styles.lockedText}>Available after approval</Text>
          <Text style={styles.lockedSubtext}>You'll be able to claim items once the host approves</Text>
        </View>
      </View>
    );
  }

  // Summary stats
  const fullyCoveredCount = sortedItems.filter(i => i.status === 'full').length;
  const totalCount = sortedItems.length;
  const overallPercent = totalCount > 0 ? Math.round((fullyCoveredCount / totalCount) * 100) : 0;
  const allCovered = fullyCoveredCount === totalCount;

  const handleClaimPress = (contrib: EventContributionNeeded) => {
    const contribClaims = getClaimsForContrib(contrib.id);
    const totalClaimed = contribClaims.reduce((sum, c) => sum + c.quantity_claimed, 0);
    const remaining = Math.max(0, (contrib.quantity_needed || 1) - totalClaimed);
    setSelectedContrib(contrib);
    setClaimQty(String(remaining > 0 ? remaining : 1));
    setShowClaimModal(true);
  };

  const handleConfirmClaim = () => {
    if (!selectedContrib) return;
    const qty = parseFloat(claimQty);
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Invalid', 'Please enter a valid quantity.');
      return;
    }
    onClaim(selectedContrib.id, qty);
    setShowClaimModal(false);
  };

  const formatQuantity = (n: number) => {
    if (Number.isInteger(n)) return String(n);
    return n % 1 === 0 ? String(n) : String(Math.round(n * 100) / 100);
  };

  return (
    <View style={styles.container}>
      {/* Header row with summary badge */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Contribution Board</Text>
        <View style={[styles.summaryBadge, allCovered && styles.summaryBadgeDone]}>
          <Text style={[styles.summaryBadgeText, allCovered && styles.summaryBadgeTextDone]}>
            {fullyCoveredCount}/{totalCount} covered
          </Text>
        </View>
      </View>

      {/* Summary progress bar */}
      <View style={styles.summaryBarRow}>
        <View style={styles.summaryTrack}>
          <View
            style={[
              styles.summaryFill,
              {
                width: `${overallPercent}%`,
                backgroundColor: allCovered ? mpColors.green : mpColors.teal,
              },
            ]}
          />
        </View>
        <Text style={styles.summaryPercent}>{overallPercent}%</Text>
      </View>

      {/* Item list */}
      <View style={styles.card}>
        {sortedItems.map(({ contrib, totalClaimed, needed, remaining, percent, status }) => {
          const contribClaims = getClaimsForContrib(contrib.id);
          const myClaim = getUserClaim(contrib.id);
          const unitLabel = contrib.unit ? ` ${contrib.unit}` : '';

          const itemBg =
            status === 'full'
              ? styles.itemRowFull
              : status === 'partial'
                ? styles.itemRowPartial
                : undefined;

          const borderColor =
            status === 'full'
              ? mpColors.green
              : status === 'partial'
                ? mpColors.amber
                : 'transparent';

          return (
            <View
              key={contrib.id}
              style={[styles.itemRow, itemBg, { borderLeftWidth: 3, borderLeftColor: borderColor }]}
            >
              <View style={styles.itemInfo}>
                {/* Item name with optional checkmark for fully claimed */}
                <View style={styles.itemNameRow}>
                  {status === 'full' && (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={mpColors.green}
                      style={styles.checkIcon}
                    />
                  )}
                  <Text style={[styles.itemName, status === 'full' && styles.itemNameDone]}>
                    {contrib.description}
                  </Text>
                </View>

                {/* Claimed / total meta */}
                <Text style={[styles.itemMeta, status === 'full' && styles.itemMetaDone]}>
                  {formatQuantity(totalClaimed)}/{formatQuantity(needed)}{unitLabel} claimed
                </Text>

                {/* Per-person claim breakdown */}
                {contribClaims.length > 0 && (
                  <ClaimerList
                    claims={contribClaims}
                    unit={contrib.unit}
                    isExpanded={expandedItems.has(contrib.id)}
                    onToggle={() => setExpandedItems(prev => {
                      const next = new Set(prev);
                      if (next.has(contrib.id)) next.delete(contrib.id);
                      else next.add(contrib.id);
                      return next;
                    })}
                    formatQuantity={formatQuantity}
                  />
                )}

                {/* Substitution / notes */}
                {contrib.notes ? (
                  <Text style={styles.itemSubNote}>{contrib.notes}</Text>
                ) : null}

                {/* Per-item progress bar */}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(percent * 100)}%`,
                        backgroundColor: status === 'full' ? mpColors.green : mpColors.teal,
                      },
                    ]}
                  />
                </View>

                {/* "X still needed" for partially claimed items */}
                {status === 'partial' && (
                  <Text style={styles.stillNeededText}>
                    {formatQuantity(remaining)}{unitLabel} still needed
                  </Text>
                )}
              </View>

              {/* Claim / Unclaim / Covered pill */}
              {canInteract && (
                myClaim ? (
                  <TouchableOpacity
                    style={styles.claimedPill}
                    onPress={() => onUnclaim(myClaim.id)}
                  >
                    <Ionicons name="checkmark" size={14} color={mpColors.white} />
                    <Text style={styles.claimedPillText}>You're bringing</Text>
                  </TouchableOpacity>
                ) : remaining > 0 ? (
                  <TouchableOpacity
                    style={styles.claimPill}
                    onPress={() => handleClaimPress(contrib)}
                  >
                    <Text style={styles.claimPillText}>Claim</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.fullPill}>
                    <Text style={styles.fullPillText}>Covered</Text>
                  </View>
                )
              )}
            </View>
          );
        })}
      </View>

      {/* Claim Quantity Modal */}
      <Modal visible={showClaimModal} transparent animationType="fade" onRequestClose={() => setShowClaimModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Claim: {selectedContrib?.description}</Text>
            <Text style={styles.modalLabel}>
              How {selectedContrib?.unit ? `many ${selectedContrib.unit}` : 'much'} will you bring?
            </Text>
            <TextInput
              style={styles.modalInput}
              value={claimQty}
              onChangeText={setClaimQty}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={mpColors.gray300}
            />
            {selectedContrib && (() => {
              const sc = getClaimsForContrib(selectedContrib.id);
              const tc = sc.reduce((sum, c) => sum + c.quantity_claimed, 0);
              const rem = Math.max(0, (selectedContrib.quantity_needed || 1) - tc);
              const unitLabel = selectedContrib.unit ? ` ${selectedContrib.unit}` : '';
              return (
                <Text style={styles.modalHint}>
                  {formatQuantity(rem)}{unitLabel} still needed
                </Text>
              );
            })()}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowClaimModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmClaim}>
                <Text style={styles.modalConfirmText}>Claim</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
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

  // Summary badge
  summaryBadge: {
    backgroundColor: mpColors.tealLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  summaryBadgeDone: {
    backgroundColor: mpColors.greenLight,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
  summaryBadgeTextDone: {
    color: mpColors.green,
  },

  // Summary progress bar
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
  summaryFill: {
    height: '100%',
    borderRadius: 2,
  },
  summaryPercent: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray400,
    minWidth: 30,
    textAlign: 'right',
  },

  // Legacy badge (kept for preview/non-interactive)
  neededBadge: {
    backgroundColor: mpColors.amberLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  neededBadgeText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
  },

  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    overflow: 'hidden',
    ...mpShadows.sm,
  },

  // Item rows
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray100,
    backgroundColor: mpColors.white,
  },
  itemRowPartial: {
    backgroundColor: mpColors.amberLight,
  },
  itemRowFull: {
    backgroundColor: mpColors.greenLight,
  },

  itemInfo: {
    flex: 1,
    marginRight: 10,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIcon: {
    marginRight: 4,
  },
  itemName: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
    flexShrink: 1,
  },
  itemNameDone: {
    color: mpColors.gray500,
  },
  itemMeta: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginTop: 2,
  },
  itemMetaDone: {
    color: mpColors.gray400,
  },
  itemSubNote: {
    fontSize: 11,
    fontFamily: mpFonts.regular,
    fontStyle: 'italic',
    color: mpColors.gray400,
    marginTop: 2,
  },

  // Per-person claimer breakdown
  claimerList: {
    marginTop: 4,
    gap: 3,
  },
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
  claimerToggle: {
    paddingVertical: 2,
  },
  claimerToggleText: {
    fontSize: 11,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
  },

  // Per-item progress bar
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: mpColors.gray100,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },

  // "X still needed" text
  stillNeededText: {
    fontSize: 11,
    fontFamily: mpFonts.medium,
    color: mpColors.amber,
    marginTop: 3,
  },

  // Claim pills
  claimPill: {
    backgroundColor: mpColors.teal,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
  },
  claimPillText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  claimedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: mpColors.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
  },
  claimedPillText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  fullPill: {
    backgroundColor: mpColors.gray100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
  },
  fullPillText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },

  // Locked state
  lockedCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: mpColors.gray300,
    gap: 6,
  },
  lockedText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  lockedSubtext: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    textAlign: 'center',
  },

  // Preview teaser (pre-RSVP)
  previewCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: mpColors.gray200,
    gap: 6,
  },
  previewCardText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  previewCardSubtext: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 24,
    width: 300,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    marginBottom: 6,
  },
  modalHint: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  modalConfirmText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
