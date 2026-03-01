import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';

interface Props {
  recipeId: number | null;
  recipeName?: string;
  recipePrepTime?: number;
  recipeCookTime?: number;
  recipeServings?: number;
  recipeSkillLevel?: string;
  recipeInstructionCount?: number;
  recipeIngredientCount?: number;
  onViewRecipe: () => void;
}

export default function EditLinkedRecipeCard({
  recipeId,
  recipeName,
  recipePrepTime,
  recipeCookTime,
  recipeServings,
  recipeSkillLevel,
  recipeInstructionCount,
  recipeIngredientCount,
  onViewRecipe,
}: Props) {
  if (!recipeId) return null;

  const subtitleParts: string[] = [];
  if (recipeInstructionCount) subtitleParts.push(`${recipeInstructionCount} steps`);
  if (recipeIngredientCount) subtitleParts.push(`${recipeIngredientCount} ingredients`);
  if (recipeSkillLevel) subtitleParts.push(recipeSkillLevel);

  const timeParts: string[] = [];
  if (recipePrepTime) timeParts.push(`${recipePrepTime}m prep`);
  if (recipeCookTime) timeParts.push(`${recipeCookTime}m cook`);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark-circle" size={16} color={mpColors.green} />
          </View>
          <Text style={styles.headerText}>Recipe Linked</Text>
        </View>

        {/* Recipe info */}
        <View style={styles.recipeRow}>
          <Text style={styles.recipeEmoji}>🍽️</Text>
          <View style={styles.recipeInfo}>
            <Text style={styles.recipeName} numberOfLines={2}>
              {recipeName || `Recipe #${recipeId}`}
            </Text>
            {subtitleParts.length > 0 && (
              <Text style={styles.recipeSubtitle}>
                {subtitleParts.join(' · ')}
              </Text>
            )}
            {timeParts.length > 0 && (
              <Text style={styles.recipeTime}>
                {timeParts.join(' + ')}
                {recipeServings ? ` · ${recipeServings} servings` : ''}
              </Text>
            )}
          </View>
        </View>

        {/* View button */}
        <TouchableOpacity style={styles.viewButton} onPress={onViewRecipe}>
          <Text style={styles.viewButtonText}>View Recipe</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    borderWidth: 1.5,
    borderColor: mpColors.green,
    padding: mpSpacing.lg,
    ...mpShadows.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: mpSpacing.md,
  },
  checkBadge: {},
  headerText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.green,
  },
  recipeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: mpSpacing.md,
  },
  recipeEmoji: {
    fontSize: 32,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeName: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 2,
  },
  recipeSubtitle: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginBottom: 2,
  },
  recipeTime: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
  },
  viewButton: {
    borderWidth: 1,
    borderColor: mpColors.teal,
    borderRadius: mpRadii.button,
    paddingVertical: 10,
    alignItems: 'center',
  },
  viewButtonText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
});
