/**
 * CreateProgramScreen — hybrid wizard + builder for user-authored programs.
 *
 * Phase 4 (IA migration): previously there was NO user-facing UI for
 * creating a program — only the AI chat tool `create_program`. The
 * "Создать программу" gold CTA on the Programs tab pointed at this
 * route but the route did not exist. This screen fills that gap.
 *
 * UX split (per design brief):
 *   - Step 1 — wizard.   Flat form: name, goal, level, duration,
 *                        days/week. No drag-drop, no list builder.
 *   - Step 2 — builder.  Visual week grid. Each day is a card; tap
 *                        opens a sheet to name the day and pick
 *                        exercises (preset templates or from-scratch).
 *
 * MVP scope: server `POST /workouts/programs` only persists the
 * Program metadata (name, goal, level, daysPerWeek, durationWeeks).
 * It does NOT create the per-day Workout rows. After save we drop
 * the user back to the Workouts list — they fill the days from the
 * existing ProgramDetail/AI-flow. The day-builder UI in step 2 is
 * a local-only preview today so users can sketch out their week
 * before saving, but those drafts aren't persisted to the server
 * yet. Persisting day exercises will land in a follow-up phase.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../store';
import { Icon, HitTarget, FadeIn, Spinner } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { workoutService } from '../../services/workoutService';
import { getApiError } from '../../services/api';
import { exercises as localExercises } from '../../data/exercises';

// ---------------------------------------------------------------------------
// Wizard model
// ---------------------------------------------------------------------------

type Goal = 'STRENGTH' | 'MUSCLE_GAIN' | 'WEIGHT_LOSS' | 'ENDURANCE';
type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

interface ProgramDay {
  name: string;
  exerciseIds: string[];
}

interface WizardState {
  step: 1 | 2;
  name: string;
  goal: Goal | null;
  level: Level | null;
  durationWeeks: number; // 1..12
  daysPerWeek: number;   // 2..6
  days: ProgramDay[];
}

const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: 'STRENGTH', label: 'Сила' },
  { value: 'MUSCLE_GAIN', label: 'Масса' },
  { value: 'WEIGHT_LOSS', label: 'Похудение' },
  { value: 'ENDURANCE', label: 'Выносливость' },
];

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'BEGINNER', label: 'Новичок' },
  { value: 'INTERMEDIATE', label: 'Средний' },
  { value: 'ADVANCED', label: 'Продвинутый' },
];

const DURATION_MIN = 1;
const DURATION_MAX = 12;
const DAYS_MIN = 2;
const DAYS_MAX = 6;

// Bundled day presets — short subset of the workouts screen QUICK_SPLITS,
// reshaped for selecting day templates inside a program. Source of
// truth for "full" presets stays in WorkoutsScreen; here we only need
// enough variety for the most common splits.
const DAY_PRESETS: { id: string; name: string; exerciseIds: string[] }[] = [
  { id: 'preset-chest-tri',   name: 'Грудь + Трицепс', exerciseIds: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown', 'overhead-tricep-ext'] },
  { id: 'preset-back-bi',     name: 'Спина + Бицепс',  exerciseIds: ['deadlift', 'barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl', 'hammer-curl'] },
  { id: 'preset-legs',        name: 'Ноги',            exerciseIds: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'leg-extension', 'calf-raise'] },
  { id: 'preset-shoulders',   name: 'Плечи + Пресс',   exerciseIds: ['overhead-press', 'lateral-raise', 'arnold-press', 'face-pull', 'plank', 'cable-crunch'] },
  { id: 'preset-fullbody',    name: 'Фулбоди',         exerciseIds: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
  { id: 'preset-arms',        name: 'Руки',            exerciseIds: ['barbell-curl', 'hammer-curl', 'preacher-curl', 'tricep-pushdown', 'french-press', 'close-grip-bench'] },
  { id: 'preset-big3',        name: 'Базовая тройка',  exerciseIds: ['squat', 'bench-press', 'deadlift'] },
  { id: 'preset-core',        name: 'Пресс + Кор',     exerciseIds: ['plank', 'cable-crunch', 'hanging-leg-raise', 'bicycle-crunch', 'russian-twist', 'side-plank'] },
];

// Rough per-set time budget — matches the 4 sets/exercise default.
// Display heuristic only; real duration depends on configuration.
const MINUTES_PER_EXERCISE = 10;

function buildEmptyDays(count: number): ProgramDay[] {
  return Array.from({ length: count }, () => ({ name: '', exerciseIds: [] }));
}

// Pad/trim the days array when daysPerWeek changes, preserving existing entries.
function resizeDays(prev: ProgramDay[], next: number): ProgramDay[] {
  if (next === prev.length) return prev;
  if (next < prev.length) return prev.slice(0, next);
  return [...prev, ...buildEmptyDays(next - prev.length)];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CreateProgramScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const fetchPrograms = useWorkoutStore((s) => s.fetchPrograms);

  const [state, setState] = useState<WizardState>({
    step: 1,
    name: '',
    goal: null,
    level: null,
    durationWeeks: 4,
    daysPerWeek: 3,
    days: buildEmptyDays(3),
  });

  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // ----- Step 1 validation --------------------------------------------------

  const step1Valid = useMemo(() => {
    return state.name.trim().length > 0 && state.goal !== null && state.level !== null;
  }, [state.name, state.goal, state.level]);

  // ----- Mutators -----------------------------------------------------------

  const goNextStep = useCallback(() => {
    if (!step1Valid) return;
    haptic.medium();
    setState((s) => ({ ...s, step: 2 }));
  }, [step1Valid, haptic]);

  const goBackStep = useCallback(() => {
    haptic.selection();
    setState((s) => ({ ...s, step: 1 }));
  }, [haptic]);

  const setName = useCallback((name: string) => {
    setState((s) => ({ ...s, name }));
  }, []);

  const setGoal = useCallback((goal: Goal) => {
    haptic.selection();
    setState((s) => ({ ...s, goal }));
  }, [haptic]);

  const setLevel = useCallback((level: Level) => {
    haptic.selection();
    setState((s) => ({ ...s, level }));
  }, [haptic]);

  const bumpDuration = useCallback((delta: number) => {
    haptic.selection();
    setState((s) => {
      const next = Math.max(DURATION_MIN, Math.min(DURATION_MAX, s.durationWeeks + delta));
      return { ...s, durationWeeks: next };
    });
  }, [haptic]);

  const bumpDays = useCallback((delta: number) => {
    haptic.selection();
    setState((s) => {
      const next = Math.max(DAYS_MIN, Math.min(DAYS_MAX, s.daysPerWeek + delta));
      if (next === s.daysPerWeek) return s;
      return { ...s, daysPerWeek: next, days: resizeDays(s.days, next) };
    });
  }, [haptic]);

  const updateDay = useCallback((index: number, patch: Partial<ProgramDay>) => {
    setState((s) => {
      const days = s.days.slice();
      days[index] = { ...days[index], ...patch };
      return { ...s, days };
    });
  }, []);

  // ----- Save ---------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!step1Valid) {
      Alert.alert('Заполни параметры', 'Вернись на первый шаг и укажи название, цель и уровень.');
      return;
    }
    setSaving(true);
    try {
      const result: any = await workoutService.createProgram({
        name: state.name.trim(),
        type: 'custom',
        goal: state.goal ?? undefined,
        level: state.level ?? undefined,
        daysPerWeek: state.daysPerWeek,
        durationWeeks: state.durationWeeks,
        days: state.days.map((day) => ({
          name: day.name?.trim() || undefined,
          exerciseIds: day.exerciseIds || [],
        })),
      });
      // Refresh user programs in the store so the new program appears
      // immediately in the Programs tab after we navigate back.
      await fetchPrograms().catch(() => {});
      haptic.success();
      // The server reports how many requested days actually persisted. A day
      // is dropped when its exercises aren't found server-side — surface that
      // honestly instead of a blanket "Готово" that hides the data loss.
      const requested: number = result?.daysRequested ?? 0;
      const created: number = result?.daysCreated ?? 0;
      if (requested > 0 && created < requested) {
        Alert.alert(
          'Сохранено частично',
          `Программа создана, но дней с упражнениями сохранено ${created} из ${requested}. ` +
          'Некоторые упражнения не найдены на сервере — добавь их вручную в карточке программы.',
        );
      } else if (requested === 0) {
        Alert.alert('Готово', 'Программа сохранена. Заполни дни упражнениями в карточке программы.');
      } else {
        Alert.alert('Готово', 'Программа сохранена.');
      }
      navigation.goBack();
    } catch (e) {
      haptic.error();
      const err = getApiError(e);
      Alert.alert('Не удалось сохранить', err.message);
    } finally {
      setSaving(false);
    }
  }, [saving, step1Valid, state, fetchPrograms, navigation, haptic]);

  // ----- Render -------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Header
        safeTop={safeTop}
        title="Новая программа"
        step={state.step}
        onBack={() => {
          if (state.step === 2) goBackStep();
          else { haptic.selection(); navigation.goBack(); }
        }}
      />

      {state.step === 1 ? (
        <WizardStep
          state={state}
          step1Valid={step1Valid}
          onChangeName={setName}
          onSelectGoal={setGoal}
          onSelectLevel={setLevel}
          onBumpDuration={bumpDuration}
          onBumpDays={bumpDays}
          onNext={goNextStep}
        />
      ) : (
        <BuilderStep
          state={state}
          saving={saving}
          onEditDay={(i) => { haptic.selection(); setEditingDayIndex(i); }}
          onSave={handleSave}
        />
      )}

      <DayEditorSheet
        visible={editingDayIndex !== null}
        index={editingDayIndex ?? 0}
        day={editingDayIndex !== null ? state.days[editingDayIndex] : { name: '', exerciseIds: [] }}
        onClose={() => setEditingDayIndex(null)}
        onUpdate={(patch) => {
          if (editingDayIndex !== null) updateDay(editingDayIndex, patch);
        }}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HeaderProps {
  safeTop: number;
  title: string;
  step: 1 | 2;
  onBack: () => void;
}

const Header: React.FC<HeaderProps> = ({ safeTop, title, step, onBack }) => {
  const colors = useThemeColors();
  const progress = step === 1 ? 0.5 : 1;

  return (
    <View style={{ paddingTop: safeTop, backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
      <View style={[styles.headerRow]}>
        <HitTarget>
          <TouchableOpacity
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Назад"
            style={{ padding: spacing.xs }}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chev" size={22} color={colors.text} />
            </View>
          </TouchableOpacity>
        </HitTarget>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>
            {step} ИЗ 2
          </Text>
          <Text style={[typography.h4, { color: colors.text, marginTop: 2 }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {/* Placeholder for right action — keeps title centered */}
        <View style={{ width: 44, height: 44 }} />
      </View>
      <View style={{ height: 2, backgroundColor: colors.border, marginHorizontal: spacing.xl, marginBottom: spacing.sm }}>
        <View style={{ height: 2, width: `${progress * 100}%`, backgroundColor: colors.primary }} />
      </View>
    </View>
  );
};

