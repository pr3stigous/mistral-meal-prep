import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii } from '../../constants/mealPrepTheme';

type RowMode = 'create' | 'detail';

interface ContributionRowProps {
  name: string;
  quantity: number;
  unit: string;
  /** 'create' mode: toggle between host_provides / needs_volunteer */
  mode: RowMode;
  /** For create mode */
  ownership?: 'host_provides' | 'needs_volunteer';
  onToggleOwnership?: () => void;
  /** For detail mode */
  isClaimed?: boolean;
  claimedByName?: string;
  isHostItem?: boolean;
  onClaim?: () => void;
  onUnclaim?: () => void;
}

export default function ContributionRow({
  name,
  quantity,
  unit,
  mode,
  ownership,
  onToggleOwnership,
  isClaimed,
  claimedByName,
  isHostItem,
  onClaim,
  onUnclaim,
}: ContributionRowProps) {
  const quantityText = `${quantity} ${unit}`;

  if (mode === 'create') {
    const isHost = ownership === 'host_provides';
    return (
      <View style={styles.row}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.quantity}>{quantityText}</Text>
        </View>
        <TouchableOpacity
          style={[styles.pill, isHost ? styles.pillHost : styles.pillNeedHelp]}
          onPress={onToggleOwnership}
        >
          <Text style={[styles.pillText, isHost ? styles.pillTextHost : styles.pillTextNeedHelp]}>
            {isHost ? 'Host' : 'Need help'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Detail mode
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.quantity}>{quantityText}</Text>
      </View>
      {isHostItem ? (
        <View style={[styles.pill, styles.pillHostDetail]}>
          <Text style={styles.pillTextHostDetail}>Host</Text>
        </View>
      ) : isClaimed ? (
        <TouchableOpacity style={[styles.pill, styles.pillClaimed]} onPress={onUnclaim}>
          <Ionicons name="checkmark" size={14} color={mpColors.white} />
          <Text style={styles.pillTextClaimed}>
            {claimedByName ? claimedByName : 'Claimed'}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.pill, styles.pillClaim]} onPress={onClaim}>
          <Text style={styles.pillTextClaim}>Claim</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray100,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
  },
  quantity: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
    gap: 4,
  },
  pillText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
  },
  // Create mode pills
  pillHost: {
    backgroundColor: mpColors.tealLight,
  },
  pillTextHost: {
    color: mpColors.tealDark,
  },
  pillNeedHelp: {
    backgroundColor: mpColors.amberLight,
  },
  pillTextNeedHelp: {
    color: mpColors.amber,
  },
  // Detail mode pills
  pillHostDetail: {
    backgroundColor: mpColors.gray100,
  },
  pillTextHostDetail: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  pillClaim: {
    backgroundColor: mpColors.teal,
  },
  pillTextClaim: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  pillClaimed: {
    backgroundColor: mpColors.green,
  },
  pillTextClaimed: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
