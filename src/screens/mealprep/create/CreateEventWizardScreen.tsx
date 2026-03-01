import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useEventDraft } from '../useEventDraft';
import { EventTemplate } from '../../../lib/eventWizardTypes';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'CreateEventWizard'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'CreateEventWizard'>;

const CreateEventWizardScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId: routeDraftId, templateId } = route.params || {};

  const {
    useMostRecentDraft,
    useTemplates,
    createDraft,
    isCreating,
  } = useEventDraft();

  const { data: existingDraft, isLoading: isLoadingDraft } = useMostRecentDraft();
  const { data: templates, isLoading: isLoadingTemplates } = useTemplates();

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Check for existing draft on mount
  useEffect(() => {
    if (!isLoadingDraft && !routeDraftId) {
      if (existingDraft) {
        // Show recovery modal
        setShowRecoveryModal(true);
      } else if (!templateId) {
        // Show template selection or start fresh
        setShowTemplateModal(true);
      } else {
        // Apply template and navigate
        handleApplyTemplate(templateId);
      }
    } else if (routeDraftId) {
      // Navigate directly to step based on draft
      navigation.replace('CreateEventStep1', { draftId: routeDraftId });
    }
  }, [isLoadingDraft, existingDraft, routeDraftId, templateId]);

  const handleContinueDraft = () => {
    setShowRecoveryModal(false);
    if (existingDraft) {
      const step = Math.min(existingDraft.stepCompleted + 1, 4) as 1 | 2 | 3 | 4;
      navigation.replace(`CreateEventStep${step}` as any, { draftId: existingDraft.id });
    }
  };

  const handleStartFresh = async () => {
    setShowRecoveryModal(false);
    try {
      const draft = await createDraft({});
      navigation.replace('CreateEventStep1', { draftId: draft.id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create event draft. Please try again.');
    }
  };

  const handleApplyTemplate = async (selectedTemplateId: string) => {
    setShowTemplateModal(false);
    try {
      // Create draft with template data
      const template = templates?.find(t => t.id === selectedTemplateId);
      const initialData = template ? {
        step1: {
          title: '',
          eventDate: getDefaultEventDate(),
          eventTime: template.templateData.suggestedTime || '10:00',
          estimatedDurationMinutes: template.templateData.estimatedDurationMinutes,
          expectedParticipants: template.templateData.expectedParticipants,
        },
        step3: {
          locationDescription: '',
          locationCity: '',
          locationState: '',
          locationCountry: 'USA',
          locationZip: '',
          addressVisibility: 'after_rsvp' as const,
          dietaryAccommodations: template.templateData.dietaryAccommodations || [],
          skillLevel: template.templateData.skillLevel,
          eventNotes: '',
        },
      } : {};

      const draft = await createDraft(initialData);
      navigation.replace('CreateEventStep1', { draftId: draft.id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create event. Please try again.');
    }
  };

  const handleSkipTemplate = async () => {
    setShowTemplateModal(false);
    try {
      const draft = await createDraft({});
      navigation.replace('CreateEventStep1', { draftId: draft.id });
    } catch (error) {
      Alert.alert('Error', 'Failed to create event draft. Please try again.');
    }
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  if (isLoadingDraft || isLoadingTemplates || isCreating) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['bottom']}>
        <ActivityIndicator size="large" color="#3fa6a6" />
        <Text style={styles.loadingText}>Setting up your event...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Recovery Modal */}
      <Modal
        visible={showRecoveryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRecoveryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="document-text-outline" size={48} color="#3fa6a6" />
            <Text style={styles.modalTitle}>Continue where you left off?</Text>
            <Text style={styles.modalDescription}>
              You have an unfinished event draft from{' '}
              {existingDraft?.updatedAt
                ? new Date(existingDraft.updatedAt).toLocaleDateString()
                : 'recently'}
              .
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonSecondary}
                onPress={handleStartFresh}
              >
                <Text style={styles.modalButtonSecondaryText}>Start Fresh</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={handleContinueDraft}
              >
                <Text style={styles.modalButtonPrimaryText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Template Selection Modal */}
      <Modal
        visible={showTemplateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <View style={styles.templateModalOverlay}>
          <View style={styles.templateModalContent}>
            <View style={styles.templateModalHeader}>
              <Text style={styles.templateModalTitle}>Quick Start</Text>
              <TouchableOpacity onPress={handleCancel}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <Text style={styles.templateModalSubtitle}>
              Choose a template or start from scratch
            </Text>

            {/* Template Options */}
            {templates?.filter(t => t.isSystem).map(template => (
              <TouchableOpacity
                key={template.id}
                style={styles.templateCard}
                onPress={() => handleApplyTemplate(template.id)}
              >
                <View style={styles.templateIcon}>
                  <Ionicons
                    name={getTemplateIcon(template.name)}
                    size={24}
                    color="#3fa6a6"
                  />
                </View>
                <View style={styles.templateInfo}>
                  <Text style={styles.templateName}>{template.name}</Text>
                  <Text style={styles.templateDescription} numberOfLines={1}>
                    {template.description}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
              </TouchableOpacity>
            ))}

            {/* Start Fresh Option */}
            <TouchableOpacity
              style={[styles.templateCard, styles.startFreshCard]}
              onPress={handleSkipTemplate}
            >
              <View style={[styles.templateIcon, styles.startFreshIcon]}>
                <Ionicons name="add" size={24} color="#34C759" />
              </View>
              <View style={styles.templateInfo}>
                <Text style={styles.templateName}>Start from Scratch</Text>
                <Text style={styles.templateDescription}>
                  Create a custom event
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// Helper functions
function getDefaultEventDate(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
  const nextSaturday = new Date(today);
  nextSaturday.setDate(today.getDate() + daysUntilSaturday);
  return nextSaturday.toISOString().split('T')[0];
}

function getTemplateIcon(name: string): keyof typeof Ionicons.glyphMap {
  if (name.toLowerCase().includes('sunday')) return 'sunny-outline';
  if (name.toLowerCase().includes('weeknight')) return 'moon-outline';
  if (name.toLowerCase().includes('party')) return 'people-outline';
  return 'restaurant-outline';
}

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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 16,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  modalButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3fa6a6',
  },
  modalButtonPrimary: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#3fa6a6',
    alignItems: 'center',
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  templateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  templateModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  templateModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  templateModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  templateModalSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 20,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  templateIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#E0F2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  templateDescription: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  startFreshCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderStyle: 'dashed',
    backgroundColor: '#FFFFFF',
  },
  startFreshIcon: {
    backgroundColor: '#E8FAE8',
  },
});

export default CreateEventWizardScreen;
