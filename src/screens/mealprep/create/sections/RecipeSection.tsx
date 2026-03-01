import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../../constants/mealPrepTheme';
import { EventFormData, ParsedRecipe, RecipeMenuItem } from '../../../../lib/eventFormTypes';
import { ingredientsToContributions, multiRecipeToContributions } from '../../../../lib/eventWizardTypes';
import { supabase } from '../../../../lib/supabase';
import { useAuth } from '../../../../AuthContext';
import { handleRateLimitError } from '../../../../lib/rateLimitHelpers';
import PrepScoreCubes from '../../../../components/mealprep/PrepScoreCubes';
import RecipeDetailSheet from '../../../../components/mealprep/RecipeDetailSheet';
import RecipeSkeletonLoader from './RecipeSkeletonLoader';
import RecipePickerMulti from './RecipePickerMulti';
import MealPlanCard from './MealPlanCard';
import { ImportQueueItemData } from './ImportQueueItem';

const MAX_RECIPES = 5;

interface RecipeSectionProps {
  recipeSource: EventFormData['recipeSource'];
  recipeId?: string;
  parsedRecipe?: ParsedRecipe;
  isRecipeLoading: boolean;
  recipeMenu?: RecipeMenuItem[];
  onChange: (updates: Partial<EventFormData>) => void;
}

