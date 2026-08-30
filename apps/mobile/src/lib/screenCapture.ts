import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * Blocks screenshots and screen recording while the app is open.
 *
 * ─── What this can and cannot do ──────────────────────────────────────
 *
 * **Android** — real prevention. `preventScreenCaptureAsync` sets `FLAG_SECURE`
 * on the activity, so the OS itself refuses the screenshot and a recording or
 * cast shows a black frame. Nothing in the app has to notice or react.
 *
 * **iOS** — no such flag exists. Apple gives no API to block a screenshot or a
 * recording; the platform only *reports* that one happened. `expo-screen-capture`
 * exposes that as an event, which is why this is documented as a deterrent on
 * iOS rather than a control. Enforcing it there would mean obscuring the UI
 * while `isCaptured` is true, which is a product decision, not a library one.
 *
 * **Web** — impossible by construction. A browser page cannot stop the operating
 * system, a browser extension, or the OS screenshot key. The call is skipped
 * rather than failing, so the web build behaves normally.
 *
 * Because two of the three platforms cannot truly enforce this, treat it as
 * raising the effort required — not as a guarantee that paid programs cannot be
 * copied. Anyone with a second camera defeats every version of this.
 */
export const useBlockScreenCapture = (enabled = true): void => {
  useEffect(() => {
    // A browser page has no such power, and calling in would throw.
    if (!enabled || Platform.OS === 'web') return;

    let active = true;

    ScreenCapture.preventScreenCaptureAsync().catch(() => {
      // A device that refuses the request must not take the app down with it;
      // the screen still works, it is simply capturable.
    });

    return () => {
      if (!active) return;
      active = false;
      ScreenCapture.allowScreenCaptureAsync().catch(() => undefined);
    };
  }, [enabled]);
};
