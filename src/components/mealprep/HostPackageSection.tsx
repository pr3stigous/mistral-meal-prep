import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Types for Host Package
interface ShoppingItem {
  item: string;
  quantity: string;
  estimated_cost_usd?: number; // Legacy field
  estimated_cost?: number; // New field (currency-aware)
  notes?: string;
}

interface ShoppingList {
  produce: ShoppingItem[];
  proteins: ShoppingItem[];
  dairy: ShoppingItem[];
  pantry: ShoppingItem[];
  frozen: ShoppingItem[];
  other: ShoppingItem[];
}

// Currency symbol mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  JPY: '¥',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
  INR: '₹',
  CNY: '¥',
  HKD: 'HK$',
  SGD: 'S$',
  KRW: '₩',
  BRL: 'R$',
  MXN: 'MX$',
  CHF: 'CHF',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
  NZD: 'NZ$',
  THB: '฿',
  PHP: '₱',
  IDR: 'Rp',
  MYR: 'RM',
  AED: 'د.إ',
  ILS: '₪',
  ZAR: 'R',
  PLN: 'zł',
  CZK: 'Kč',
  TRY: '₺',
  RUB: '₽',
};

interface TimelineStep {
  task: string;
  duration_minutes: number;
  can_do_ahead: boolean;
  tips?: string;
  phase?: 'prep' | 'cooking' | 'finishing';
  time_before_event?: string; // Legacy field - no longer used for new packages
}

// Phase configuration
const PHASE_CONFIG = {
  prep: {
    label: 'Prep',
    icon: 'nutrition-outline' as const,
    color: '#10B981',
    bgColor: '#ECFDF5',
  },
  cooking: {
    label: 'Cooking',
    icon: 'flame-outline' as const,
    color: '#F59E0B',
    bgColor: '#FFFBEB',
  },
  finishing: {
    label: 'Finishing',
    icon: 'checkmark-done-outline' as const,
    color: '#8B5CF6',
    bgColor: '#F5F3FF',
  },
};

// Infer phase from time_before_event string (for backwards compatibility)
const inferPhase = (timeString: string): 'prep' | 'cooking' | 'finishing' => {
  const lower = timeString.toLowerCase();

  // Finishing phase indicators
  if (lower.includes('after') || lower.includes('final') || lower.includes('before serving') || lower.includes('last')) {
    return 'finishing';
  }

  // Cooking phase indicators
  if (lower.includes('at start') || lower.includes('cooking start') || lower.includes('during') || lower.includes('while cooking')) {
    return 'cooking';
  }

  // Default to prep (anything "before" the event)
  return 'prep';
};

// Group timeline steps by phase and calculate totals
interface PhaseGroup {
  steps: TimelineStep[];
  totalMinutes: number;
}

const groupByPhase = (steps: TimelineStep[]): Record<'prep' | 'cooking' | 'finishing', PhaseGroup> => {
  const grouped: Record<'prep' | 'cooking' | 'finishing', PhaseGroup> = {
    prep: { steps: [], totalMinutes: 0 },
    cooking: { steps: [], totalMinutes: 0 },
    finishing: { steps: [], totalMinutes: 0 },
  };

  steps.forEach(step => {
    const phase = step.phase || inferPhase(step.time_before_event || step.task);
    grouped[phase].steps.push(step);
    grouped[phase].totalMinutes += step.duration_minutes || 0;
  });

  return grouped;
};

