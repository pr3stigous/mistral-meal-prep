/**
 * MealPrepWidget - Dashboard Widget
 *
 * Simple button widget that navigates to the Meal Prep event screens.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const MealPrepWidget: React.FC = () => {
  const navigation = useNavigation<any>();

  const handlePress = () => {
    navigation.navigate('MealPrep', {
      screen: 'MealPrepEventList',
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetTitle}>Cook Together</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handlePress} activeOpacity={0.7}>
        <View style={styles.iconContainer}>
          <Ionicons name="people-outline" size={24} color="#3fa6a6" />
        </View>
        <View style={styles.buttonTextContainer}>
          <Text style={styles.buttonTitle}>Community Events</Text>
          <Text style={styles.buttonSubtitle}>Plan and join meal prep sessions</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  widgetHeader: {
    marginBottom: 12,
  },
  widgetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  buttonSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
});

export default MealPrepWidget;
