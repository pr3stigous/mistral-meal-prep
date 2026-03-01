import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../../constants/mealPrepTheme';
import { EventFormData } from '../../../../lib/eventFormTypes';

interface DateTimeSectionProps {
  eventDate: string;
  eventTime: string;
  eventEndTime?: string;
  onChange: (updates: Partial<EventFormData>) => void;
}

export default function DateTimeSection({ eventDate, eventTime, eventEndTime, onChange }: DateTimeSectionProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const dateObj = new Date(eventDate + 'T12:00:00');
  const [hours, minutes] = eventTime.split(':').map(Number);
  const timeObj = new Date();
  timeObj.setHours(hours, minutes, 0, 0);

  const endTimeObj = (() => {
    if (!eventEndTime) {
      // Default to 2 hours after start when first opening
      const d = new Date(timeObj);
      d.setHours(d.getHours() + 2);
      return d;
    }
    const [h, m] = eventEndTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  })();

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const closeAllPickers = () => {
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowEndTimePicker(false);
  };

  const handleDateChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selected) {
      const yyyy = selected.getFullYear();
      const mm = String(selected.getMonth() + 1).padStart(2, '0');
      const dd = String(selected.getDate()).padStart(2, '0');
      onChange({ eventDate: `${yyyy}-${mm}-${dd}` });
      if (Platform.OS === 'ios') setShowDatePicker(false);
    }
  };

  const handleTimeChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) {
      const hh = String(selected.getHours()).padStart(2, '0');
      const mm = String(selected.getMinutes()).padStart(2, '0');
      onChange({ eventTime: `${hh}:${mm}` });
    }
  };

  const handleEndTimeChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowEndTimePicker(false);
    if (selected) {
      const hh = String(selected.getHours()).padStart(2, '0');
      const mm = String(selected.getMinutes()).padStart(2, '0');
      onChange({ eventEndTime: `${hh}:${mm}` });
    }
  };

  return (
    <View style={styles.container}>
      {/* Date row */}
      <TouchableOpacity style={styles.row} onPress={() => { closeAllPickers(); setShowDatePicker(v => !v); }}>
        <View style={[styles.iconBox, { backgroundColor: mpColors.coralLight }]}>
          <Ionicons name="calendar-outline" size={18} color={mpColors.coral} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>Date</Text>
          <Text style={styles.rowValue}>{formatDate(dateObj)}</Text>
        </View>
        <Ionicons name={showDatePicker ? 'chevron-down' : 'chevron-forward'} size={18} color={mpColors.gray400} />
      </TouchableOpacity>

      {showDatePicker && (
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={dateObj}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date()}
            onChange={handleDateChange}
          />
        </View>
      )}

      {/* Start time row */}
      <TouchableOpacity style={styles.row} onPress={() => { closeAllPickers(); setShowTimePicker(v => !v); }}>
        <View style={[styles.iconBox, { backgroundColor: mpColors.purpleLight }]}>
          <Ionicons name="time-outline" size={18} color={mpColors.purple} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowLabel}>Start Time</Text>
          <Text style={styles.rowValue}>{formatTime(timeObj)}</Text>
        </View>
        <Ionicons name={showTimePicker ? 'chevron-down' : 'chevron-forward'} size={18} color={mpColors.gray400} />
      </TouchableOpacity>

      {showTimePicker && (
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={timeObj}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minuteInterval={5}
            onChange={handleTimeChange}
          />
        </View>
      )}

      {/* End time row (optional) */}
      {eventEndTime ? (
        <TouchableOpacity style={styles.row} onPress={() => { closeAllPickers(); setShowEndTimePicker(v => !v); }}>
          <View style={[styles.iconBox, { backgroundColor: mpColors.purpleLight }]}>
            <Ionicons name="time-outline" size={18} color={mpColors.purple} />
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>End Time</Text>
            <Text style={styles.rowValue}>{formatTime(endTimeObj)}</Text>
          </View>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onChange({ eventEndTime: undefined });
              setShowEndTimePicker(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={20} color={mpColors.gray300} />
          </TouchableOpacity>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.addEndTimeRow}
          onPress={() => {
            closeAllPickers();
            // Set default end time to 2 hours after start
            const defaultEnd = new Date(timeObj);
            defaultEnd.setHours(defaultEnd.getHours() + 2);
            const hh = String(defaultEnd.getHours()).padStart(2, '0');
            const mm = String(defaultEnd.getMinutes()).padStart(2, '0');
            onChange({ eventEndTime: `${hh}:${mm}` });
            setShowEndTimePicker(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={18} color={mpColors.teal} />
          <Text style={styles.addEndTimeText}>Add end time</Text>
        </TouchableOpacity>
      )}

      {showEndTimePicker && eventEndTime && (
        <View style={styles.pickerWrapper}>
          <DateTimePicker
            value={endTimeObj}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minuteInterval={5}
            onChange={handleEndTimeChange}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.button,
    padding: 14,
    marginBottom: 8,
    ...mpShadows.xs,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray500,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginTop: 2,
  },
  pickerWrapper: {
    alignItems: 'center',
    marginBottom: 8,
  },
  addEndTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  addEndTimeText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.teal,
  },
});
