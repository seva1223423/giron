import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

/**
 * Returns bottom padding that respects the device home indicator / gesture bar.
 * Adds a small floor on Android so floating bars don't sit on the navigation pill.
 */
export function useSafeBottom(minPadding = 0): number {
  const insets = useSafeAreaInsets();
  const floor = Platform.OS === 'android' ? 12 : 0;
  return Math.max(insets.bottom, minPadding, floor);
}
