import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ProgressRing } from '../ui';

interface Macro {
  label: string;
  consumed: number;
  target: number;
  color: string;
}

interface MacroSummaryProps {
  protein: Macro;
  carbs: Macro;
  fat: Macro;
}

export const MacroSummary: React.FC<MacroSummaryProps> = ({ protein, carbs, fat }) => {
  const { styles } = useStyles(stylesheet);

  const renderMacro = (macro: Macro) => {
    const progress = macro.target > 0 ? Math.min(macro.consumed / macro.target, 1) : 0;
    return (
      <View style={styles.macroContainer} key={macro.label}>
        <ProgressRing
          progress={progress}
          size={80}
          strokeWidth={8}
          color={macro.color}
        >
          <View style={styles.macroInner}>
            <Text style={styles.macroValue}>{Math.round(macro.consumed)}g</Text>
            <Text style={styles.macroLabel}>{macro.label}</Text>
          </View>
        </ProgressRing>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {renderMacro(protein)}
      {renderMacro(carbs)}
      {renderMacro(fat)}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  macroContainer: {
    alignItems: 'center',
  },
  macroInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroValue: {
    ...theme.typography.labelLg,
    color: theme.colors.text,
  },
  macroLabel: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
}));
