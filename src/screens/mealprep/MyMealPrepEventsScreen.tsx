import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepEvent } from '../../lib/types';

type MyMealPrepEventsNavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'MyMealPrepEvents'>;
type TabType = 'all' | 'hosting' | 'attending';

// Fetch events user is hosting
const fetchHostingEvents = async (userId: string): Promise<MealPrepEvent[]> => {
  const { data, error } = await supabase
    .from('meal_prep_events')
    .select('*')
    .eq('host_user_id', userId)
    .order('event_date', { ascending: true });

  if (error) {
    console.error('Error fetching hosting events:', error);
    throw new Error(error.message);
  }
  return data || [];
};

// Fetch events user is attending
const fetchAttendingEvents = async (userId: string): Promise<MealPrepEvent[]> => {
  const { data, error } = await supabase
    .from('event_attendees')
    .select(`
      event_id,
      meal_prep_events (*)
    `)
    .eq('user_id', userId)
    .eq('role', 'participant')
    .in('registration_status', ['approved', 'pending']);

  if (error) {
    console.error('Error fetching attending events:', error);
    throw new Error(error.message);
  }

  // Extract meal_prep_events from the joined data
  const events = data?.map((item: any) => item.meal_prep_events).filter(Boolean) || [];
  // Sort by event_date
  events.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  return events;
};

const MyMealPrepEventsScreen = () => {
  const navigation = useNavigation<MyMealPrepEventsNavigationProp>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState<TabType>('all');

  const { data: hostingEvents = [], isLoading: isLoadingHosting, error: hostingError, refetch: refetchHosting, isFetching: isFetchingHosting } = useQuery<MealPrepEvent[], Error>({
    queryKey: ['myHostingEvents', user?.id],
    queryFn: () => fetchHostingEvents(user!.id),
    enabled: !!user,
  });

  const { data: attendingEvents = [], isLoading: isLoadingAttending, error: attendingError, refetch: refetchAttending, isFetching: isFetchingAttending } = useQuery<MealPrepEvent[], Error>({
    queryKey: ['myAttendingEvents', user?.id],
    queryFn: () => fetchAttendingEvents(user!.id),
    enabled: !!user,
  });

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['myHostingEvents'] });
      queryClient.invalidateQueries({ queryKey: ['myAttendingEvents'] });
    }, [queryClient])
  );

  const handleRefresh = () => {
    refetchHosting();
    refetchAttending();
  };

  const renderEventItem = ({ item }: { item: MealPrepEvent }) => (
    <TouchableOpacity
      style={styles.eventItem}
      onPress={() => navigation.navigate('MealPrepEventDetail', { eventId: item.id })}
    >
      <View style={styles.eventHeader}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        {item.skill_level && (
          <View style={styles.skillBadge}>
            <Text style={styles.skillBadgeText}>{item.skill_level}</Text>
          </View>
        )}
      </View>
      <Text style={styles.eventDetailText}>Date: {item.event_date} at {item.event_time}</Text>
      <Text style={styles.eventDetailText}>Location: {item.location_city}{item.location_zip ? `, ${item.location_zip}` : ''}</Text>
      <Text style={[styles.eventDetailText, styles.statusText]}>Status: <Text style={stylesStatusToStyle(item.status)}>{item.status.replace(/_/g, ' ').charAt(0).toUpperCase() + item.status.slice(1)}</Text></Text>
      {item.description && <Text style={styles.eventDescription} numberOfLines={2}>{item.description}</Text>}

      {/* Show hosting badge if user is host */}
      {item.host_user_id === user?.id && (
        <View style={styles.hostBadge}>
          <Ionicons name="star" size={14} color="#F59E0B" />
          <Text style={styles.hostBadgeText}>Hosting</Text>
        </View>
      )}

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

  const getEventsForTab = (): MealPrepEvent[] => {
    switch (selectedTab) {
      case 'hosting':
        return hostingEvents;
      case 'attending':
        return attendingEvents.filter(event => event.host_user_id !== user?.id); // Exclude events where user is also host
      case 'all':
      default:
        // Combine hosting and attending, removing duplicates
        const combinedEvents = [...hostingEvents];
        attendingEvents.forEach(event => {
          if (!combinedEvents.find(e => e.id === event.id)) {
            combinedEvents.push(event);
          }
        });
        // Sort by event_date
        combinedEvents.sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
        return combinedEvents;
    }
  };

  const displayEvents = getEventsForTab();
  const isLoading = (isLoadingHosting || isLoadingAttending) && !hostingEvents.length && !attendingEvents.length;
  const isFetching = isFetchingHosting || isFetchingAttending;
  const error = hostingError || attendingError;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <ActivityIndicator size="large" color="#3fa6a6" />
        <Text style={styles.loadingText}>Loading Your Events...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.errorText}>Error loading events: {error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#3fa6a6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Events</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'all' && styles.activeTab]}
          onPress={() => setSelectedTab('all')}
        >
          <Text style={[styles.tabText, selectedTab === 'all' && styles.activeTabText]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'hosting' && styles.activeTab]}
          onPress={() => setSelectedTab('hosting')}
        >
          <Text style={[styles.tabText, selectedTab === 'hosting' && styles.activeTabText]}>Hosting</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, selectedTab === 'attending' && styles.activeTab]}
          onPress={() => setSelectedTab('attending')}
        >
          <Text style={[styles.tabText, selectedTab === 'attending' && styles.activeTabText]}>Attending</Text>
        </TouchableOpacity>
      </View>

      {displayEvents.length === 0 ? (
        <View style={styles.centeredScreenContent}>
          <Text style={styles.noEventsText}>
            {selectedTab === 'all' && 'You have no events.'}
            {selectedTab === 'hosting' && 'You are not hosting any events.'}
            {selectedTab === 'attending' && 'You are not attending any events.'}
          </Text>
          <Text style={styles.noEventsSubText}>Browse events to get started!</Text>
        </View>
      ) : (
        <FlatList
          data={displayEvents}
          renderItem={renderEventItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContentContainer}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={handleRefresh}
              colors={["#3fa6a6"]}
              tintColor={"#3fa6a6"}
            />
          }
        />
      )}
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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3fa6a6',
  },
  tabText: {
    fontSize: 16,
    color: '#8E8E93',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#3fa6a6',
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
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  eventTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  skillBadge: {
    backgroundColor: '#3fa6a6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  skillBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
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
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  hostBadgeText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
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
  statusActive: { color: '#2ECC71', fontWeight: 'bold' },
  statusPlanning: { color: '#3498DB', fontWeight: 'bold' },
  statusCompleted: { color: '#95A5A6', fontWeight: 'bold' },
  statusCancelled: { color: '#E74C3C', fontWeight: 'bold' },
  statusFull: { color: '#F39C12', fontWeight: 'bold' },
});

const stylesStatusToStyle = (status: string) => {
  switch (status) {
    case 'active':
    case 'open_for_registration':
      return styles.statusActive;
    case 'planning': return styles.statusPlanning;
    case 'completed': return styles.statusCompleted;
    case 'cancelled': return styles.statusCancelled;
    case 'full': return styles.statusFull;
    default: return {};
  }
};

export default MyMealPrepEventsScreen;
