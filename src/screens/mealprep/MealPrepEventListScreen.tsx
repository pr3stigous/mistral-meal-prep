import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Button, TextInput, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { supabase } from '../../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepEvent } from '../../lib/types';
import { useEventDraft } from './useEventDraft';
import { EventDraft } from '../../lib/eventWizardTypes';

// Define the navigation prop type for this screen
type MealPrepEventListNavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'MealPrepEventList'>;

// Function to fetch events with filters including search and skill level
// Note: RLS policy enforces that users only see events they host or attend
const fetchMealPrepEvents = async (
  status: string | null,
  dateRange: string | null,
  skillLevel: string | null,
  searchQuery: string | null
): Promise<MealPrepEvent[]> => {
  // Use RPC function that handles the join properly (avoids RLS complexity)
  // This returns events where user is host OR an approved/pending attendee
  let query = supabase
    .from('meal_prep_events')
    .select('*');

  if (status) {
    query = query.eq('status', status);
  }

  if (skillLevel) {
    query = query.eq('skill_level', skillLevel);
  }

  if (searchQuery && searchQuery.trim()) {
    query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
  }

  // Date formatting helper
  const getISODateString = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const today = new Date();
  const todayStr = getISODateString(today);

  if (dateRange) {
    switch (dateRange) {
      case 'today':
        query = query.eq('event_date', todayStr);
        break;
      case 'next7days':
        const sevenDaysLater = new Date(today);
        sevenDaysLater.setDate(today.getDate() + 7);
        query = query.gte('event_date', todayStr).lte('event_date', getISODateString(sevenDaysLater));
        break;
      case 'next30days':
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(today.getDate() + 30);
        query = query.gte('event_date', todayStr).lte('event_date', getISODateString(thirtyDaysLater));
        break;
      case 'all_upcoming': // Default behavior: all future or current events
        query = query.gte('event_date', todayStr);
        break;
      default:
        // If no specific date range or 'all_upcoming' selected, fetch all events on or after today
        query = query.gte('event_date', todayStr);
        break;
    }
  } else {
    // Default to all upcoming if no dateRange is explicitly passed (e.g. initial load before filter set)
    query = query.gte('event_date', todayStr);
  }

  query = query.order('event_date', { ascending: true });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching meal prep events:', error);
    throw new Error(error.message);
  }
  return data || [];
};

const MAX_DRAFTS = 3;

