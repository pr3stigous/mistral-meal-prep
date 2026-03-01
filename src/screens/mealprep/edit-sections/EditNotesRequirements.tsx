import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpSpacing, mpRadii } from '../../../constants/mealPrepTheme';
import { EditEventFormData, EventRequirementUIItem } from '../../../lib/eventFormTypes';

interface Props {
  eventNotes: string;
  requirements: EventRequirementUIItem[];
  onChange: (updates: Partial<EditEventFormData>) => void;
  onAddRequirement: (req: { description: string; type: string }) => void;
  onRemoveRequirement: (id: string) => void;
}

const SUGGESTION_CHIPS = [
  'Parking available',
  'BYOB',
  'Bring containers',
  'Kid-friendly',
  'Pet-free zone',
];

const REQ_TYPE_CHIPS = [
  { value: 'item_to_bring', label: 'Bring Item' },
  { value: 'action_required', label: 'Action Required' },
];

export default function EditNotesRequirements({
  eventNotes,
  requirements,
  onChange,
  onAddRequirement,
  onRemoveRequirement,
}: Props) {
  const [showAddReq, setShowAddReq] = useState(false);
  const [newReqDesc, setNewReqDesc] = useState('');
  const [newReqType, setNewReqType] = useState('item_to_bring');

  const handleAddSuggestion = (chip: string) => {
    const current = eventNotes.trim();
    const updated = current ? `${current}\n${chip}` : chip;
    onChange({ eventNotes: updated });
  };

  const handleAddReq = () => {
    if (!newReqDesc.trim()) {
      Alert.alert('Missing Info', 'Please enter a description for the requirement.');
      return;
    }
    onAddRequirement({ description: newReqDesc.trim(), type: newReqType });
    setNewReqDesc('');
    setShowAddReq(false);
  };

  const getTypeBadgeStyle = (type: string) => {
    if (type === 'action_required') {
      return { bg: mpColors.amberLight, text: mpColors.amber };
    }
    return { bg: mpColors.tealLight, text: mpColors.teal };
  };

  return (
    <View style={styles.container}>
      {/* Notes textarea */}
      <Text style={styles.label}>Notes</Text>
      <View style={styles.chipRow}>
        {SUGGESTION_CHIPS.map(chip => (
          <TouchableOpacity key={chip} style={styles.suggestionChip} onPress={() => handleAddSuggestion(chip)}>
            <Ionicons name="add" size={12} color={mpColors.teal} />
            <Text style={styles.suggestionText}>{chip}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.textarea}
        value={eventNotes}
        onChangeText={(text) => onChange({ eventNotes: text })}
        placeholder="Additional notes for your event..."
        placeholderTextColor={mpColors.gray400}
        multiline
        textAlignVertical="top"
        numberOfLines={4}
      />

      {/* Requirements list */}
      <View style={styles.reqHeader}>
        <Text style={styles.label}>Requirements</Text>
        <Text style={styles.reqCount}>{requirements.length}</Text>
      </View>

      {requirements.map(req => {
        const badge = getTypeBadgeStyle(req.type);
        return (
          <View key={req.id} style={styles.reqRow}>
            <View style={[styles.reqTypeBadge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.reqTypeBadgeText, { color: badge.text }]}>
                {req.type === 'action_required' ? 'Action' : 'Bring'}
              </Text>
            </View>
            <Text style={styles.reqDesc} numberOfLines={2}>{req.description}</Text>
            <TouchableOpacity onPress={() => onRemoveRequirement(req.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color={mpColors.gray400} />
            </TouchableOpacity>
          </View>
        );
      })}

      {/* Add requirement */}
      {showAddReq ? (
        <View style={styles.addReqForm}>
          <TextInput
            style={styles.addReqInput}
            value={newReqDesc}
            onChangeText={setNewReqDesc}
            placeholder="e.g., Bring your own apron"
            placeholderTextColor={mpColors.gray400}
            autoFocus
          />
          <View style={styles.chipRow}>
            {REQ_TYPE_CHIPS.map(chip => (
              <TouchableOpacity
                key={chip.value}
                style={[styles.typeChip, newReqType === chip.value && styles.typeChipActive]}
                onPress={() => setNewReqType(chip.value)}
              >
                <Text style={[styles.typeChipText, newReqType === chip.value && styles.typeChipTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.addReqActions}>
            <TouchableOpacity style={styles.addReqCancel} onPress={() => { setShowAddReq(false); setNewReqDesc(''); }}>
              <Text style={styles.addReqCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addReqConfirm} onPress={handleAddReq}>
              <Text style={styles.addReqConfirmText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.addReqButton} onPress={() => setShowAddReq(true)}>
          <Ionicons name="add" size={16} color={mpColors.teal} />
          <Text style={styles.addReqButtonText}>Add Requirement</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.md,
  },
  label: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray700,
    marginBottom: mpSpacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: mpSpacing.sm,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: mpRadii.pill,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    backgroundColor: mpColors.white,
  },
  suggestionText: {
    fontSize: 12,
    fontFamily: mpFonts.regular,
    color: mpColors.gray600,
  },
  textarea: {
    backgroundColor: mpColors.gray50,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
    minHeight: 100,
    marginBottom: mpSpacing.lg,
  },
  reqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: mpSpacing.sm,
  },
  reqCount: {
    fontSize: 12,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray400,
    backgroundColor: mpColors.gray100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: mpColors.white,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    padding: 10,
    marginBottom: 6,
  },
  reqTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: mpRadii.pill,
  },
  reqTypeBadgeText: {
    fontSize: 10,
    fontFamily: mpFonts.semiBold,
    letterSpacing: 0.3,
  },
  reqDesc: {
    flex: 1,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  addReqButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: mpColors.teal,
  },
  addReqButtonText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
  addReqForm: {
    marginTop: 4,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  addReqInput: {
    borderWidth: 1,
    borderColor: mpColors.gray200,
    borderRadius: mpRadii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: mpFonts.regular,
    color: mpColors.gray800,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: mpRadii.pill,
    borderWidth: 1,
    borderColor: mpColors.gray200,
    backgroundColor: mpColors.white,
  },
  typeChipActive: {
    backgroundColor: mpColors.tealMist,
    borderColor: mpColors.teal,
  },
  typeChipText: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  typeChipTextActive: {
    color: mpColors.teal,
  },
  addReqActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addReqCancel: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  addReqCancelText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray600,
  },
  addReqConfirm: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  addReqConfirmText: {
    fontSize: 14,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
});
