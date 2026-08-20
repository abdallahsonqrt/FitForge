import React, { useState } from 'react';
import { View, TextInput, Text, TextInputProps, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTranslation } from '../../i18n';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  secureTextEntry,
  multiline,
  style,
  ...props
}) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const isSecure = secureTextEntry && !isPasswordVisible;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.inputContainer,
          multiline && styles.inputContainerMultiline,
          isFocused && styles.inputFocused,
          error && styles.inputError,
        ]}
      >
        {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
        <TextInput
          // `props` is spread first so the focus handlers below cannot be
          // silently replaced by a caller-supplied one — they already forward to
          // it, and losing them would kill the focus ring and the error styling.
          {...props}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          placeholderTextColor={theme.colors.textSecondary}
          secureTextEntry={isSecure}
          multiline={multiline}
          // The visible `label` is a sibling `Text`, which nothing associates
          // with this field, so every form input was announced as an unlabelled
          // edit box. The error travels with the label for the same reason.
          accessibilityLabel={
            props.accessibilityLabel ??
            (label ? (error ? `${label}, ${error}` : label) : undefined)
          }
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={styles.rightIcon}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t(isPasswordVisible ? 'common.hidePassword' : 'common.showPassword')}
          >
            {isPasswordVisible ? (
              <EyeOff color={theme.colors.textSecondary} size={20} />
            ) : (
              <Eye color={theme.colors.textSecondary} size={20} />
            )}
          </Pressable>
        ) : rightIcon ? (
          <View style={styles.rightIcon}>{rightIcon}</View>
        ) : null}
      </View>
      {error && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    width: '100%',
    marginBottom: theme.spacing.md,
  },
  label: {
    ...theme.typography.labelSm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    /**
     * `minHeight`, not `height`: a single-line field still measures exactly 48,
     * but a `multiline` one can grow instead of overflowing. With a fixed height
     * the text spilled out of the box and collided with the label above it.
     */
    minHeight: 48,
  },
  /** Multiline text starts at the top of the box, not centred in it. */
  inputContainerMultiline: {
    alignItems: 'flex-start',
    minHeight: 96,
    paddingVertical: theme.spacing.sm,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  input: {
    flex: 1,
    ...theme.typography.bodyLg,
    color: theme.colors.text,
    outlineStyle: 'none',
  },
  inputMultiline: {
    // Android centres multiline text vertically without this; web and iOS ignore it.
    textAlignVertical: 'top',
    // `flex: 1` alone makes the field fill the row's cross axis rather than the
    // height it was given, so the caret starts mid-box on the first line.
    alignSelf: 'stretch',
  },
  leftIcon: {
    marginRight: theme.spacing.sm,
  },
  rightIcon: {
    marginLeft: theme.spacing.sm,
  },
  errorText: {
    ...theme.typography.bodySm,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
}));
