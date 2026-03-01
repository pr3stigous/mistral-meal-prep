import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WizardNavigationProps {
  onBack?: () => void;
  onNext?: () => void;
  showBack?: boolean;
  showNext?: boolean;
  nextLabel?: string;
  isLoading?: boolean;
  isNextDisabled?: boolean;
  nextVariant?: 'primary' | 'success';
}

export const WizardNavigation: React.FC<WizardNavigationProps> = ({
  onBack,
  onNext,
  showBack = true,
  showNext = true,
  nextLabel = 'Next',
  isLoading = false,
  isNextDisabled = false,
  nextVariant = 'primary',
}) => {
  const nextBackgroundColor = nextVariant === 'success' ? '#34C759' : '#3fa6a6';

  return (
    <View style={styles.container}>
      {/* Back Button */}
      {showBack && onBack ? (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={20} color="#3fa6a6" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}

      {/* Saving Indicator */}
      {isLoading && (
        <View style={styles.savingContainer}>
          <ActivityIndicator size="small" color="#8E8E93" />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}

      {/* Next Button */}
      {showNext && onNext ? (
        <TouchableOpacity
          style={[
            styles.nextButton,
            { backgroundColor: nextBackgroundColor },
            (isLoading || isNextDisabled) && styles.nextButtonDisabled,
          ]}
          onPress={onNext}
          disabled={isLoading || isNextDisabled}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.nextButtonText}>{nextLabel}</Text>
              {nextLabel === 'Next' && (
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              )}
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3fa6a6',
    fontWeight: '500',
    marginLeft: 2,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 100,
    justifyContent: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginRight: 4,
  },
  placeholder: {
    width: 80,
  },
  savingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  savingText: {
    fontSize: 13,
    color: '#8E8E93',
    marginLeft: 6,
  },
});

export default WizardNavigation;
