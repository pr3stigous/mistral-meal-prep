import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mpColors, mpFonts, mpRadii, mpSpacing } from '../../../../constants/mealPrepTheme';

export type ImportQueueStatus = 'pending' | 'importing' | 'done' | 'error';

export interface ImportQueueItemData {
  id: string;
  url: string;
  name?: string;
  status: ImportQueueStatus;
  recipeId?: string;
}

interface ImportQueueItemProps {
  item: ImportQueueItemData;
  onRetry: () => void;
  onRemove: () => void;
}

export default function ImportQueueItem({ item, onRetry, onRemove }: ImportQueueItemProps) {
  const displayName = item.name || truncateUrl(item.url);

  return (
    <View style={styles.row}>
      <View style={styles.statusIcon}>
        {item.status === 'importing' || item.status === 'pending' ? (
          <ActivityIndicator size="small" color={mpColors.teal} />
        ) : item.status === 'done' ? (
          <Ionicons name="checkmark-circle" size={18} color={mpColors.green} />
        ) : (
          <TouchableOpacity onPress={onRetry}>
            <Ionicons name="refresh-circle" size={18} color={mpColors.amber} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        {item.status === 'error' && (
          <Text style={styles.errorHint}>Tap to retry</Text>
        )}
      </View>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={16} color={mpColors.gray400} />
      </TouchableOpacity>
    </View>
  );
}

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    const lastSegment = path.split('/').pop() || parsed.hostname;
    return lastSegment.replace(/-/g, ' ').slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: mpSpacing.md,
    backgroundColor: mpColors.white,
    borderRadius: mpRadii.input,
    borderWidth: 1,
    borderColor: mpColors.gray100,
    marginBottom: 4,
  },
  statusIcon: {
    width: 24,
    alignItems: 'center',
    marginRight: 8,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 13,
    fontFamily: mpFonts.medium,
    color: mpColors.gray800,
  },
  errorHint: {
    fontSize: 11,
    fontFamily: mpFonts.regular,
    color: mpColors.amber,
    marginTop: 1,
  },
});
