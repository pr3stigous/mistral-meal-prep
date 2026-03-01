import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';

interface Props {
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export default function EditBottomBar({ isSaving, onCancel, onSave }: Props) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={isSaving}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
        onPress={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color={mpColors.white} />
        ) : (
          <>
            <Ionicons name="checkmark" size={18} color={mpColors.white} />
            <Text style={styles.saveText}>Save Changes</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: mpColors.white,
    borderTopWidth: 1,
    borderTopColor: mpColors.gray200,
    ...mpShadows.md,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.gray100,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray600,
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
