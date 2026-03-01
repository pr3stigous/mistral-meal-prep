import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
  Modal,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useEventDraft } from '../useEventDraft';
import { useFriends } from '../../../hooks/useFriends';
import WizardProgressBar from '../../../components/mealprep/wizard/WizardProgressBar';
import WizardNavigation from '../../../components/mealprep/wizard/WizardNavigation';
import {
  Step4Data,
  ContributionItem,
  ContributionOwnership,
  getInitialStep4Data,
  IngredientCategory,
} from '../../../lib/eventWizardTypes';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'CreateEventStep4'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'CreateEventStep4'>;

const CATEGORY_LABELS: Record<IngredientCategory | 'equipment', string> = {
  produce: 'Produce',
  proteins: 'Proteins',
  dairy: 'Dairy',
  pantry: 'Pantry',
  frozen: 'Frozen',
  other: 'Other',
  equipment: 'Equipment',
};

const CATEGORY_ICONS: Record<IngredientCategory | 'equipment', keyof typeof Ionicons.glyphMap> = {
  produce: 'leaf-outline',
  proteins: 'fish-outline',
  dairy: 'water-outline',
  pantry: 'cube-outline',
  frozen: 'snow-outline',
  other: 'ellipsis-horizontal',
  equipment: 'construct-outline',
};

