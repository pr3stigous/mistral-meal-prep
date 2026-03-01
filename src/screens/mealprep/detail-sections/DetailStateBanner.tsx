import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts } from '../../../constants/mealPrepTheme';

interface DetailStateBannerProps {
  status: string | null; // registration_status: 'pending' | 'approved' | 'invited' | etc.
}

export default function DetailStateBanner({ status }: DetailStateBannerProps) {
  if (!status || status === 'denied' || status === 'cancelled_by_user') return null;

  if (status === 'pending') {
    return (
      <View style={[styles.banner, { backgroundColor: mpColors.amberLight }]}>
        <View style={styles.bannerContent}>
          <View style={styles.bannerRow}>
            <Ionicons name="time-outline" size={16} color={mpColors.amber} />
            <Text style={[styles.text, { color: mpColors.amber }]}>Request Pending</Text>
          </View>
          <Text style={[styles.subtext, { color: mpColors.amber }]}>The host will review your request</Text>
        </View>
      </View>
    );
  }

  if (status === 'approved') {
    return (
      <View style={[styles.banner, { backgroundColor: mpColors.greenLight }]}>
        <View style={styles.bannerContent}>
          <View style={styles.bannerRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={mpColors.green} />
            <Text style={[styles.text, { color: mpColors.green }]}>You're in!</Text>
          </View>
          <Text style={[styles.subtext, { color: mpColors.green }]}>You've been approved to attend this event</Text>
        </View>
      </View>
    );
  }

  if (status === 'invited') {
    return (
      <View style={[styles.banner, { backgroundColor: mpColors.blueLight }]}>
        <View style={styles.bannerContent}>
          <View style={styles.bannerRow}>
            <Ionicons name="mail-outline" size={16} color={mpColors.blue} />
            <Text style={[styles.text, { color: mpColors.blue }]}>You've been invited!</Text>
          </View>
          <Text style={[styles.subtext, { color: mpColors.blue }]}>Accept below to join this event</Text>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bannerContent: {
    alignItems: 'center',
    gap: 2,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
  },
  subtext: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    opacity: 0.8,
  },
});