const MealPrepEventListScreen = () => {
  const navigation = useNavigation<MealPrepEventListNavigationProp>();
  const queryClient = useQueryClient();
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedDateRange, setSelectedDateRange] = useState<string | null>(null);
  const [selectedSkillLevel, setSelectedSkillLevel] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<{
    status: string | null;
    dateRange: string | null;
    skillLevel: string | null;
    search: string;
  }>({ status: null, dateRange: null, skillLevel: null, search: '' });

  // Draft management
  const { useDrafts, deleteDraft, isDeleting } = useEventDraft();
  const { data: drafts, isLoading: isLoadingDrafts } = useDrafts();
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  // Define available statuses for filtering
  const filterStatuses = [ {label: 'All', value: null}, { label: 'Planning', value: 'planning' }, { label: 'Active', value: 'active' }, { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' }];
  // Define available date ranges for filtering
  const filterDateRanges = [
    { label: 'All Upcoming', value: 'all_upcoming' },
    { label: 'Today', value: 'today' },
    { label: 'Next 7 Days', value: 'next7days' },
    { label: 'Next 30 Days', value: 'next30days' },
  ];
  // Define skill levels for filtering
  const filterSkillLevels = [
    { label: 'All Levels', value: null },
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];

  const {
    data: events,
    isLoading,
    error,
    refetch,
    isFetching, // Added for refresh control to show loading state during refetch
  } = useQuery<MealPrepEvent[], Error>({
    queryKey: ['mealPrepEvents', activeFilters.status, activeFilters.dateRange, activeFilters.skillLevel, activeFilters.search],
    queryFn: () => fetchMealPrepEvents(activeFilters.status, activeFilters.dateRange, activeFilters.skillLevel, activeFilters.search),
  });

  // This FocusEffect might be redundant if queryKey changes trigger refetch as desired.
  // However, explicit invalidation on focus can be useful for fresh data.
  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['mealPrepEvents'] });
    }, [queryClient])
  );

  // Debounce search query to avoid triggering query on every keystroke
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setActiveFilters(prev => ({ ...prev, search: searchQuery }));
    }, 500); // 500ms debounce delay

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleApplyFilters = () => {
    setActiveFilters({
      status: selectedStatus,
      dateRange: selectedDateRange,
      skillLevel: selectedSkillLevel,
      search: searchQuery,
    });
    setFilterModalVisible(false);
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    // Search is debounced via useEffect above
  };

  const handleClearFilters = () => {
    setSelectedStatus(null);
    setSelectedDateRange(null);
    setSelectedSkillLevel(null);
    setSearchQuery('');
    setActiveFilters({ status: null, dateRange: null, skillLevel: null, search: '' });
    setFilterModalVisible(false);
  };

  // Draft management handlers
  const handleCreateEvent = () => {
    if (drafts && drafts.length >= MAX_DRAFTS) {
      Alert.alert(
        'Draft Limit Reached',
        `You have ${MAX_DRAFTS} drafts. Please delete one before starting a new event.`,
        [{ text: 'OK' }]
      );
      return;
    }
    navigation.navigate('CreateEventForm');
  };

  const handleResumeDraft = (draft: EventDraft) => {
    navigation.navigate('CreateEventForm', { draftId: draft.id });
  };

  const handleDeleteDraft = (draft: EventDraft) => {
    const title = draft.draftData?.step1?.title || 'Untitled Event';
    Alert.alert(
      'Delete Draft',
      `Are you sure you want to delete "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingDraftId(draft.id);
            try {
              await deleteDraft(draft.id);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete draft. Please try again.');
            } finally {
              setDeletingDraftId(null);
            }
          },
        },
      ]
    );
  };

  // Format relative time for "last edited"
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // Get draft display info
  const getDraftInfo = (draft: EventDraft) => {
    const title = draft.draftData?.step1?.title || 'Untitled Event';
    const recipeName = draft.draftData?.step2?.parsedRecipe?.name || null;
    const stepCompleted = draft.stepCompleted || 0;
    const nextStep = Math.min(stepCompleted + 1, 5);
    const lastEdited = formatRelativeTime(draft.updatedAt);

    return { title, recipeName, nextStep, lastEdited };
  };

  const renderEventItem = ({ item }: { item: MealPrepEvent }) => (
    <TouchableOpacity
      style={styles.eventItem}
      onPress={() => navigation.navigate('MealPrepEventDetail', { eventId: item.id })}
    >
      <View style={styles.eventHeader}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(item as any).is_cancelled && (
            <View style={[styles.skillBadge, { backgroundColor: '#EF4444' }]}>
              <Text style={styles.skillBadgeText}>Cancelled</Text>
            </View>
          )}
          {(item as any).joining_paused && !(item as any).is_cancelled && (
            <View style={[styles.skillBadge, { backgroundColor: '#E6930A' }]}>
              <Text style={styles.skillBadgeText}>Paused</Text>
            </View>
          )}
          {item.skill_level && (
            <View style={styles.skillBadge}>
              <Text style={styles.skillBadgeText}>{item.skill_level}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.eventDetailText}>Date: {item.event_date} at {item.event_time}</Text>
      <Text style={styles.eventDetailText}>Location: {item.location_city}{item.location_zip ? `, ${item.location_zip}` : ''}</Text>
      <Text style={[styles.eventDetailText, styles.statusText]}>Status: <Text style={stylesStatusToStyle(item.status)}>{item.status.replace(/_/g, ' ').charAt(0).toUpperCase() + item.status.slice(1)}</Text></Text>
      {item.description && <Text style={styles.eventDescription} numberOfLines={2}>{item.description}</Text>}

      {/* Dietary Accommodations */}
      {item.dietary_accommodations && item.dietary_accommodations.length > 0 && (
        <View style={styles.dietaryContainer}>
          {item.dietary_accommodations.map((diet, index) => (
            <View key={index} style={styles.dietaryChip}>
              <Ionicons name="leaf-outline" size={12} color="#10B981" />
              <Text style={styles.dietaryText}>{diet}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );

  // Render a draft card
  const renderDraftCard = (draft: EventDraft) => {
    const { title, recipeName, nextStep, lastEdited } = getDraftInfo(draft);
    const isDeletingThis = deletingDraftId === draft.id;

    return (
      <TouchableOpacity
        key={draft.id}
        style={styles.draftCard}
        onPress={() => handleResumeDraft(draft)}
        disabled={isDeletingThis}
      >
        <View style={styles.draftContent}>
          <View style={styles.draftHeader}>
            <Text style={styles.draftTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.draftStepBadge}>
              <Text style={styles.draftStepText}>Step {nextStep}/5</Text>
            </View>
          </View>
          {recipeName && (
            <Text style={styles.draftRecipe} numberOfLines={1}>
              <Ionicons name="restaurant-outline" size={12} color="#6B7280" /> {recipeName}
            </Text>
          )}
          <Text style={styles.draftLastEdited}>Last edited {lastEdited}</Text>
        </View>
        <TouchableOpacity
          style={styles.draftDeleteButton}
          onPress={() => handleDeleteDraft(draft)}
          disabled={isDeletingThis}
        >
          {isDeletingThis ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Render drafts section
  const renderDraftsSection = () => {
    if (!drafts || drafts.length === 0) return null;

    return (
      <View style={styles.draftsSection}>
        <View style={styles.draftsSectionHeader}>
          <Text style={styles.draftsSectionTitle}>Your Drafts</Text>
          <Text style={styles.draftsSectionCount}>{drafts.length}/{MAX_DRAFTS}</Text>
        </View>
        {drafts.map(renderDraftCard)}
      </View>
    );
  };

  // Determine what to render in content area
  const renderContent = () => {
    // Initial loading state (no cached data yet)
    if (isLoading && !events) {
      return (
        <View style={styles.centeredScreenContent}>
          <ActivityIndicator size="large" color="#3fa6a6" />
          <Text style={styles.loadingText}>Loading Events...</Text>
        </View>
      );
    }

    // Error state
    if (error) {
      return (
        <View style={styles.centeredScreenContent}>
          <Text style={styles.errorText}>Error fetching events: {error.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Empty state - still show drafts if they exist
    if (events && events.length === 0) {
      return (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              colors={["#3fa6a6"]}
              tintColor={"#3fa6a6"}
            />
          }
        >
          {renderDraftsSection()}
          <View style={styles.emptyStateContainer}>
            <Text style={styles.noEventsText}>No upcoming events found.</Text>
            <Text style={styles.noEventsSubText}>Why not host one?</Text>
          </View>
        </ScrollView>
      );
    }

    // Events list with drafts section
    return (
      <FlatList
        data={events}
        renderItem={renderEventItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContentContainer}
        ListHeaderComponent={renderDraftsSection}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            colors={["#3fa6a6"]}
            tintColor={"#3fa6a6"}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.myEventsButton}
          onPress={() => navigation.navigate('MyMealPrepEvents')}
        >
          <Ionicons name="calendar" size={20} color="#3fa6a6" />
          <Text style={styles.myEventsButtonText}>My Events</Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {/* Map button hidden for now - kept in codebase for future use
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => navigation.navigate('EventMap')}
          >
            <Text style={styles.filterButtonText}>Map</Text>
          </TouchableOpacity>
          */}
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setFilterModalVisible(true)}
          >
            <Text style={styles.filterButtonText}>Filter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateEvent}
          >
            <Text style={styles.createButtonText}>+ Create</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search events by title or description..."
          value={searchQuery}
          onChangeText={handleSearchChange}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearchChange('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={filterModalVisible}
        onRequestClose={() => {
          setFilterModalVisible(!filterModalVisible);
        }}
      >
        <View style={styles.modalCenteredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalText}>Filter Options</Text>
            
            <Text style={styles.filterSectionTitle}>Status:</Text>
            <View style={styles.statusFilterContainer}>
              {filterStatuses.map(status => (
                <TouchableOpacity
                  key={status.label}
                  style={[styles.statusButton, selectedStatus === status.value && styles.statusButtonSelected]}
                  onPress={() => setSelectedStatus(status.value)}
                >
                  <Text style={[styles.statusButtonText, selectedStatus === status.value && styles.statusButtonTextSelected]}>{status.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSectionTitle}>Date Range:</Text>
            <View style={styles.statusFilterContainer}>
              {filterDateRanges.map(range => (
                <TouchableOpacity
                  key={range.label}
                  style={[styles.statusButton, selectedDateRange === range.value && styles.statusButtonSelected]}
                  onPress={() => setSelectedDateRange(range.value)}
                >
                  <Text style={[styles.statusButtonText, selectedDateRange === range.value && styles.statusButtonTextSelected]}>{range.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterSectionTitle}>Skill Level:</Text>
            <View style={styles.statusFilterContainer}>
              {filterSkillLevels.map(level => (
                <TouchableOpacity
                  key={level.label}
                  style={[styles.statusButton, selectedSkillLevel === level.value && styles.statusButtonSelected]}
                  onPress={() => setSelectedSkillLevel(level.value)}
                >
                  <Text style={[styles.statusButtonText, selectedSkillLevel === level.value && styles.statusButtonTextSelected]}>{level.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtonContainer}>
                <TouchableOpacity 
                    style={[styles.modalActionButton, styles.clearButton]}
                    onPress={handleClearFilters}
                >
                    <Text style={styles.modalActionButtonText}>Clear Filters</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    style={[styles.modalActionButton, styles.applyButton]}
                    onPress={handleApplyFilters}
                >
                    <Text style={styles.modalActionButtonText}>Apply Filters</Text>
                </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeModalButton} onPress={() => setFilterModalVisible(false)} >
                 <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {renderContent()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centeredScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 20,
  },
  centeredScreenContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorText: {
    fontSize: 16,
    color: 'red',
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#3fa6a6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  noEventsText: {
    fontSize: 18,
    color: '#1C1C1E',
    marginBottom: 5,
    fontWeight: '500',
  },
  noEventsSubText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#FFFFFF',
  },
  myEventsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2F2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  myEventsButtonText: {
    color: '#3fa6a6',
    fontSize: 15,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
  },
  filterButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    backgroundColor: '#3fa6a6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  eventItem: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
    color: '#1C1C1E',
  },
  eventDetailText: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  statusText: {
    fontStyle: 'italic',
  },
  eventDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
    paddingVertical: 4,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  skillBadge: {
    backgroundColor: '#3fa6a6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dietaryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  dietaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
    gap: 4,
  },
  dietaryText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  modalCenteredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
  },
  modalText: {
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%', // Make container take full width for better spacing
    marginTop: 20,
  },
  modalActionButton: { // Common style for Apply/Clear buttons
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    elevation: 2,
    minWidth: 120, // Give them a decent minimum width
    alignItems: 'center',
  },
  applyButton: {
    backgroundColor: '#3fa6a6',
  },
  clearButton: {
    backgroundColor: '#6c757d', // Grey color for clear
  },
  modalActionButtonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center",
    fontSize: 16,
  },
  closeModalButton: {
    marginTop: 20,
    backgroundColor: '#3fa6a6',
    borderRadius: 8,
    padding: 10,
    elevation: 2,
    minWidth: 100,
  },
  closeModalButtonText: {
    color: "white",
    fontWeight: "bold",
    textAlign: "center"
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  statusFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 15,
  },
  statusButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#E9ECEF',
    borderRadius: 20,
    margin: 5,
    borderWidth: 1,
    borderColor: '#CED4DA',
  },
  statusButtonSelected: {
    backgroundColor: '#3fa6a6',
    borderColor: '#2d7a7a',
  },
  statusButtonText: {
    color: '#3fa6a6',
    fontSize: 14,
    fontWeight: '500',
  },
  statusButtonTextSelected: {
    color: '#FFFFFF',
  },
  statusActive: { color: '#2ECC71', fontWeight: 'bold' },
  statusPlanning: { color: '#3498DB', fontWeight: 'bold' },
  statusCompleted: { color: '#95A5A6', fontWeight: 'bold' },
  statusCancelled: { color: '#E74C3C', fontWeight: 'bold' },
  statusFull: { color: '#F39C12', fontWeight: 'bold' },

  // Draft section styles
  draftsSection: {
    marginBottom: 20,
  },
  draftsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  draftsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  draftsSectionCount: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  draftCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderStyle: 'dashed',
  },
  draftContent: {
    flex: 1,
  },
  draftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  draftTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
    marginRight: 8,
  },
  draftStepBadge: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  draftStepText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  draftRecipe: {
    fontSize: 13,
    color: '#92400E',
    marginBottom: 4,
  },
  draftLastEdited: {
    fontSize: 12,
    color: '#B45309',
  },
  draftDeleteButton: {
    padding: 8,
    marginLeft: 8,
  },
});

const stylesStatusToStyle = (status: string) => {
  switch (status) {
    case 'active':
    case 'open_for_registration': // Assuming this is also a possibility
      return styles.statusActive;
    case 'planning': return styles.statusPlanning;
    case 'completed': return styles.statusCompleted;
    case 'cancelled': return styles.statusCancelled;
    case 'full': return styles.statusFull; // Assuming 'full' is a status
    default: return {}; // Return empty object for default/unknown status
  }
};

export default MealPrepEventListScreen; 