import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing, mpShadows } from '../../../constants/mealPrepTheme';
import { EventAttendee } from '../hooks/useEventDetail';

interface DetailAttendeesListProps {
  approvedAttendees: EventAttendee[];
  pendingAttendees: EventAttendee[];
  canManage: boolean;
  hostUserId: string;
  onApprove?: (attendeeId: string) => void;
  onDeny?: (attendeeId: string) => void;
  onUpdateRole?: (attendeeId: string, newRole: 'participant' | 'co-leader') => void;
}

const AVATAR_COLORS = [mpColors.teal, mpColors.coral, mpColors.purple, mpColors.blue, mpColors.green, mpColors.amber];

export default function DetailAttendeesList({
  approvedAttendees, pendingAttendees, canManage, hostUserId,
  onApprove, onDeny, onUpdateRole,
}: DetailAttendeesListProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Attendees</Text>

      {/* Pending requests (host only) */}
      {canManage && pendingAttendees.length > 0 && (
        <View style={styles.pendingSection}>
          <Text style={styles.subTitle}>Pending Requests ({pendingAttendees.length})</Text>
          {pendingAttendees.map(att => {
            const name = att.profiles?.name || att.profiles?.username || 'Unknown';
            return (
              <View key={att.id} style={styles.attendeeRow}>
                <View style={[styles.avatar, { backgroundColor: mpColors.amber }]}>
                  <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.attendeeName}>{name}</Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity style={styles.approveButton} onPress={() => onApprove?.(att.id)}>
                    <Ionicons name="checkmark" size={16} color={mpColors.white} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.denyButton} onPress={() => onDeny?.(att.id)}>
                    <Ionicons name="close" size={16} color={mpColors.white} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Approved attendees */}
      <View style={styles.card}>
        {approvedAttendees.map((att, i) => {
          const name = att.profiles?.name || att.profiles?.username || 'Unknown';
          const isHost = att.user_id === hostUserId;
          const isCoLeader = att.role === 'co-leader';
          return (
            <View key={att.id} style={styles.attendeeRow}>
              <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
                <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.attendeeName}>{name}</Text>
              {isHost && (
                <View style={styles.hostLabel}>
                  <Text style={styles.hostLabelText}>★ Host</Text>
                </View>
              )}
              {isCoLeader && !isHost && (
                <View style={styles.coLeaderLabel}>
                  <Text style={styles.coLeaderLabelText}>Co-leader</Text>
                </View>
              )}
              <Text style={styles.capacityBadge}>{approvedAttendees.length}</Text>
            </View>
          );
        })}
        {approvedAttendees.length === 0 && (
          <Text style={styles.emptyText}>No attendees yet</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: mpFonts.semiBold,
    color: mpColors.gray800,
    marginBottom: 8,
  },
  subTitle: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
    marginBottom: 8,
  },
  pendingSection: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.card,
    overflow: 'hidden',
    ...mpShadows.sm,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: mpColors.gray100,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 13,
    fontFamily: mpFonts.semiBold,
    color: mpColors.white,
  },
  attendeeName: {
    flex: 1,
    fontSize: 14,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
  },
  hostLabel: {
    backgroundColor: mpColors.amberLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  hostLabelText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.amber,
  },
  coLeaderLabel: {
    backgroundColor: mpColors.tealMist,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: mpRadii.pill,
  },
  coLeaderLabelText: {
    fontSize: 11,
    fontFamily: mpFonts.semiBold,
    color: mpColors.tealDark,
  },
  capacityBadge: {
    fontSize: 12,
    fontFamily: mpFonts.medium,
    color: mpColors.gray400,
    marginLeft: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  approveButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: mpColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: mpColors.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: mpFonts.regular,
    color: mpColors.gray400,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
