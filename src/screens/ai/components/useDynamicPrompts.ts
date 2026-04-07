import { useMemo } from 'react';
import { useWorkoutStore } from '../../../store';

export function useDynamicPrompts() {
  const { workoutHistory, programs } = useWorkoutStore();

  return useMemo(() => {
    const prompts: { emoji: string; text: string }[] = [];
    const activeProgram = programs.find((p) => p.isActive);

    if (activeProgram?.workouts?.length) {
      const firstWorkout = activeProgram.workouts[0];
      prompts.push({ emoji: '🔄', text: `Сделай тренировку "${firstWorkout.name}" немного легче` });
      prompts.push({ emoji: '✂️', text: `Убери одно упражнение из "${firstWorkout.name}" — устала спина` });
    }

    if (workoutHistory.length > 0) {
      const last = workoutHistory[0];
      prompts.push({ emoji: '🔍', text: `Разбери мою последнюю тренировку: ${last.name}` });

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const weekWorkouts = workoutHistory.filter((w) => new Date(w.completedAt || w.startedAt || '').getTime() > weekAgo);
      if (weekWorkouts.length >= 2) {
        const totalVol = weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
        prompts.push({ emoji: '📊', text: `Анализ моей недели: ${weekWorkouts.length} тренировок, объём ${Math.round(totalVol / 1000 * 10) / 10} т` });
      }

      const sortedDates = workoutHistory
        .map((w) => new Date(w.completedAt || w.startedAt || '').toDateString())
        .filter((v, i, a) => a.indexOf(v) === i);
      let consecutive = 0;
      const today = new Date();
      for (let i = 0; i < 4; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        if (sortedDates.includes(d.toDateString())) consecutive++;
        else break;
      }
      if (consecutive >= 3) {
        prompts.push({ emoji: '😴', text: `Тренируюсь ${consecutive} дня подряд — стоит ли взять день отдыха?` });
      }
    }

    if (activeProgram?.workouts && activeProgram.workouts.length > 1 && workoutHistory.length < 3) {
      prompts.push({ emoji: '📅', text: `Расставь тренировки программы "${activeProgram.name}" по дням недели` });
    }

    if (!activeProgram) {
      prompts.push({ emoji: '📋', text: 'Составь мне программу тренировок Толчок-Тяга-Ноги на 3 дня в неделю' });
    }

    return prompts;
  }, [workoutHistory, programs]);
}