// Format duration for display
const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  }
  return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min`;
};

interface EquipmentItem {
  item: string;
  quantity: number;
  essential: boolean;
  notes?: string;
  size_guidance?: string;
}

interface SpaceRequirements {
  counter_space: string;
  stove_burners: number;
  oven_needed: boolean;
  refrigerator_space: string;
  simultaneous_cooks: number;
}

interface SubstitutionGuideItem {
  original: string;
  substitute: string;
  impact_on_taste: number;
  impact_on_texture: number;
  recommendation: string;
}

interface CommonMistake {
  mistake: string;
  prevention: string;
  fix: string;
}

interface StorageGuideItem {
  item: string;
  method: string;
  duration: string;
  reheating?: string | null;
}

interface HostPackage {
  currency?: string;
  shopping_list: ShoppingList;
  prep_timeline: TimelineStep[];
  equipment_checklist: EquipmentItem[];
  space_requirements: SpaceRequirements;
  host_tips: string[];
  substitution_guide?: SubstitutionGuideItem[];
  scaling_notes?: string[];
  common_mistakes?: CommonMistake[];
  storage_guide?: StorageGuideItem[];
}

interface RecipeManifestItem {
  input_recipe: string;
  handling: 'kept_separate' | 'merged_with' | 'used_as_component';
  merged_into?: string | null;
  merge_reason?: string | null;
  component_of?: string | null;
  component_usage?: string | null;
  prep_timeline_steps: number;
  common_mistakes_count: number;
}

interface CrossRecipeNote {
  type: 'component_relationship' | 'shared_technique' | 'timing_dependency' | 'conflict_warning';
  affected_recipes: string[];
  note: string;
  shopping_impact?: string | null;
}

interface HostPackageSectionProps {
  hostPackage: HostPackage | null;
  isHost: boolean;
  recipeManifest?: RecipeManifestItem[];
  crossRecipeNotes?: CrossRecipeNote[];
}

const CROSS_RECIPE_NOTE_CONFIG: Record<CrossRecipeNote['type'], { icon: string; color: string; bgColor: string; label: string }> = {
  component_relationship: { icon: 'link-outline', color: '#0891B2', bgColor: '#ECFEFF', label: 'Recipes Work Together' },
  shared_technique: { icon: 'flash-outline', color: '#0891B2', bgColor: '#ECFEFF', label: 'Time Saver' },
  timing_dependency: { icon: 'time-outline', color: '#D97706', bgColor: '#FFFBEB', label: 'Timing Tip' },
  conflict_warning: { icon: 'warning-outline', color: '#DC2626', bgColor: '#FEF2F2', label: 'Heads Up' },
};

const HostPackageSection: React.FC<HostPackageSectionProps> = ({
  hostPackage,
  isHost,
  recipeManifest,
  crossRecipeNotes,
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    shopping: true,
    timeline: false,
    equipment: false,
    tips: false,
    substitutions: false,
    scaling: false,
    mistakes: false,
    storage: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Category colors for shopping list
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

  const getCategoryIcon = (category: string): string => {
    const icons: Record<string, string> = {
      produce: 'leaf-outline',
      proteins: 'fish-outline',
      dairy: 'water-outline',
      pantry: 'file-tray-stacked-outline',
      frozen: 'snow-outline',
      other: 'ellipse-outline',
    };
    return icons[category] || 'ellipse-outline';
  };

  // Calculate total estimated cost (supports both legacy and new field names)
  const calculateTotalCost = (shoppingList: ShoppingList): number => {
    let total = 0;
    Object.values(shoppingList).forEach(category => {
      category.forEach(item => {
        // Support both old (estimated_cost_usd) and new (estimated_cost) field names
        total += item.estimated_cost ?? item.estimated_cost_usd ?? 0;
      });
    });
    return total;
  };

  // Get currency symbol for display
  const getCurrencySymbol = (currencyCode?: string): string => {
    if (!currencyCode) return '$'; // Default to USD
    return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
  };

  // Get item cost (supports both legacy and new field names)
  const getItemCost = (item: ShoppingItem): number | undefined => {
    return item.estimated_cost ?? item.estimated_cost_usd;
  };

  // Only hosts see the host package section
  if (!isHost) {
    return null;
  }

  // Don't render if no host package exists
  if (!hostPackage) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="clipboard-outline" size={22} color="#3fa6a6" />
          <Text style={styles.title}>Host Package</Text>
        </View>
      </View>

      <View style={styles.packageContent}>
        {/* Recipe Notes — only shown when there's something noteworthy (merges, components, cross-recipe tips) */}
        {(() => {
          const mergedRecipes = (recipeManifest || []).filter(r => r.handling === 'merged_with');
          const componentRecipes = (recipeManifest || []).filter(r => r.handling === 'used_as_component');
          const hasNotes = mergedRecipes.length > 0 || componentRecipes.length > 0 || (crossRecipeNotes && crossRecipeNotes.length > 0);
          if (!hasNotes) return null;

          return (
            <View style={styles.recipeNotesContainer}>
              {/* Merged recipe callouts */}
              {mergedRecipes.map((item, index) => (
                <View key={`merged-${index}`} style={[styles.recipeNoteCard, { backgroundColor: '#F5F3FF' }]}>
                  <View style={styles.recipeNoteHeader}>
                    <Ionicons name="git-merge-outline" size={16} color="#7C3AED" />
                    <Text style={[styles.recipeNoteTitle, { color: '#7C3AED' }]}>Combined Similar Recipes</Text>
                  </View>
                  <Text style={styles.recipeNoteText}>
                    <Text style={styles.recipeNoteBold}>{item.input_recipe}</Text>
                    {' was combined with '}
                    <Text style={styles.recipeNoteBold}>{item.merged_into}</Text>
                    {item.merge_reason ? ` — ${item.merge_reason}` : '. The best parts of both are included.'}
                  </Text>
                </View>
              ))}

              {/* Component recipe callouts */}
              {componentRecipes.map((item, index) => (
                <View key={`component-${index}`} style={[styles.recipeNoteCard, { backgroundColor: '#ECFEFF' }]}>
                  <View style={styles.recipeNoteHeader}>
                    <Ionicons name="link-outline" size={16} color="#0891B2" />
                    <Text style={[styles.recipeNoteTitle, { color: '#0891B2' }]}>Recipes Work Together</Text>
                  </View>
                  <Text style={styles.recipeNoteText}>
                    {'Your '}
                    <Text style={styles.recipeNoteBold}>{item.input_recipe}</Text>
                    {item.component_usage
                      ? ` ${item.component_usage}`
                      : ` will be used in your ${item.component_of}`
                    }
                    {' — no need to buy a store-bought version!'}
                  </Text>
                </View>
              ))}

              {/* Cross-recipe tips */}
              {crossRecipeNotes && crossRecipeNotes.map((note, index) => {
                const config = CROSS_RECIPE_NOTE_CONFIG[note.type];
                // Skip component_relationship notes if we already surfaced them above
                if (note.type === 'component_relationship' && componentRecipes.length > 0) return null;
                return (
                  <View key={`note-${index}`} style={[styles.recipeNoteCard, { backgroundColor: config.bgColor }]}>
                    <View style={styles.recipeNoteHeader}>
                      <Ionicons name={config.icon as any} size={16} color={config.color} />
                      <Text style={[styles.recipeNoteTitle, { color: config.color }]}>{config.label}</Text>
                    </View>
                    <Text style={styles.recipeNoteText}>{note.note}</Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* Shopping List Section */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection('shopping')}
        >
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="cart-outline" size={20} color="#1C1C1E" />
            <Text style={styles.sectionTitle}>Shopping List</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                ~{getCurrencySymbol(hostPackage.currency)}{calculateTotalCost(hostPackage.shopping_list).toFixed(0)}
              </Text>
            </View>
          </View>
          <Ionicons
            name={expandedSections.shopping ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#8E8E93"
          />
        </TouchableOpacity>

        {expandedSections.shopping && (
          <View style={styles.sectionContent}>
            {Object.entries(hostPackage.shopping_list).map(([category, items]) => {
              if (!items || items.length === 0) return null;
              return (
                <View key={category} style={styles.categorySection}>
                  <View style={[styles.categoryHeader, { backgroundColor: getCategoryColor(category) }]}>
                    <Ionicons name={getCategoryIcon(category) as any} size={16} color="#666" />
                    <Text style={styles.categoryName}>{category.charAt(0).toUpperCase() + category.slice(1)}</Text>
                  </View>
                  {items.map((item, index) => (
                    <View key={index} style={styles.shoppingItem}>
                      <View style={styles.shoppingItemMain}>
                        <Text style={styles.shoppingItemName}>{item.item}</Text>
                        <Text style={styles.shoppingItemQuantity}>{item.quantity}</Text>
                      </View>
                      {getItemCost(item) !== undefined && (
                        <Text style={styles.shoppingItemCost}>~{getCurrencySymbol(hostPackage.currency)}{getItemCost(item)!.toFixed(2)}</Text>
                      )}
                      {item.notes && (
                        <Text style={styles.shoppingItemNotes}>{item.notes}</Text>
                      )}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}

        {/* Prep Timeline Section */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection('timeline')}
        >
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="time-outline" size={20} color="#1C1C1E" />
            <Text style={styles.sectionTitle}>Prep Timeline</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{hostPackage.prep_timeline.length} steps</Text>
            </View>
          </View>
          <Ionicons
            name={expandedSections.timeline ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#8E8E93"
          />
        </TouchableOpacity>

        {expandedSections.timeline && (
          <View style={styles.sectionContent}>
            {(() => {
              const groupedSteps = groupByPhase(hostPackage.prep_timeline);
              const phases: Array<'prep' | 'cooking' | 'finishing'> = ['prep', 'cooking', 'finishing'];

              // Calculate total time across all phases
              const totalTime = phases.reduce((sum, phase) => sum + groupedSteps[phase].totalMinutes, 0);

              return (
                <>
                  {/* Total Time Summary */}
                  <View style={styles.totalTimeSummary}>
                    <Ionicons name="time-outline" size={16} color="#6B7280" />
                    <Text style={styles.totalTimeText}>Total time: {formatDuration(totalTime)}</Text>
                  </View>

                  {phases.map(phase => {
                    const { steps, totalMinutes } = groupedSteps[phase];
                    if (steps.length === 0) return null;

                    const config = PHASE_CONFIG[phase];

                    return (
                      <View key={phase} style={styles.phaseGroup}>
                        {/* Phase Header */}
                        <View style={[styles.phaseHeader, { backgroundColor: config.bgColor }]}>
                          <Ionicons name={config.icon} size={16} color={config.color} />
                          <Text style={[styles.phaseLabel, { color: config.color }]}>{config.label}</Text>
                          <Text style={styles.phaseDuration}>{formatDuration(totalMinutes)}</Text>
                        </View>

                        {/* Phase Steps */}
                        {steps.map((step, index) => (
                          <View key={index} style={styles.timelineItem}>
                            <View style={styles.timelineLeft}>
                              <View style={[styles.timelineDot, { backgroundColor: config.color }]} />
                              {index < steps.length - 1 && (
                                <View style={[styles.timelineLine, { backgroundColor: config.color + '40' }]} />
                              )}
                            </View>
                            <View style={styles.timelineContent}>
                              <Text style={styles.timelineTask}>{step.task}</Text>
                              <View style={styles.timelineMeta}>
                                <View style={styles.durationBadge}>
                                  <Ionicons name="time-outline" size={12} color="#6B7280" />
                                  <Text style={styles.timelineDuration}>{step.duration_minutes} min</Text>
                                </View>
                                {step.can_do_ahead && (
                                  <View style={styles.aheadBadge}>
                                    <Text style={styles.aheadBadgeText}>Can do ahead</Text>
                                  </View>
                                )}
                              </View>
                              {step.tips && <Text style={styles.timelineTip}>{step.tips}</Text>}
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </View>
        )}

        {/* Equipment Checklist Section */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => toggleSection('equipment')}
        >
          <View style={styles.sectionHeaderLeft}>
            <Ionicons name="construct-outline" size={20} color="#1C1C1E" />
            <Text style={styles.sectionTitle}>Equipment</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{hostPackage.equipment_checklist.length} items</Text>
            </View>
          </View>
          <Ionicons
            name={expandedSections.equipment ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#8E8E93"
          />
        </TouchableOpacity>

        {expandedSections.equipment && (
          <View style={styles.sectionContent}>
            {hostPackage.equipment_checklist.map((item, index) => (
              <View key={index} style={styles.equipmentItem}>
                <View style={styles.equipmentLeft}>
                  <Ionicons
                    name={item.essential ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={20}
                    color={item.essential ? '#3fa6a6' : '#C7C7CC'}
                  />
                  <View style={styles.equipmentInfo}>
                    <Text style={styles.equipmentName}>{item.item}</Text>
                    {item.size_guidance && (
                      <Text style={styles.equipmentSizeGuide}>{item.size_guidance}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.equipmentRight}>
                  {item.quantity > 1 && (
                    <Text style={styles.equipmentQuantity}>x{item.quantity}</Text>
                  )}
                  {!item.essential && (
                    <View style={styles.optionalBadge}>
                      <Text style={styles.optionalBadgeText}>Optional</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}

            {/* Space Requirements */}
            {hostPackage.space_requirements && (
              <View style={styles.spaceRequirements}>
                <Text style={styles.spaceTitle}>Space Needed</Text>
                <View style={styles.spaceGrid}>
                  <View style={styles.spaceItem}>
                    <Ionicons name="resize-outline" size={16} color="#8E8E93" />
                    <Text style={styles.spaceText}>{hostPackage.space_requirements.counter_space}</Text>
                  </View>
                  <View style={styles.spaceItem}>
                    <Ionicons name="flame-outline" size={16} color="#8E8E93" />
                    <Text style={styles.spaceText}>{hostPackage.space_requirements.stove_burners} burners</Text>
                  </View>
                  {hostPackage.space_requirements.oven_needed && (
                    <View style={styles.spaceItem}>
                      <Ionicons name="thermometer-outline" size={16} color="#8E8E93" />
                      <Text style={styles.spaceText}>Oven required</Text>
                    </View>
                  )}
                  <View style={styles.spaceItem}>
                    <Ionicons name="people-outline" size={16} color="#8E8E93" />
                    <Text style={styles.spaceText}>{hostPackage.space_requirements.simultaneous_cooks} cooks</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Host Tips Section */}
        {hostPackage.host_tips && hostPackage.host_tips.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('tips')}
            >
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="bulb-outline" size={20} color="#1C1C1E" />
                <Text style={styles.sectionTitle}>Host Tips</Text>
              </View>
              <Ionicons
                name={expandedSections.tips ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#8E8E93"
              />
            </TouchableOpacity>

            {expandedSections.tips && (
              <View style={styles.sectionContent}>
                {hostPackage.host_tips.map((tip, index) => (
                  <View key={index} style={styles.tipItem}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#3fa6a6" />
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Substitution Guide Section */}
        {hostPackage.substitution_guide && hostPackage.substitution_guide.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('substitutions')}
            >
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="swap-horizontal-outline" size={20} color="#1C1C1E" />
                <Text style={styles.sectionTitle}>Substitution Guide</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{hostPackage.substitution_guide.length} swaps</Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.substitutions ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#8E8E93"
              />
            </TouchableOpacity>

            {expandedSections.substitutions && (
              <View style={styles.sectionContent}>
                {hostPackage.substitution_guide.map((sub, index) => (
                  <View key={index} style={styles.substitutionItem}>
                    <View style={styles.substitutionHeader}>
                      <Text style={styles.substitutionOriginal}>{sub.original}</Text>
                      <Ionicons name="arrow-forward" size={14} color="#8E8E93" />
                      <Text style={styles.substitutionNew}>{sub.substitute}</Text>
                    </View>
                    <View style={styles.substitutionRatings}>
                      <View style={styles.ratingPill}>
                        <Text style={styles.ratingLabel}>Taste</Text>
                        <Text style={styles.ratingValue}>{sub.impact_on_taste}/5</Text>
                      </View>
                      <View style={styles.ratingPill}>
                        <Text style={styles.ratingLabel}>Texture</Text>
                        <Text style={styles.ratingValue}>{sub.impact_on_texture}/5</Text>
                      </View>
                    </View>
                    <Text style={styles.substitutionRec}>{sub.recommendation}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Scaling Notes Section */}
        {hostPackage.scaling_notes && hostPackage.scaling_notes.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('scaling')}
            >
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="warning-outline" size={20} color="#E6930A" />
                <Text style={styles.sectionTitle}>Scaling Notes</Text>
              </View>
              <Ionicons
                name={expandedSections.scaling ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#8E8E93"
              />
            </TouchableOpacity>

            {expandedSections.scaling && (
              <View style={styles.sectionContent}>
                {hostPackage.scaling_notes.map((note, index) => (
                  <View key={index} style={styles.scalingNoteItem}>
                    <Ionicons name="alert-circle" size={16} color="#E6930A" />
                    <Text style={styles.scalingNoteText}>{note}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Common Mistakes Section */}
        {hostPackage.common_mistakes && hostPackage.common_mistakes.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('mistakes')}
            >
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                <Text style={styles.sectionTitle}>Common Mistakes</Text>
                <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={[styles.badgeText, { color: '#EF4444' }]}>SOS</Text>
                </View>
              </View>
              <Ionicons
                name={expandedSections.mistakes ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#8E8E93"
              />
            </TouchableOpacity>

            {expandedSections.mistakes && (
              <View style={styles.sectionContent}>
                {hostPackage.common_mistakes.map((item, index) => (
                  <View key={index} style={styles.mistakeItem}>
                    <View style={styles.mistakeHeader}>
                      <Ionicons name="warning" size={16} color="#EF4444" />
                      <Text style={styles.mistakeTitle}>{item.mistake}</Text>
                    </View>
                    <View style={styles.mistakeDetail}>
                      <Text style={styles.mistakeLabel}>Prevention:</Text>
                      <Text style={styles.mistakeText}>{item.prevention}</Text>
                    </View>
                    <View style={styles.mistakeDetail}>
                      <Text style={styles.mistakeLabel}>Fix:</Text>
                      <Text style={styles.mistakeText}>{item.fix}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* Storage Guide Section */}
        {hostPackage.storage_guide && hostPackage.storage_guide.length > 0 && (
          <>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection('storage')}
            >
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="archive-outline" size={20} color="#1C1C1E" />
                <Text style={styles.sectionTitle}>Storage & Leftovers</Text>
              </View>
              <Ionicons
                name={expandedSections.storage ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#8E8E93"
              />
            </TouchableOpacity>

            {expandedSections.storage && (
              <View style={styles.sectionContent}>
                {hostPackage.storage_guide.map((item, index) => (
                  <View key={index} style={styles.storageItem}>
                    <Text style={styles.storageItemName}>{item.item}</Text>
                    <View style={styles.storageDetails}>
                      <View style={styles.storageRow}>
                        <Ionicons name="cube-outline" size={14} color="#6B7280" />
                        <Text style={styles.storageText}>{item.method}</Text>
                      </View>
                      <View style={styles.storageRow}>
                        <Ionicons name="time-outline" size={14} color="#6B7280" />
                        <Text style={styles.storageText}>{item.duration}</Text>
                      </View>
                      {item.reheating && (
                        <View style={styles.storageRow}>
                          <Ionicons name="flame-outline" size={14} color="#6B7280" />
                          <Text style={styles.storageText}>{item.reheating}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginVertical: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  packageContent: {
    paddingBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9F9FB',
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  badge: {
    backgroundColor: '#E0F2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3fa6a6',
  },
  sectionContent: {
    padding: 16,
    paddingTop: 8,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  shoppingItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  shoppingItemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shoppingItemName: {
    fontSize: 15,
    color: '#1C1C1E',
    flex: 1,
  },
  shoppingItemQuantity: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3fa6a6',
  },
  shoppingItemCost: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  shoppingItemNotes: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 4,
  },
  totalTimeSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 16,
  },
  totalTimeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  phaseGroup: {
    marginBottom: 20,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  phaseLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  phaseDuration: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  phaseCount: {
    fontSize: 12,
    color: '#8E8E93',
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#C7C7CC',
    marginTop: 4,
  },
  timelineDotAhead: {
    backgroundColor: '#34C759',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E5EA',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  timelineTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3fa6a6',
    marginBottom: 4,
  },
  timelineTask: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 20,
  },
  timelineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  timelineDuration: {
    fontSize: 12,
    color: '#8E8E93',
  },
  aheadBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aheadBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#34C759',
  },
  timelineTip: {
    fontSize: 13,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginTop: 6,
    backgroundColor: '#FFF8E1',
    padding: 8,
    borderRadius: 6,
  },
  equipmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  equipmentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  equipmentName: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  equipmentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  equipmentQuantity: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3fa6a6',
  },
  optionalBadge: {
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionalBadgeText: {
    fontSize: 11,
    color: '#8E8E93',
  },
  spaceRequirements: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F9F9FB',
    borderRadius: 8,
  },
  spaceTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  spaceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  spaceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spaceText: {
    fontSize: 13,
    color: '#666',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  tipText: {
    fontSize: 14,
    color: '#1C1C1E',
    flex: 1,
    lineHeight: 20,
  },
  equipmentInfo: {
    flex: 1,
  },
  equipmentSizeGuide: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 2,
  },
  substitutionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  substitutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  substitutionOriginal: {
    fontSize: 14,
    color: '#8E8E93',
    textDecorationLine: 'line-through',
  },
  substitutionNew: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  substitutionRatings: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ratingLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  ratingValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  substitutionRec: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  scalingNoteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  scalingNoteText: {
    fontSize: 14,
    color: '#92400E',
    flex: 1,
    lineHeight: 20,
  },
  mistakeItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  mistakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  mistakeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    flex: 1,
  },
  mistakeDetail: {
    paddingLeft: 24,
    marginBottom: 4,
  },
  mistakeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 2,
  },
  mistakeText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  storageItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  storageItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  storageDetails: {
    gap: 4,
  },
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storageText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  // Recipe Notes (merges, components, cross-recipe tips)
  recipeNotesContainer: {
    padding: 12,
    gap: 8,
  },
  recipeNoteCard: {
    padding: 12,
    borderRadius: 10,
  },
  recipeNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  recipeNoteTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  recipeNoteText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 19,
  },
  recipeNoteBold: {
    fontWeight: '600',
    color: '#1C1C1E',
  },
});

export default HostPackageSection;
