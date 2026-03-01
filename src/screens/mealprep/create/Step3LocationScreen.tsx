import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { MealPrepStackParamList } from '../../../navigators/MealPrepNavigator';
import { useEventDraft } from '../useEventDraft';
import WizardProgressBar from '../../../components/mealprep/wizard/WizardProgressBar';
import WizardNavigation from '../../../components/mealprep/wizard/WizardNavigation';
import {
  Step3Data,
  AddressVisibility,
  SkillLevel,
  getInitialStep3Data,
  validateStep3,
  ADDRESS_VISIBILITY_OPTIONS,
  DIETARY_OPTIONS,
} from '../../../lib/eventWizardTypes';

type NavigationProp = NativeStackNavigationProp<MealPrepStackParamList, 'CreateEventStep3'>;
type RouteProps = RouteProp<MealPrepStackParamList, 'CreateEventStep3'>;

const SKILL_LEVELS: { value: SkillLevel; label: string; description: string }[] = [
  { value: 'beginner', label: 'Beginner', description: 'Basic cooking skills' },
  { value: 'intermediate', label: 'Intermediate', description: 'Comfortable in kitchen' },
  { value: 'advanced', label: 'Advanced', description: 'Complex techniques' },
];

const Step3LocationScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { draftId } = route.params;

  const { useDraft, updateDraft, isUpdating } = useEventDraft();
  const { data: draft, isLoading } = useDraft(draftId);

  // Refs for keyboard handling
  const scrollViewRef = useRef<ScrollView>(null);

  // Form state
  const [formData, setFormData] = useState<Step3Data>(getInitialStep3Data());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load draft data on mount
  useEffect(() => {
    if (draft?.draftData?.step3) {
      setFormData(draft.draftData.step3);
    }
  }, [draft]);

  // Update form field
  const updateField = <K extends keyof Step3Data>(key: K, value: Step3Data[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  // Toggle dietary accommodation
  const toggleDietary = (item: string) => {
    setFormData(prev => {
      const current = prev.dietaryAccommodations || [];
      const updated = current.includes(item)
        ? current.filter(d => d !== item)
        : [...current, item];
      return { ...prev, dietaryAccommodations: updated };
    });
  };

  // Handle navigation
  const handleBack = () => {
    navigation.goBack();
  };

  const handleNext = async () => {
    // Validate
    const validation = validateStep3(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Save and navigate
    try {
      await updateDraft({
        draftId,
        stepCompleted: 3,
        draftData: { step3: formData },
      });
      navigation.navigate('CreateEventStep4', { draftId });
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
                stepCompleted: 2,
                draftData: { step3: formData },
              });
            } catch {}
            navigation.navigate('MealPrepEventList');
          },
        },
      ]
    );
  };

  // Completed steps for progress bar
  const completedSteps = [1, 2];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location & Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Progress Bar */}
      <WizardProgressBar
        currentStep={3}
        completedSteps={completedSteps}
        onStepPress={(step) => {
          if (step === 1) navigation.navigate('CreateEventStep1', { draftId });
          if (step === 2) navigation.navigate('CreateEventStep2', { draftId });
        }}
      />

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
          {/* Step Title */}
          <Text style={styles.stepTitle}>Where & how?</Text>
          <Text style={styles.stepSubtitle}>
            Set up the logistics for your event
          </Text>

          {/* Location Description */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Location Description</Text>
            <Text style={styles.hint}>Can be general like "Downtown area"</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Near Central Park, quiet neighborhood"
              value={formData.locationDescription}
              onChangeText={(text) => updateField('locationDescription', text)}
              multiline
              numberOfLines={2}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                }, 100);
              }}
            />
          </View>

          {/* City */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>City *</Text>
            <TextInput
              style={[styles.input, errors.locationCity && styles.inputError]}
              placeholder="e.g., San Francisco"
              value={formData.locationCity}
              onChangeText={(text) => updateField('locationCity', text)}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ y: 60, animated: true });
                }, 100);
              }}
            />
            {errors.locationCity && (
              <Text style={styles.errorText}>{errors.locationCity}</Text>
            )}
          </View>

          {/* State & Country Row */}
          <View style={styles.row}>
            <View style={[styles.fieldContainer, styles.halfField]}>
              <Text style={styles.label}>State/Province</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., California"
                value={formData.locationState}
                onChangeText={(text) => updateField('locationState', text)}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 120, animated: true });
                  }, 100);
                }}
              />
            </View>
            <View style={[styles.fieldContainer, styles.halfField]}>
              <Text style={styles.label}>Country</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., USA"
                value={formData.locationCountry}
                onChangeText={(text) => updateField('locationCountry', text)}
                onFocus={() => {
                  setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: 120, animated: true });
                  }, 100);
                }}
              />
            </View>
          </View>

          {/* Address Visibility */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>When to share exact address?</Text>
            <View style={styles.radioGroup}>
              {ADDRESS_VISIBILITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.radioOption,
                    formData.addressVisibility === option.value &&
                      styles.radioOptionActive,
                  ]}
                  onPress={() => updateField('addressVisibility', option.value)}
                >
                  <View style={styles.radioCircle}>
                    {formData.addressVisibility === option.value && (
                      <View style={styles.radioCircleInner} />
                    )}
                  </View>
                  <View style={styles.radioContent}>
                    <Text
                      style={[
                        styles.radioLabel,
                        formData.addressVisibility === option.value &&
                          styles.radioLabelActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.radioDescription}>{option.description}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Skill Level */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Skill Level Required</Text>
            <Text style={styles.hint}>
              {draft?.draftData?.step2?.parsedRecipe
                ? 'Auto-detected from recipe, but you can change it'
                : 'What cooking experience is needed?'}
            </Text>
            <View style={styles.skillLevelRow}>
              {SKILL_LEVELS.map((level) => (
                <TouchableOpacity
                  key={level.value}
                  style={[
                    styles.skillButton,
                    formData.skillLevel === level.value && styles.skillButtonActive,
                  ]}
                  onPress={() => updateField('skillLevel', level.value)}
                >
                  <Text
                    style={[
                      styles.skillButtonText,
                      formData.skillLevel === level.value &&
                        styles.skillButtonTextActive,
                    ]}
                  >
                    {level.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Dietary Accommodations */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Dietary Accommodations</Text>
            <Text style={styles.hint}>Select all that apply</Text>
            <View style={styles.dietaryGrid}>
              {DIETARY_OPTIONS.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[
                    styles.dietaryChip,
                    formData.dietaryAccommodations?.includes(item) &&
                      styles.dietaryChipActive,
                  ]}
                  onPress={() => toggleDietary(item)}
                >
                  {formData.dietaryAccommodations?.includes(item) && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color="#FFFFFF"
                      style={styles.dietaryCheckmark}
                    />
                  )}
                  <Text
                    style={[
                      styles.dietaryChipText,
                      formData.dietaryAccommodations?.includes(item) &&
                        styles.dietaryChipTextActive,
                    ]}
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Event Notes */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Additional Notes (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Anything else guests should know? Parking tips, what to bring, etc."
              value={formData.eventNotes}
              onChangeText={(text) => updateField('eventNotes', text)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 100);
              }}
            />
          </View>
        </ScrollView>

        {/* Navigation */}
        <WizardNavigation
          onBack={handleBack}
          onNext={handleNext}
          nextLabel="Next"
          isLoading={isUpdating}
        />
      </KeyboardAvoidingView>
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
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 28,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
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
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  radioGroup: {
    gap: 10,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  radioOptionActive: {
    borderColor: '#3fa6a6',
    backgroundColor: '#E0F2F2',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3fa6a6',
  },
  radioContent: {
    flex: 1,
  },
  radioLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  radioLabelActive: {
    color: '#3fa6a6',
  },
  radioDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 8,
  },
  skillLevelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skillButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  skillButtonActive: {
    backgroundColor: '#3fa6a6',
    borderColor: '#3fa6a6',
  },
  skillButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  skillButtonTextActive: {
    color: '#FFFFFF',
  },
  dietaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dietaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  dietaryChipActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  dietaryChipText: {
    fontSize: 14,
    color: '#1C1C1E',
  },
  dietaryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  dietaryCheckmark: {
    marginRight: 4,
  },
});

export default Step3LocationScreen;
