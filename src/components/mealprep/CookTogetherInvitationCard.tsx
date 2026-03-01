/**
 * CookTogetherInvitationCard
 *
 * Displays a pending Cook Together event invitation in the SupportersScreen.
 * Shows event details and the host who invited you.
 * User must Accept or Decline the invitation before they can access the event.
 * Modeled after ChallengeInvitationCard.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CookTogetherInvitation } from '../../services/mealPrepInviteService';

interface Props {
  invitation: CookTogetherInvitation;
  onAccept: (eventId: string, notificationId: number) => void;
  onDecline: (eventId: string, notificationId: number) => void;
  onViewEvent: (eventId: string, notificationId: number) => void;
  isAccepting?: boolean;
  isDeclining?: boolean;
}

const CookTogetherInvitationCard: React.FC<Props> = ({
  invitation,
  onAccept,
  onDecline,
  onViewEvent,
  isAccepting = false,
  isDeclining = false,
}) => {
  const isLoading = isAccepting || isDeclining;
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string | null): string => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const dateStr = formatDate(invitation.eventDate);
  const timeStr = formatTime(invitation.eventTime);
  const dateTimeStr = [dateStr, timeStr].filter(Boolean).join(' at ');

  return (
    <View style={styles.container}>
      {/* Header with inviter info */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Text style={styles.headerEmoji}>🍳</Text>
        </View>
        <Text style={styles.inviterText}>
          <Text style={styles.inviterName}>{invitation.inviterName || 'Someone'}</Text>
          {' invited you to cook together'}
        </Text>
      </View>

      {/* Event details card - tappable to view full event */}
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => onViewEvent(invitation.eventId, invitation.notificationId)}
        activeOpacity={0.7}
      >
        <Text style={styles.eventTitle} numberOfLines={2}>
          {invitation.eventTitle}
        </Text>

        {dateTimeStr ? (
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={15} color="#6B7280" />
            <Text style={styles.detailText}>{dateTimeStr}</Text>
          </View>
        ) : null}

        {invitation.eventLocation ? (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={15} color="#6B7280" />
            <Text style={styles.detailText} numberOfLines={1}>
              {invitation.eventLocation}
            </Text>
          </View>
        ) : null}

        <View style={styles.viewEventHint}>
          <Text style={styles.viewEventHintText}>Tap to view event details</Text>
          <Ionicons name="chevron-forward" size={14} color="#3fa6a6" />
        </View>
      </TouchableOpacity>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.declineButton]}
          onPress={() => onDecline(invitation.eventId, invitation.notificationId)}
          disabled={isLoading}
        >
          {isDeclining ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <>
              <Ionicons name="close" size={16} color="#6B7280" />
              <Text style={styles.declineButtonText}>Decline</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => onAccept(invitation.eventId, invitation.notificationId)}
          disabled={isLoading}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              <Text style={styles.acceptButtonText}>Accept</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerEmoji: {
    fontSize: 14,
  },
  inviterText: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  inviterName: {
    fontWeight: '600',
    color: '#1F2937',
  },
  eventCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  viewEventHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 4,
  },
  viewEventHintText: {
    fontSize: 13,
    color: '#3fa6a6',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
  },
  declineButton: {
    backgroundColor: '#F3F4F6',
    flex: 0.45,
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  acceptButton: {
    backgroundColor: '#10B981',
    flex: 0.55,
  },
  acceptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default CookTogetherInvitationCard;
