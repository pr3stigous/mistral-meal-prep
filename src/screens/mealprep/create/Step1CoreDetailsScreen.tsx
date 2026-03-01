import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useEventDraft } from '../useEventDraft';
import WizardProgressBar from '../../../components/mealprep/wizard/WizardProgressBar';
import WizardNavigation from '../../../components/mealprep/wizard/WizardNavigation';
import {
  Step1Data,
  ParticipantRange,
  DURATION_OPTIONS,
  PARTICIPANT_OPTIONS,
  getInitialStep1Data,
  validateStep1,
} from '../../../lib/eventWizardTypes';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'CreateEventStep1'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'CreateEventStep1'>;

const TITLE_MAX_LENGTH = 80;

const Step1CoreDetailsScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId } = route.params;

  const { useDraft, updateDraft, isUpdating } = useEventDraft();
  const { data: draft, isLoading } = useDraft(draftId);

  // Refs for keyboard handling
  const scrollViewRef = useRef<ScrollView>(null);

  // Form state
  const [formData, setFormData] = useState<Step1Data>(getInitialStep1Data());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [customDuration, setCustomDuration] = useState('');
  const [showCustomDuration, setShowCustomDuration] = useState(false);

  // Load draft data on mount
  useEffect(() => {
    if (draft?.draftData?.step1) {
      setFormData(draft.draftData.step1);
      // Check if duration is custom
      const isStandardDuration = DURATION_OPTIONS.some(
        opt => opt.value === draft.draftData.step1?.estimatedDurationMinutes
      );
      if (!isStandardDuration && draft.draftData.step1.estimatedDurationMinutes) {
        setShowCustomDuration(true);
        setCustomDuration(draft.draftData.step1.estimatedDurationMinutes.toString());
      }
    }
  }, [draft]);

  // Auto-save debounced
  const saveFormData = useCallback(async () => {
    try {
      await updateDraft({
        draftId,
        stepCompleted: 1,
        draftData: { step1: formData },
      });
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [draftId, formData, updateDraft]);

  // Update form field
  const updateField = <K extends keyof Step1Data>(key: K, value: Step1Data[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    // Clear error when field is updated
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  // Handle date change
  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      updateField('eventDate', selectedDate.toISOString().split('T')[0]);
    }
  };

  // Handle time change
  const handleTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'set' && selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      updateField('eventTime', `${hours}:${minutes}`);
    }
  };

  // Handle duration selection
  const handleDurationSelect = (value: number | 'custom') => {
    if (value === 'custom') {
      setShowCustomDuration(true);
    } else {
      setShowCustomDuration(false);
      setCustomDuration('');
      updateField('estimatedDurationMinutes', value);
    }
  };

  // Handle custom duration input
  const handleCustomDurationChange = (text: string) => {
    setCustomDuration(text);
    const minutes = parseInt(text, 10);
    if (!isNaN(minutes) && minutes > 0) {
      updateField('estimatedDurationMinutes', minutes);
    }
  };

  // Handle navigation
  const handleBack = () => {
    navigation.goBack();
  };

  const handleNext = async () => {
    // Validate
    const validation = validateStep1(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Save and navigate
    try {
      await updateDraft({
        draftId,
        stepCompleted: 1,
        draftData: { step1: formData },
      });
      navigation.navigate('CreateEventStep2', { draftId });
    } catch (error) {
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Discard Event?',
      'Your progress will be saved as a draft.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Save & Exit',
          onPress: async () => {
            await saveFormData();
            navigation.navigate('MealPrepEventList');
          },
        },
      ]
    );
  };

  // Parse date/time for pickers
  const dateValue = formData.eventDate ? new Date(formData.eventDate) : new Date();
  const timeValue = formData.eventTime
    ? new Date(`2000-01-01T${formData.eventTime}:00`)
    : new Date();

  // Format display values
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Event</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Progress Bar */}
      <WizardProgressBar currentStep={1} completedSteps={[]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Event Title */}
          <View style={styles.fieldContainer}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Event Title</Text>
              <Text style={styles.charCounter}>
                {formData.title.length}/{TITLE_MAX_LENGTH}
              </Text>
            </View>
            <TextInput
              style={[styles.input, errors.title && styles.inputError]}
              placeholder="e.g., Sunday Italian Feast Prep"
              value={formData.title}
              onChangeText={(text) => updateField('title', text.slice(0, TITLE_MAX_LENGTH))}
              maxLength={TITLE_MAX_LENGTH}
              returnKeyType="done"
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                }, 100);
              }}
            />
            {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
          </View>

          {/* Date & Time Row */}
          <View style={styles.row}>
            {/* Date */}
            <View style={[styles.fieldContainer, styles.halfField]}>
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                style={[styles.pickerButton, errors.eventDate && styles.inputError]}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowTimePicker(false);
                  setShowDatePicker(true);
                }}
              >
                <Ionicons name="calendar-outline" size={18} color="#3fa6a6" />
                <Text style={styles.pickerButtonText}>
                  {formData.eventDate ? formatDate(formData.eventDate) : 'Select date'}
                </Text>
              </TouchableOpacity>
              {errors.eventDate && <Text style={styles.errorText}>{errors.eventDate}</Text>}
            </View>

            {/* Time */}
            <View style={[styles.fieldContainer, styles.halfField]}>
              <Text style={styles.label}>Time</Text>
              <TouchableOpacity
                style={[styles.pickerButton, errors.eventTime && styles.inputError]}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowDatePicker(false);
                  setShowTimePicker(true);
                }}
              >
                <Ionicons name="time-outline" size={18} color="#3fa6a6" />
                <Text style={styles.pickerButtonText}>
                  {formData.eventTime ? formatTime(formData.eventTime) : 'Select time'}
                </Text>
              </TouchableOpacity>
              {errors.eventTime && <Text style={styles.errorText}>{errors.eventTime}</Text>}
            </View>
          </View>

          {/* Duration */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>How long will it take?</Text>
            <View style={styles.quickSelectRow}>
              {DURATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.quickSelectButton,
                    formData.estimatedDurationMinutes === option.value &&
                      !showCustomDuration &&
                      styles.quickSelectButtonActive,
                  ]}
                  onPress={() => handleDurationSelect(option.value)}
                >
                  <Text
                    style={[
                      styles.quickSelectText,
                      formData.estimatedDurationMinutes === option.value &&
                        !showCustomDuration &&
                        styles.quickSelectTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.quickSelectButton,
                  showCustomDuration && styles.quickSelectButtonActive,
                ]}
                onPress={() => handleDurationSelect('custom')}
              >
                <Text
                  style={[
                    styles.quickSelectText,
                    showCustomDuration && styles.quickSelectTextActive,
                  ]}
                >
                  Custom
                </Text>
              </TouchableOpacity>
            </View>
            {showCustomDuration && (
              <View style={styles.customDurationRow}>
                <TextInput
                  style={[styles.customDurationInput]}
                  placeholder="Minutes"
                  value={customDuration}
                  onChangeText={handleCustomDurationChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: 200, animated: true });
                    }, 100);
                  }}
                />
                <Text style={styles.customDurationLabel}>minutes</Text>
              </View>
            )}
            {errors.estimatedDurationMinutes && (
              <Text style={styles.errorText}>{errors.estimatedDurationMinutes}</Text>
            )}
          </View>

          {/* Participants */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>How many people?</Text>
            <View style={styles.quickSelectRow}>
              {PARTICIPANT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.quickSelectButton,
                    formData.expectedParticipants === option.value &&
                      styles.quickSelectButtonActive,
                  ]}
                  onPress={() => updateField('expectedParticipants', option.value)}
                >
                  <Text
                    style={[
                      styles.quickSelectText,
                      formData.expectedParticipants === option.value &&
                        styles.quickSelectTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.expectedParticipants && (
              <Text style={styles.errorText}>{errors.expectedParticipants}</Text>
            )}
          </View>

          {/* Info Note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={18} color="#8E8E93" />
            <Text style={styles.infoNoteText}>
              This is an in-person event. Online events coming soon!
            </Text>
          </View>
        </ScrollView>

        {/* Navigation */}
        <WizardNavigation
          onBack={handleBack}
          onNext={handleNext}
          showBack={false}
          nextLabel="Next"
          isLoading={isUpdating}
        />
      </KeyboardAvoidingView>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}

      {/* Time Picker */}
      {showTimePicker && (
        <DateTimePicker
          value={timeValue}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleTimeChange}
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
    width: 60,
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
  fieldContainer: {
    marginBottom: 24,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  charCounter: {
    fontSize: 13,
    color: '#8E8E93',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    gap: 8,
  },
  pickerButtonText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  quickSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickSelectButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  quickSelectButtonActive: {
    backgroundColor: '#3fa6a6',
    borderColor: '#3fa6a6',
  },
  quickSelectText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  quickSelectTextActive: {
    color: '#FFFFFF',
  },
  customDurationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  customDurationInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    width: 100,
    textAlign: 'center',
  },
  customDurationLabel: {
    fontSize: 15,
    color: '#8E8E93',
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  infoNoteText: {
    fontSize: 14,
    color: '#8E8E93',
    flex: 1,
  },
});

export default Step1CoreDetailsScreen;
