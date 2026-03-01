import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import { LinkedRecipe, FullRecipe } from '../hooks/useEventDetail';
import PrepScoreCubes from '../../../components/mealprep/PrepScoreCubes';
import RecipeDetailSheet from '../../../components/mealprep/RecipeDetailSheet';
import { ParsedRecipe } from '../../../lib/eventWizardTypes';

interface DetailRecipeCardProps {
  linkedRecipe: LinkedRecipe | null | undefined;
  fullRecipe: FullRecipe | null | undefined;
  onRequestFullRecipe?: () => void;
}

function fullRecipeToParsed(r: FullRecipe): ParsedRecipe {
  const ni = r.nutritional_info || {};
  return {
    name: r.name,
    description: r.description || '',
    prepTimeMinutes: r.prep_time_minutes || 0,
    cookTimeMinutes: r.cook_time_minutes || 0,
    servings: r.servings || 0,
    ingredients: (r.ingredients || []).map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit, category: (i.category || 'other') as any })),
    instructions: r.instructions || [],
    skillLevel: (r.skill_level || 'intermediate') as any,
    mealPrepScore: r.meal_prep_score || 0,
    mealPrepScoreExplanation: r.meal_prep_score_explanation,
    tags: r.tags || [],
    nutritionalInfo: {
      calories: (ni as any).calories || 0,
      proteinG: (ni as any).protein_g || 0,
      carbsG: (ni as any).carbs_g || 0,
      fatG: (ni as any).fat_g || 0,
      fiberG: (ni as any).fiber_g || 0,
      sugarG: (ni as any).sugar_g || 0,
      sodiumMg: (ni as any).sodium_mg || 0,
    },
    equipmentNeeded: r.equipment_needed || [],
    sourceUrl: r.source_url,
  };
}

export default function DetailRecipeCard({ linkedRecipe, fullRecipe, onRequestFullRecipe }: DetailRecipeCardProps) {
  const [showDetail, setShowDetail] = useState(false);

  if (!linkedRecipe) return null;

  const handleView = () => {
    if (fullRecipe) {
      setShowDetail(true);
    } else {
      onRequestFullRecipe?.();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.card} onPress={handleView} activeOpacity={0.7}>
        <View style={styles.emojiBox}>
          <Text style={styles.emoji}>🍽️</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{linkedRecipe.name}</Text>
          <Text style={styles.meta}>
            {linkedRecipe.prep_time_minutes ? `${linkedRecipe.prep_time_minutes}m prep` : ''}
            {linkedRecipe.cook_time_minutes ? ` \u2022 ${linkedRecipe.cook_time_minutes}m cook` : ''}
            {linkedRecipe.servings ? ` \u2022 ${linkedRecipe.servings} servings` : ''}
          </Text>
          {fullRecipe?.meal_prep_score ? (
            <View style={styles.scoreRow}>
              <PrepScoreCubes score={fullRecipe.meal_prep_score} size={14} showLabel={false} />
            </View>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={mpColors.gray400} />
      </TouchableOpacity>

      {fullRecipe && showDetail && (
        <RecipeDetailSheet
          recipe={fullRecipeToParsed(fullRecipe)}
          visible={showDetail}
          onClose={() => setShowDetail(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 12,
    ...mpShadows.sm,
  },
  emojiBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: mpColors.amberLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  emoji: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  meta: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 2,
  },
  scoreRow: {
    marginTop: 4,
  },
});
