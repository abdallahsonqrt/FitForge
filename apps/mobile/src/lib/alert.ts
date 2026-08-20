import { Alert, AlertButton, Platform } from 'react-native';

/**
 * `Alert.alert` is a no-op stub on react-native-web (`static alert() {}`), so any
 * action nested in a button's `onPress` — logging out, removing a device, leaving a
 * workout — silently never runs there, and error alerts never surface at all.
 *
 * This keeps `Alert.alert`'s signature and delegates to it on native, falling back
 * to the browser's own dialogs on web.
 */
export const showAlert = (title: string, message?: string, buttons?: AlertButton[]): void => {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = message ? `${title}\n\n${message}` : title;
  const confirmButton = buttons?.find((button) => button.style !== 'cancel');
  const cancelButton = buttons?.find((button) => button.style === 'cancel');

  // A lone button (or none) is a notice, not a question — `confirm` would offer a
  // meaningless Cancel next to it.
  if (!confirmButton || !cancelButton) {
    window.alert(body);
    confirmButton?.onPress?.();
    return;
  }

  if (window.confirm(body)) {
    confirmButton.onPress?.();
  } else {
    cancelButton.onPress?.();
  }
};
