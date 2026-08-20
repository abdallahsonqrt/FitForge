import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { relativeDayLabel } from '../../utils/date';

interface DataPoint {
  date: string;
  weight: number;
}

interface WeightChartProps {
  /** Oldest first. */
  data: DataPoint[];
  unit?: 'kg' | 'lbs';
}

const WIDTH = 300;
const HEIGHT = 150;

export const WeightChart: React.FC<WeightChartProps> = ({ data, unit = 'kg' }) => {
  const { styles, theme } = useStyles(stylesheet);

  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Weight trend</Text>
        <Text style={styles.emptyText}>
          Log your weight to see changes over time.
        </Text>
      </View>
    );
  }

  const weights = data.map((point) => point.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  // Pad the range so a flat line sits mid-chart instead of dividing by zero.
  const padding = Math.max((max - min) * 0.2, 1);
  const lower = min - padding;
  const range = max + padding - lower;

  const coordinate = (point: DataPoint, index: number) => ({
    x: (index / Math.max(data.length - 1, 1)) * WIDTH,
    y: HEIGHT - ((point.weight - lower) / range) * HEIGHT,
  });

  const latest = data[data.length - 1];
  const delta = latest.weight - data[0].weight;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
          <View>
            <Text style={styles.title}>Weight trend</Text>
            <Text style={styles.helper}>Your logged weight over time</Text>
          </View>
        <View style={styles.latestBlock}>
          <Text style={styles.latestValue}>
            {latest.weight.toFixed(1)} {unit}
          </Text>
          {data.length > 1 && (
            <Text style={[styles.delta, delta < 0 ? styles.deltaDown : delta > 0 ? styles.deltaUp : styles.deltaFlat]}>
              {delta === 0 ? 'No change yet' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${unit} since first log`}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.chartArea}>
        <Svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          {data.length > 1 && (
            <Polyline
              points={data.map((point, index) => {
                const { x, y } = coordinate(point, index);
                return `${x},${y}`;
              })
              .join(' ')}
              fill="none"
              stroke={theme.colors.primary}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {data.map((point, index) => {
            const { x, y } = coordinate(point, index);
            return (
              <Circle
                key={point.date}
                cx={x}
                cy={y}
                r="4"
                fill={theme.colors.surface}
                stroke={theme.colors.primary}
                strokeWidth="2"
              />
            );
          })}
        </Svg>
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{relativeDayLabel(data[0].date)}</Text>
        <Text style={styles.axisLabel}>{relativeDayLabel(latest.date)}</Text>
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.labelMd,
    color: theme.colors.text,
  },
  helper: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  latestBlock: {
    alignItems: 'flex-end',
  },
  latestValue: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  delta: {
    ...theme.typography.bodySm,
  },
  deltaDown: {
    color: theme.colors.success,
  },
  deltaUp: {
    color: theme.colors.warning,
  },
  deltaFlat: {
    color: theme.colors.textSecondary,
  },
  chartArea: {
    width: '100%',
    height: HEIGHT,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  axisLabel: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
  },
  emptyText: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
}));
