import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Returns the top padding that accounts for the device's safe area (notch, dynamic island, etc.)
 * Minimum of 44px to ensure content is always visible.
 */
export function useSafeTop(minPadding = 44): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.top + 10, minPadding);
}