const Step4ContributionsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId } = route.params;
  const { width } = useWindowDimensions();
  const isWideScreen = width >= 768;

  const { useDraft, updateDraft, isUpdating } = useEventDraft();
  const { data: draft, isLoading } = useDraft(draftId);

  // Get friends for invite panel
  const { useAcceptedFriends } = useFriends();
  const { data: friends = [] } = useAcceptedFriends();

  // Form state
  const [formData, setFormData] = useState<Step4Data>(getInitialStep4Data());
  const [activeTab, setActiveTab] = useState<'contributions' | 'invites'>('contributions');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  // Load draft data on mount
  useEffect(() => {
    if (draft?.draftData?.step4) {
      setFormData({
        ...getInitialStep4Data(),
        ...draft.draftData.step4,
        contributions: draft.draftData.step4.contributions || [],
        invitedUserIds: draft.draftData.step4.invitedUserIds || [],
      });
    }
  }, [draft]);

  // Group contributions by category
  const groupedContributions = (formData.contributions || []).reduce((acc, item) => {
    const category = item.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ContributionItem[]>);

  // Toggle contribution ownership
  const toggleOwnership = useCallback((itemId: string) => {
    setFormData(prev => ({
      ...prev,
      contributions: prev.contributions.map(item =>
        item.id === itemId
          ? {
              ...item,
              ownership:
                item.ownership === 'host_provides'
                  ? 'needs_volunteer'
                  : 'host_provides',
            }
          : item
      ),
    }));
  }, []);

  // Remove contribution
  const removeContribution = useCallback((itemId: string) => {
    setFormData(prev => ({
      ...prev,
      contributions: prev.contributions.filter(item => item.id !== itemId),
    }));
  }, []);

  // Add custom contribution
  const addCustomContribution = () => {
    if (!newItemName.trim()) return;

    const newItem: ContributionItem = {
      id: `custom-${Date.now()}`,
      name: newItemName.trim(),
      quantity: 1,
      unit: 'item',
      category: 'other',
      ownership: 'needs_volunteer',
      isFromRecipe: false,
    };

    setFormData(prev => ({
      ...prev,
      contributions: [...prev.contributions, newItem],
    }));
    setNewItemName('');
    setShowAddItem(false);
  };

  // Toggle friend invite
  const toggleInvite = useCallback((userId: string) => {
    setFormData(prev => {
      const isInvited = prev.invitedUserIds.includes(userId);
      return {
        ...prev,
        invitedUserIds: isInvited
          ? prev.invitedUserIds.filter(id => id !== userId)
          : [...prev.invitedUserIds, userId],
      };
    });
  }, []);

  // Set co-host
  const toggleCoHost = useCallback((userId: string) => {
    setFormData(prev => ({
      ...prev,
      coHostUserId: prev.coHostUserId === userId ? undefined : userId,
    }));
  }, []);

  // Filter friends by search
  const filteredFriends = friends.filter(
    friend =>
      friend.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      friend.user_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle navigation
  const handleBack = () => {
    navigation.goBack();
  };

  const handleNext = async () => {
    try {
      await updateDraft({
        draftId,
        stepCompleted: 4,
        draftData: { step4: formData },
      });
      navigation.navigate('EventPreview', { draftId });
    } catch (error) {
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
                stepCompleted: 3,
                draftData: { step4: formData },
              });
            } catch {}
            navigation.navigate('MealPrepEventList');
          },
        },
      ]
    );
  };

  // Completed steps for progress bar
  const completedSteps = [1, 2, 3];

  // Contributions Panel - memoized to prevent re-renders on unrelated state changes
  const contributionsPanelContent = useMemo(() => (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Contribution Board</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddItem(true)}
        >
          <Ionicons name="add" size={20} color="#3fa6a6" />
          <Text style={styles.addButtonText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {(formData.contributions || []).length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="list-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyStateText}>No items yet</Text>
          <Text style={styles.emptyStateHint}>
            Items from your recipe will appear here, or add your own
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.contributionsList}>
          {Object.entries(groupedContributions).map(([category, items]) => (
            <View key={category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Ionicons
                  name={CATEGORY_ICONS[category as keyof typeof CATEGORY_ICONS] || 'ellipsis-horizontal'}
                  size={16}
                  color="#8E8E93"
                />
                <Text style={styles.categoryTitle}>
                  {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category}
                </Text>
              </View>
              {items.map(item => (
                <View key={item.id} style={styles.contributionItem}>
                  <View style={styles.contributionInfo}>
                    <Text style={styles.contributionName}>{item.name}</Text>
                    {item.quantity > 1 && (
                      <Text style={styles.contributionQuantity}>
                        {item.quantity} {item.unit}
                      </Text>
                    )}
                  </View>
                  <View style={styles.contributionActions}>
                    <TouchableOpacity
                      style={[
                        styles.ownershipToggle,
                        item.ownership === 'host_provides' && styles.ownershipHost,
                      ]}
                      onPress={() => toggleOwnership(item.id)}
                    >
                      <Text
                        style={[
                          styles.ownershipText,
                          item.ownership === 'host_provides' && styles.ownershipTextHost,
                        ]}
                      >
                        {item.ownership === 'host_provides' ? "I'll provide" : 'Need help'}
                      </Text>
                    </TouchableOpacity>
                    {!item.isFromRecipe && (
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => removeContribution(item.id)}
                      >
                        <Ionicons name="close" size={18} color="#FF3B30" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  ), [formData.contributions, groupedContributions, toggleOwnership, removeContribution]);

  // Invites Panel - memoized to prevent remounting on unrelated state changes
  const invitesPanelContent = useMemo(() => (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Invite Guests</Text>
        <Text style={styles.inviteCount}>
          {(formData.invitedUserIds || []).length} invited
        </Text>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search friends..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {filteredFriends.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={48} color="#C7C7CC" />
          <Text style={styles.emptyStateText}>No friends found</Text>
          <Text style={styles.emptyStateHint}>
            Add friends to invite them to your events
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.friendsList}>
          {filteredFriends.map(friend => {
            const isInvited = (formData.invitedUserIds || []).includes(friend.user_id);
            const isCoHost = formData.coHostUserId === friend.user_id;

            return (
              <View key={friend.user_id} style={styles.friendItem}>
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarText}>
                    {(friend.email?.[0] || '?').toUpperCase()}
                  </Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendEmail} numberOfLines={1}>
                    {friend.email || 'Unknown'}
                  </Text>
                  {isCoHost && (
                    <Text style={styles.coHostBadge}>Co-host</Text>
                  )}
                </View>
                <View style={styles.friendActions}>
                  <TouchableOpacity
                    style={[
                      styles.inviteButton,
                      isInvited && styles.inviteButtonActive,
                    ]}
                    onPress={() => toggleInvite(friend.user_id)}
                  >
                    <Ionicons
                      name={isInvited ? 'checkmark' : 'add'}
                      size={18}
                      color={isInvited ? '#FFFFFF' : '#3fa6a6'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.coHostButton,
                      isCoHost && styles.coHostButtonActive,
                    ]}
                    onPress={() => toggleCoHost(friend.user_id)}
                  >
                    <Ionicons
                      name="star"
                      size={14}
                      color={isCoHost ? '#FFD700' : '#C7C7CC'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

    </View>
  ), [searchQuery, filteredFriends, formData.invitedUserIds, formData.coHostUserId, toggleInvite, toggleCoHost]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contributions</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Progress Bar */}
      <WizardProgressBar
        currentStep={4}
        completedSteps={completedSteps}
        onStepPress={(step) => {
          if (step === 1) navigation.navigate('CreateEventStep1', { draftId });
          if (step === 2) navigation.navigate('CreateEventStep2', { draftId });
          if (step === 3) navigation.navigate('CreateEventStep3', { draftId });
        }}
      />

      {/* Mobile Tab Switcher */}
      {!isWideScreen && (
        <View style={styles.tabSwitcher}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'contributions' && styles.tabActive]}
            onPress={() => setActiveTab('contributions')}
          >
            <Ionicons
              name="list-outline"
              size={18}
              color={activeTab === 'contributions' ? '#3fa6a6' : '#8E8E93'}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'contributions' && styles.tabTextActive,
              ]}
            >
              Contributions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'invites' && styles.tabActive]}
            onPress={() => setActiveTab('invites')}
          >
            <Ionicons
              name="people-outline"
              size={18}
              color={activeTab === 'invites' ? '#3fa6a6' : '#8E8E93'}
            />
            <Text
              style={[styles.tabText, activeTab === 'invites' && styles.tabTextActive]}
            >
              Invites
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {isWideScreen ? (
          // Desktop: Side by side
          <View style={styles.splitView}>
            {contributionsPanelContent}
            <View style={styles.splitDivider} />
            {invitesPanelContent}
          </View>
        ) : (
          // Mobile: Tab based
          activeTab === 'contributions' ? contributionsPanelContent : invitesPanelContent
        )}
      </View>

      {/* Navigation */}
      <WizardNavigation
        onBack={handleBack}
        onNext={handleNext}
        nextLabel="Preview"
        isLoading={isUpdating}
      />

      {/* Add Item Modal - rendered at component level to avoid remounting */}
      <Modal
        visible={showAddItem}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowAddItem(false);
          setNewItemName('');
        }}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            style={styles.addItemOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <TouchableWithoutFeedback onPress={() => {
              setShowAddItem(false);
              setNewItemName('');
            }}>
              <View style={styles.addItemOverlayDismiss} />
            </TouchableWithoutFeedback>
            <View style={styles.addItemModal}>
              <Text style={styles.addItemTitle}>Add Custom Item</Text>
              <TextInput
                style={styles.addItemInput}
                placeholder="Item name (e.g., Paper plates)"
                value={newItemName}
                onChangeText={setNewItemName}
                autoFocus
              />
              <View style={styles.addItemButtons}>
                <TouchableOpacity
                  style={styles.addItemCancel}
                  onPress={() => {
                    setShowAddItem(false);
                    setNewItemName('');
                  }}
                >
                  <Text style={styles.addItemCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addItemConfirm}
                  onPress={addCustomContribution}
                >
                  <Text style={styles.addItemConfirmText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
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
    width: 60,
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
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
  content: {
    flex: 1,
  },
  splitView: {
    flex: 1,
    flexDirection: 'row',
  },
  splitDivider: {
    width: 1,
    backgroundColor: '#E5E5EA',
  },
  panel: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    color: '#3fa6a6',
    fontWeight: '500',
  },
  inviteCount: {
    fontSize: 14,
    color: '#8E8E93',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8E8E93',
    marginTop: 12,
  },
  emptyStateHint: {
    fontSize: 14,
    color: '#C7C7CC',
    textAlign: 'center',
    marginTop: 4,
  },
  contributionsList: {
    flex: 1,
    padding: 16,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
  },
  contributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  contributionInfo: {
    flex: 1,
  },
  contributionName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  contributionQuantity: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  contributionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ownershipToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E5E5EA',
  },
  ownershipHost: {
    backgroundColor: '#34C759',
  },
  ownershipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#8E8E93',
  },
  ownershipTextHost: {
    color: '#FFFFFF',
  },
  removeButton: {
    padding: 4,
  },
  addItemOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  addItemOverlayDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  addItemModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  addItemTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  addItemInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  addItemButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  addItemCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  addItemCancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#3fa6a6',
  },
  addItemConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3fa6a6',
    alignItems: 'center',
  },
  addItemConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  searchInput: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  friendsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3fa6a6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  friendAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  friendInfo: {
    flex: 1,
  },
  friendEmail: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  coHostBadge: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '500',
    marginTop: 2,
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inviteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3fa6a6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButtonActive: {
    backgroundColor: '#3fa6a6',
    borderColor: '#3fa6a6',
  },
  coHostButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coHostButtonActive: {
    borderColor: '#FFD700',
    backgroundColor: '#FFF9E6',
  },
});

export default Step4ContributionsScreen;
