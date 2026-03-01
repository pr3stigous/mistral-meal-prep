import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useEventDraft } from '../useEventDraft';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../AuthContext';
import { handleRateLimitError } from '../../../lib/rateLimitHelpers';
import WizardProgressBar from '../../../components/mealprep/wizard/WizardProgressBar';
import WizardNavigation from '../../../components/mealprep/wizard/WizardNavigation';
import {
  Step2Data,
  ParsedRecipe,
  validateStep2,
  ingredientsToContributions,
} from '../../../lib/eventWizardTypes';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'CreateEventStep2'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'CreateEventStep2'>;

type RecipeTab = 'library' | 'url';

const Step2RecipeMenuScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId } = route.params;
  const { user } = useAuth();

  const { useDraft, updateDraft, isUpdating } = useEventDraft();
  const { data: draft, isLoading } = useDraft(draftId);

  // Refs for keyboard handling
  const scrollViewRef = useRef<ScrollView>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<RecipeTab>('library');

  // Library tab state
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [isLoadingSelectedRecipe, setIsLoadingSelectedRecipe] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // URL import tab state
  const [recipeUrl, setRecipeUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Enhancement state
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Recipe detail modal state
  const [showRecipeDetail, setShowRecipeDetail] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Step2Data>({
    recipeSource: 'library',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load draft data on mount
  useEffect(() => {
    if (draft?.draftData?.step2) {
      const step2 = draft.draftData.step2;
      setFormData(step2);
      if (step2.parsedRecipe) setParsedRecipe(step2.parsedRecipe);
      if (step2.recipeId) setSelectedRecipeId(step2.recipeId);
      // Map old 'paste' source to 'url' for backwards compatibility
      if (step2.recipeSource === 'paste' || step2.recipeSource === 'url') {
        setActiveTab('url');
      } else if (step2.recipeSource === 'library') {
        setActiveTab('library');
        // For library recipes without parsedRecipe (older drafts), re-fetch the recipe data
        if (step2.recipeId && !step2.parsedRecipe) {
          handleSelectRecipe(step2.recipeId);
        }
      }
    }
  }, [draft]);

  // Load saved recipes on mount and when library tab is active
  useEffect(() => {
    loadSavedRecipes();
  }, []);

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
    } catch (error) {
      console.error('Failed to load recipes:', error);
    } finally {
      setIsLoadingRecipes(false);
    }
  };

  // Check if a recipe needs meal prep enhancement
  const needsMealPrepEnhancement = (recipe: any): boolean => {
    // Recipe needs enhancement if it's missing meal_prep_score or equipment_needed
    const hasMealPrepScore = recipe.meal_prep_score != null && recipe.meal_prep_score > 0;
    const hasEquipment = recipe.equipment_needed && Array.isArray(recipe.equipment_needed) && recipe.equipment_needed.length > 0;
    return !hasMealPrepScore || !hasEquipment;
  };

  // Enhance a recipe for meal prep via edge function
  const enhanceRecipeForMealPrep = async (recipe: any): Promise<any> => {
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

      if (error) {
        console.error('Enhancement edge function error:', error);
        return null;
      }

      if (data?.success && data?.enhancement) {
        return data.enhancement;
      }

      return null;
    } catch (err) {
      console.error('Failed to enhance recipe:', err);
      return null;
    }
  };

  // Transform a database recipe row into ParsedRecipe format
  const dbRecipeToParsedRecipe = (dbRecipe: any, sourceUrl: string): ParsedRecipe => {
    const ingredients = (dbRecipe.ingredients || []).map((ing: any) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category || 'other',
    }));
    const nutritionalInfo = dbRecipe.nutritional_info || {};
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
        calories: nutritionalInfo.calories || 0,
        proteinG: nutritionalInfo.protein_g || nutritionalInfo.proteinG || 0,
        carbsG: nutritionalInfo.carbs_g || nutritionalInfo.carbsG || 0,
        fatG: nutritionalInfo.fat_g || nutritionalInfo.fatG || 0,
        fiberG: nutritionalInfo.fiber_g || nutritionalInfo.fiberG || 0,
        sugarG: nutritionalInfo.sugar_g || nutritionalInfo.sugarG || 0,
        sodiumMg: nutritionalInfo.sodium_mg || nutritionalInfo.sodiumMg || 0,
      },
      equipmentNeeded: dbRecipe.equipment_needed || [],
      sourceUrl: dbRecipe.source_url || sourceUrl,
      authorTips: dbRecipe.author_tips || [],
    };
  };

  // Import recipe from URL using Jina AI
  const handleImportFromUrl = async () => {
    if (!recipeUrl.trim()) {
      setImportError('Please enter a recipe URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(recipeUrl.trim());
    } catch {
      setImportError('Please enter a valid URL');
      return;
    }

    setIsImporting(true);
    setImportError(null);

    const trimmedUrl = recipeUrl.trim();

    try {
      // Check if this URL has already been imported to the user's library
      if (user?.id) {
        const { data: existingRecipe } = await supabase
          .from('recipes')
          .select('*')
          .eq('user_id', user.id)
          .eq('source_url', trimmedUrl)
          .limit(1)
          .maybeSingle();

        if (existingRecipe) {
          // Use the cached recipe directly — no need to call the edge function
          const recipe = dbRecipeToParsedRecipe(existingRecipe, trimmedUrl);
          setParsedRecipe(recipe);
          setFormData(prev => ({
            ...prev,
            recipeSource: 'url',
            parsedRecipe: recipe,
            recipeId: existingRecipe.id.toString(),
          }));
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke('parse-recipe-url', {
        body: {
          url: trimmedUrl,
          user_id: user?.id,
        },
      });

      if (error) throw error;

      if (data.success && data.recipe) {
        // Transform the response to match our ParsedRecipe type
        const recipe: ParsedRecipe = {
          name: data.recipe.name,
          description: data.recipe.description,
          prepTimeMinutes: data.recipe.prep_time_minutes,
          cookTimeMinutes: data.recipe.cook_time_minutes,
          servings: data.recipe.servings,
          ingredients: (data.recipe.ingredients || []).map((ing: any) => ({
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            category: ing.category || 'other',
          })),
          instructions: data.recipe.instructions,
          skillLevel: data.recipe.skill_level,
          mealPrepScore: data.recipe.meal_prep_score,
          mealPrepScoreExplanation: data.recipe.meal_prep_score_explanation,
          tags: data.recipe.tags,
          nutritionalInfo: {
            calories: data.recipe.nutritional_info?.calories || 0,
            proteinG: data.recipe.nutritional_info?.protein_g || 0,
            carbsG: data.recipe.nutritional_info?.carbs_g || 0,
            fatG: data.recipe.nutritional_info?.fat_g || 0,
            fiberG: data.recipe.nutritional_info?.fiber_g || 0,
            sugarG: data.recipe.nutritional_info?.sugar_g || 0,
            sodiumMg: data.recipe.nutritional_info?.sodium_mg || 0,
          },
          equipmentNeeded: data.recipe.equipment_needed || [],
          sourceUrl: data.recipe.source_url || trimmedUrl,
          imageUrl: data.recipe.image_url || undefined,
          authorTips: data.recipe.author_tips || [],
        };

        setParsedRecipe(recipe);
        setFormData(prev => ({
          ...prev,
          recipeSource: 'url',
          parsedRecipe: recipe,
        }));
      } else if (data.error === 'RATE_LIMITED') {
        // Show alert similar to photo analysis rate limiting
        handleRateLimitError(new Error(`RATE_LIMITED: Daily URL import limit reached. Try again tomorrow.`));
        setImportError(`Daily limit reached. You can import ${data.limit} recipes per day.`);
      } else {
        throw new Error(data.error || 'Failed to import recipe');
      }
    } catch (error: any) {
      console.error('Import error:', error);

      // Try to extract the actual error response from FunctionsHttpError
      let errorBody: any = null;
      if (error?.context?.json) {
        try {
          errorBody = await error.context.json();
        } catch {
          // Couldn't parse response body
        }
      }

      // Check if it's a rate limit error (either from error body or error message)
      if (errorBody?.error === 'RATE_LIMITED') {
        handleRateLimitError(new Error(`RATE_LIMITED: ${errorBody.message || 'Daily limit reached'}`));
        setImportError(`Daily limit reached. You can import ${errorBody.limit || 4} recipes per day.`);
      } else if (handleRateLimitError(error)) {
        setImportError('Daily limit reached for recipe imports.');
      } else {
        setImportError(
          'Couldn\'t import this recipe. The website may be temporarily unavailable. Please try again later or use a different URL.'
        );
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Select recipe from library - fetch full data and convert to ParsedRecipe format
  const handleSelectRecipe = async (recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setIsLoadingSelectedRecipe(true);
    setIsEnhancing(false);

    try {
      // Fetch full recipe data from database
      const { data: recipe, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId)
        .single();

      if (error || !recipe) {
        console.error('Error fetching recipe:', error);
        // Fallback: just store the ID without parsedRecipe
        setFormData(prev => ({
          ...prev,
          recipeSource: 'library',
          recipeId,
          parsedRecipe: undefined,
        }));
        setParsedRecipe(null);
        return;
      }

      // Check if recipe needs meal prep enhancement
      let enhancedRecipe = recipe;
      if (needsMealPrepEnhancement(recipe)) {
        setIsLoadingSelectedRecipe(false);
        setIsEnhancing(true);

        const enhancement = await enhanceRecipeForMealPrep(recipe);
        if (enhancement) {
          // Merge enhancement data into recipe
          enhancedRecipe = {
            ...recipe,
            meal_prep_score: enhancement.meal_prep_score,
            meal_prep_score_explanation: enhancement.meal_prep_score_explanation,
            skill_level: enhancement.skill_level,
            equipment_needed: enhancement.equipment_needed,
            // Update ingredients if categorized
            ingredients: enhancement.ingredients_categorized || recipe.ingredients,
          };
        }
        setIsEnhancing(false);
      }

      // Convert database recipe to ParsedRecipe format (same structure as URL imports)
      const libraryParsedRecipe: ParsedRecipe = {
        name: enhancedRecipe.name || '',
        description: enhancedRecipe.description || '',
        prepTimeMinutes: enhancedRecipe.prep_time_minutes || 0,
        cookTimeMinutes: enhancedRecipe.cook_time_minutes || 0,
        servings: enhancedRecipe.servings || 4,
        ingredients: (enhancedRecipe.ingredients || []).map((ing: any) => ({
          name: ing.name || '',
          quantity: ing.quantity || 0,
          unit: ing.unit || '',
          category: ing.category || 'other',
        })),
        instructions: enhancedRecipe.instructions || [],
        skillLevel: enhancedRecipe.skill_level || 'intermediate',
        mealPrepScore: enhancedRecipe.meal_prep_score || 3,
        mealPrepScoreExplanation: enhancedRecipe.meal_prep_score_explanation || '',
        tags: enhancedRecipe.tags || [],
        nutritionalInfo: enhancedRecipe.nutritional_info ? {
          calories: enhancedRecipe.nutritional_info.calories || 0,
          proteinG: enhancedRecipe.nutritional_info.protein_g || enhancedRecipe.nutritional_info.proteinG || 0,
          carbsG: enhancedRecipe.nutritional_info.carbs_g || enhancedRecipe.nutritional_info.carbsG || 0,
          fatG: enhancedRecipe.nutritional_info.fat_g || enhancedRecipe.nutritional_info.fatG || 0,
          fiberG: enhancedRecipe.nutritional_info.fiber_g || enhancedRecipe.nutritional_info.fiberG || 0,
          sugarG: enhancedRecipe.nutritional_info.sugar_g || enhancedRecipe.nutritional_info.sugarG || 0,
          sodiumMg: enhancedRecipe.nutritional_info.sodium_mg || enhancedRecipe.nutritional_info.sodiumMg || 0,
        } : {
          calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0, sodiumMg: 0,
        },
        equipmentNeeded: enhancedRecipe.equipment_needed || [],
        sourceUrl: enhancedRecipe.source_url || undefined,
        authorTips: enhancedRecipe.author_tips || [],
      };

      setParsedRecipe(libraryParsedRecipe);
      setFormData(prev => ({
        ...prev,
        recipeSource: 'library',
        recipeId,
        parsedRecipe: libraryParsedRecipe,
      }));
    } catch (err) {
      console.error('Error in handleSelectRecipe:', err);
    } finally {
      setIsLoadingSelectedRecipe(false);
    }
  };

  // Handle tab change
  const handleTabChange = (tab: RecipeTab) => {
    setActiveTab(tab);
    // Don't clear selections when switching tabs
  };

  // Navigate to recipe generator
  const handleGenerateRecipes = () => {
    // Navigate to the recipe generator screen
    // This assumes there's a route to the meal assistant recipe generator
    navigation.navigate('MealPrepEventList'); // Temporary - should navigate to recipe generator
    Alert.alert(
      'Generate Recipes',
      'Navigate to Meal Assistant to generate recipes, then come back to select one.',
      [{ text: 'OK' }]
    );
  };

  // Handle navigation
  const handleBack = () => {
    navigation.goBack();
  };

  const handleNext = async () => {
    // Determine if we have a valid selection
    const hasLibrarySelection = activeTab === 'library' && selectedRecipeId;
    const hasUrlImport = activeTab === 'url' && parsedRecipe;

    if (!hasLibrarySelection && !hasUrlImport) {
      Alert.alert('Recipe Required', 'Please select a recipe from your library or import one from a URL.');
      return;
    }

    // Save and navigate
    try {
      let finalRecipeId = selectedRecipeId;
      let finalFormData = { ...formData };

      // If URL import, save the recipe to the database first
      if (hasUrlImport && parsedRecipe && user?.id) {
        // Check if a recipe with the same source_url already exists
        if (parsedRecipe.sourceUrl) {
          const { data: existingByUrl } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', user.id)
            .eq('source_url', parsedRecipe.sourceUrl)
            .single();

          if (existingByUrl) {
            // Reuse existing recipe imported from the same URL
            finalRecipeId = existingByUrl.id.toString();
            finalFormData = { ...finalFormData, recipeId: finalRecipeId };
          }
        }

        // Check if a recipe with the same name already exists
        const { data: existingByName } = await supabase
          .from('recipes')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', parsedRecipe.name)
          .single();

        if (!finalRecipeId && existingByName) {
          // Reuse existing recipe with the same name (if not already found by URL)
          finalRecipeId = existingByName.id.toString();
          finalFormData = { ...finalFormData, recipeId: finalRecipeId };
        }

        // Only create new recipe if we didn't find an existing one
        if (!finalRecipeId) {
          // Transform parsedRecipe to database format
          // Cast to any to include fields that may not be in Supabase types
          const recipeToSave: any = {
            user_id: user.id,
            name: parsedRecipe.name,
            description: parsedRecipe.description || null,
            prep_time_minutes: parsedRecipe.prepTimeMinutes || null,
            cook_time_minutes: parsedRecipe.cookTimeMinutes || null,
            servings: parsedRecipe.servings || null,
            ingredients: parsedRecipe.ingredients || [],
            instructions: parsedRecipe.instructions || [],
            tags: parsedRecipe.tags || [],
            nutritional_info: parsedRecipe.nutritionalInfo ? {
              calories: parsedRecipe.nutritionalInfo.calories || 0,
              protein_g: parsedRecipe.nutritionalInfo.proteinG || 0,
              carbs_g: parsedRecipe.nutritionalInfo.carbsG || 0,
              fat_g: parsedRecipe.nutritionalInfo.fatG || 0,
              fiber_g: parsedRecipe.nutritionalInfo.fiberG || 0,
              sugar_g: parsedRecipe.nutritionalInfo.sugarG || 0,
              sodium_mg: parsedRecipe.nutritionalInfo.sodiumMg || 0,
            } : null,
            // Additional fields from URL imports (may not be in Supabase types)
            skill_level: parsedRecipe.skillLevel || null,
            meal_prep_score: parsedRecipe.mealPrepScore || null,
            meal_prep_score_explanation: parsedRecipe.mealPrepScoreExplanation || null,
            equipment_needed: parsedRecipe.equipmentNeeded || [],
            source_url: parsedRecipe.sourceUrl || null,
            image_url: parsedRecipe.imageUrl || null, // From edge function
            author_tips: parsedRecipe.authorTips || [],
          };

        const { data: savedRecipe, error: saveError } = await supabase
          .from('recipes')
          .insert(recipeToSave as any)
          .select('id')
          .single();

        if (saveError) {
          console.error('Failed to save recipe:', saveError);
          Alert.alert('Error', 'Failed to save recipe. Please try again.');
          return;
        }

          // Use the newly created recipe ID
          finalRecipeId = savedRecipe.id.toString();
          finalFormData = {
            ...finalFormData,
            recipeId: finalRecipeId,
          };
        }
      }

      // Build draft data with step2
      const draftData: Record<string, unknown> = {
        step2: finalFormData,
      };

      // If we have a parsed recipe (from URL import), generate contributions for step4
      if (finalFormData.parsedRecipe) {
        const contributions = ingredientsToContributions(
          finalFormData.parsedRecipe.ingredients || [],
          finalFormData.parsedRecipe.equipmentNeeded || []
        );
        // Merge with existing step4 data from draft
        const existingStep4 = draft?.draftData?.step4 || {};
        draftData.step4 = {
          ...existingStep4,
          contributions,
        };
      }

      await updateDraft({
        draftId,
        stepCompleted: 2,
        draftData,
      });
      navigation.navigate('CreateEventStep3', { draftId });
    } catch (error) {
      console.error('handleNext error:', error);
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard Changes?',
      'Your progress will be saved as a draft.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Save & Exit',
          onPress: async () => {
            try {
              await updateDraft({
                draftId,
                stepCompleted: 1,
                draftData: { step2: formData },
              });
            } catch {}
            navigation.navigate('MealPrepEventList');
          },
        },
      ]
    );
  };

  // Filter saved recipes
  const filteredRecipes = savedRecipes.filter(
    recipe =>
      recipe.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if we have any recipes
  const hasNoRecipes = !isLoadingRecipes && savedRecipes.length === 0;

  // Completed steps for progress bar
  const completedSteps = [1];

  // Render Recipe Preview Card (for URL imports)
  const RecipePreviewCard = ({ recipe }: { recipe: ParsedRecipe }) => (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <View style={styles.previewBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#34C759" />
          <Text style={styles.previewBadgeText}>Recipe Imported</Text>
        </View>
      </View>
      <Text style={styles.previewName}>{recipe.name}</Text>
      <Text style={styles.previewDescription} numberOfLines={2}>
        {recipe.description}
      </Text>
      <View style={styles.previewStats}>
        <View style={styles.previewStat}>
          <Ionicons name="time-outline" size={16} color="#8E8E93" />
          <Text style={styles.previewStatText}>
            {recipe.prepTimeMinutes + recipe.cookTimeMinutes} min
          </Text>
        </View>
        <View style={styles.previewStat}>
          <Ionicons name="people-outline" size={16} color="#8E8E93" />
          <Text style={styles.previewStatText}>{recipe.servings} servings</Text>
        </View>
        <View style={styles.previewStat}>
          <Ionicons name="fitness-outline" size={16} color="#8E8E93" />
          <Text style={styles.previewStatText}>{recipe.skillLevel}</Text>
        </View>
      </View>
      <View style={styles.previewMealPrep}>
        <Text style={styles.previewMealPrepLabel}>Prep Score</Text>
        <View style={styles.previewMealPrepScore}>
          {[1, 2, 3, 4, 5].map(i => (
            <Ionicons
              key={i}
              name={i <= (recipe.mealPrepScore || 0) ? 'cube' : 'cube-outline'}
              size={16}
              color={i <= (recipe.mealPrepScore || 0) ? '#3fa6a6' : '#C7C7CC'}
            />
          ))}
        </View>
      </View>
      <View style={styles.previewIngredients}>
        <Text style={styles.previewIngredientsLabel}>
          {recipe.ingredients?.length || 0} ingredients
        </Text>
        <Text style={styles.previewIngredientsHint}>
          Will be added to contribution board
        </Text>
      </View>
      <TouchableOpacity
        style={styles.viewRecipeButton}
        onPress={() => setShowRecipeDetail(true)}
      >
        <Ionicons name="eye-outline" size={18} color="#3fa6a6" />
        <Text style={styles.viewRecipeButtonText}>View Full Recipe</Text>
      </TouchableOpacity>
    </View>
  );

  // Recipe Detail Modal
  const RecipeDetailModal = ({ recipe, visible, onClose }: { recipe: ParsedRecipe; visible: boolean; onClose: () => void }) => (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{recipe.name}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={24} color="#1C1C1E" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Description */}
          {recipe.description && (
            <Text style={styles.modalDescription}>{recipe.description}</Text>
          )}

          {/* Quick Stats */}
          <View style={styles.modalStats}>
            <View style={styles.modalStatItem}>
              <Ionicons name="time-outline" size={20} color="#3fa6a6" />
              <Text style={styles.modalStatLabel}>Prep</Text>
              <Text style={styles.modalStatValue}>{recipe.prepTimeMinutes} min</Text>
            </View>
            <View style={styles.modalStatItem}>
              <Ionicons name="flame-outline" size={20} color="#3fa6a6" />
              <Text style={styles.modalStatLabel}>Cook</Text>
              <Text style={styles.modalStatValue}>{recipe.cookTimeMinutes} min</Text>
            </View>
            <View style={styles.modalStatItem}>
              <Ionicons name="people-outline" size={20} color="#3fa6a6" />
              <Text style={styles.modalStatLabel}>Serves</Text>
              <Text style={styles.modalStatValue}>{recipe.servings}</Text>
            </View>
            <View style={styles.modalStatItem}>
              <Ionicons name="fitness-outline" size={20} color="#3fa6a6" />
              <Text style={styles.modalStatLabel}>Level</Text>
              <Text style={styles.modalStatValue}>{recipe.skillLevel}</Text>
            </View>
          </View>

          {/* Meal Prep Score */}
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <Ionicons name="cube-outline" size={20} color="#1C1C1E" />
              <Text style={styles.modalSectionTitle}>Prep Score</Text>
            </View>
            <View style={styles.modalMealPrepScore}>
              {[1, 2, 3, 4, 5].map(i => (
                <Ionicons
                  key={i}
                  name={i <= (recipe.mealPrepScore || 0) ? 'cube' : 'cube-outline'}
                  size={24}
                  color={i <= (recipe.mealPrepScore || 0) ? '#3fa6a6' : '#C7C7CC'}
                />
              ))}
              <Text style={styles.modalMealPrepLabel}>{recipe.mealPrepScore || 0}/5</Text>
            </View>
            {recipe.mealPrepScoreExplanation && (
              <Text style={styles.modalMealPrepExplanation}>{recipe.mealPrepScoreExplanation}</Text>
            )}
          </View>

          {/* Ingredients */}
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <Ionicons name="list-outline" size={20} color="#1C1C1E" />
              <Text style={styles.modalSectionTitle}>Ingredients ({recipe.ingredients?.length || 0})</Text>
            </View>
            <View style={styles.modalIngredientsList}>
              {(recipe.ingredients || []).map((ing, index) => (
                <View key={index} style={styles.modalIngredientItem}>
                  <Text style={styles.modalIngredientQuantity}>
                    {ing.quantity} {ing.unit}
                  </Text>
                  <Text style={styles.modalIngredientName}>{ing.name}</Text>
                  <View style={[styles.modalIngredientCategory, { backgroundColor: getCategoryColor(ing.category) }]}>
                    <Text style={styles.modalIngredientCategoryText}>{ing.category}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Instructions */}
          <View style={styles.modalSection}>
            <View style={styles.modalSectionHeader}>
              <Ionicons name="document-text-outline" size={20} color="#1C1C1E" />
              <Text style={styles.modalSectionTitle}>Instructions ({recipe.instructions?.length || 0} steps)</Text>
            </View>
            <View style={styles.modalInstructionsList}>
              {(recipe.instructions || []).map((step, index) => (
                <View key={index} style={styles.modalInstructionItem}>
                  <View style={styles.modalInstructionNumber}>
                    <Text style={styles.modalInstructionNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.modalInstructionText}>{step}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Equipment */}
          {recipe.equipmentNeeded && recipe.equipmentNeeded.length > 0 && (
            <View style={styles.modalSection}>
              <View style={styles.modalSectionHeader}>
                <Ionicons name="construct-outline" size={20} color="#1C1C1E" />
                <Text style={styles.modalSectionTitle}>Equipment Needed</Text>
              </View>
              <View style={styles.modalEquipmentList}>
                {recipe.equipmentNeeded.map((item, index) => (
                  <View key={index} style={styles.modalEquipmentItem}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#3fa6a6" />
                    <Text style={styles.modalEquipmentText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Nutrition Info */}
          {recipe.nutritionalInfo && (
            <View style={styles.modalSection}>
              <View style={styles.modalSectionHeader}>
                <Ionicons name="nutrition-outline" size={20} color="#1C1C1E" />
                <Text style={styles.modalSectionTitle}>Nutrition (per serving)</Text>
              </View>
              <View style={styles.modalNutritionGrid}>
                <View style={styles.modalNutritionItem}>
                  <Text style={styles.modalNutritionValue}>{recipe.nutritionalInfo.calories}</Text>
                  <Text style={styles.modalNutritionLabel}>Calories</Text>
                </View>
                <View style={styles.modalNutritionItem}>
                  <Text style={styles.modalNutritionValue}>{recipe.nutritionalInfo.proteinG}g</Text>
                  <Text style={styles.modalNutritionLabel}>Protein</Text>
                </View>
                <View style={styles.modalNutritionItem}>
                  <Text style={styles.modalNutritionValue}>{recipe.nutritionalInfo.carbsG}g</Text>
                  <Text style={styles.modalNutritionLabel}>Carbs</Text>
                </View>
                <View style={styles.modalNutritionItem}>
                  <Text style={styles.modalNutritionValue}>{recipe.nutritionalInfo.fatG}g</Text>
                  <Text style={styles.modalNutritionLabel}>Fat</Text>
                </View>
              </View>
            </View>
          )}

          {/* Bottom spacing */}
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Use Recipe Button */}
        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.modalUseButton} onPress={onClose}>
            <Text style={styles.modalUseButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  // Helper function for ingredient category colors
  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      produce: '#E8F5E9',
      proteins: '#FFEBEE',
      dairy: '#E3F2FD',
      pantry: '#FFF8E1',
      frozen: '#E0F7FA',
      other: '#F5F5F5',
    };
    return colors[category] || colors.other;
  };

  // Determine if next button should be disabled
  // For both tabs, we need parsedRecipe to be populated (unified flow)
  const isNextDisabled = activeTab === 'library'
    ? !selectedRecipeId || isLoadingSelectedRecipe || isEnhancing || !parsedRecipe
    : !parsedRecipe;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recipe</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Progress Bar */}
      <WizardProgressBar
        currentStep={2}
        completedSteps={completedSteps}
        onStepPress={(step) => {
          if (step === 1) navigation.navigate('CreateEventStep1', { draftId });
        }}
      />

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'library' && styles.tabActive]}
          onPress={() => handleTabChange('library')}
        >
          <Ionicons
            name="book-outline"
            size={18}
            color={activeTab === 'library' ? '#3fa6a6' : '#8E8E93'}
          />
          <Text
            style={[styles.tabText, activeTab === 'library' && styles.tabTextActive]}
          >
            My Recipes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'url' && styles.tabActive]}
          onPress={() => handleTabChange('url')}
        >
          <Ionicons
            name="link-outline"
            size={18}
            color={activeTab === 'url' ? '#3fa6a6' : '#8E8E93'}
          />
          <Text
            style={[styles.tabText, activeTab === 'url' && styles.tabTextActive]}
          >
            Import URL
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 180 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Library Tab */}
          {activeTab === 'library' && (
            <View style={styles.tabContent}>
              <Text style={styles.stepTitle}>My Recipes</Text>
              <Text style={styles.stepSubtitle}>
                Choose from your saved recipes
              </Text>

              {isLoadingRecipes ? (
                <ActivityIndicator size="large" color="#3fa6a6" style={styles.loader} />
              ) : hasNoRecipes ? (
                // Enhanced empty state with generate CTA
                <View style={styles.emptyState}>
                  <Ionicons name="book-outline" size={56} color="#C7C7CC" />
                  <Text style={styles.emptyStateTitle}>Your cookbook is empty</Text>
                  <Text style={styles.emptyStateText}>
                    Generate your first recipe to use it for meal prep events
                  </Text>

                  <TouchableOpacity
                    style={styles.generateButton}
                    onPress={handleGenerateRecipes}
                  >
                    <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                    <Text style={styles.generateButtonText}>Generate Recipes</Text>
                  </TouchableOpacity>

                  <View style={styles.orDivider}>
                    <View style={styles.orLine} />
                    <Text style={styles.orText}>or</Text>
                    <View style={styles.orLine} />
                  </View>

                  <Text style={styles.emptyStateHint}>
                    Import a recipe from the web using the "Import URL" tab
                  </Text>
                </View>
              ) : (
                <>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search recipes..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollTo({ y: 50, animated: true });
                      }, 100);
                    }}
                  />

                  {filteredRecipes.length === 0 ? (
                    <View style={styles.noResultsState}>
                      <Ionicons name="search-outline" size={32} color="#C7C7CC" />
                      <Text style={styles.noResultsText}>No matching recipes</Text>
                    </View>
                  ) : (
                    <View style={styles.recipeGrid}>
                      {filteredRecipes.map(recipe => (
                        <TouchableOpacity
                          key={recipe.id}
                          style={[
                            styles.recipeCard,
                            selectedRecipeId === recipe.id.toString() && styles.recipeCardSelected,
                          ]}
                          onPress={() => handleSelectRecipe(recipe.id.toString())}
                        >
                          <View style={styles.recipeCardContent}>
                            <Text style={styles.recipeCardName} numberOfLines={2}>
                              {recipe.name}
                            </Text>
                            <Text style={styles.recipeCardMeta}>
                              {(recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0)} min •{' '}
                              {recipe.servings} servings
                            </Text>
                          </View>
                          {selectedRecipeId === recipe.id.toString() && (
                            <View style={styles.recipeCardCheck}>
                              {isLoadingSelectedRecipe || isEnhancing ? (
                                <ActivityIndicator size="small" color="#34C759" />
                              ) : (
                                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
                              )}
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Enhancement loading indicator */}
                  {isEnhancing && (
                    <View style={styles.enhancingContainer}>
                      <ActivityIndicator size="small" color="#3fa6a6" />
                      <Text style={styles.enhancingText}>Optimizing recipe for meal prep...</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* URL Import Tab */}
          {activeTab === 'url' && (
            <View style={styles.tabContent}>
              <Text style={styles.stepTitle}>Import from URL</Text>
              <Text style={styles.stepSubtitle}>
                Paste a recipe link and we'll extract the details
              </Text>

              {!parsedRecipe ? (
                <>
                  <View style={styles.urlInputContainer}>
                    <Ionicons name="link" size={20} color="#8E8E93" style={styles.urlIcon} />
                    <TextInput
                      style={styles.urlInput}
                      placeholder="https://allrecipes.com/recipe/..."
                      value={recipeUrl}
                      onChangeText={setRecipeUrl}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollTo({ y: 80, animated: true });
                        }, 100);
                      }}
                    />
                    {recipeUrl.length > 0 && (
                      <TouchableOpacity onPress={() => setRecipeUrl('')}>
                        <Ionicons name="close-circle" size={20} color="#C7C7CC" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {importError && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={16} color="#FF3B30" />
                      <Text style={styles.errorText}>{importError}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.importButton,
                      (!recipeUrl.trim() || isImporting) && styles.importButtonDisabled,
                    ]}
                    onPress={handleImportFromUrl}
                    disabled={!recipeUrl.trim() || isImporting}
                  >
                    {isImporting ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.importButtonText}>Importing recipe...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.importButtonText}>Import Recipe</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.supportedSites}>
                    <Text style={styles.supportedSitesTitle}>Works with most recipe sites:</Text>
                    <Text style={styles.supportedSitesList}>
                      Serious Eats, Budget Bytes, Simply Recipes, Epicurious, Food Network, and more
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <RecipePreviewCard recipe={parsedRecipe} />
                  <TouchableOpacity
                    style={styles.changeRecipeButton}
                    onPress={() => {
                      setParsedRecipe(null);
                      setRecipeUrl('');
                      setFormData(prev => ({
                        ...prev,
                        parsedRecipe: undefined,
                      }));
                    }}
                  >
                    <Text style={styles.changeRecipeText}>Import a different recipe</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Navigation */}
        <WizardNavigation
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Next"
          isLoading={isUpdating}
          isNextDisabled={isNextDisabled}
        />
      </KeyboardAvoidingView>

      {/* Recipe Detail Modal */}
      {parsedRecipe && (
        <RecipeDetailModal
          recipe={parsedRecipe}
          visible={showRecipeDetail}
          onClose={() => setShowRecipeDetail(false)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  cancelButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#3fa6a6',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  headerSpacer: {
    width: 60, // Match cancel button width for centering
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#E0F2F2',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#3fa6a6',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  tabContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 24,
  },
  // Library tab styles
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 16,
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3fa6a6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    width: '100%',
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5EA',
  },
  orText: {
    fontSize: 14,
    color: '#8E8E93',
    marginHorizontal: 16,
  },
  emptyStateHint: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  noResultsState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noResultsText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 12,
  },
  recipeGrid: {
    gap: 12,
  },
  recipeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  recipeCardSelected: {
    borderColor: '#34C759',
    borderWidth: 2,
  },
  recipeCardContent: {
    flex: 1,
  },
  recipeCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  recipeCardMeta: {
    fontSize: 13,
    color: '#8E8E93',
  },
  recipeCardCheck: {
    justifyContent: 'center',
    marginLeft: 12,
  },
  // URL import tab styles
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    marginBottom: 16,
  },
  urlIcon: {
    marginRight: 10,
  },
  urlInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1C1C1E',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    flex: 1,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3fa6a6',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  supportedSites: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
  },
  supportedSitesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  supportedSitesList: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 20,
  },
  // Recipe preview card styles
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#34C759',
  },
  previewHeader: {
    marginBottom: 12,
  },
  previewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },
  previewName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  previewDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 16,
    lineHeight: 20,
  },
  previewStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  previewStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewStatText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  previewMealPrep: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  previewMealPrepLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  previewMealPrepScore: {
    flexDirection: 'row',
    gap: 4,
  },
  previewIngredients: {
    backgroundColor: '#E0F2F2',
    padding: 12,
    borderRadius: 8,
  },
  previewIngredientsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3fa6a6',
  },
  previewIngredientsHint: {
    fontSize: 12,
    color: '#3fa6a6',
    marginTop: 2,
  },
  changeRecipeButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  changeRecipeText: {
    fontSize: 15,
    color: '#3fa6a6',
  },
  // View Full Recipe button
  viewRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    gap: 8,
  },
  viewRecipeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3fa6a6',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    flex: 1,
    paddingRight: 16,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalDescription: {
    fontSize: 15,
    color: '#8E8E93',
    lineHeight: 22,
    marginTop: 16,
    marginBottom: 20,
  },
  modalStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  modalStatItem: {
    alignItems: 'center',
  },
  modalStatLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  modalStatValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 2,
  },
  modalSection: {
    marginBottom: 24,
  },
  modalSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalMealPrepScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
  },
  modalMealPrepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginLeft: 8,
  },
  modalMealPrepExplanation: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 18,
  },
  modalIngredientsList: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalIngredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  modalIngredientQuantity: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    width: 80,
  },
  modalIngredientName: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
  },
  modalIngredientCategory: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  modalIngredientCategoryText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
    textTransform: 'capitalize',
  },
  modalInstructionsList: {
    gap: 16,
  },
  modalInstructionItem: {
    flexDirection: 'row',
    gap: 12,
  },
  modalInstructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3fa6a6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInstructionNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalInstructionText: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 22,
  },
  modalEquipmentList: {
    gap: 8,
  },
  modalEquipmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalEquipmentText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  modalNutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
  },
  modalNutritionItem: {
    alignItems: 'center',
  },
  modalNutritionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalNutritionLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  modalUseButton: {
    backgroundColor: '#3fa6a6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalUseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Enhancement loading styles
  enhancingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F7F7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 10,
  },
  enhancingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3fa6a6',
  },
});

export default Step2RecipeMenuScreen;
