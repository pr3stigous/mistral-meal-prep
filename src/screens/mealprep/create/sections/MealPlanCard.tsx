import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../../constants/mealPrepTheme';
import { RECIPE_COLORS } from '../../../../constants/mealPrepTheme';
import { EventFormData, RecipeMenuItem } from '../../../../lib/eventFormTypes';
import RecipeDetailSheet from '../../../../components/mealprep/RecipeDetailSheet';

interface MealPlanCardProps {
  recipeMenu: RecipeMenuItem[];
  onChange?: (updates: Partial<EventFormData>) => void;
  /** When true, hides the "Change" button (picker is visible below) */
  isLivePreview?: boolean;
}

export default function MealPlanCard({ recipeMenu, onChange, isLivePreview }: MealPlanCardProps) {
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  const stats = useMemo(() => {
    let totalPrep = 0;
    let totalCook = 0;
    let totalIngredients = 0;

    for (const item of recipeMenu) {
      const r = item.parsedRecipe;
      totalPrep += r.prepTimeMinutes || 0;
      totalCook += r.cookTimeMinutes || 0;
      totalIngredients += (r.ingredients || []).length;
    }

    return { totalPrep, totalCook, totalIngredients };
  }, [recipeMenu]);

  const handleChange = () => {
    onChange?.({
      recipeMenu: undefined,
      recipeSource: null,
      recipeId: undefined,
      parsedRecipe: undefined,
    });
  };

  const detailRecipe = detailIndex !== null ? recipeMenu[detailIndex]?.parsedRecipe : null;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons name="checkmark-circle" size={18} color={mpColors.green} />
          <Text style={styles.headerText}>Meal Plan Prepped</Text>
          <Text style={styles.headerCount}>{recipeMenu.length} recipes</Text>
        </View>

        {/* Recipe rows */}
        {recipeMenu.map((item, index) => {
          const color = RECIPE_COLORS[item.colorIndex] || RECIPE_COLORS[0];
          const r = item.parsedRecipe;
          return (
            <TouchableOpacity
              key={item.recipeId}
              style={styles.recipeRow}
              onPress={() => setDetailIndex(index)}
              activeOpacity={0.7}
            >
              <View style={[styles.colorDot, { backgroundColor: color.color }]} />
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.recipeMeta}>
                  {r.prepTimeMinutes}m prep · {r.cookTimeMinutes}m cook
                  {r.servings ? ` · ${r.servings} servings` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={mpColors.gray300} />
            </TouchableOpacity>
          );
        })}

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="time-outline" size={14} color={mpColors.gray500} />
            <Text style={styles.summaryText}>{stats.totalPrep + stats.totalCook}m total</Text>
          </View>
          <View style={styles.summaryDot} />
          <View style={styles.summaryItem}>
            <Ionicons name="leaf-outline" size={14} color={mpColors.gray500} />
            <Text style={styles.summaryText}>{stats.totalIngredients} ingredients</Text>
          </View>
        </View>

        {/* Actions — only show "Change" when not in live preview mode */}
        {!isLivePreview && onChange && (
          <View style={styles.actions}>
            <View />
            <TouchableOpacity style={styles.changeButton} onPress={handleChange}>
              <Text style={styles.changeButtonText}>Change</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {detailRecipe && (
        <RecipeDetailSheet
          recipe={detailRecipe}
          visible={detailIndex !== null}
          onClose={() => setDetailIndex(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 16,
    ...mpShadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  headerText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.green,
    flex: 1,
  },
  headerCount: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  // Recipe rows
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray100,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  recipeInfo: {
    flex: 1,
    marginRight: 8,
  },
  recipeName: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
  },
  recipeMeta: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 1,
  },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mpColors.tealMist,
    borderRadius: mpRadii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.tealDark,
  },
  summaryDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: mpColors.tealDark,
  },
  // Actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
  },
  changeButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  changeButtonText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
});
