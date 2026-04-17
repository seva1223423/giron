import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/useSettingsStore';

export const useHaptic = () => {
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback);

  const light = () => { if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  const medium = () => { if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
  const heavy = () => { if (hapticFeedback) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}); };
  const success = () => { if (hapticFeedback) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
  const warning = () => { if (hapticFeedback) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); };
  const error = () => { if (hapticFeedback) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); };
  const selection = () => { if (hapticFeedback) Haptics.selectionAsync().catch(() => {}); };

  return { light, medium, heavy, success, warning, error, selection };
};
