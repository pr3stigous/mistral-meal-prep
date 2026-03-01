import React from 'react';
import { View, StyleSheet } from 'react-native';
import { mpSpacing } from '../../../constants/mealPrepTheme';
import HostPackageSection from '../../../components/mealprep/HostPackageSection';
import { MealPrepEvent } from '../../../lib/types';

interface DetailHostPackageProps {
  event: MealPrepEvent;
}

export default function DetailHostPackage({ event }: DetailHostPackageProps) {
  if (!event.host_package) return null;

  return (
    <View style={styles.container}>
      <HostPackageSection
        hostPackage={event.host_package}
        isHost={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
});
