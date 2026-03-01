import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';

interface DetailInvitedBannerProps {
  onAccept: () => void;
  onDecline: () => void;
  isAccepting: boolean;
  isDeclining: boolean;
}

export default function DetailInvitedBanner({ onAccept, onDecline, isAccepting, isDeclining }: DetailInvitedBannerProps) {
  return (
    <View style={styles.banner}>
      <Text style={styles.title}>You've been invited!</Text>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.declineButton} onPress={onDecline} disabled={isDeclining || isAccepting}>
          {isDeclining ? (
            <ActivityIndicator size="small" color={mpColors.gray500} />
          ) : (
            <Text style={styles.declineText}>Decline</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptButton} onPress={onAccept} disabled={isAccepting || isDeclining}>
          {isAccepting ? (
            <ActivityIndicator size="small" color={mpColors.white} />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color={mpColors.white} />
              <Text style={styles.acceptText}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: mpColors.white,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray200,
    ...mpShadows.md,
  },
  title: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    textAlign: 'center',
    marginBottom: 10,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  declineText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  acceptButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.green,
  },
  acceptText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
