import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Returns true when user has "Reduce Motion" turned on (iOS Settings →
 * Accessibility → Motion, Android → Settings → Accessibility → Remove animations).
 *
 * Respect this in any meaningful animation: shorten or skip transitions,
 * disable parallax, swap autoplay videos for static thumbnails. Failing to
 * respect Reduce Motion makes apps reject-worthy on modern App Store reviews.
 *
 *   const reduceMotion = useReducedMotion();
 *   const duration = reduceMotion ? 0 : 220;
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove?.();
    };
  }, []);

  return reduce;
}

/**
 * True when user has "Bold Text" enabled (iOS) or system prefers heavier
 * weight (Android via inverted text). When true, swap medium → semibold
 * and regular → medium to maintain hierarchy under bold mode.
 */
export function useBoldTextPreference(): boolean {
  const [bold, setBold] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return; // Android has no equivalent flag
    let mounted = true;
    AccessibilityInfo.isBoldTextEnabled?.().then((v) => {
      if (mounted) setBold(v ?? false);
    });
    const sub = AccessibilityInfo.addEventListener('boldTextChanged', setBold);
    return () => {
      mounted = false;
      sub.remove?.();
    };
  }, []);

  return bold;
}

/**
 * True when a screen reader (VoiceOver / TalkBack) is currently active.
 * Helpful for swapping interactive UI: hide pure-decoration animations,
 * make tap targets even larger, prefer text labels over icons.
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled().then((v) => {
      if (mounted) setOn(v);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      mounted = false;
      sub.remove?.();
    };
  }, []);
  return on;
}
