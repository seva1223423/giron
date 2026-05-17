import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { useThemeStore, useSettingsStore, useAuthStore } from '../../store';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useHaptic } from '../../hooks/useHaptic';
import { Icon, Card, FadeIn, ProgressRing, Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { usePedometer } from '../../hooks/usePedometer';
import { healthSyncService } from '../../services/health';

/** Rough kcal/step constant — derived from MET * stride length. The
 *  averages-of-averages literature pegs a 70kg adult at ~0.04 kcal/step
 *  (4 kcal per 100 steps). For other body weights we scale linearly:
 *  kcal/step ≈ 0.04 * (weightKg / 70). Runners burn more per step but
 *  pedometer steps are ~95% walking for most users, so we don't try to
 *  detect intensity here. */
const KCAL_PER_STEP_AT_70KG = 0.04;

/** Active-minute heuristic — average step cadence while purposefully
 *  walking is 90–110 steps/min. We bucket the day's steps at 100 spm
 *  to estimate minutes-on-feet. Slightly under-counts for runners,
 *  over-counts for slow strollers, but the magnitude is stable enough
 *  to surface as a vibe metric. */
const STEPS_PER_ACTIVE_MINUTE = 100;

/** Streak threshold — a "successful" day is ≥ 80% of goal. Setting it
 *  to 100% punishes legitimate "almost made it" days (9.8k vs 10k) and
 *  resets streaks too aggressively. 80% mirrors the StepsCard's "цель
 *  достигнута" copy on the home tab — keep both in sync. */
const STREAK_THRESHOLD_RATIO = 0.8;

const HISTORY_DAYS = 30;

function formatSteps(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1)}к`;
  }
  return String(n);
}

function formatKm(km: number): string {
  return km < 10 ? km.toFixed(2) : km.toFixed(1);
}

export const StepsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const user = useAuthStore((s) => s.user);
  const stepsDailyGoal = useSettingsStore((s) => s.stepsDailyGoal);
  const setStepsDailyGoal = useSettingsStore((s) => s.setStepsDailyGoal);
  const strideLengthCm = useSettingsStore((s) => s.strideLengthCm);
  const setStrideLengthCm = useSettingsStore((s) => s.setStrideLengthCm);

  const {
    todaySteps: phoneTodaySteps,
    historySteps: phoneHistorySteps,
    historyDayLabels,
    isAvailable,
    isLoading,
    refresh,
    permission,
    canAskAgain,
    hasHardware,
    requestPermission,
  } = usePedometer(HISTORY_DAYS, { autoRequest: true });

  const [refreshing, setRefreshing] = useState(false);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(String(stepsDailyGoal));
  const [strideDraft, setStrideDraft] = useState(String(strideLengthCm));

  // Round 240 Phase E — pull daily step totals synced from HealthKit/
  // Health Connect via /user/health/steps. We merge `max(phone, watch)`
  // per day below: the phone pedometer covers intervals when the watch
  // isn't worn, the watch covers intervals when the phone is in the
  // bag. Whichever has more for a given day is the truer count.
  const [watchStepsByDate, setWatchStepsByDate] = useState<Map<string, number>>(new Map());
  const fetchWatchSteps = useCallback(async () => {
    const series = await healthSyncService.getDailySteps(HISTORY_DAYS);
    const m = new Map<string, number>();
    for (const s of series) m.set(s.date, s.steps);
    setWatchStepsByDate(m);
  }, []);
  useEffect(() => { fetchWatchSteps().catch(() => { /* ignore */ }); }, [fetchWatchSteps]);

  const todayYmd = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const todaySteps = useMemo(
    () => Math.max(phoneTodaySteps, watchStepsByDate.get(todayYmd) ?? 0),
    [phoneTodaySteps, watchStepsByDate, todayYmd],
  );
  const historySteps = useMemo(() => {
    if (phoneHistorySteps.length === 0) return phoneHistorySteps;
    const todayMs = new Date(todayYmd + 'T00:00:00').getTime();
    const N = phoneHistorySteps.length;
    return phoneHistorySteps.map((phone, i) => {
      const offset = N - 1 - i;
      const ymd = new Date(todayMs - offset * 86400_000).toLocaleDateString('en-CA');
      const watch = watchStepsByDate.get(ymd) ?? 0;
      return Math.max(phone, watch);
    });
  }, [phoneHistorySteps, watchStepsByDate, todayYmd]);

  // Use a finer stride estimate when the profile has a height (Murray-Drought:
  // walking stride ≈ 0.413 × heightCm). Falls back to the user's saved
  // strideLengthCm preference, which itself defaults to 75cm population avg.
  const effectiveStride = useMemo(() => {
    if (user?.heightCm && user.heightCm > 100 && user.heightCm < 250) {
      return Math.round(user.heightCm * 0.413);
    }
    return strideLengthCm;
  }, [user?.heightCm, strideLengthCm]);

  // Derived "today" stats — cheap, but useMemo keeps them stable across
  // unrelated re-renders (the goal modal toggles a sibling state).
  const todayStats = useMemo(() => {
    const km = (todaySteps * effectiveStride) / 100_000;
    const kcal = todaySteps * KCAL_PER_STEP_AT_70KG * (user?.weightKg ? user.weightKg / 70 : 1);
    const activeMinutes = Math.round(todaySteps / STEPS_PER_ACTIVE_MINUTE);
    const progress = Math.min(todaySteps / Math.max(1, stepsDailyGoal), 1);
    const remaining = Math.max(0, stepsDailyGoal - todaySteps);
    return { km, kcal: Math.round(kcal), activeMinutes, progress, remaining };
  }, [todaySteps, effectiveStride, user?.weightKg, stepsDailyGoal]);

  // Window aggregates over the historical lookback — average, total, best,
  // and current goal-streak (counting back from today).
  const aggregates = useMemo(() => {
    if (historySteps.length === 0) {
      return { avg: 0, total: 0, bestDay: 0, bestDayLabel: '—', streak: 0, daysHitGoal: 0 };
    }
    const total = historySteps.reduce((s, n) => s + n, 0);
    const avg = Math.round(total / historySteps.length);
    let bestDay = 0;
    let bestIdx = 0;
    historySteps.forEach((n, i) => {
      if (n > bestDay) { bestDay = n; bestIdx = i; }
    });
    const daysHitGoal = historySteps.filter((n) => n >= stepsDailyGoal).length;

    // Streak — walk backwards from today (last index) until a day fails the
    // 80% threshold. Today is special: if we haven't hit the threshold yet
    // (because it's, say, 14:00) but the threshold is achievable, don't
    // break the streak — only the previous day's failure does.
    let streak = 0;
    const goalThreshold = stepsDailyGoal * STREAK_THRESHOLD_RATIO;
    for (let i = historySteps.length - 1; i >= 0; i--) {
      const n = historySteps[i];
      const isToday = i === historySteps.length - 1;
      if (n >= goalThreshold) {
        streak++;
      } else if (isToday) {
        // Don't break the streak just because today isn't done yet.
        continue;
      } else {
        break;
      }
    }

    // Round 90: when the streak fills the whole lookback window, the user
    // probably has a longer real-world streak we just can't see (we only
    // queried HISTORY_DAYS). Surface this as "30+" so a user with a
    // 60-day actual streak doesn't read the tile as "started 30 days ago".
    const streakAtWindowEdge = streak >= historySteps.length;

    return {
      avg,
      total,
      bestDay,
      bestDayLabel: historyDayLabels[bestIdx] ?? '—',
      streak,
      streakAtWindowEdge,
      daysHitGoal,
    };
  }, [historySteps, historyDayLabels, stepsDailyGoal]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.light();
    try { await Promise.all([refresh(), fetchWatchSteps()]); } finally { setRefreshing(false); }
  }, [refresh, fetchWatchSteps, haptic]);

  const openGoalModal = () => {
    haptic.selection();
    setGoalDraft(String(stepsDailyGoal));
    setStrideDraft(String(strideLengthCm));
    setShowGoalModal(true);
  };

  const saveGoals = () => {
    const goal = parseInt(goalDraft.replace(/\D/g, ''), 10);
    const stride = parseInt(strideDraft.replace(/\D/g, ''), 10);
    if (!Number.isFinite(goal) || goal < 1000 || goal > 30_000) {
      Alert.alert('Цель шагов', 'Введите число от 1000 до 30000');
      return;
    }
    if (!Number.isFinite(stride) || stride < 40 || stride > 120) {
      Alert.alert('Длина шага', 'Введите длину шага в см (40–120)');
      return;
    }
    setStepsDailyGoal(goal);
    setStrideLengthCm(stride);
    haptic.success();
    setShowGoalModal(false);
  };

  // Permission / hardware state — handled separately so the rest of the
  // screen can assume permission === 'granted'.
  //
  // Round 185: distinguish "no hardware" (terminal — show explanation
  // only) from "permission needed" (recoverable — show a button that
  // either re-prompts or jumps straight to system settings, depending
  // on `canAskAgain`). Previously we showed a single static message
  // telling the user to fix it themselves, which forced them to dig
  // through their OS settings on their own.
  // R240 audit L13: if the phone pedometer is denied/unavailable BUT
  // we have watch step data for today, let the screen render normally.
  // The previous gate hid all watch steps behind "разреши доступ" even
  // when the user had Apple Watch / Mi Band syncing — confusing UX
  // ("у меня же часы есть, причём тут шагомер телефона?").
  const hasWatchTodaySteps = (watchStepsByDate.get(todayYmd) ?? 0) > 0;
  if (!isLoading && permission !== 'granted' && !hasWatchTodaySteps) {
    const hardwareMissing = permission === 'unavailable' || !hasHardware;
    const needsSettings = permission === 'denied' && !canAskAgain;

    const onPressAction = async () => {
      haptic.selection();
      if (hardwareMissing) return;
      if (needsSettings) {
        // canAskAgain became false (Android: "Don't ask again", iOS:
        // post-first-denial). The OS prompt is now a no-op, so jump
        // straight into the app's system settings page where one tap
        // toggles the permission. The hook's AppState listener picks up
        // the change when the user returns.
        Linking.openSettings();
        return;
      }
      // 'unknown' or 'denied' with canAskAgain still true — fire the
      // OS prompt. If the user denies and Android flips canAskAgain
      // off, the next render will switch the button label to
      // "Открыть настройки" automatically.
      await requestPermission();
    };

    const iconTint = hardwareMissing ? colors.warning : colors.primary;
    const iconName: 'bolt' | 'lock' = hardwareMissing ? 'bolt' : 'lock';

    const title = hardwareMissing
      ? 'Шагомер недоступен'
      : 'Доступ к шагомеру';

    const desc = hardwareMissing
      ? 'На этом устройстве нет датчика шагов или он не поддерживается системой.'
      : needsSettings
        ? 'Доступ заблокирован. Открой настройки и разреши приложению считывать данные о движении — мы вернёмся к шагам автоматически.'
        : 'Разреши доступ к данным о движении, чтобы считать шаги, километры и активные минуты.';

    const buttonTitle = needsSettings ? 'Открыть настройки' : 'Разрешить доступ';

    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
        <Header colors={colors} onBack={() => navigation.goBack()} onSettings={openGoalModal} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl }}>
          <View style={[styles.iconBox, { backgroundColor: iconTint + '15', borderColor: iconTint + '40', width: 64, height: 64, borderRadius: 18 }]}>
            <Icon name={iconName} size={28} color={iconTint} />
          </View>
          <Text style={[typography.h3, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>
            {title}
          </Text>
          <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 20 }]}>
            {desc}
          </Text>
          {!hardwareMissing && (
            <View style={{ marginTop: spacing.xl, width: '100%' }}>
              <Button title={buttonTitle} onPress={onPressAction} fullWidth size="lg" />
            </View>
          )}
        </View>
      </View>
    );
  }

  const max = Math.max(...historySteps, 1);
  const ringSize = 240;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
      <Header colors={colors} onBack={() => navigation.goBack()} onSettings={openGoalModal} />

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.huge }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ─── Today ring ──────────────────────────────────────────────── */}
        <FadeIn delay={50}>
          <Card style={styles.heroCard}>
            <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
              <ProgressRing
                progress={todayStats.progress}
                size={ringSize}
                strokeWidth={14}
                color={todayStats.progress >= 1 ? colors.success : colors.primary}
              />
              <View style={styles.ringCenter} pointerEvents="none">
                <Text style={[typography.number, { color: colors.text, fontSize: 44 }]}>
                  {todaySteps.toLocaleString('ru-RU')}
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                  из {stepsDailyGoal.toLocaleString('ru-RU')} шагов
                </Text>
                <View style={{
                  marginTop: spacing.sm,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: 4,
                  borderRadius: borderRadius.full,
                  backgroundColor: todayStats.progress >= 1 ? colors.success + '15' : colors.primary + '15',
                }}>
                  <Text style={[typography.smallMedium, {
                    color: todayStats.progress >= 1 ? colors.success : colors.primary,
                  }]}>
                    {todayStats.progress >= 1
                      ? '✓ Цель достигнута'
                      : `Ещё ${formatSteps(todayStats.remaining)}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stat row under the ring */}
            <View style={[styles.statRow, { borderTopColor: colors.border }]}>
              <Stat label="км" value={formatKm(todayStats.km)} color={colors.primary} />
              <Divider colors={colors} />
              <Stat label="ккал" value={String(todayStats.kcal)} color={colors.calories} />
              <Divider colors={colors} />
              <Stat label="активн. мин." value={String(todayStats.activeMinutes)} color={colors.success} />
            </View>
          </Card>
        </FadeIn>

        {/* ─── 30-day chart ──────────────────────────────────────────── */}
        <FadeIn delay={120}>
          <Card style={{ marginTop: spacing.lg, padding: spacing.lg }}>
            <View style={styles.cardHeaderRow}>
              <Text style={[typography.h4, { color: colors.text }]}>30 дней</Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                ср. {formatSteps(aggregates.avg)} / день
              </Text>
            </View>

            {historySteps.length === 0 ? (
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.md }]}>
                Нет данных за выбранный период.
              </Text>
            ) : (
              <View style={styles.chart}>
                {historySteps.map((steps, i) => {
                  const ratio = steps / max;
                  const barH = Math.max(3, Math.round(ratio * 80));
                  const hitGoal = steps >= stepsDailyGoal;
                  const isToday = i === historySteps.length - 1;
                  return (
                    <View key={i} style={styles.chartCol}>
                      <View style={[styles.barTrack, { height: 84 }]}>
                        <View
                          style={[
                            styles.bar,
                            {
                              height: barH,
                              backgroundColor: hitGoal
                                ? colors.success
                                : isToday
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Goal line legend */}
            <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
              <LegendDot colors={colors} color={colors.success} label="Цель достигнута" />
              <LegendDot colors={colors} color={colors.primary} label="Сегодня" />
              <LegendDot colors={colors} color={colors.border} label="Прочие дни" />
            </View>
          </Card>
        </FadeIn>

        {/* ─── Stats grid ──────────────────────────────────────────── */}
        <FadeIn delay={190}>
          <View style={styles.statsGrid}>
            <StatTile
              colors={colors}
              icon="flame"
              tint={colors.calories}
              label="Серия"
              // Round 90: append "+" when the streak fills the lookback
              // window — actual streak might be longer than HISTORY_DAYS,
              // and "30 days" reads like "started exactly 30 days ago"
              // when in fact we just can't see further back.
              value={
                aggregates.streakAtWindowEdge
                  ? `${aggregates.streak}+ ${aggregates.streak === 1 ? 'день' : 'дней'}`
                  : `${aggregates.streak} ${aggregates.streak === 1 ? 'день' : aggregates.streak >= 2 && aggregates.streak <= 4 ? 'дня' : 'дней'}`
              }
              hint={aggregates.streak > 0 ? `≥ ${Math.round(STREAK_THRESHOLD_RATIO * 100)}% от цели подряд` : 'Сделай 80% цели сегодня'}
            />
            <StatTile
              colors={colors}
              icon="trophy"
              tint={colors.success}
              label="Лучший день"
              value={formatSteps(aggregates.bestDay)}
              hint={aggregates.bestDayLabel !== '—' ? aggregates.bestDayLabel : 'Нет данных'}
            />
            <StatTile
              colors={colors}
              icon="check"
              tint={colors.primary}
              // Round 90: clarify the 100%-of-goal threshold so the user
              // doesn't conflate this tile with the streak tile (which
              // counts the looser ≥80%-of-goal days). Same denominator
              // (historySteps.length), different numerator definition.
              label="100% цели"
              value={`${aggregates.daysHitGoal} / ${historySteps.length}`}
              hint={historySteps.length > 0
                ? `${Math.round((aggregates.daysHitGoal / historySteps.length) * 100)}% дней закрыли цель полностью`
                : '—'}
            />
            <StatTile
              colors={colors}
              icon="chart"
              tint={colors.protein}
              label="Сумма"
              value={formatSteps(aggregates.total)}
              hint={`за ${historySteps.length} дн.`}
            />
          </View>
        </FadeIn>

        {/* ─── Tips ─────────────────────────────────────────────────── */}
        <FadeIn delay={260}>
          <Card style={{ marginTop: spacing.lg, padding: spacing.lg }}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              СОВЕТ
            </Text>
            <Text style={[typography.body, { color: colors.text, lineHeight: 22 }]}>
              {tipForToday(todayStats.progress, aggregates.streak)}
            </Text>
          </Card>
        </FadeIn>
      </ScrollView>

      {/* ─── Goal modal ──────────────────────────────────────────── */}
      <Modal visible={showGoalModal} animationType="slide" transparent onRequestClose={() => setShowGoalModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: colors.background,
            padding: spacing.xl,
            paddingBottom: spacing.huge,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          }}>
            <View style={{
              alignSelf: 'center',
              width: 40, height: 4, borderRadius: 2,
              backgroundColor: colors.border,
              marginBottom: spacing.lg,
            }} />
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.lg }]}>
              Настройки шагомера
            </Text>

            <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              Дневная цель, шагов
            </Text>
            <TextInput
              value={goalDraft}
              onChangeText={setGoalDraft}
              keyboardType="number-pad"
              maxLength={5}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 4, marginBottom: spacing.md }]}>
              ВОЗ рекомендует от 7000. Для активного образа — 10000–12000.
            </Text>

            <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>
              Длина шага, см
            </Text>
            <TextInput
              value={strideDraft}
              onChangeText={setStrideDraft}
              keyboardType="number-pad"
              maxLength={3}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 4, marginBottom: spacing.lg }]}>
              {user?.heightCm
                ? `Из роста ${user.heightCm} см: ~${Math.round(user.heightCm * 0.413)} см. Используется для оценки километража.`
                : 'Среднее значение для взрослых — 75 см. Используется для оценки км.'}
            </Text>

            <Button title="Сохранить" onPress={saveGoals} fullWidth size="lg" />
            <TouchableOpacity onPress={() => setShowGoalModal(false)} style={{ alignItems: 'center', paddingVertical: spacing.md }}>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Subcomponents ──────────────────────────────────────────────────────

