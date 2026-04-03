import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/useSettingsStore';

export const useHaptic = () => {
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback);

  const light = () => hapticFeedback && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  const medium = () => hapticFeedback && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const heavy = () => hapticFeedback && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  const success = () => hapticFeedback && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const warning = () => hapticFeedback && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  const error = () => hapticFeedback && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  const selection = () => hapticFeedback && Haptics.selectionAsync();

  return { light, medium, heavy, success, warning, error, selection };
};
