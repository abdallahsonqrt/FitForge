import { router, type Href } from 'expo-router';

/**
 * `router.back()` silently does nothing when there is no history to pop — which
 * is exactly what happens on a deep link, a web refresh, or any entry point that
 * makes a screen the first route in the stack. A back affordance that quietly
 * does nothing looks broken, so fall forward to where back would have led.
 */
export const goBack = (fallback: Href) => {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
};
