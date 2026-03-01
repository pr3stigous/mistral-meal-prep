import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpGradients, mpHeroEmojis } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';

interface HeroBannerSectionProps {
  heroEmoji: string;
  heroGradient: string[];
  onChange: (updates: Partial<EventFormData>) => void;
}

const gradientOptions = Object.entries(mpGradients);

export default function HeroBannerSection({ heroEmoji, heroGradient, onChange }: HeroBannerSectionProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <LinearGradient colors={heroGradient} style={styles.banner}>
        <Text style={styles.emoji}>{heroEmoji}</Text>
        <TouchableOpacity style={styles.changeButton} onPress={() => setShowPicker(true)}>
          <Ionicons name="color-palette-outline" size={16} color={mpColors.gray600} />
          <Text style={styles.changeText}>Change Theme</Text>
        </TouchableOpacity>
      </LinearGradient>

      <Modal visible={showPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Choose Theme</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Ionicons name="close" size={24} color={mpColors.gray800} />
            </TouchableOpacity>
          </View>

          {/* Emoji picker */}
          <Text style={styles.pickerSectionLabel}>Emoji</Text>
          <View style={styles.emojiGrid}>
            {mpHeroEmojis.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.emojiOption, heroEmoji === emoji && styles.emojiOptionSelected]}
                onPress={() => onChange({ heroEmoji: emoji })}
              >
                <Text style={styles.emojiText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Gradient picker */}
          <Text style={styles.pickerSectionLabel}>Background</Text>
          <View style={styles.gradientGrid}>
            {gradientOptions.map(([name, colors]) => (
              <TouchableOpacity
                key={name}
                onPress={() => onChange({ heroGradient: [...colors] })}
              >
                <LinearGradient
                  colors={[...colors]}
                  style={[
                    styles.gradientOption,
                    heroGradient[0] === colors[0] && styles.gradientOptionSelected,
                  ]}
                >
                  <Text style={styles.gradientName}>{name}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.doneButton} onPress={() => setShowPicker(false)}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emoji: {
    fontSize: 56,
  },
  changeButton: {
    position: 'absolute',
    bottom: 10,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
  },
  changeText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: mpColors.white,
    padding: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  pickerTitle: {
    fontSize: 20,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
  },
  pickerSectionLabel: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
    marginBottom: 12,
    marginTop: 8,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mpColors.gray50,
  },
  emojiOptionSelected: {
    backgroundColor: mpColors.tealLight,
    borderWidth: 2,
    borderColor: mpColors.teal,
  },
  emojiText: {
    fontSize: 28,
  },
  gradientGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  gradientOption: {
    width: 100,
    height: 60,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientOptionSelected: {
    borderWidth: 2,
    borderColor: mpColors.teal,
  },
  gradientName: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
    textTransform: 'capitalize',
  },
  doneButton: {
    backgroundColor: mpColors.teal,
    paddingVertical: 16,
    borderRadius: mpRadii.button,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
