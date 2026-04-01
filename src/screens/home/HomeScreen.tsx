import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import { Card, ProgressRing, MacroBar, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const todayDate = () => new Date().toISOString().split('T')[0];

const DAILY_QUOTES = [
  { text: 'Штанга не знает сколько ты устал. Она знает только сколько ты поднял.', author: 'Iron Coach' },
  { text: 'Прогресс — это не прямая линия. Это серпантин в гору.', author: 'Iron Coach' },
  { text: 'Дисциплина — это выбор между тем чего ты хочешь сейчас и тем чего хочешь по-настоящему.', author: 'Abraham Lincoln' },
  { text: 'Тело всегда слушается мозга. Натренируй оба.', author: 'Iron Coach' },
  { text: 'Каждый профессионал когда-то был новичком, который не бросил.', author: 'Iron Coach' },
  { text: 'Мышцы не растут во время тренировки. Они растут пока ты спишь и ешь правильно.', author: 'Наука' },
  { text: 'Не ищи мотивацию. Создавай дисциплину. Мотивация уйдёт — дисциплина останется.', author: 'Iron Coach' },
  { text: 'Слабые моменты строят сильных людей.', author: 'Iron Coach' },
  { text: 'Один процент лучше каждый день — за год ты станешь в 37 раз лучше.', author: 'James Clear' },
  { text: 'Сравнивай себя только с собой вчерашним.', author: 'Jordan Peterson' },
  { text: 'Боль от тренировки временна. Гордость от результата навсегда.', author: 'Iron Coach' },
  { text: 'Ты не проигрываешь. Ты либо выигрываешь, либо учишься.', author: 'Nelson Mandela' },
  { text: 'Правило 40%: когда ты думаешь что достиг предела — ты использовал только 40% своих возможностей.', author: 'SEAL' },
  { text: 'Тело достигает того, что задумал разум.', author: 'Bill Phillips' },
  { text: 'Нет плохих тренировок. Есть только тренировки которые ты не сделал.', author: 'Iron Coach' },
  { text: 'Каждый подход — это голосование за того человека которым ты хочешь стать.', author: 'Iron Coach' },
  { text: 'Восстановление — часть тренировки. Пренебрегать им — значит тренироваться неправильно.', author: 'Наука' },
  { text: 'Великие результаты требуют великого отношения к базовым вещам: сон, белок, объём.', author: 'Helms' },
  { text: 'Сила — это не только мышцы. Это привычка не отступать.', author: 'Iron Coach' },
  { text: 'Начни там где ты есть. Используй то что имеешь. Делай что можешь.', author: 'Arthur Ashe' },
  { text: 'Тренировка без цели — это просто усталость. Тренировка с целью — инвестиция.', author: 'Iron Coach' },
  { text: 'Гравитация одинакова для всех. Работа со штангой — честный бизнес.', author: 'Iron Coach' },
  { text: 'Никогда не пропускай понедельник. И среду. И пятницу.', author: 'Iron Coach' },
  { text: 'Тело — это долгосрочный проект. Не спринт.', author: 'Iron Coach' },
  { text: 'Лучшая диета и лучшая программа — та, которой ты придерживаешься.', author: 'Alan Aragon' },
  { text: 'Страдания сейчас, преимущество потом.', author: 'Джоко Уиллинк' },
  { text: 'Тренировки не делают тебя лучше. Восстановление после тренировок — делает.', author: 'Наука' },
  { text: 'Маленький прогресс каждый день складывается в большие результаты.', author: 'Iron Coach' },
  { text: 'Делай сложное пока оно не стало лёгким.', author: 'Iron Coach' },
  { text: 'Подними больше. Спи дольше. Ешь лучше. Повтори.', author: 'Iron Coach' },
];

function getDailyQuote() {
  const start = new Date(2024, 0, 1).getTime();
  const dayIndex = Math.floor((Date.now() - start) / 86400000);
  return DAILY_QUOTES[dayIndex % DAILY_QUOTES.length];
}

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const { programs, workoutHistory, activeWorkout, weekPlan, fetchPrograms, fetchHistory, startWorkout } = useWorkoutStore();
  const { getDayLog } = useNutritionStore();

  // Sync data from server on mount
  useEffect(() => {
    fetchPrograms();
    fetchHistory();
  }, []);

  const today = todayDate();
  const dayLog = getDayLog(today);
  const { todayCalories, todayProtein, todayFats, todayCarbs } = useMemo(() => ({
    todayCalories: dayLog.meals.reduce((sum, m) => sum + m.totalCalories, 0),
    todayProtein: dayLog.meals.reduce((sum, m) => sum + m.totalProtein, 0),
    todayFats: dayLog.meals.reduce((sum, m) => sum + m.totalFats, 0),
    todayCarbs: dayLog.meals.reduce((sum, m) => sum + m.totalCarbs, 0),
  }), [dayLog.meals]);

  const activeProgram = programs.find((p) => p.isActive);
  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      if (workoutHistory.some((w) => w.completedAt?.startsWith(ds))) {
        s++;
      } else if (i > 0) {
        break;
      }
    }
    return s;
  }, [workoutHistory]);

  const quote = getDailyQuote();

  // Today's planned workout (Mon=0 … Sun=6)
  const todayDow = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const todayPlan = weekPlan[todayDow] ?? null;

  const handleStartPlannedWorkout = () => {
    if (!todayPlan || todayPlan.exercises.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const workoutExercises: WorkoutExercise[] = todayPlan.exercises
      .map((exId, index) => {
        const ex = localExercises.find((e) => e.id === exId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
          id: `set-${Date.now()}-${index}-${i}`,
          setNumber: i + 1, type: 'normal' as const, reps: 10, weight: 0, completed: false,
        }));
        return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: 90 };
      })
      .filter(Boolean) as WorkoutExercise[];
    startWorkout({ id: `workout-${Date.now()}`, name: todayPlan.name, exercises: workoutExercises });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  };

  // Last workout
  const lastWorkout = workoutHistory[0] || null;
  const daysSinceLastWorkout = lastWorkout?.completedAt
    ? Math.floor((Date.now() - new Date(lastWorkout.completedAt).getTime()) / 86400000)
    : null;

  const handleRepeatWorkout = () => {
    if (!lastWorkout || activeWorkout) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const workoutExercises: WorkoutExercise[] = lastWorkout.exercises.map((we, index) => {
      const sets: WorkoutSet[] = we.sets.map((s, i) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1,
        type: s.type,
        reps: s.reps,
        weight: s.weight,
        completed: false,
      }));
      return { ...we, id: `we-${Date.now()}-${index}`, sets };
    });
    startWorkout({ id: `workout-${Date.now()}`, name: lastWorkout.name, exercises: workoutExercises });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  };

  const workoutRecommendation = useMemo(() => {
    const SPLITS = [
      { name: 'Грудь + Трицепс', muscles: ['chest', 'triceps'], emoji: '💪' },
      { name: 'Спина + Бицепс', muscles: ['back', 'biceps', 'lats'], emoji: '🏋️' },
      { name: 'Ноги', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'], emoji: '🦵' },
      { name: 'Плечи + Пресс', muscles: ['shoulders', 'abs'], emoji: '🎯' },
      { name: 'Фулбоди', muscles: ['chest', 'back', 'quadriceps'], emoji: '⚡' },
    ];
    const splitLastDays = SPLITS.map((split) => {
      let lastDay = 999;
      workoutHistory.forEach((w) => {
        if (!w.completedAt) return;
        const hasThisSplit = w.exercises.some((ex) =>
          ex.exercise.primaryMuscles.some((m) => split.muscles.includes(m))
        );
        if (hasThisSplit) {
          const daysAgo = Math.floor((Date.now() - new Date(w.completedAt).getTime()) / 86400000);
          if (daysAgo < lastDay) lastDay = daysAgo;
        }
      });
      return { ...split, daysSince: lastDay };
    });
    const recommended = splitLastDays.sort((a, b) => b.daysSince - a.daysSince)[0];
    const daysLabel = recommended.daysSince >= 999
      ? 'Ещё не тренировал'
      : recommended.daysSince === 0 ? 'Уже сегодня'
      : `${recommended.daysSince} ${recommended.daysSince === 1 ? 'день' : recommended.daysSince < 5 ? 'дня' : 'дней'} назад`;
    return { ...recommended, daysLabel };
  }, [workoutHistory]);

  const weekWorkouts = useMemo(() => workoutHistory.filter((w) => {
    if (!w.completedAt) return false;
    const d = new Date(w.completedAt);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  }), [workoutHistory]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  const handleWater = (ml: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useNutritionStore.getState().addWater(today, ml);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn delay={0} from="top">
        <View style={styles.header}>
          <View>
            <Text style={[typography.small, { color: colors.textSecondary }]}>{greeting()}</Text>
            <Text style={[typography.h2, { color: colors.text }]}>
              {user?.firstName || 'Атлет'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('ProfileTab')}
            style={[styles.avatar, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700' }}>
              {(user?.firstName?.[0] || 'A').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </FadeIn>

      {/* Quick Start */}
      <FadeIn delay={100}>
        {activeWorkout ? (
          <Card
            style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}
            onPress={() => navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' })}
          >
            <Text style={[typography.captionMedium, { color: colors.success }]}>АКТИВНАЯ ТРЕНИРОВКА</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
              {activeWorkout.workout.name}
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              Нажми, чтобы продолжить
            </Text>
          </Card>
        ) : (
          <Card
            style={{ marginBottom: spacing.lg }}
            onPress={() => navigation.navigate('WorkoutsTab')}
          >
            <Text style={[typography.h4, { color: colors.text }]}>Начать тренировку</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              {activeProgram
                ? `Программа: ${activeProgram.name}`
                : 'Выбери программу или создай свою'}
            </Text>
          </Card>
        )}
      </FadeIn>

      {/* Today's planned workout */}
      {!activeWorkout && todayPlan && (
        <FadeIn delay={140}>
          <Card
            style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.accent }}
            onPress={todayPlan.exercises.length > 0 ? handleStartPlannedWorkout : undefined}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.captionMedium, { color: colors.accent }]}>ПЛАН НА СЕГОДНЯ</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                  <Text style={{ fontSize: 20 }}>{todayPlan.emoji}</Text>
                  <Text style={[typography.h4, { color: colors.text }]}>{todayPlan.name}</Text>
                </View>
              </View>
              {todayPlan.exercises.length > 0 && (
                <Text style={[typography.bodySemibold, { color: colors.accent }]}>▶ Начать</Text>
              )}
            </View>
          </Card>
        </FadeIn>
      )}

      {/* Smart recommendation */}
      {!activeWorkout && (
        <FadeIn delay={150}>
          <Card
            style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.success }}
            onPress={() => navigation.navigate('WorkoutsTab')}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.captionMedium, { color: colors.success }]}>РЕКОМЕНДУЕМ СЕГОДНЯ</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                  <Text style={{ fontSize: 20 }}>{workoutRecommendation.emoji}</Text>
                  <Text style={[typography.h4, { color: colors.text }]}>{workoutRecommendation.name}</Text>
                </View>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                  {workoutRecommendation.daysLabel}
                </Text>
              </View>
              <Text style={[typography.body, { color: colors.primary, marginTop: spacing.sm }]}>▶</Text>
            </View>
          </Card>
        </FadeIn>
      )}

      {/* Streak at risk warning */}
      {!activeWorkout && streak > 0 && daysSinceLastWorkout !== null && daysSinceLastWorkout >= 2 && (
        <FadeIn delay={180}>
          <Card
            style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.error }}
            onPress={() => navigation.navigate('WorkoutsTab')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 24 }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={[typography.captionMedium, { color: colors.error }]}>СЕРИЯ ПОД УГРОЗОЙ!</Text>
                <Text style={[typography.bodyMedium, { color: colors.text, marginTop: 2 }]}>
                  Серия {streak} {streak === 1 ? 'день' : streak < 5 ? 'дня' : 'дней'} — потренируйся сегодня
                </Text>
              </View>
              <Text style={[typography.bodySemibold, { color: colors.error }]}>▶</Text>
            </View>
          </Card>
        </FadeIn>
      )}

      {/* Last workout recap */}
      {lastWorkout && daysSinceLastWorkout !== null && daysSinceLastWorkout <= 7 && (
        <FadeIn delay={175}>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <Text style={[typography.captionMedium, { color: colors.textTertiary }]}>
                {daysSinceLastWorkout === 0 ? 'СЕГОДНЯ' : daysSinceLastWorkout === 1 ? 'ВЧЕРА' : `${daysSinceLastWorkout} ДНЯ НАЗАД`}
              </Text>
              {!activeWorkout && (
                <TouchableOpacity onPress={handleRepeatWorkout} style={[{ backgroundColor: colors.primary + '15', paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm }]}>
                  <Text style={[typography.captionMedium, { color: colors.primary }]}>🔁 Повторить</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xs }]} numberOfLines={1}>
              {lastWorkout.name}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm }}>
              {lastWorkout.exercises.length > 0 && (
                <View>
                  <Text style={[typography.numberSmall, { color: colors.primary, fontSize: 18 }]}>{lastWorkout.exercises.length}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>упр.</Text>
                </View>
              )}
              {lastWorkout.durationMinutes && (
                <View>
                  <Text style={[typography.numberSmall, { color: colors.accent, fontSize: 18 }]}>{lastWorkout.durationMinutes}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>мин</Text>
                </View>
              )}
              {lastWorkout.totalVolume ? (
                <View>
                  <Text style={[typography.numberSmall, { color: colors.success, fontSize: 18 }]}>{Math.round(lastWorkout.totalVolume)}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
                </View>
              ) : null}
            </View>
          </Card>
        </FadeIn>
      )}

      {/* Weekly stats */}
      <FadeIn delay={200}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.h4, { color: colors.text }]}>Эта неделя</Text>
            <TouchableOpacity onPress={() => navigation.navigate('WorkoutsTab', { screen: 'WorkoutHistory' })}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>История</Text>
            </TouchableOpacity>
          </View>
          {/* Week day dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, i) => {
              const now = new Date();
              const currentDow = now.getDay() === 0 ? 6 : now.getDay() - 1;
              const dayDate = new Date(now);
              dayDate.setDate(now.getDate() - currentDow + i);
              const dateStr = dayDate.toISOString().split('T')[0];
              const hadWorkout = workoutHistory.some(
                (w) => w.completedAt && w.completedAt.startsWith(dateStr)
              );
              const isToday = i === currentDow;
              return (
                <View key={day} style={{ alignItems: 'center', gap: 4 }}>
                  <Text style={[typography.small, { color: isToday ? colors.primary : colors.textTertiary, fontSize: 10 }]}>
                    {day}
                  </Text>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: hadWorkout ? colors.success : isToday ? colors.primary + '15' : colors.surface,
                      borderWidth: isToday ? 2 : 0,
                      borderColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {hadWorkout ? (
                      <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>{'✓'}</Text>
                    ) : (
                      <Text style={[typography.small, { color: isToday ? colors.primary : colors.textTertiary }]}>
                        {dayDate.getDate()}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.primary }]}>
                {weekWorkouts.length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.accent }]}>
                {Math.round(weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0) / 1000)}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.success }]}>
                {weekWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0)}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
            </View>
            {streak > 0 && (
              <View style={styles.statItem}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text style={[typography.number, { color: colors.error }]}>{streak}</Text>
                  <Text style={{ fontSize: 14 }}>🔥</Text>
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней</Text>
              </View>
            )}
          </View>
        </Card>
      </FadeIn>

      {/* Nutrition today */}
      <FadeIn delay={300}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.nutritionHeader}>
            <Text style={[typography.h4, { color: colors.text }]}>Питание сегодня</Text>
            <TouchableOpacity onPress={() => navigation.navigate('NutritionTab')}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Подробнее</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calorieRow}>
            <ProgressRing
              progress={dayLog.targetCalories > 0 ? todayCalories / dayLog.targetCalories : 0}
              size={90}
              strokeWidth={8}
              value={`${todayCalories}`}
              label="ккал"
            />
            <View style={{ flex: 1, marginLeft: spacing.xl }}>
              <MacroBar
                label="Белки"
                current={todayProtein}
                target={dayLog.targetProtein}
                color={colors.protein}
              />
              <MacroBar
                label="Жиры"
                current={todayFats}
                target={dayLog.targetFats}
                color={colors.fats}
              />
              <MacroBar
                label="Углеводы"
                current={todayCarbs}
                target={dayLog.targetCarbs}
                color={colors.carbs}
              />
            </View>
          </View>
        </Card>
      </FadeIn>

      {/* AI tip */}
      <FadeIn delay={400}>
        <Card
          style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}
          onPress={() => navigation.navigate('AITab')}
        >
          <Text style={[typography.captionMedium, { color: colors.accent }]}>ИИ-ТРЕНЕР</Text>
          <Text style={[typography.body, { color: colors.text, marginTop: spacing.sm }]}>
            Спроси что угодно о тренировках, питании или технике упражнений
          </Text>
          <Text style={[typography.smallMedium, { color: colors.primary, marginTop: spacing.sm }]}>
            Открыть чат
          </Text>
        </Card>
      </FadeIn>

      {/* Daily quote */}
      <FadeIn delay={450}>
        <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '08' }}>
          <Text style={[typography.captionMedium, { color: colors.primary, marginBottom: spacing.sm }]}>
            ЦИТАТА ДНЯ
          </Text>
          <Text style={[typography.body, { color: colors.text, fontStyle: 'italic', lineHeight: 22 }]}>
            "{quote.text}"
          </Text>
          <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.sm }]}>
            — {quote.author}
          </Text>
        </Card>
      </FadeIn>

      {/* Water tracker mini */}
      <FadeIn delay={500}>
        <Card style={{ marginBottom: spacing.xxxl }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <View>
              <Text style={[typography.h4, { color: colors.text }]}>Вода</Text>
              <Text style={[typography.small, { color: colors.textSecondary }]}>
                {dayLog.waterMl} / {dayLog.waterTargetMl ?? 2500} мл
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {[250, 500].map((ml) => (
                <TouchableOpacity
                  key={ml}
                  style={[styles.waterBtn, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
                  onPress={() => handleWater(ml)}
                >
                  <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}мл</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* Water progress bar */}
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.info,
                width: `${Math.min((dayLog.waterMl / (dayLog.waterTargetMl ?? 2500)) * 100, 100)}%`,
              }}
            />
          </View>
        </Card>
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  calorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  waterBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
});
