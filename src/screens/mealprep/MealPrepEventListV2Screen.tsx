import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Text, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealPrepStackParamList } from '../../navigators/MealPrepNavigator';
import { useAuth } from '../../AuthContext';
import { supabase } from '../../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MealPrepEvent } from '../../lib/types';
import { useEventDraft } from './useEventDraft';
import { mpColors, mpFonts } from '../../constants/mealPrepTheme';

// Section components
import ListPageTitle from './list-sections/ListPageTitle';
import CategoryChips from './list-sections/CategoryChips';
import SearchBar from './list-sections/SearchBar';
import YourEventsCarousel from './list-sections/YourEventsCarousel';
import PastEventsSection from './list-sections/PastEventsSection';
import CreateEventFAB from './list-sections/CreateEventFAB';
import DraftBanner from './list-sections/DraftBanner';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'MealPrepEventList'>;

const MAX_DRAFTS = 3;

// Category → dietary/tag keyword mapping for filtering
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Mexican: ['mexican', 'tacos', 'burrito', 'enchilada', 'salsa'],
  BBQ: ['bbq', 'barbecue', 'grill', 'smoked', 'brisket'],
  Vegan: ['vegan', 'plant-based'],
  Asian: ['asian', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese'],
  Italian: ['italian', 'pasta', 'pizza', 'risotto'],
  Indian: ['indian', 'curry', 'tikka', 'masala'],
  Comfort: ['comfort', 'casserole', 'stew', 'soup'],
};

function matchesCategory(event: MealPrepEvent, category: string): boolean {
  if (category === 'All') return true;
  const keywords = CATEGORY_KEYWORDS[category] || [];
  const searchable = [
    event.title,
    event.description,
    ...(event.dietary_accommodations || []),
  ].join(' ').toLowerCase();
  return keywords.some((kw) => searchable.includes(kw));
}

function matchesSearch(event: MealPrepEvent, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    (event.title || '').toLowerCase().includes(q) ||
    (event.description || '').toLowerCase().includes(q)
  );
}

// Fetch user's upcoming events (host or attendee)
async function fetchMyEvents(userId: string): Promise<MealPrepEvent[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('meal_prep_events')
    .select('*')
    .gte('event_date', today)
    .order('event_date', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

// Fetch user's past events (host or attendee)
async function fetchPastEvents(userId: string): Promise<MealPrepEvent[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('meal_prep_events')
    .select('*')
    .lt('event_date', today)
    .order('event_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// Fetch attendee names for events (for avatar dots)
async function fetchAttendeesForEvents(eventIds: string[]): Promise<Record<string, string[]>> {
  if (eventIds.length === 0) return {};
  const { data } = await supabase
    .from('event_attendees')
    .select('event_id, profiles:profiles!user_id(name)')
    .in('event_id', eventIds)
    .eq('registration_status', 'approved');

  const result: Record<string, string[]> = {};
  (data || []).forEach((row: any) => {
    if (!result[row.event_id]) result[row.event_id] = [];
    result[row.event_id].push(row.profiles?.name || '?');
  });
  return result;
}

export default function MealPrepEventListV2Screen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Drafts
  const { useDrafts, deleteDraft } = useEventDraft();
  const { data: drafts } = useDrafts();

  // My upcoming events
  const {
    data: myEvents,
    isLoading: isLoadingMy,
    refetch: refetchMy,
    isFetching: isFetchingMy,
  } = useQuery({
    queryKey: ['mealPrepMyEvents', userId],
    queryFn: () => fetchMyEvents(userId!),
    enabled: !!userId,
  });

  // Past events
  const {
    data: pastEvents,
    refetch: refetchPast,
    isFetching: isFetchingPast,
  } = useQuery({
    queryKey: ['mealPrepPastEvents', userId],
    queryFn: () => fetchPastEvents(userId!),
    enabled: !!userId,
  });

  // Attendee names for carousel dots
  const myEventIds = useMemo(() => (myEvents || []).map((e) => e.id), [myEvents]);
  const { data: attendeeNamesMap } = useQuery({
    queryKey: ['mealPrepAttendeesMap', myEventIds],
    queryFn: () => fetchAttendeesForEvents(myEventIds),
    enabled: myEventIds.length > 0,
  });

  // Refetch on focus
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['mealPrepMyEvents'] });
      queryClient.invalidateQueries({ queryKey: ['mealPrepPastEvents'] });
    }, [queryClient])
  );

  const handleRefresh = () => {
    refetchMy();
    refetchPast();
  };

  const handleEventPress = (eventId: string) => {
    navigation.navigate('MealPrepEventDetail', { eventId });
  };

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

  const handleResumeDraft = (draftId: string) => {
    navigation.navigate('CreateEventForm', { draftId });
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await deleteDraft(draftId);
    } catch {}
  };

  // Build carousel data with role info
  const carouselEvents = useMemo(() => {
    const events = (myEvents || [])
      .filter((e) => matchesCategory(e, category) && matchesSearch(e, debouncedSearch))
      .map((e) => ({
        ...e,
        _role: (e.host_user_id === userId ? 'host' : 'attending') as 'host' | 'attending',
        _attendeeNames: (attendeeNamesMap || {})[e.id] || [],
      }));
    return events;
  }, [myEvents, category, debouncedSearch, userId, attendeeNamesMap]);

  // Filter past events
  const filteredPastEvents = useMemo(() => {
    return (pastEvents || []).filter(
      (e) => matchesCategory(e, category) && matchesSearch(e, debouncedSearch)
    );
  }, [pastEvents, category, debouncedSearch]);

  // Loading state
  if (isLoadingMy && !myEvents) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={mpColors.teal} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetchingMy || isFetchingPast}
            onRefresh={handleRefresh}
            tintColor={mpColors.teal}
            colors={[mpColors.teal]}
          />
        }
      >
        <ListPageTitle />
        <CategoryChips selected={category} onSelect={setCategory} />
        <SearchBar value={search} onChange={setSearch} />

        <DraftBanner
          drafts={drafts || []}
          onResume={handleResumeDraft}
          onDelete={handleDeleteDraft}
        />

        <YourEventsCarousel
          events={carouselEvents}
          onEventPress={handleEventPress}
        />

        <PastEventsSection
          events={filteredPastEvents}
          userId={userId || ''}
          onEventPress={handleEventPress}
        />

        <View style={{ height: 80 }} />
      </ScrollView>

      <CreateEventFAB onPress={handleCreateEvent} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: mpColors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mpColors.background,
  },
});
