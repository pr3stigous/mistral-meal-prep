import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii } from '../../../constants/mealPrepTheme';

interface ListHeaderProps {
  onProfilePress?: () => void;
}

export default function ListHeader({ onProfilePress }: ListHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <View style={styles.logoSquircle}>
          <Text style={styles.logoGlyph}>W</Text>
        </View>
        <Text style={styles.logoText}>wellbody</Text>
      </View>
      <TouchableOpacity style={styles.avatar} onPress={onProfilePress}>
        <Ionicons name="person" size={16} color={mpColors.tealDark} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoSquircle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: mpColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: {
    fontSize: 16,
    fontFamily: mpFonts.bold,
    color: mpColors.white,
  },
  logoText: {
    fontSize: 20,
    fontFamily: mpFonts.bold,
    color: mpColors.teal,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: mpColors.tealLight,
    borderWidth: 2,
    borderColor: mpColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
