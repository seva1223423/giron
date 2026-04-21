/**
 * Central guard for starting a new workout.
 *
 * The Zustand store's `startWorkout` returns `false` when there's already an
 * active workout — silently overwriting would discard the user's in-flight
 * sets. This helper turns that boolean into visible UX:
 *
 *   - no active workout → start immediately, navigate to ActiveWorkout
 *   - active workout    → alert with "Продолжить текущую" / "Отменить и начать новую"
 *
 * Used by HomeScreen, program/template starters, weekly plan, etc. — anywhere
 * the user triggers a fresh session.
 */
import { Alert } from 'react-native';
import type { Workout } from '../types';
import { useWorkoutStore } from '../store/useWorkoutStore';

type Nav = {
  navigate: (route: string, params?: any) => void;
};

/**
 * @param workout       Freshly-built workout to start.
 * @param navigation    Any navigation object exposing .navigate().
 * @param options.tab   If provided, navigates to { tab, { screen: 'ActiveWorkout' } };
 *                      otherwise navigates directly to 'ActiveWorkout'.
 */
export const startWorkoutSafe = (
  workout: Workout,
  navigation: Nav,
  options?: { tab?: string },
): void => {
  const { startWorkout, cancelWorkout, activeWorkout } = useWorkoutStore.getState();

  const goActive = () => {
    if (options?.tab) navigation.navigate(options.tab, { screen: 'ActiveWorkout' });
    else navigation.navigate('ActiveWorkout');
  };

  if (!activeWorkout) {
    startWorkout(workout);
    goActive();
    return;
  }

  const existingName = activeWorkout.workout.name || 'Без названия';
  Alert.alert(
    'Тренировка уже идёт',
    `«${existingName}» не завершена. Продолжить её или отменить и начать новую?`,
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Продолжить текущую',
        onPress: () => goActive(),
      },
      {
        text: 'Отменить и начать новую',
        style: 'destructive',
        onPress: () => {
          cancelWorkout();
          // cancelWorkout is synchronous (Zustand set) so startWorkout will succeed
          useWorkoutStore.getState().startWorkout(workout);
          goActive();
        },
      },
    ],
  );
};
