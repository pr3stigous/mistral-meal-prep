import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../../constants/mealPrepTheme';

interface Props {
  recipeId: number | null;
  hasPackageRelevantChanges: boolean;
  changedFields: string[];
  isRegenerating: boolean;
  onRegenerate: () => void;
}

export default function EditRegenerateSection({
  recipeId,
  hasPackageRelevantChanges,
  changedFields,
  isRegenerating,
  onRegenerate,
}: Props) {
  if (!recipeId) return null;

  return (
    <View style={styles.container}>
      {/* Smart hint */}
      {hasPackageRelevantChanges && (
        <View style={styles.hintBar}>
          <Ionicons name="alert-circle" size={16} color={mpColors.amber} />
          <Text style={styles.hintText}>
            {changedFields.length > 0
              ? `${changedFields.join(', ')} changed — consider regenerating`
              : 'Event details changed — consider regenerating'}
          </Text>
        </View>
      )}

      {!hasPackageRelevantChanges && (
        <Text style={styles.grayHint}>
          Regenerate contributions and host package from the linked recipe.
        </Text>
      )}

      {/* Regenerate button */}
      <TouchableOpacity
        style={[styles.button, isRegenerating && styles.buttonDisabled]}
        onPress={onRegenerate}
        disabled={isRegenerating}
      >
        {isRegenerating ? (
          <ActivityIndicator size="small" color={mpColors.white} />
        ) : (
          <>
            <Ionicons name="refresh-outline" size={18} color={mpColors.white} />
            <Text style={styles.buttonText}>Regenerate Event Package</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: mpColors.amberLight,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: mpRadii.input,
    marginBottom: 10,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.amber,
  },
  grayHint: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginBottom: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
