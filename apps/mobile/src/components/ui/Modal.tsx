import React from 'react';
import {
  Modal as RNModal,
  View,
  Pressable,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { MotiView } from 'moti';
import { X } from 'lucide-react-native';
import { useTranslation } from '../../i18n';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ visible, onClose, children }) => {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const closeLabel = t('common.close');

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        {/*
          This sheet is bottom-anchored, and two callers put a focused text input
          inside it (the weight logger on Progress, and PortionSheet's amount
          field). Without this the keyboard covers both the field and the button
          below it, with no way to scroll them back into view.
        */}
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <MotiView
              from={{ opacity: 0, translateY: 100 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0, translateY: 100 }}
              transition={{ type: 'timing', duration: 250 }}
              style={styles.contentContainer}
            >
              <View style={styles.header}>
                <View style={styles.dragHandle} />
                <Pressable
                  onPress={onClose}
                  style={styles.closeButton}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel}
                >
                  <X color={theme.colors.textSecondary} size={24} />
                </Pressable>
              </View>
              {children}
            </MotiView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </RNModal>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end',
  },
  contentContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['3xl'],
    maxHeight: '80%',
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    position: 'relative',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: -8,
    padding: theme.spacing.xs,
  },
}));