const Header: React.FC<{ colors: any; onBack: () => void; onSettings: () => void }> = ({ colors, onBack, onSettings }) => {
  const haptic = useHaptic();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <TouchableOpacity onPress={() => { haptic.selection(); onBack(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="arrow" size={20} color={colors.text} />
      </TouchableOpacity>
      <Text style={[typography.h3, { color: colors.text }]}>Шагомер</Text>
      <TouchableOpacity onPress={onSettings} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Icon name="settings" size={20} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={[typography.numberSmall, { color }]}>{value}</Text>
    <Text style={[typography.caption, { color: '#888', marginTop: 2 }]}>{label}</Text>
  </View>
);

const Divider: React.FC<{ colors: any }> = ({ colors }) => (
  <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />
);

const LegendDot: React.FC<{ colors: any; color: string; label: string }> = ({ colors, color, label }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    <Text style={[typography.caption, { color: colors.textTertiary }]}>{label}</Text>
  </View>
);

const StatTile: React.FC<{
  colors: any;
  icon: any;
  tint: string;
  label: string;
  value: string;
  hint: string;
}> = ({ colors, icon, tint, label, value, hint }) => (
  <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.iconBox, { backgroundColor: tint + '15', borderColor: tint + '40' }]}>
      <Icon name={icon} size={16} color={tint} />
    </View>
    <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.sm }]}>
      {label}
    </Text>
    <Text style={[typography.h4, { color: colors.text, marginTop: 2 }]}>{value}</Text>
    <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
      {hint}
    </Text>
  </View>
);

// ─── Tip generator ──────────────────────────────────────────────────────

function tipForToday(progress: number, streak: number): string {
  if (progress >= 1) {
    if (streak >= 7) return `Серия из ${streak} дней — это привычка, а не вспышка. Поддерживай темп: лучший способ удержать кардио-форму без зала.`;
    return 'Цель закрыта. Добавь к концу недели один длинный «прогулочный» день в 14–18к — поднимешь среднюю мощность аэробной системы.';
  }
  if (progress >= 0.8) return 'Уже близко. 15 минут активного шага — и день закроется в зелёной зоне.';
  if (progress >= 0.5) return 'Половина пути. Если есть встреча или звонок — попробуй провести его на ходу: добавит ~3000 за полчаса.';
  return 'Начни с малого: одна короткая прогулка 1–2 км утром даёт ~3000 шагов и запускает обмен на весь день.';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  heroCard: { padding: 0, overflow: 'hidden' },
  ringCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    gap: 2,
  },
  chartCol: { flex: 1, alignItems: 'center' },
  barTrack: { justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', borderRadius: 2, minHeight: 3 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  statTile: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 17,
  },
});
