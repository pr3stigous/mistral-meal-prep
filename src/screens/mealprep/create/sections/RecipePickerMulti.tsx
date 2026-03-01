import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../../constants/mealPrepTheme';
import { ParsedRecipe } from '../../../../lib/eventFormTypes';
import SelectedCountBanner from './SelectedCountBanner';
import ImportQueueItem, { ImportQueueItemData } from './ImportQueueItem';

type RecipeTab = 'library' | 'url';

interface RecipePickerMultiProps {
  savedRecipes: any[];
  isLoadingRecipes: boolean;
  selectedIds: Set<string>;
  pendingRecipes: Map<string, ParsedRecipe>;
  loadingIds: Set<string>;
  importQueue: ImportQueueItemData[];
  onToggleRecipe: (id: string) => void;
  onImportUrl: (url: string) => void;
  onRetryImport: (queueId: string) => void;
  onRemoveFromQueue: (queueId: string) => void;
  maxRecipes: number;
}

export default function RecipePickerMulti({
  savedRecipes,
  isLoadingRecipes,
  selectedIds,
  pendingRecipes,
  loadingIds,
  importQueue,
  onToggleRecipe,
  onImportUrl,
  onRetryImport,
  onRemoveFromQueue,
  maxRecipes,
}: RecipePickerMultiProps) {
  const [activeTab, setActiveTab] = useState<RecipeTab>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [recipeUrl, setRecipeUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const selectedCount = selectedIds.size;
  const isMaxed = selectedCount >= maxRecipes;

  // Count by source
  const librarySelectedCount = savedRecipes.filter(r => selectedIds.has(r.id.toString())).length;
  const importedSelectedCount = selectedCount - librarySelectedCount;

  const filteredRecipes = savedRecipes.filter(r =>
    !searchQuery.trim() || r.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddUrl = () => {
    const trimmed = recipeUrl.trim();
    if (!trimmed) {
      setUrlError('Please enter a recipe URL');
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setUrlError('Please enter a valid URL');
      return;
    }
    // Check dupe
    if (importQueue.some(q => q.url === trimmed)) {
      setUrlError('This URL is already in your queue');
      return;
    }
    setUrlError(null);
    setRecipeUrl('');
    onImportUrl(trimmed);
  };

  return (
    <View>
      <SelectedCountBanner
        count={selectedCount}
        maxCount={maxRecipes}
        libraryCount={librarySelectedCount}
        importedCount={importedSelectedCount}
      />

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'library' && styles.tabActive]}
          onPress={() => setActiveTab('library')}
        >
          <Text style={[styles.tabText, activeTab === 'library' && styles.tabTextActive]}>
            My Recipes
          </Text>
          {librarySelectedCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{librarySelectedCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'url' && styles.tabActive]}
          onPress={() => setActiveTab('url')}
        >
          <Text style={[styles.tabText, activeTab === 'url' && styles.tabTextActive]}>
            Import URL
          </Text>
          {importedSelectedCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{importedSelectedCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'library' ? (
        <View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes..."
            placeholderTextColor={mpColors.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {isLoadingRecipes ? (
            <ActivityIndicator style={{ marginTop: 20 }} color={mpColors.teal} />
          ) : filteredRecipes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={32} color={mpColors.gray300} />
              <Text style={styles.emptyText}>No recipes yet. Import one or generate with Meal Assistant.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredRecipes}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              renderItem={({ item }) => {
                const id = item.id.toString();
                const isSelected = selectedIds.has(id);
                const isLoading = loadingIds.has(id);
                const dimmed = isMaxed && !isSelected;

                return (
                  <TouchableOpacity
                    style={[styles.recipeListItem, isSelected && styles.recipeListItemSelected, dimmed && styles.recipeListItemDimmed]}
                    onPress={() => onToggleRecipe(id)}
                    disabled={dimmed && !isSelected}
                  >
                    <View style={styles.recipeListInfo}>
                      <Text style={styles.recipeListName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.recipeListMeta}>
                        {item.prep_time_minutes ? `${item.prep_time_minutes}m prep` : ''}
                        {item.servings ? ` \u2022 ${item.servings} servings` : ''}
                      </Text>
                    </View>
                    {isLoading ? (
                      <ActivityIndicator size="small" color={mpColors.teal} />
                    ) : (
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={isSelected ? mpColors.teal : dimmed ? mpColors.gray200 : mpColors.gray300}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
              style={styles.recipeList}
            />
          )}
        </View>
      ) : (
        <View>
          <View style={styles.urlRow}>
            <TextInput
              style={styles.urlInput}
              placeholder="Paste recipe URL..."
              placeholderTextColor={mpColors.gray400}
              value={recipeUrl}
              onChangeText={(t) => { setRecipeUrl(t); setUrlError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TouchableOpacity
              style={[styles.addButton, !recipeUrl.trim() && styles.addButtonDisabled]}
              onPress={handleAddUrl}
              disabled={!recipeUrl.trim()}
            >
              <Ionicons name="add" size={20} color={mpColors.white} />
            </TouchableOpacity>
          </View>
          {urlError && <Text style={styles.errorText}>{urlError}</Text>}
          <Text style={styles.urlHint}>Works with most recipe blogs and sites like Serious Eats, Budget Bytes, Simply Recipes, Epicurious, and more</Text>

          {importQueue.length > 0 && (
            <View style={styles.queueList}>
              {importQueue.map(item => (
                <ImportQueueItem
                  key={item.id}
                  item={item}
                  onRetry={() => onRetryImport(item.id)}
                  onRemove={() => onRemoveFromQueue(item.id)}
                />
              ))}
            </View>
          )}
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: mpColors.gray100,
    borderRadius: mpRadii.input,
    padding: 3,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: {
    backgroundColor: mpColors.white,
    ...mpShadows.xs,
  },
  tabText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  tabTextActive: {
    color: mpColors.gray800,
  },
  tabBadge: {
    backgroundColor: mpColors.teal,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  // Search
  searchInput: {
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    marginBottom: 8,
  },
  // Recipe list
  recipeList: {
    maxHeight: 300,
  },
  recipeListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: mpRadii.input,
    marginBottom: 4,
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray100,
  },
  recipeListItemSelected: {
    borderColor: mpColors.teal,
    backgroundColor: mpColors.tealMist,
  },
  recipeListItemDimmed: {
    opacity: 0.5,
  },
  recipeListInfo: {
    flex: 1,
    marginRight: 8,
  },
  recipeListName: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
  },
  recipeListMeta: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
    marginTop: 2,
  },
  // URL import
  urlRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  addButton: {
    backgroundColor: mpColors.teal,
    width: 44,
    borderRadius: mpRadii.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  urlHint: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.red,
    marginBottom: 8,
  },
  queueList: {
    marginTop: 8,
    gap: 4,
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    textAlign: 'center',
  },
});
