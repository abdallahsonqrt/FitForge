import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { formatDate } from '../../utils/formatters';

interface ProgressPhotoCardProps {
  beforeUrl: string;
  afterUrl: string;
  beforeDate: string;
  afterDate: string;
}

export const ProgressPhotoCard: React.FC<ProgressPhotoCardProps> = ({
  beforeUrl,
  afterUrl,
  beforeDate,
  afterDate,
}) => {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={styles.container}>
      <View style={styles.photoContainer}>
        <Image source={{ uri: beforeUrl }} style={styles.image} contentFit="cover" />
        <View style={styles.labelContainer}>
          <Text style={styles.labelText}>Before</Text>
          <Text style={styles.dateText}>{formatDate(beforeDate)}</Text>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.photoContainer}>
        <Image source={{ uri: afterUrl }} style={styles.image} contentFit="cover" />
        <View style={styles.labelContainer}>
          <Text style={styles.labelText}>After</Text>
          <Text style={styles.dateText}>{formatDate(afterDate)}</Text>
        </View>
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    height: 250,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  photoContainer: {
    flex: 1,
    position: 'relative',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  divider: {
    width: 2,
    backgroundColor: theme.colors.surfaceElevated,
    zIndex: 10,
  },
  labelContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: theme.spacing.xs,
    alignItems: 'center',
  },
  labelText: {
    ...theme.typography.labelSm,
    color: '#FFF',
  },
  dateText: {
    ...theme.typography.bodySm,
    color: '#CCC',
    fontSize: 10,
  },
}));