// ------- Step 1 -----------------------------------------------------------

interface WizardStepProps {
  state: WizardState;
  step1Valid: boolean;
  onChangeName: (v: string) => void;
  onSelectGoal: (g: Goal) => void;
  onSelectLevel: (l: Level) => void;
  onBumpDuration: (delta: number) => void;
  onBumpDays: (delta: number) => void;
  onNext: () => void;
}

const WizardStep: React.FC<WizardStepProps> = ({
  state,
  step1Valid,
  onChangeName,
  onSelectGoal,
  onSelectLevel,
  onBumpDuration,
  onBumpDays,
  onNext,
}) => {
  const colors = useThemeColors();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={0}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>
            01 · ПАРАМЕТРЫ ПРОГРАММЫ
          </Text>
          <Text style={[typography.h2, { color: colors.text, marginTop: spacing.xs }]}>
            Расскажи о цели
          </Text>
        </FadeIn>

        {/* NAME ------------------------------------------------------------ */}
        <FadeIn delay={60}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
            НАЗВАНИЕ
          </Text>
          <TextInput
            value={state.name}
            onChangeText={onChangeName}
            placeholder="Например: 4 недели на массу"
            placeholderTextColor={colors.inputPlaceholder}
            style={[
              styles.input,
              typography.body,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                color: colors.inputText,
              },
            ]}
            maxLength={120}
            returnKeyType="next"
            accessibilityLabel="Название программы"
          />
        </FadeIn>

        {/* GOAL ------------------------------------------------------------ */}
        <FadeIn delay={120}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
            ЦЕЛЬ
          </Text>
          <View style={styles.grid2}>
            {GOAL_OPTIONS.map((opt) => {
              const selected = state.goal === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => onSelectGoal(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                  style={[
                    styles.chipCard,
                    {
                      backgroundColor: selected ? colors.primary + '15' : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: selected ? colors.primary : colors.text, textAlign: 'center' },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* LEVEL ----------------------------------------------------------- */}
        <FadeIn delay={180}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
            УРОВЕНЬ
          </Text>
          <View style={styles.row3}>
            {LEVEL_OPTIONS.map((opt) => {
              const selected = state.level === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => onSelectLevel(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                  style={[
                    styles.chipCardCompact,
                    {
                      backgroundColor: selected ? colors.primary + '15' : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.smallMedium,
                      { color: selected ? colors.primary : colors.text, textAlign: 'center' },
                    ]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* DURATION + DAYS ------------------------------------------------- */}
        <FadeIn delay={240}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
            ДЛИТЕЛЬНОСТЬ
          </Text>
          <Stepper
            value={state.durationWeeks}
            min={DURATION_MIN}
            max={DURATION_MAX}
            suffix={ruWeeks(state.durationWeeks)}
            onChange={onBumpDuration}
            accessibilityLabel="Длительность программы в неделях"
          />
        </FadeIn>

        <FadeIn delay={300}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
            ДНИ В НЕДЕЛЮ
          </Text>
          <Stepper
            value={state.daysPerWeek}
            min={DAYS_MIN}
            max={DAYS_MAX}
            suffix={ruDays(state.daysPerWeek)}
            onChange={onBumpDays}
            accessibilityLabel="Количество тренировочных дней в неделю"
          />
        </FadeIn>
      </ScrollView>

      {/* Sticky-bottom CTA — primary action in thumb zone (§19) */}
      <View style={[styles.stickyBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={onNext}
          disabled={!step1Valid}
          accessibilityRole="button"
          accessibilityState={{ disabled: !step1Valid }}
          accessibilityLabel="Далее"
          style={[
            styles.primaryButton,
            {
              backgroundColor: step1Valid ? colors.primary : colors.textTertiary,
              opacity: step1Valid ? 1 : 0.4,
              ...(Platform.OS === 'ios'
                ? {
                    shadowColor: step1Valid ? colors.primary : 'transparent',
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 0 },
                  }
                : { elevation: step1Valid ? 6 : 0 }),
            },
          ]}
        >
          <Text style={[typography.button, { color: colors.textInverse }]}>Далее</Text>
          <Icon name="arrow" size={18} color={colors.textInverse} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ------- Step 2 -----------------------------------------------------------

interface BuilderStepProps {
  state: WizardState;
  saving: boolean;
  onEditDay: (index: number) => void;
  onSave: () => void;
}

const BuilderStep: React.FC<BuilderStepProps> = ({ state, saving, onEditDay, onSave }) => {
  const colors = useThemeColors();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn delay={0}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>
            02 · РАСПИСАНИЕ
          </Text>
          <Text style={[typography.h2, { color: colors.text, marginTop: spacing.xs }]}>
            Собери дни
          </Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Тап на день — добавишь упражнения
          </Text>
        </FadeIn>

        {/* Day grid ------------------------------------------------------- */}
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          {state.days.map((day, i) => (
            <FadeIn key={i} delay={60 + i * 40}>
              <DayCard
                index={i}
                day={day}
                onPress={() => onEditDay(i)}
              />
            </FadeIn>
          ))}
        </View>
      </ScrollView>

      {/* Sticky-bottom CTA */}
      <View style={[styles.stickyBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ busy: saving }}
          accessibilityLabel="Сохранить программу"
          style={[
            styles.primaryButton,
            {
              backgroundColor: colors.primary,
              opacity: saving ? 0.6 : 1,
              ...(Platform.OS === 'ios'
                ? {
                    shadowColor: colors.primary,
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 0 },
                  }
                : { elevation: 6 }),
            },
          ]}
        >
          {saving ? (
            <Spinner size={20} color={colors.textInverse} />
          ) : (
            <>
              <Icon name="check" size={18} color={colors.textInverse} strokeWidth={2.5} />
              <Text style={[typography.button, { color: colors.textInverse }]}>Сохранить программу</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ------- Day card ---------------------------------------------------------

interface DayCardProps {
  index: number;
  day: ProgramDay;
  onPress: () => void;
}

const DayCard: React.FC<DayCardProps> = ({ index, day, onPress }) => {
  const colors = useThemeColors();
  const exerciseCount = day.exerciseIds.length;
  const duration = exerciseCount * MINUTES_PER_EXERCISE;
  const title = day.name.trim() || 'Без названия';
  const empty = exerciseCount === 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`День ${index + 1}: ${title}, ${exerciseCount} упражнений`}
      style={[
        styles.dayCard,
        {
          backgroundColor: colors.card,
          borderColor: empty ? colors.border : colors.primary + '40',
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>
          ДЕНЬ {index + 1}
        </Text>
        <Text
          style={[typography.h4, { color: empty ? colors.textSecondary : colors.text, marginTop: 2 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
          {empty
            ? 'Тап чтобы заполнить'
            : `${exerciseCount} ${ruExercises(exerciseCount)} · ~${duration} мин`}
        </Text>
      </View>
      <Icon name="chev" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
};

// ------- Stepper ----------------------------------------------------------

interface StepperProps {
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (delta: number) => void;
  accessibilityLabel: string;
}

const Stepper: React.FC<StepperProps> = ({ value, min, max, suffix, onChange, accessibilityLabel }) => {
  const colors = useThemeColors();
  const canDecrement = value > min;
  const canIncrement = value < max;

  return (
    <View
      style={[
        styles.stepper,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <HitTarget>
        <TouchableOpacity
          onPress={() => canDecrement && onChange(-1)}
          disabled={!canDecrement}
          accessibilityRole="button"
          accessibilityLabel="Меньше"
          accessibilityState={{ disabled: !canDecrement }}
          style={[styles.stepperButton, { opacity: canDecrement ? 1 : 0.3 }]}
        >
          <Text style={[typography.h3, { color: colors.text }]}>−</Text>
        </TouchableOpacity>
      </HitTarget>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[typography.numberSmall, { color: colors.text }]}>
          {value}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
          {suffix}
        </Text>
      </View>
      <HitTarget>
        <TouchableOpacity
          onPress={() => canIncrement && onChange(1)}
          disabled={!canIncrement}
          accessibilityRole="button"
          accessibilityLabel="Больше"
          accessibilityState={{ disabled: !canIncrement }}
          style={[styles.stepperButton, { opacity: canIncrement ? 1 : 0.3 }]}
        >
          <Text style={[typography.h3, { color: colors.text }]}>+</Text>
        </TouchableOpacity>
      </HitTarget>
    </View>
  );
};

// ------- Day editor sheet -------------------------------------------------

interface DayEditorSheetProps {
  visible: boolean;
  index: number;
  day: ProgramDay;
  onClose: () => void;
  onUpdate: (patch: Partial<ProgramDay>) => void;
}

const DayEditorSheet: React.FC<DayEditorSheetProps> = ({ visible, index, day, onClose, onUpdate }) => {
  const colors = useThemeColors();
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const [pickerVisible, setPickerVisible] = useState(false);

  const applyPreset = (preset: { id: string; name: string; exerciseIds: string[] }) => {
    haptic.medium();
    onUpdate({
      name: day.name.trim() ? day.name : preset.name,
      exerciseIds: preset.exerciseIds,
    });
  };

  const clearDay = () => {
    haptic.warning();
    onUpdate({ exerciseIds: [] });
  };

  const removeExercise = (exerciseId: string) => {
    haptic.selection();
    onUpdate({ exerciseIds: day.exerciseIds.filter((id) => id !== exerciseId) });
  };

  // Merge picker results into the day's exercises (de-duped, preserves existing order).
  const handlePickerDone = (newIds: string[]) => {
    haptic.medium();
    const existing = new Set(day.exerciseIds);
    const merged = [...day.exerciseIds, ...newIds.filter((id) => !existing.has(id))];
    onUpdate({ exerciseIds: merged });
    setPickerVisible(false);
  };

  // Look up exercise names for the inline chip list. Local-only IDs may not
  // resolve (e.g. a preset references an id we removed) — fall back to the raw id.
  const selectedExercises = useMemo(
    () => day.exerciseIds.map((id) => localExercises.find((e) => e.id === id) ?? { id, name: id }),
    [day.exerciseIds],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.headerRow, { paddingTop: safeTop, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Отмена">
            <Text style={[typography.bodySemibold, { color: colors.textSecondary }]}>Отмена</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>ДЕНЬ {index + 1}</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: 2 }]} numberOfLines={1}>
              Настройка дня
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Готово">
            <Text style={[typography.bodySemibold, { color: colors.primary }]}>Готово</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            НАЗВАНИЕ ДНЯ
          </Text>
          <TextInput
            value={day.name}
            onChangeText={(name) => onUpdate({ name })}
            placeholder="Например: Грудь и трицепс"
            placeholderTextColor={colors.inputPlaceholder}
            style={[
              styles.input,
              typography.body,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                color: colors.inputText,
              },
            ]}
            maxLength={80}
            accessibilityLabel="Название дня"
          />

          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
            ВЫБРАТЬ ИЗ ШАБЛОНОВ
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
          >
            {DAY_PRESETS.map((preset) => {
              const selected = day.name === preset.name && day.exerciseIds.length === preset.exerciseIds.length;
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => applyPreset(preset)}
                  accessibilityRole="button"
                  accessibilityLabel={preset.name}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: selected ? colors.primary + '15' : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: colors.primary + '18',
                      borderWidth: 1.5,
                      borderColor: colors.primary + '40',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: spacing.sm,
                    }}
                  >
                    <Icon name="dumbbell" size={16} color={colors.primary} />
                  </View>
                  <Text
                    style={[typography.bodySemibold, { color: colors.text, marginBottom: 2 }]}
                    numberOfLines={2}
                  >
                    {preset.name}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>
                    {preset.exerciseIds.length} {ruExercises(preset.exerciseIds.length)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {day.exerciseIds.length > 0 && (
            <TouchableOpacity
              onPress={clearDay}
              accessibilityRole="button"
              accessibilityLabel="Очистить день"
              style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
            >
              <Text style={[typography.smallMedium, { color: colors.error }]}>
                Очистить день
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 1, backgroundColor: colors.primary + '20', marginVertical: spacing.xl }} />

          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            УПРАЖНЕНИЯ
          </Text>

          {selectedExercises.length === 0 ? (
            <TouchableOpacity
              onPress={() => { haptic.selection(); setPickerVisible(true); }}
              accessibilityRole="button"
              accessibilityLabel="Выбрать упражнения"
              style={[
                styles.outlineButton,
                {
                  borderColor: colors.primary + '60',
                  backgroundColor: colors.primary + '10',
                },
              ]}
            >
              <Icon name="plus" size={18} color={colors.primary} />
              <Text style={[typography.button, { color: colors.primary }]}>
                Выбрать упражнения
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={{ gap: spacing.sm }}>
                {selectedExercises.map((ex) => (
                  <View
                    key={ex.id}
                    style={[
                      styles.exerciseRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {ex.name}
                    </Text>
                    <HitTarget>
                      <TouchableOpacity
                        onPress={() => removeExercise(ex.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Убрать ${ex.name}`}
                        style={{ padding: spacing.xs }}
                      >
                        <View style={{ transform: [{ rotate: '45deg' }] }}>
                          <Icon name="plus" size={18} color={colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    </HitTarget>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => { haptic.selection(); setPickerVisible(true); }}
                accessibilityRole="button"
                accessibilityLabel="Добавить ещё упражнения"
                style={[
                  styles.outlineButton,
                  {
                    borderColor: colors.primary + '60',
                    backgroundColor: colors.primary + '10',
                    marginTop: spacing.md,
                  },
                ]}
              >
                <Icon name="plus" size={18} color={colors.primary} />
                <Text style={[typography.button, { color: colors.primary }]}>
                  Добавить ещё
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        <ExercisePickerModal
          visible={pickerVisible}
          existingIds={day.exerciseIds}
          onCancel={() => setPickerVisible(false)}
          onDone={handlePickerDone}
        />
      </View>
    </Modal>
  );
};

// ------- Exercise picker modal -------------------------------------------

const PICKER_MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'chest', label: 'Грудь' },
  { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' },
  { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' },
  { key: 'quadriceps', label: 'Ноги' },
  { key: 'abs', label: 'Пресс' },
];

interface ExercisePickerModalProps {
  visible: boolean;
  existingIds: string[];
  onCancel: () => void;
  onDone: (selectedIds: string[]) => void;
}

const ExercisePickerModal: React.FC<ExercisePickerModalProps> = ({ visible, existingIds, onCancel, onDone }) => {
  const colors = useThemeColors();
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');

  // Reset picker state every time the modal opens — fresh selection per session.
  React.useEffect(() => {
    if (visible) {
      setLocalSelected(new Set());
      setSearchQuery('');
      setMuscleFilter('all');
    }
  }, [visible]);

  const existingSet = useMemo(() => new Set(existingIds), [existingIds]);

  const filteredExercises = useMemo(
    () => localExercises.filter((ex) => {
      const matchesSearch = searchQuery ? ex.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
      const matchesMuscle = muscleFilter === 'all' ? true : ex.primaryMuscles.includes(muscleFilter as any);
      return matchesSearch && matchesMuscle;
    }),
    [searchQuery, muscleFilter],
  );

  const toggle = (id: string) => {
    haptic.selection();
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDone = () => {
    onDone(Array.from(localSelected));
  };

  const selectedCount = localSelected.size;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.headerRow, { paddingTop: safeTop, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
          <TouchableOpacity onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Отмена">
            <Text style={[typography.bodySemibold, { color: colors.textSecondary }]}>Отмена</Text>
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>УПРАЖНЕНИЯ</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: 2 }]} numberOfLines={1}>
              Выбери упражнения
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDone}
            disabled={selectedCount === 0}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={selectedCount > 0 ? `Готово, выбрано ${selectedCount}` : 'Готово'}
            accessibilityState={{ disabled: selectedCount === 0 }}
          >
            <Text style={[typography.bodySemibold, { color: selectedCount === 0 ? colors.textTertiary : colors.primary }]}>
              Готово{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Поиск..."
            placeholderTextColor={colors.inputPlaceholder}
            style={[
              styles.searchInput,
              typography.body,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.inputBorder,
                color: colors.inputText,
              },
            ]}
            accessibilityLabel="Поиск упражнений"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.md }}
          style={{ flexGrow: 0 }}
        >
          {PICKER_MUSCLE_FILTERS.map((f) => {
            const active = muscleFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => { haptic.selection(); setMuscleFilter(f.key); }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={f.label}
              >
                <Text style={[typography.captionMedium, { color: active ? colors.textInverse : colors.text }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
          keyboardShouldPersistTaps="handled"
        >
          {filteredExercises.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: spacing.huge }}>
              <Icon name="search" size={48} color={colors.textSecondary} />
              <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>
                Ничего не найдено
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }]}>
                Попробуй другой фильтр
              </Text>
            </View>
          ) : (
            filteredExercises.map((ex) => {
              const selected = localSelected.has(ex.id);
              const alreadyAdded = existingSet.has(ex.id);
              return (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => !alreadyAdded && toggle(ex.id)}
                  disabled={alreadyAdded}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: alreadyAdded }}
                  accessibilityLabel={ex.name}
                  style={[
                    styles.pickerRow,
                    {
                      backgroundColor: selected ? colors.primary + '15' : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderWidth: selected ? 2 : 1,
                      opacity: alreadyAdded ? 0.5 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}
                    numberOfLines={1}
                  >
                    {ex.name}
                  </Text>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected && <Icon name="check" size={14} color={colors.textInverse} strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Russian helpers
// ---------------------------------------------------------------------------

function ruWeeks(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'неделя';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'недели';
  return 'недель';
}

function ruDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

function ruExercises(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'упражнение';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'упражнения';
  return 'упражнений';
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  input: {
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  chipCard: {
    flexGrow: 1,
    flexBasis: '45%',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  row3: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chipCardCompact: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    minHeight: 64,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: borderRadius.xl,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    gap: spacing.md,
  },
  presetCard: {
    width: 160,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    alignItems: 'flex-start',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  searchInput: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
});