export default function RecipeSection({
  recipeSource,
  recipeId,
  parsedRecipe,
  isRecipeLoading,
  recipeMenu,
  onChange,
}: RecipeSectionProps) {
  const { user } = useAuth();

  // Saved recipes from DB
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingRecipes, setPendingRecipes] = useState<Map<string, ParsedRecipe>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  // URL import queue
  const [importQueue, setImportQueue] = useState<ImportQueueItemData[]>([]);

  // Detail sheet
  const [showDetail, setShowDetail] = useState(false);

  // Track whether user has interacted with the picker (to avoid clearing draft data on mount)
  const hasInteractedRef = useRef(false);

  // Track last committed selection to avoid duplicate onChange calls
  const lastCommittedRef = useRef<string>('');

  // Load saved recipes on mount
  useEffect(() => {
    loadSavedRecipes();
  }, []);

  // Initialize selectedIds from existing recipeMenu when returning via "Change"
  useEffect(() => {
    if (selectedIds.size > 0) return; // Don't override if already selecting

    if (recipeMenu && recipeMenu.length > 0 && !hasInteractedRef.current) {
      // Loaded from draft or "Change" was tapped — restore selections into picker
      const ids = new Set<string>();
      const recipes = new Map<string, ParsedRecipe>();
      for (const item of recipeMenu) {
        ids.add(item.recipeId);
        recipes.set(item.recipeId, item.parsedRecipe);
      }
      setSelectedIds(ids);
      setPendingRecipes(recipes);
      // Pre-set the lastCommitted so the effect doesn't re-fire onChange
      lastCommittedRef.current = [...ids].sort().join(',');
    } else if (recipeId && parsedRecipe && !recipeMenu && !hasInteractedRef.current) {
      // Single recipe loaded from draft — restore into picker
      setSelectedIds(new Set([recipeId]));
      setPendingRecipes(new Map([[recipeId, parsedRecipe]]));
      lastCommittedRef.current = recipeId;
    }
  }, [recipeMenu, parsedRecipe, recipeId]);

  // =====================================================
  // AUTO-COMMIT: sync form data as recipes are selected
  // =====================================================
  useEffect(() => {
    if (!hasInteractedRef.current) return; // Don't auto-commit on mount

    const ids = [...selectedIds].sort();
    const key = ids.join(',');

    // Don't re-commit if nothing changed
    if (key === lastCommittedRef.current) return;

    // Check if all selected recipes are loaded
    const allLoaded = ids.length > 0 && ids.every(id => pendingRecipes.has(id) && !loadingIds.has(id));

    if (ids.length === 0) {
      // User deselected everything — clear form
      lastCommittedRef.current = '';
      onChange({
        recipeMenu: undefined,
        recipeId: undefined,
        parsedRecipe: undefined,
        recipeSource: null,
        isRecipeLoading: false,
        contributions: [],
      });
      return;
    }

    if (!allLoaded) return; // Still loading, wait

    lastCommittedRef.current = key;

    if (ids.length === 1) {
      // Single recipe
      const id = ids[0];
      const recipe = pendingRecipes.get(id)!;
      const contributions = ingredientsToContributions(
        recipe.ingredients || [],
        recipe.equipmentNeeded || []
      );
      onChange({
        recipeSource: 'library',
        recipeId: id,
        parsedRecipe: recipe,
        isRecipeLoading: false,
        skillLevel: recipe.skillLevel || null,
        recipeMenu: undefined,
        contributions,
      });
    } else {
      // Multi-recipe
      const items: RecipeMenuItem[] = ids.map((id, index) => ({
        recipeId: id,
        parsedRecipe: pendingRecipes.get(id)!,
        sortOrder: index,
        colorIndex: index,
      }));
      const contributions = multiRecipeToContributions(items);
      onChange({
        recipeMenu: items,
        recipeSource: null,
        recipeId: undefined,
        parsedRecipe: undefined,
        isRecipeLoading: false,
        contributions,
      });
    }
  }, [selectedIds, pendingRecipes, loadingIds]);

  const loadSavedRecipes = async () => {
    setIsLoadingRecipes(true);
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, description, prep_time_minutes, cook_time_minutes, servings, image_url')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setSavedRecipes(data || []);
    } catch {
      // silently fail
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  const needsEnhancement = (recipe: any): boolean => {
    const hasMealPrepScore = recipe.meal_prep_score != null && recipe.meal_prep_score > 0;
    const hasEquipment = recipe.equipment_needed && Array.isArray(recipe.equipment_needed) && recipe.equipment_needed.length > 0;
    return !hasMealPrepScore || !hasEquipment;
  };

  const enhanceRecipe = async (recipe: any) => {
    if (!user?.id) return null;
    try {
      const { data, error } = await supabase.functions.invoke('enhance-recipe-for-mealprep', {
        body: {
          recipe: {
            id: recipe.id,
            name: recipe.name,
            description: recipe.description,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            prep_time_minutes: recipe.prep_time_minutes,
            cook_time_minutes: recipe.cook_time_minutes,
            servings: recipe.servings,
          },
          user_id: user.id,
        },
      });
      if (error) return null;
      return data?.success && data?.enhancement ? data.enhancement : null;
    } catch {
      return null;
    }
  };

  const dbRecipeToParsedRecipe = (dbRecipe: any): ParsedRecipe => {
    const ingredients = (dbRecipe.ingredients || []).map((ing: any) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category || 'other',
    }));
    const ni = dbRecipe.nutritional_info || {};
    return {
      name: dbRecipe.name,
      description: dbRecipe.description || '',
      prepTimeMinutes: dbRecipe.prep_time_minutes || 0,
      cookTimeMinutes: dbRecipe.cook_time_minutes || 0,
      servings: dbRecipe.servings || 0,
      ingredients,
      instructions: dbRecipe.instructions || [],
      skillLevel: dbRecipe.skill_level || 'intermediate',
      mealPrepScore: dbRecipe.meal_prep_score || 3,
      mealPrepScoreExplanation: dbRecipe.meal_prep_score_explanation || '',
      tags: dbRecipe.tags || [],
      nutritionalInfo: {
        calories: ni.calories || 0,
        proteinG: ni.protein_g || ni.proteinG || 0,
        carbsG: ni.carbs_g || ni.carbsG || 0,
        fatG: ni.fat_g || ni.fatG || 0,
        fiberG: ni.fiber_g || ni.fiberG || 0,
        sugarG: ni.sugar_g || ni.sugarG || 0,
        sodiumMg: ni.sodium_mg || ni.sodiumMg || 0,
      },
      equipmentNeeded: dbRecipe.equipment_needed || [],
      sourceUrl: dbRecipe.source_url || undefined,
      authorTips: dbRecipe.author_tips || [],
    };
  };

  // Toggle recipe selection (for library tab)
  const handleToggleRecipe = useCallback(async (id: string) => {
    hasInteractedRef.current = true;

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= MAX_RECIPES) {
        Alert.alert('Maximum Recipes', `You can select up to ${MAX_RECIPES} recipes per event.`);
        return prev;
      }
      next.add(id);
      return next;
    });

    // Fetch full recipe if not already loaded
    if (!pendingRecipes.has(id)) {
      setLoadingIds(prev => new Set(prev).add(id));
      try {
        const { data: recipe, error } = await supabase
          .from('recipes')
          .select('*')
          .eq('id', id)
          .single();

        if (error || !recipe) {
          setLoadingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
          return;
        }

        let enhanced = recipe;
        if (needsEnhancement(recipe)) {
          const enhancement = await enhanceRecipe(recipe);
          if (enhancement) {
            enhanced = {
              ...recipe,
              meal_prep_score: enhancement.meal_prep_score,
              meal_prep_score_explanation: enhancement.meal_prep_score_explanation,
              skill_level: enhancement.skill_level,
              equipment_needed: enhancement.equipment_needed,
              ingredients: enhancement.ingredients_categorized || recipe.ingredients,
            };
          }
        }

        const parsed = dbRecipeToParsedRecipe(enhanced);
        setPendingRecipes(prev => new Map(prev).set(id, parsed));
      } catch {
        // Failed to load — deselect
        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      } finally {
        setLoadingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
  }, [pendingRecipes, user]);

  // Import recipe from URL
  const handleImportUrl = useCallback(async (url: string) => {
    hasInteractedRef.current = true;
    const queueId = `import-${Date.now()}`;
    setImportQueue(prev => [...prev, { id: queueId, url, status: 'importing' }]);

    try {
      // Check cache
      if (user?.id) {
        const { data: existing } = await supabase
          .from('recipes')
          .select('*')
          .eq('user_id', user.id)
          .eq('source_url', url)
          .limit(1)
          .maybeSingle();

        if (existing) {
          const parsed = dbRecipeToParsedRecipe(existing);
          const id = existing.id.toString();
          setPendingRecipes(prev => new Map(prev).set(id, parsed));
          setSelectedIds(prev => {
            if (prev.size >= MAX_RECIPES) return prev;
            return new Set(prev).add(id);
          });
          setImportQueue(prev => prev.map(q =>
            q.id === queueId ? { ...q, status: 'done' as const, name: parsed.name, recipeId: id } : q
          ));
          // Add to saved recipes list so it shows on library tab
          if (!savedRecipes.some(r => r.id.toString() === id)) {
            setSavedRecipes(prev => [{ id: existing.id, name: existing.name, description: existing.description, prep_time_minutes: existing.prep_time_minutes, cook_time_minutes: existing.cook_time_minutes, servings: existing.servings }, ...prev]);
          }
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke('parse-recipe-url', {
        body: { url, user_id: user?.id },
      });

      if (error) throw error;

      if (data.success && data.recipe) {
        const r = data.recipe;
        const parsed: ParsedRecipe = {
          name: r.name,
          description: r.description,
          prepTimeMinutes: r.prep_time_minutes,
          cookTimeMinutes: r.cook_time_minutes,
          servings: r.servings,
          ingredients: (r.ingredients || []).map((ing: any) => ({
            name: ing.name, quantity: ing.quantity, unit: ing.unit, category: ing.category || 'other',
          })),
          instructions: r.instructions,
          skillLevel: r.skill_level,
          mealPrepScore: r.meal_prep_score,
          mealPrepScoreExplanation: r.meal_prep_score_explanation,
          tags: r.tags,
          nutritionalInfo: {
            calories: r.nutritional_info?.calories || 0,
            proteinG: r.nutritional_info?.protein_g || 0,
            carbsG: r.nutritional_info?.carbs_g || 0,
            fatG: r.nutritional_info?.fat_g || 0,
            fiberG: r.nutritional_info?.fiber_g || 0,
            sugarG: r.nutritional_info?.sugar_g || 0,
            sodiumMg: r.nutritional_info?.sodium_mg || 0,
          },
          equipmentNeeded: r.equipment_needed || [],
          sourceUrl: r.source_url || url,
          imageUrl: r.image_url || undefined,
          authorTips: r.author_tips || [],
        };

        // Save to DB
        let savedId: string | undefined;
        if (user?.id) {
          const recipeToSave: any = {
            user_id: user.id,
            name: parsed.name,
            description: parsed.description || null,
            prep_time_minutes: parsed.prepTimeMinutes || null,
            cook_time_minutes: parsed.cookTimeMinutes || null,
            servings: parsed.servings || null,
            ingredients: parsed.ingredients || [],
            instructions: parsed.instructions || [],
            tags: parsed.tags || [],
            nutritional_info: parsed.nutritionalInfo ? {
              calories: parsed.nutritionalInfo.calories,
              protein_g: parsed.nutritionalInfo.proteinG,
              carbs_g: parsed.nutritionalInfo.carbsG,
              fat_g: parsed.nutritionalInfo.fatG,
              fiber_g: parsed.nutritionalInfo.fiberG,
              sugar_g: parsed.nutritionalInfo.sugarG,
              sodium_mg: parsed.nutritionalInfo.sodiumMg,
            } : null,
            skill_level: parsed.skillLevel || null,
            meal_prep_score: parsed.mealPrepScore || null,
            meal_prep_score_explanation: parsed.mealPrepScoreExplanation || null,
            equipment_needed: parsed.equipmentNeeded || [],
            source_url: parsed.sourceUrl || null,
            image_url: parsed.imageUrl || null,
            author_tips: parsed.authorTips || [],
          };
          const { data: saved } = await supabase.from('recipes').insert(recipeToSave as any).select('id').single();
          if (saved) savedId = saved.id.toString();
        }

        const recipeIdStr = savedId || queueId;
        setPendingRecipes(prev => new Map(prev).set(recipeIdStr, parsed));
        setSelectedIds(prev => {
          if (prev.size >= MAX_RECIPES) return prev;
          return new Set(prev).add(recipeIdStr);
        });
        setImportQueue(prev => prev.map(q =>
          q.id === queueId ? { ...q, status: 'done' as const, name: parsed.name, recipeId: recipeIdStr } : q
        ));

        // Add to saved recipes list
        if (savedId) {
          setSavedRecipes(prev => [{ id: parseInt(savedId!), name: parsed.name, description: parsed.description, prep_time_minutes: parsed.prepTimeMinutes, cook_time_minutes: parsed.cookTimeMinutes, servings: parsed.servings }, ...prev]);
        }
      } else if (data.error === 'RATE_LIMITED') {
        handleRateLimitError(new Error('RATE_LIMITED'));
        setImportQueue(prev => prev.map(q =>
          q.id === queueId ? { ...q, status: 'error' as const } : q
        ));
      } else {
        throw new Error(data.error || 'Failed to import recipe');
      }
    } catch (err) {
      console.error('[RecipeSection] URL import failed:', err);
      setImportQueue(prev => prev.map(q =>
        q.id === queueId ? { ...q, status: 'error' as const } : q
      ));
    }
  }, [user, savedRecipes]);

  const handleRetryImport = useCallback((queueId: string) => {
    const item = importQueue.find(q => q.id === queueId);
    if (item) {
      setImportQueue(prev => prev.filter(q => q.id !== queueId));
      handleImportUrl(item.url);
    }
  }, [importQueue, handleImportUrl]);

  const handleRemoveFromQueue = useCallback((queueId: string) => {
    const item = importQueue.find(q => q.id === queueId);
    setImportQueue(prev => prev.filter(q => q.id !== queueId));
    if (item?.recipeId) {
      setSelectedIds(prev => { const n = new Set(prev); n.delete(item.recipeId!); return n; });
    }
  }, [importQueue]);

  // "Change" handler — re-enter selection mode with current recipes pre-selected
  const handleChange = useCallback(() => {
    hasInteractedRef.current = true;
    // Restore selections from current recipeMenu or single recipe
    if (recipeMenu && recipeMenu.length > 0) {
      const ids = new Set<string>();
      const recipes = new Map<string, ParsedRecipe>();
      for (const item of recipeMenu) {
        ids.add(item.recipeId);
        recipes.set(item.recipeId, item.parsedRecipe);
      }
      setSelectedIds(ids);
      setPendingRecipes(recipes);
      lastCommittedRef.current = [...ids].sort().join(',');
    } else if (recipeId && parsedRecipe) {
      setSelectedIds(new Set([recipeId]));
      setPendingRecipes(new Map([[recipeId, parsedRecipe]]));
      lastCommittedRef.current = recipeId;
    }
  }, [recipeMenu, recipeId, parsedRecipe]);

  // =====================================================
  // RENDER
  // =====================================================

  const isSelecting = hasInteractedRef.current || selectedIds.size > 0;
  const isMultiRecipe = recipeMenu && recipeMenu.length >= 2;
  const isSingleRecipe = !!parsedRecipe && !isMultiRecipe;
  const isLoading = isRecipeLoading && !parsedRecipe && !isMultiRecipe;

  // Build live preview recipeMenu from current selections
  const liveRecipeMenu = React.useMemo<RecipeMenuItem[]>(() => {
    const ids = [...selectedIds];
    const allLoaded = ids.every(id => pendingRecipes.has(id) && !loadingIds.has(id));
    if (!allLoaded || ids.length < 2) return [];
    return ids.map((id, index) => ({
      recipeId: id,
      parsedRecipe: pendingRecipes.get(id)!,
      sortOrder: index,
      colorIndex: index,
    }));
  }, [selectedIds, pendingRecipes, loadingIds]);

  // Loading state (initial recipe loading from another source)
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Recipe</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={mpColors.teal} />
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
        <RecipeSkeletonLoader />
      </View>
    );
  }

  // Active selection mode — show live card + picker
  if (isSelecting) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>
          {selectedIds.size >= 2 ? 'Recipes' : 'Recipe'}
        </Text>

        {/* Picker always visible during selection */}
        <RecipePickerMulti
          savedRecipes={savedRecipes}
          isLoadingRecipes={isLoadingRecipes}
          selectedIds={selectedIds}
          pendingRecipes={pendingRecipes}
          loadingIds={loadingIds}
          importQueue={importQueue}
          onToggleRecipe={handleToggleRecipe}
          onImportUrl={handleImportUrl}
          onRetryImport={handleRetryImport}
          onRemoveFromQueue={handleRemoveFromQueue}
          maxRecipes={MAX_RECIPES}
        />

        {/* Live MealPlanCard preview below picker (2+ recipes selected and loaded) */}
        {liveRecipeMenu.length >= 2 && (
          <View style={{ marginTop: 12 }}>
            <MealPlanCard recipeMenu={liveRecipeMenu} isLivePreview />
          </View>
        )}
      </View>
    );
  }

  // Committed multi-recipe (loaded from draft, not yet interacted)
  if (isMultiRecipe) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Recipes</Text>
        <MealPlanCard recipeMenu={recipeMenu!} onChange={handleChange} />
      </View>
    );
  }

  // Committed single recipe (loaded from draft, not yet interacted)
  if (isSingleRecipe) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Recipe</Text>
        <View style={styles.recipeCard}>
          <View style={styles.recipeCardHeader}>
            <Ionicons name="checkmark-circle" size={18} color={mpColors.green} />
            <Text style={styles.recipeCardHeaderText}>Recipe Prepped</Text>
          </View>
          <Text style={styles.recipeName}>{parsedRecipe!.name}</Text>
          {parsedRecipe!.description ? (
            <Text style={styles.recipeDesc} numberOfLines={2}>{parsedRecipe!.description}</Text>
          ) : null}
          <View style={styles.recipeStats}>
            <Text style={styles.recipeStat}>{parsedRecipe!.prepTimeMinutes}m prep</Text>
            <Text style={styles.recipeStatDot}>&bull;</Text>
            <Text style={styles.recipeStat}>{parsedRecipe!.cookTimeMinutes}m cook</Text>
            <Text style={styles.recipeStatDot}>&bull;</Text>
            <Text style={styles.recipeStat}>{parsedRecipe!.servings} servings</Text>
          </View>
          <View style={styles.prepScoreRow}>
            <Text style={styles.prepScoreLabel}>Prep Score</Text>
            <PrepScoreCubes score={parsedRecipe!.mealPrepScore || 0} size={18} />
          </View>
          <View style={styles.recipeActions}>
            <TouchableOpacity style={styles.viewRecipeButton} onPress={() => setShowDetail(true)}>
              <Ionicons name="information-circle-outline" size={16} color={mpColors.teal} />
              <Text style={styles.viewRecipeText}>View Full Recipe</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeRecipeButton} onPress={handleChange}>
              <Text style={styles.changeRecipeText}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>
        {parsedRecipe && (
          <RecipeDetailSheet recipe={parsedRecipe} visible={showDetail} onClose={() => setShowDetail(false)} />
        )}
      </View>
    );
  }

  // Empty state — show picker
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Recipe</Text>
      <RecipePickerMulti
        savedRecipes={savedRecipes}
        isLoadingRecipes={isLoadingRecipes}
        selectedIds={selectedIds}
        pendingRecipes={pendingRecipes}
        loadingIds={loadingIds}
        importQueue={importQueue}
        onToggleRecipe={handleToggleRecipe}
        onImportUrl={handleImportUrl}
        onRetryImport={handleRetryImport}
        onRemoveFromQueue={handleRemoveFromQueue}
        maxRecipes={MAX_RECIPES}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    marginBottom: 8,
  },
  // Loading
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  // Single recipe card
  recipeCard: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 16,
    ...mpShadows.sm,
  },
  recipeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  recipeCardHeaderText: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.green,
  },
  recipeName: {
    fontSize: 17,
    fontFamily: mpFonts.bold,
    color: mpColors.gray800,
    marginBottom: 4,
  },
  recipeDesc: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    lineHeight: 18,
    marginBottom: 8,
  },
  recipeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  recipeStat: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
  recipeStatDot: {
    color: mpColors.gray300,
  },
  prepScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: mpColors.tealMist,
    padding: 10,
    borderRadius: mpRadii.sm,
    marginBottom: 12,
  },
  prepScoreLabel: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.tealDark,
  },
  recipeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewRecipeText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
  },
  changeRecipeButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  changeRecipeText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
});
