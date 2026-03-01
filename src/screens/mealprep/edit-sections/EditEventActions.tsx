import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../../constants/mealPrepTheme';

interface Props {
  joiningPaused: boolean;
  isCancelled: boolean;
  isOriginalHost: boolean;
  onPauseToggle: () => void;
  onCancel: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  isPauseLoading: boolean;
  isCancelLoading: boolean;
  isDeleteLoading: boolean;
}

export default function EditEventActions({
  joiningPaused,
  isCancelled,
  isOriginalHost,
  onPauseToggle,
  onCancel,
  onReactivate,
  onDelete,
  isPauseLoading,
  isCancelLoading,
  isDeleteLoading,
}: Props) {
  const handlePauseToggle = () => {
    const action = joiningPaused ? 'resume' : 'pause';
    Alert.alert(
      joiningPaused ? 'Resume Joining' : 'Pause Joining',
      joiningPaused
        ? 'New guests will be able to request to join again.'
        : 'New guests will not be able to request to join until you resume.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: joiningPaused ? 'Resume' : 'Pause', onPress: onPauseToggle },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Event',
      'This will mark the event as cancelled. Attendees will see a cancelled banner. You can reactivate later.',
      [
        { text: 'Keep Active', style: 'cancel' },
        { text: 'Cancel Event', style: 'destructive', onPress: onCancel },
      ]
    );
  };

  const handleReactivate = () => {
    Alert.alert(
      'Reactivate Event',
      'This will make the event active again and allow new guests to join.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Reactivate', onPress: onReactivate },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Event',
      'Are you sure? This action cannot be undone. All event data including contributions and attendees will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Delete',
              'This is your last chance. Delete this event permanently?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, Delete', style: 'destructive', onPress: onDelete },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Pause Joining */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Pause Joining</Text>
          <Text style={styles.switchHint}>
            Temporarily prevent new join requests
          </Text>
        </View>
        {isPauseLoading ? (
          <ActivityIndicator size="small" color={mpColors.teal} />
        ) : (
          <Switch
            trackColor={{ false: mpColors.gray300, true: mpColors.amber }}
            thumbColor={mpColors.white}
            ios_backgroundColor={mpColors.gray300}
            onValueChange={handlePauseToggle}
            value={joiningPaused}
            disabled={isCancelled}
          />
        )}
      </View>

      {/* Cancel / Reactivate Event */}
      {isCancelled ? (
        <TouchableOpacity
          style={styles.reactivateButton}
          onPress={handleReactivate}
          disabled={isCancelLoading}
        >
          {isCancelLoading ? (
            <ActivityIndicator size="small" color={mpColors.teal} />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color={mpColors.teal} />
              <Text style={styles.reactivateText}>Reactivate Event</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.cancelEventButton}
          onPress={handleCancel}
          disabled={isCancelLoading}
        >
          {isCancelLoading ? (
            <ActivityIndicator size="small" color={mpColors.amber} />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={18} color={mpColors.amber} />
              <Text style={styles.cancelEventText}>Cancel Event</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Delete Event (original host only) */}
      {isOriginalHost && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          disabled={isDeleteLoading}
        >
          {isDeleteLoading ? (
            <ActivityIndicator size="small" color={mpColors.red} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={18} color={mpColors.red} />
              <Text style={styles.deleteText}>Delete Event</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.input,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    padding: 14,
  },
  switchInfo: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
  },
  switchHint: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    marginTop: 2,
  },
  cancelEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    borderWidth: 1.5,
    borderColor: mpColors.amber,
    backgroundColor: mpColors.white,
  },
  cancelEventText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
  },
  reactivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    borderWidth: 1.5,
    borderColor: mpColors.teal,
    backgroundColor: mpColors.white,
  },
  reactivateText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    borderWidth: 1.5,
    borderColor: mpColors.red,
    backgroundColor: mpColors.white,
  },
  deleteText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.red,
  },
});
