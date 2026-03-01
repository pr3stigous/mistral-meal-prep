import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpShadows } from '../../../constants/mealPrepTheme';
import { EventAttendee } from '../hooks/useEventDetail';

interface DetailStickyBottomBarProps {
  attendeeStatus: EventAttendee | null | undefined;
  canManage: boolean;
  isPastEvent?: boolean;
  joiningPaused?: boolean;
  isCancelled?: boolean;
  isJoining: boolean;
  isCancelling: boolean;
  onRequestToJoin: () => void;
  onCancelRequest: () => void;
  onLeaveEvent: () => void;
  onEdit: () => void;
  onShare: () => void;
}

export default function DetailStickyBottomBar({
  attendeeStatus,
  canManage,
  isPastEvent,
  joiningPaused,
  isCancelled,
  isJoining,
  isCancelling,
  onRequestToJoin,
  onCancelRequest,
  onLeaveEvent,
  onEdit,
  onShare,
}: DetailStickyBottomBarProps) {
  const status = attendeeStatus?.registration_status;

  // Cancelled event — show for host
  if (isCancelled && canManage) {
    return (
      <View style={styles.bar}>
        <View style={styles.cancelledInfo}>
          <Ionicons name="close-circle" size={18} color={mpColors.red} />
          <Text style={styles.cancelledText}>Event Cancelled</Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onEdit}>
          <Ionicons name="settings-outline" size={16} color={mpColors.white} />
          <Text style={styles.primaryText}>Manage</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Host view
  if (canManage) {
    return (
      <View style={styles.bar}>
        <TouchableOpacity style={styles.secondaryButton} onPress={onShare}>
          <Ionicons name="share-outline" size={18} color={mpColors.teal} />
          <Text style={styles.secondaryText}>Share</Text>
        </TouchableOpacity>
        {isPastEvent ? (
          <View style={styles.pastEventInfo}>
            <Ionicons name="time-outline" size={16} color={mpColors.gray400} />
            <Text style={styles.pastEventText}>Past Event</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={onEdit}>
            <Ionicons name="pencil" size={16} color={mpColors.white} />
            <Text style={styles.primaryText}>Edit Event</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Pending
  if (status === 'pending') {
    return (
      <View style={styles.bar}>
        <View style={styles.pendingInfo}>
          <Ionicons name="time-outline" size={18} color={mpColors.amber} />
          <Text style={styles.pendingText}>Awaiting host approval...</Text>
        </View>
        <TouchableOpacity style={styles.mutedButton} onPress={onCancelRequest} disabled={isCancelling}>
          {isCancelling ? (
            <ActivityIndicator size="small" color={mpColors.gray500} />
          ) : (
            <Text style={styles.mutedText}>Cancel</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Approved
  if (status === 'approved') {
    return (
      <View style={styles.bar}>
        <View style={styles.approvedInfo}>
          <Ionicons name="checkmark-circle" size={18} color={mpColors.green} />
          <Text style={styles.approvedText}>You're attending</Text>
        </View>
        <TouchableOpacity style={styles.mutedButton} onPress={onLeaveEvent}>
          <Text style={styles.mutedText}>Leave Event</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Pre-RSVP (or denied/cancelled — same UI, re-request)
  if (joiningPaused || isCancelled) {
    return (
      <View style={styles.bar}>
        <View style={isCancelled ? styles.cancelledInfo : styles.pausedInfo}>
          <Ionicons name={isCancelled ? 'close-circle' : 'pause-circle'} size={18} color={isCancelled ? mpColors.red : mpColors.amber} />
          <Text style={isCancelled ? styles.cancelledText : styles.pausedText}>
            {isCancelled ? 'Event Cancelled' : 'Joining Paused'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <TouchableOpacity style={styles.mutedButton} onPress={() => {}}>
        <Text style={styles.mutedText}>Not Now</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryButton} onPress={onRequestToJoin} disabled={isJoining}>
        {isJoining ? (
          <ActivityIndicator size="small" color={mpColors.white} />
        ) : (
          <Text style={styles.primaryText}>Request to Join</Text>
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
  primaryButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.teal,
  },
  primaryText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.teal,
  },
  secondaryText: {
    fontSize: 15,
    fontFamily: mpFonts.semiBold,
    color: mpColors.teal,
  },
  mutedButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    borderWidth: 1,
    borderColor: mpColors.gray200,
  },
  mutedText: {
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray500,
  },
  pendingInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.amberLight,
    justifyContent: 'center',
  },
  pendingText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.amber,
  },
  approvedInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.greenLight,
    justifyContent: 'center',
  },
  approvedText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.green,
  },
  pastEventInfo: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.gray100,
  },
  pastEventText: {
    fontSize: 15,
    fontFamily: mpFonts.medium,
    color: mpColors.gray400,
  },
  cancelledInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.redLight,
    justifyContent: 'center',
  },
  cancelledText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.red,
  },
  pausedInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: mpRadii.button,
    backgroundColor: mpColors.amberLight,
    justifyContent: 'center',
  },
  pausedText: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.amber,
  },
});
