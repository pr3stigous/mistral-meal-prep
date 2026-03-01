import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii } from '../../constants/mealPrepTheme';
import PrepScoreCubes from './PrepScoreCubes';
import { ParsedRecipe } from '../../lib/eventWizardTypes';

interface RecipeDetailSheetProps {
  recipe: ParsedRecipe;
  visible: boolean;
  onClose: () => void;
}

const getCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    produce: '#E8F5E9',
    proteins: '#FFEBEE',
    dairy: '#E3F2FD',
    pantry: '#FFF8E1',
    frozen: '#E0F7FA',
    other: '#F5F5F5',
    equipment: '#F3E8FF',
  };
  return colors[category] || colors.other;
};

export default function RecipeDetailSheet({ recipe, visible, onClose }: RecipeDetailSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>{recipe.name}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={mpColors.gray800} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Description */}
          {recipe.description ? (
            <Text style={styles.description}>{recipe.description}</Text>
          ) : null}

          {/* Quick Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={20} color={mpColors.teal} />
              <Text style={styles.statLabel}>Prep</Text>
              <Text style={styles.statValue}>{recipe.prepTimeMinutes} min</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="flame-outline" size={20} color={mpColors.teal} />
              <Text style={styles.statLabel}>Cook</Text>
              <Text style={styles.statValue}>{recipe.cookTimeMinutes} min</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={20} color={mpColors.teal} />
              <Text style={styles.statLabel}>Serves</Text>
              <Text style={styles.statValue}>{recipe.servings}</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="fitness-outline" size={20} color={mpColors.teal} />
              <Text style={styles.statLabel}>Level</Text>
              <Text style={styles.statValue}>{recipe.skillLevel}</Text>
            </View>
          </View>

          {/* Prep Score */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cube-outline" size={20} color={mpColors.gray800} />
              <Text style={styles.sectionTitle}>Prep Score</Text>
            </View>
            <View style={styles.prepScoreRow}>
              <PrepScoreCubes score={recipe.mealPrepScore || 0} size={24} />
            </View>
            {recipe.mealPrepScoreExplanation ? (
              <Text style={styles.prepScoreExplanation}>{recipe.mealPrepScoreExplanation}</Text>
            ) : null}
          </View>

          {/* Ingredients */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list-outline" size={20} color={mpColors.gray800} />
              <Text style={styles.sectionTitle}>
                Ingredients ({recipe.ingredients?.length || 0})
              </Text>
            </View>
            <View style={styles.ingredientsList}>
              {(recipe.ingredients || []).map((ing, index) => (
                <View key={index} style={styles.ingredientItem}>
                  <Text style={styles.ingredientQty}>
                    {ing.quantity} {ing.unit}
                  </Text>
                  <Text style={styles.ingredientName}>{ing.name}</Text>
                  <View style={[styles.categoryTag, { backgroundColor: getCategoryColor(ing.category) }]}>
                    <Text style={styles.categoryTagText}>{ing.category}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={20} color={mpColors.gray800} />
              <Text style={styles.sectionTitle}>
                Instructions ({recipe.instructions?.length || 0} steps)
              </Text>
            </View>
            <View style={styles.instructionsList}>
              {(recipe.instructions || []).map((step, index) => (
                <View key={index} style={styles.instructionItem}>
                  <View style={styles.instructionNumber}>
                    <Text style={styles.instructionNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.instructionText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Equipment */}
          {recipe.equipmentNeeded && recipe.equipmentNeeded.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="construct-outline" size={20} color={mpColors.gray800} />
                <Text style={styles.sectionTitle}>Equipment Needed</Text>
              </View>
              <View style={styles.equipmentChips}>
                {recipe.equipmentNeeded.map((item, index) => (
                  <View key={index} style={styles.equipmentChip}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={mpColors.teal} />
                    <Text style={styles.equipmentChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Nutrition */}
          {recipe.nutritionalInfo ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="nutrition-outline" size={20} color={mpColors.gray800} />
                <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>
              </View>
              <View style={styles.nutritionGrid}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{recipe.nutritionalInfo.calories}</Text>
                  <Text style={styles.nutritionLabel}>Calories</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{recipe.nutritionalInfo.proteinG}g</Text>
                  <Text style={styles.nutritionLabel}>Protein</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{recipe.nutritionalInfo.carbsG}g</Text>
                  <Text style={styles.nutritionLabel}>Carbs</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{recipe.nutritionalInfo.fatG}g</Text>
                  <Text style={styles.nutritionLabel}>Fat</Text>
                </View>
              </View>
            </View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mpColors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray200,
  },
  title: {
    fontSize: 18,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
    flex: 1,
    paddingRight: 16,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    lineHeight: 22,
    marginTop: 16,
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: mpColors.gray100,
    borderRadius: mpRadii.button,
    padding: 16,
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 4,
  },
  statValue: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
  },
  prepScoreRow: {
    backgroundColor: mpColors.gray100,
    padding: 12,
    borderRadius: mpRadii.sm,
  },
  prepScoreExplanation: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 8,
    lineHeight: 18,
  },
  ingredientsList: {
    backgroundColor: mpColors.gray50,
    borderRadius: mpRadii.button,
    overflow: 'hidden',
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray200,
  },
  ingredientQty: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    width: 80,
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  categoryTagText: {
    fontSize: 11,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
    textTransform: 'capitalize',
  },
  instructionsList: {
    gap: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: mpColors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionNumberText: {
    fontSize: 14,
    fontFamily: mpFonts.bold,
    color: mpColors.white,
  },
  instructionText: {
    flex: 1,
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    lineHeight: 22,
  },
  equipmentChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: mpColors.gray100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: mpRadii.sm,
  },
  equipmentChipText: {
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: mpColors.gray100,
    borderRadius: mpRadii.button,
    padding: 16,
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
  },
  nutritionLabel: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 4,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray200,
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
