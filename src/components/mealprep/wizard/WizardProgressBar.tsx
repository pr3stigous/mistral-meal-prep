import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WizardStep } from '../../../lib/eventWizardTypes';

interface Step {
  number: WizardStep;
  label: string;
  shortLabel: string;
}

const STEPS: Step[] = [
  { number: 1, label: 'Core Details', shortLabel: 'Details' },
  { number: 2, label: 'Recipe & Menu', shortLabel: 'Recipe' },
  { number: 3, label: 'Location', shortLabel: 'Location' },
  { number: 4, label: 'Contributions', shortLabel: 'Invite' },
];

interface WizardProgressBarProps {
  currentStep: WizardStep;
  completedSteps: number[];
  onStepPress?: (step: WizardStep) => void;
  disabled?: boolean;
}

export const WizardProgressBar: React.FC<WizardProgressBarProps> = ({
  currentStep,
  completedSteps,
  onStepPress,
  disabled = false,
}) => {
  const getStepStatus = (step: WizardStep): 'completed' | 'current' | 'upcoming' => {
    if (completedSteps.includes(step)) return 'completed';
    if (step === currentStep) return 'current';
    return 'upcoming';
  };

  const getStepColor = (status: 'completed' | 'current' | 'upcoming') => {
    switch (status) {
      case 'completed':
        return '#34C759'; // Green
      case 'current':
        return '#3fa6a6'; // Teal (matches app theme)
      case 'upcoming':
        return '#C7C7CC'; // Gray
    }
  };

  const handleStepPress = (step: WizardStep) => {
    // Only allow navigation to completed steps or previous steps
    if (!disabled && onStepPress && (completedSteps.includes(step) || step < currentStep)) {
      onStepPress(step);
    }
  };

  return (
    <View style={styles.container}>
      {STEPS.map((step, index) => {
        const status = getStepStatus(step.number);
        const color = getStepColor(status);
        const isClickable = !disabled && (completedSteps.includes(step.number) || step.number < currentStep);

        return (
          <React.Fragment key={step.number}>
            {/* Step Circle */}
            <TouchableOpacity
              style={[
                styles.stepContainer,
                isClickable && styles.stepClickable,
              ]}
              onPress={() => handleStepPress(step.number)}
              disabled={!isClickable}
              activeOpacity={isClickable ? 0.7 : 1}
            >
              <View
                style={[
                  styles.stepCircle,
                  { backgroundColor: status === 'upcoming' ? '#F2F2F7' : color },
                  { borderColor: color },
                ]}
              >
                {status === 'completed' ? (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      { color: status === 'upcoming' ? '#8E8E93' : '#FFFFFF' },
                    ]}
                  >
                    {step.number}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  { color: status === 'upcoming' ? '#8E8E93' : '#1C1C1E' },
                  status === 'current' && styles.stepLabelCurrent,
                ]}
                numberOfLines={1}
              >
                {step.shortLabel}
              </Text>
            </TouchableOpacity>

            {/* Connector Line */}
            {index < STEPS.length - 1 && (
              <View
                style={[
                  styles.connector,
                  {
                    backgroundColor:
                      completedSteps.includes(step.number) ? '#34C759' : '#E5E5EA',
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  stepContainer: {
    alignItems: 'center',
    minWidth: 60,
  },
  stepClickable: {
    opacity: 1,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  stepLabelCurrent: {
    fontWeight: '700',
  },
  connector: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 20, // Align with circle center
  },
});

export default WizardProgressBar;
