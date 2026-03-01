import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useEventDraft } from '../useEventDraft';
import { useAuth } from '../../../AuthContext';
import { supabase } from '../../../lib/supabase';
import { EventDraftData } from '../../../lib/eventWizardTypes';
import { generateEventInviteToken, inviteToEvent } from '../../../services/mealPrepInviteService';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'EventPreview'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'EventPreview'>;

const EventPreviewScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId } = route.params;
  const { user } = useAuth();

  const { useDraft, deleteDraft } = useEventDraft();
  const { data: draft, isLoading } = useDraft(draftId);

  const [isPublishing, setIsPublishing] = useState(false);

  const draftData = draft?.draftData || {};
  const { step1, step2, step3, step4 } = draftData;

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Format time for display
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Get max participants from range
  const getMaxParticipants = (range: string): number => {
    switch (range) {
      case '2-4': return 4;
      case '5-8': return 8;
      case '9-12': return 12;
      case '13+': return 20;
      default: return 8;
    }
  };

  // Handle publish
  const handlePublish = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to publish an event.');
      return;
    }

    if (!step1) {
      Alert.alert('Error', 'Missing event details. Please go back and complete step 1.');
      return;
    }

    setIsPublishing(true);

    try {
      // Create the event
      const eventData = {
        host_user_id: user.id,
        title: step1.title,
        event_date: step1.eventDate,
        event_time: step1.eventTime,
        estimated_duration_minutes: step1.estimatedDurationMinutes,
        expected_participants: step1.expectedParticipants,
        recipe_id: step2?.recipeId ? parseInt(step2.recipeId, 10) : null,
        description: step2?.parsedRecipe?.description || step3?.eventNotes || null,
        location_city: step3?.locationCity || '',
        location_state: step3?.locationState || null,
        location_country: step3?.locationCountry || 'USA',
        location_zip: step3?.locationZip || null,
        location_general_description: step3?.locationDescription || null,
        latitude: step3?.latitude || null,
        longitude: step3?.longitude || null,
        address_visibility: step3?.addressVisibility || 'after_rsvp',
        dietary_accommodations: step3?.dietaryAccommodations?.length ? step3.dietaryAccommodations : null,
        skill_level: step3?.skillLevel || null,
        status: 'planning',
        max_participants: getMaxParticipants(step1.expectedParticipants),
      };

      const { data: event, error: eventError } = await supabase
        .from('meal_prep_events')
        .insert(eventData)
        .select('id')
        .single();

      if (eventError) throw eventError;
      const eventId = event.id;

      // Auto-add host as participant
      await supabase.from('event_attendees').insert({
        event_id: eventId,
        user_id: user.id,
        role: 'participant',
        registration_status: 'approved',
      });

      // Add contributions
      if (step4?.contributions && step4.contributions.length > 0) {
        const contributionsToInsert = step4.contributions
          .filter(c => c.ownership === 'needs_volunteer')
          .map(c => ({
            event_id: eventId,
            description: `${c.name}${c.quantity > 1 ? ` (${c.quantity} ${c.unit})` : ''}`,
            type: c.category === 'equipment' ? 'equipment' : 'ingredient',
            quantity_needed: c.quantity,
          }));

        if (contributionsToInsert.length > 0) {
          await supabase.from('event_contributions_needed').insert(contributionsToInsert);
        }
      }

      // Generate shareable invite token for the event
      await generateEventInviteToken(eventId);

      // Add targeted invites (auto-approved) with pending_invitations records
      if (step4?.invitedUserIds && step4.invitedUserIds.length > 0) {
        await inviteToEvent(user.id, eventId, step4.invitedUserIds);
      }

      // Add co-host if specified
      if (step4?.coHostUserId) {
        await supabase.from('event_attendees').insert({
          event_id: eventId,
          user_id: step4.coHostUserId,
          role: 'co-leader',
          registration_status: 'approved',
        });
      }

      // Generate host package if event has a recipe
      if (step2?.recipeId && step2?.parsedRecipe) {
        try {
          const { data: hostPackageData } = await supabase.functions.invoke('generate-host-package', {
            body: {
              recipe: {
                name: step2.parsedRecipe.name,
                description: step2.parsedRecipe.description,
                servings: step2.parsedRecipe.servings,
                prep_time_minutes: step2.parsedRecipe.prepTimeMinutes,
                cook_time_minutes: step2.parsedRecipe.cookTimeMinutes,
                skill_level: step2.parsedRecipe.skillLevel,
                ingredients: step2.parsedRecipe.ingredients,
                instructions: step2.parsedRecipe.instructions,
                equipment_needed: step2.parsedRecipe.equipmentNeeded,
              },
              event_details: {
                event_date: step1.eventDate,
                event_time: step1.eventTime,
                expected_participants: step1.expectedParticipants,
                dietary_accommodations: step3?.dietaryAccommodations,
              },
              user_id: user.id,
            },
          });

          if (hostPackageData?.success && hostPackageData?.host_package) {
            // Save host package to event
            await supabase
              .from('meal_prep_events')
              .update({ host_package: hostPackageData.host_package })
              .eq('id', eventId);
          }
        } catch (hostPackageError) {
          // Log but don't fail event creation if host package generation fails
          console.error('Host package generation failed:', hostPackageError);
        }
      }

      // Delete the draft
      await deleteDraft(draftId);

      // Navigate to the event detail
      Alert.alert(
        'Event Created!',
        'Your meal prep event has been published.',
        [
          {
            text: 'View Event',
            onPress: () => {
              navigation.reset({
                index: 1,
                routes: [
                  { name: 'MealPrepEventList' },
                  { name: 'MealPrepEventDetail', params: { eventId } },
                ],
              });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Publish error:', error);
      Alert.alert('Error', error.message || 'Failed to publish event. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  // Handle edit section
  const handleEditSection = (step: number) => {
    switch (step) {
      case 1:
        navigation.navigate('CreateEventStep1', { draftId });
        break;
      case 2:
        navigation.navigate('CreateEventStep2', { draftId });
        break;
      case 3:
        navigation.navigate('CreateEventStep3', { draftId });
        break;
      case 4:
        navigation.navigate('CreateEventStep4', { draftId });
        break;
    }
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSaveDraft = () => {
    Alert.alert(
      'Draft Saved',
      'Your event has been saved. You can continue editing anytime.',
      [
        {
          text: 'OK',
          onPress: () => navigation.navigate('MealPrepEventList'),
        },
      ]
    );
  };

  // Show loading until we have actual step1 data (not just draft loaded)
  if (isLoading || !step1?.title) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator size="large" color="#3fa6a6" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#3fa6a6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preview</Text>
        <TouchableOpacity onPress={handleSaveDraft} style={styles.draftButton}>
          <Text style={styles.draftButtonText}>Save Draft</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Preview Header */}
        <View style={styles.previewHeader}>
          <Ionicons name="eye-outline" size={24} color="#8E8E93" />
          <Text style={styles.previewHeaderText}>
            This is how your event will appear to guests
          </Text>
        </View>

        {/* Event Card */}
        <View style={styles.eventCard}>
          {/* Title */}
          <Text style={styles.eventTitle}>{step1?.title || 'Untitled Event'}</Text>

          {/* Date & Time */}
          <View style={styles.eventRow}>
            <Ionicons name="calendar-outline" size={18} color="#3fa6a6" />
            <View style={styles.eventRowContent}>
              <Text style={styles.eventRowLabel}>
                {step1?.eventDate ? formatDate(step1.eventDate) : 'Date not set'}
              </Text>
              <Text style={styles.eventRowValue}>
                {step1?.eventTime ? formatTime(step1.eventTime) : ''} •{' '}
                {step1?.estimatedDurationMinutes
                  ? `${Math.floor(step1.estimatedDurationMinutes / 60)}h ${step1.estimatedDurationMinutes % 60 > 0 ? `${step1.estimatedDurationMinutes % 60}m` : ''}`
                  : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => handleEditSection(1)}>
              <Ionicons name="pencil" size={16} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Location */}
          <View style={styles.eventRow}>
            <Ionicons name="location-outline" size={18} color="#3fa6a6" />
            <View style={styles.eventRowContent}>
              <Text style={styles.eventRowLabel}>
                {step3?.locationCity
                  ? `${step3.locationCity}${step3.locationState ? `, ${step3.locationState}` : ''}`
                  : 'Location not set'}
              </Text>
              {step3?.locationDescription && (
                <Text style={styles.eventRowValue}>{step3.locationDescription}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => handleEditSection(3)}>
              <Ionicons name="pencil" size={16} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          {/* Participants */}
          <View style={styles.eventRow}>
            <Ionicons name="people-outline" size={18} color="#3fa6a6" />
            <View style={styles.eventRowContent}>
              <Text style={styles.eventRowLabel}>
                {step1?.expectedParticipants || '5-8'} people expected
              </Text>
            </View>
            <TouchableOpacity onPress={() => handleEditSection(1)}>
              <Ionicons name="pencil" size={16} color="#8E8E93" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Recipe Section */}
        {step2?.parsedRecipe && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recipe</Text>
              <TouchableOpacity onPress={() => handleEditSection(2)}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.recipeCard}>
              <Text style={styles.recipeName}>{step2.parsedRecipe.name}</Text>
              <Text style={styles.recipeDescription} numberOfLines={2}>
                {step2.parsedRecipe.description}
              </Text>
              <View style={styles.recipeMeta}>
                <View style={styles.recipeMetaItem}>
                  <Ionicons name="time-outline" size={14} color="#8E8E93" />
                  <Text style={styles.recipeMetaText}>
                    {step2.parsedRecipe.prepTimeMinutes + step2.parsedRecipe.cookTimeMinutes} min
                  </Text>
                </View>
                <View style={styles.recipeMetaItem}>
                  <Ionicons name="restaurant-outline" size={14} color="#8E8E93" />
                  <Text style={styles.recipeMetaText}>
                    {step2.parsedRecipe.servings} servings
                  </Text>
                </View>
                <View style={styles.recipeMetaItem}>
                  <Ionicons name="fitness-outline" size={14} color="#8E8E93" />
                  <Text style={styles.recipeMetaText}>
                    {step2.parsedRecipe.skillLevel}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Details Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Details</Text>
            <TouchableOpacity onPress={() => handleEditSection(3)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Skill Level */}
          {step3?.skillLevel && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Skill Level</Text>
              <Text style={styles.detailValue}>
                {step3.skillLevel.charAt(0).toUpperCase() + step3.skillLevel.slice(1)}
              </Text>
            </View>
          )}

          {/* Dietary */}
          {step3?.dietaryAccommodations && step3.dietaryAccommodations.length > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dietary</Text>
              <View style={styles.tagRow}>
                {step3.dietaryAccommodations.map(diet => (
                  <View key={diet} style={styles.tag}>
                    <Text style={styles.tagText}>{diet}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {step3?.eventNotes && (
            <View style={styles.notesSection}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{step3.eventNotes}</Text>
            </View>
          )}
        </View>

        {/* Contributions Section */}
        {step4?.contributions && step4.contributions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Contributions Needed</Text>
              <TouchableOpacity onPress={() => handleEditSection(4)}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.contributionsList}>
              {step4.contributions
                .filter(c => c.ownership === 'needs_volunteer')
                .slice(0, 5)
                .map(item => (
                  <View key={item.id} style={styles.contributionItem}>
                    <Ionicons name="ellipse-outline" size={12} color="#8E8E93" />
                    <Text style={styles.contributionText}>{item.name}</Text>
                  </View>
                ))}
              {step4.contributions.filter(c => c.ownership === 'needs_volunteer').length > 5 && (
                <Text style={styles.moreItems}>
                  +{step4.contributions.filter(c => c.ownership === 'needs_volunteer').length - 5} more items
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Invites Section */}
        {step4?.invitedUserIds && step4.invitedUserIds.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Invites</Text>
              <TouchableOpacity onPress={() => handleEditSection(4)}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.invitesSummary}>
              {step4.invitedUserIds.length} guest{step4.invitedUserIds.length !== 1 ? 's' : ''} will be invited
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Publish Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.publishButton, isPublishing && styles.publishButtonDisabled]}
          onPress={handlePublish}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.publishButtonText}>Publishing...</Text>
            </>
          ) : (
            <>
              <Ionicons name="rocket-outline" size={20} color="#FFFFFF" />
              <Text style={styles.publishButtonText}>Publish Event</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  draftButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  draftButtonText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  previewHeaderText: {
    fontSize: 14,
    color: '#8E8E93',
    flex: 1,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 20,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  eventRowContent: {
    flex: 1,
    marginLeft: 12,
  },
  eventRowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  eventRowValue: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  editLink: {
    fontSize: 15,
    color: '#3fa6a6',
  },
  recipeCard: {
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 14,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  recipeDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
    lineHeight: 20,
  },
  recipeMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  recipeMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeMetaText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  detailLabel: {
    fontSize: 15,
    color: '#8E8E93',
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#E0F2F2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 13,
    color: '#3fa6a6',
  },
  notesSection: {
    marginTop: 12,
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: '#1C1C1E',
    lineHeight: 20,
  },
  contributionsList: {
    gap: 8,
  },
  contributionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contributionText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  moreItems: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  invitesSummary: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  publishButtonDisabled: {
    opacity: 0.6,
  },
  publishButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default EventPreviewScreen;
