import React from 'react';
import { View, StyleSheet } from 'react-native';
import { mpSpacing } from '../../../constants/mealPrepTheme';
import EventCommentsSection from '../../../components/mealprep/EventCommentsSection';

interface DetailCommentsProps {
  eventId: string;
  isParticipant: boolean;
  canManage: boolean;
  commentsRestricted: boolean;
  onToggleRestriction: (restricted: boolean) => void;
}

export default function DetailComments({ eventId, isParticipant, canManage, commentsRestricted, onToggleRestriction }: DetailCommentsProps) {
  return (
    <View style={styles.container}>
      <EventCommentsSection
        eventId={eventId}
        isParticipant={isParticipant}
        canManageEvent={canManage}
        commentsRestrictedToHosts={commentsRestricted}
        onToggleRestriction={onToggleRestriction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: mpSpacing.lg,
    paddingTop: mpSpacing.lg,
  },
});
