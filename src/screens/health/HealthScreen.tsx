import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Platform, Linking, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors } from '../../store';
import { useHealthStore } from '../../store/useHealthStore';
import { Card, Button, Icon, HitTarget, FadeIn, type IconName } from '../../components';
import { toast } from '../../components/app-modal/toast';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { healthSyncService, bleDirectService, type ConnectedDevice } from '../../services/health';
import { StageBar } from './components/StageBar';

/**
 * HealthScreen — Профиль → Здоровье и часы.
 *
 * Phase B (Android via Health Connect). iOS shows a Phase-C-pending
 * banner because `noopAdapter` reports `isAvailable=false` there.
 *
 * Lifecycle:
 *   - on mount: probe `isAvailable`. If available and at least one
 *     scope is granted, fan-out `loadSummary` + `loadDevices` +
 *     `refreshGrantedScopes` in parallel
 *   - pull-to-refresh runs `syncNow` then refreshes the summary
 *   - permission banner & sync button shown conditionally based on
 *     availability/grant state
 */

const PLAY_MARKET_HEALTH_CONNECT_URL = 'market://details?id=com.google.android.apps.healthdata';

// ─── KPI helpers ──────────────────────────────────────────────────────────

interface KpiSpec {
  label: string;
  /** Pre-formatted display value, or null for "—" placeholder. */
  value: string | null;
  unit: string;
  iconName: IconName;
}

function formatKpi(v: number | null | undefined, opts?: { digits?: number }): string | null {
  if (v == null || Number.isNaN(v)) return null;
  if (opts?.digits != null) return v.toFixed(opts.digits);
  return String(Math.round(v));
}

// ─── Screen ───────────────────────────────────────────────────────────────

export default function HealthScreen() {
  const navigation = useNavigation<any>();
  const safeTop = useSafeTop();
  const colors = useThemeColors();

  const {
    summary, devices, grantedScopes, lastSyncAt, isSyncing, error,
    refreshGrantedScopes, requestPermissions, syncNow,
    loadSummary, loadDevices, unpairDevice,
  } = useHealthStore();

  // SDK presence is platform-local — store via local state, not zustand.
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [requestingPerms, setRequestingPerms] = useState(false);
  const [scanningBle, setScanningBle] = useState(false);

  // Phase D — scan for BLE HR devices and offer to pair the nearest one.
  // Kept deliberately minimal: no in-screen device picker UI, just a
  // confirm modal. Live HR streaming is out of scope.
  const handleScanBle = useCallback(async () => {
    if (scanningBle) return;
    setScanningBle(true);
    try {
      const available = await bleDirectService.isAvailable();
      if (!available) {
        toast.error('Bluetooth выключен или нет прав. Включи Bluetooth и попробуй ещё раз.');
        return;
      }
      toast.info('Сканирую BLE-пульсометры…');
      const found = await bleDirectService.scanForHrDevices(8);
      if (found.length === 0) {
        toast.error('Не нашлось HR-устройств поблизости. Включи пульсометр и попробуй ещё раз.');
        return;
      }
      const nearest = found[0];
      Alert.alert(
        'Найден пульсометр',
        `${nearest.name}${found.length > 1 ? ` (и ещё ${found.length - 1})` : ''}. Привязать?`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Привязать',
            onPress: async () => {
              const paired = await bleDirectService.pairWithServer(nearest);
              if (paired) {
                await loadDevices();
                toast.success(`Привязан: ${nearest.name}`);
              } else {
                toast.error('Не удалось привязать. Попробуй ещё раз.');
              }
            },
          },
        ],
      );
    } catch {
      toast.error('Ошибка сканирования BLE');
    } finally {
      setScanningBle(false);
    }
  }, [scanningBle, loadDevices]);

  const hasAnyGrant = useMemo(
    () => Object.values(grantedScopes).some(Boolean),
    [grantedScopes],
  );

  // ── Initial probe + parallel data fetch ────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const available = await healthSyncService.isAvailable();
      if (!alive) return;
      setIsAvailable(available);
      if (available) {
        // Probe grants first so we know whether to bother with summary/devices.
        await refreshGrantedScopes();
        const grants = await healthSyncService.getGrantedScopes();
        if (!alive) return;
        if (Object.values(grants).some(Boolean)) {
          // Fan-out — order doesn't matter.
          await Promise.all([loadSummary(), loadDevices()]);
        }
      }
    })();
    return () => { alive = false; };
    // Run-once on mount; store actions are stable references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Surface sync errors via toast (per design rules — no custom banners).
  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleRequestPermissions = useCallback(async () => {
    if (requestingPerms) return;
    setRequestingPerms(true);
    try {
      const ok = await requestPermissions();
      if (ok) {
        toast.success('Доступ выдан');
        await Promise.all([loadSummary(), loadDevices()]);
      } else {
        toast.warn('Доступ не выдан. Открой настройки Health Connect.');
      }
    } finally {
      setRequestingPerms(false);
    }
  }, [requestPermissions, requestingPerms, loadSummary, loadDevices]);

  const handleOpenPlayMarket = useCallback(async () => {
    try {
      await Linking.openURL(PLAY_MARKET_HEALTH_CONNECT_URL);
    } catch {
      toast.error('Не удалось открыть Play Маркет');
    }
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (isSyncing) return;
    const result = await syncNow();
    if (result.ok) {
      toast.success(
        result.ingestedTotal > 0
          ? `Загружено ${result.ingestedTotal} записей`
          : 'Свежих записей нет',
      );
    }
    // Errors are surfaced through the `error` effect above.
  }, [isSyncing, syncNow]);

  const handlePullRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await syncNow();
      await loadSummary();
    } finally {
      setIsRefreshing(false);
    }
  }, [syncNow, loadSummary]);

  const handleUnpair = useCallback((device: ConnectedDevice) => {
    Alert.alert(
      'Отвязать устройство?',
      `${device.displayName} перестанет присылать данные. История останется.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отвязать',
          style: 'destructive',
          onPress: async () => {
            await unpairDevice(device.id);
            toast.success('Устройство отвязано');
          },
        },
      ],
    );
  }, [unpairDevice]);

  // ── Derived UI state ───────────────────────────────────────────────────

  const showPermissionBanner = isAvailable === false || (isAvailable === true && !hasAnyGrant);
  const isIos = Platform.OS === 'ios';

  const lastSyncLabel = lastSyncAt
    ? `Синхронизировано ${formatDistanceToNow(new Date(lastSyncAt), { locale: ru, addSuffix: true })}`
    : 'Ещё ни разу не синхронизировано';

  const kpis: KpiSpec[] = useMemo(() => [
    {
      label: 'Пульс покоя',
      value: formatKpi(summary?.restingHr),
      unit: 'уд/мин',
      iconName: 'heart',
    },
    {
      label: 'VO₂max',
      value: formatKpi(summary?.latestVo2Max, { digits: 1 }),
      unit: 'мл/кг/мин',
      iconName: 'bolt',
    },
    {
      label: 'SpO₂',
      value: formatKpi(summary?.latestSpo2),
      unit: '%',
      iconName: 'chart',
    },
    {
      label: 'Активность сегодня',
      // TODO(icon): use a dedicated `clock` icon when the Icon set grows.
      // For now `timer` is the closest match in the 38-icon Direction A set.
      value: formatKpi(summary?.today.activeMin),
      unit: 'мин',
      iconName: 'timer',
    },
    {
      label: 'Калории кардио',
      value: formatKpi(summary?.today.caloriesFromCardio),
      unit: 'ккал',
      iconName: 'flame',
    },
  ], [summary]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border, paddingTop: safeTop },
        ]}
      >
        <HitTarget
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={{ transform: [{ rotate: '180deg' }] }}
        >
          <Icon name="chev" size={22} color={colors.primary} />
        </HitTarget>
        <Text
          style={[typography.h3, { color: colors.text, flex: 1, marginLeft: spacing.md }]}
          numberOfLines={1}
        >
          Здоровье и часы
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* 1 — Permission / availability banner */}
        {showPermissionBanner && (
          <FadeIn delay={0}>
            <Card style={{ marginBottom: spacing.lg }}>
              <View style={styles.bannerRow}>
                <View
                  style={[
                    styles.bannerIcon,
                    { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
                  ]}
                >
                  <Icon
                    name={isIos ? 'lock' : isAvailable === false ? 'settings' : 'link'}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  {isIos ? (
                    <>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>
                        Поддержка Apple Watch скоро
                      </Text>
                      <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                        Phase C — подключение HealthKit готовится. Сейчас работает только Android.
                      </Text>
                    </>
                  ) : isAvailable === false ? (
                    <>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>
                        Установи Health Connect
                      </Text>
                      <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                        Без приложения Google Health Connect мы не можем читать данные с твоих часов.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={[typography.bodySemibold, { color: colors.text }]}>
                        Дай доступ к данным со своих часов
                      </Text>
                      <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                        Iron Gym читает только указанные показатели — пульс, сон, активность.
                      </Text>
                    </>
                  )}
                </View>
              </View>

              {isIos ? (
                <Button
                  title="Скоро"
                  onPress={() => undefined}
                  variant="outline"
                  fullWidth
                  disabled
                  style={{ marginTop: spacing.lg }}
                />
              ) : isAvailable === false ? (
                <Button
                  title="Открыть Play Маркет"
                  onPress={handleOpenPlayMarket}
                  fullWidth
                  style={{ marginTop: spacing.lg }}
                />
              ) : (
                <Button
                  title="Дать доступ"
                  onPress={handleRequestPermissions}
                  loading={requestingPerms}
                  fullWidth
                  style={{ marginTop: spacing.lg }}
                />
              )}
            </Card>
          </FadeIn>
        )}

        {/* 2 — Last sync + manual sync */}
        {(isAvailable && hasAnyGrant) && (
          <FadeIn delay={50}>
            <Card style={{ marginBottom: spacing.lg }}>
              <View style={styles.bannerRow}>
                <View
                  style={[
                    styles.bannerIcon,
                    { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
                  ]}
                >
                  <Icon name="refresh" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>
                    Синхронизация
                  </Text>
                  <Text
                    style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}
                    numberOfLines={2}
                  >
                    {lastSyncLabel}
                  </Text>
                </View>
              </View>

              <Button
                title="Синхронизировать сейчас"
                onPress={handleSyncNow}
                loading={isSyncing}
                fullWidth
                style={{ marginTop: spacing.lg }}
              />
              {error ? (
                <Text
                  style={[typography.small, { color: colors.error, marginTop: spacing.sm, textAlign: 'center' }]}
                >
                  {error}
                </Text>
              ) : null}
            </Card>
          </FadeIn>
        )}

        {/* 3 — KPI grid (2 columns) */}
        <FadeIn delay={100}>
          <View style={styles.kpiGrid}>
            {kpis.map((kpi) => (
              <View key={kpi.label} style={styles.kpiCellWrap}>
                <Card style={styles.kpiCard}>
                  <View
                    style={[
                      styles.kpiIconCircle,
                      { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
                    ]}
                  >
                    <Icon name={kpi.iconName} size={16} color={colors.primary} />
                  </View>
                  <Text
                    style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.md }]}
                    numberOfLines={1}
                  >
                    {kpi.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs, flexWrap: 'wrap' }}>
                    <Text
                      style={[
                        typography.numberSmall,
                        { color: kpi.value == null ? colors.textTertiary : colors.text },
                      ]}
                    >
                      {kpi.value ?? '—'}
                    </Text>
                    <Text
                      style={[typography.caption, { color: colors.textSecondary, marginLeft: spacing.xs }]}
                    >
                      {kpi.unit}
                    </Text>
                  </View>
                </Card>
              </View>
            ))}
          </View>
        </FadeIn>

        {/* 4 — Sleep yesterday */}
        <FadeIn delay={150}>
          <Text
            style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}
          >
            СОН ВЧЕРА
          </Text>
          <Card style={{ marginBottom: spacing.lg }}>
            {summary?.lastSleep ? (
              <>
                <View style={styles.bannerRow}>
                  <View
                    style={[
                      styles.bannerIcon,
                      { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
                    ]}
                  >
                    <Icon name="moon" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <Text style={[typography.number, { color: colors.text }]}>
                        {summary.lastSleep.durationHours.toFixed(1)}
                      </Text>
                      <Text style={[typography.body, { color: colors.textSecondary, marginLeft: spacing.xs }]}>
                        ч
                      </Text>
                      {summary.lastSleep.quality != null && (
                        <Text
                          style={[typography.small, { color: colors.textSecondary, marginLeft: spacing.md }]}
                        >
                          Качество {summary.lastSleep.quality}/5
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {summary.lastSleep.stages ? (
                  <StageBar stages={summary.lastSleep.stages} />
                ) : null}

                {(summary.lastSleep.spo2Avg != null || summary.lastSleep.hrvAvg != null || summary.lastSleep.awakenings != null) && (
                  <View style={{ marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                    {summary.lastSleep.spo2Avg != null && (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        SpO₂ ночью {Math.round(summary.lastSleep.spo2Avg)}%
                      </Text>
                    )}
                    {summary.lastSleep.hrvAvg != null && (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        HRV {Math.round(summary.lastSleep.hrvAvg)} мс
                      </Text>
                    )}
                    {summary.lastSleep.awakenings != null && (
                      <Text style={[typography.caption, { color: colors.textSecondary }]}>
                        Пробуждений {summary.lastSleep.awakenings}
                      </Text>
                    )}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyInner}>
                <View
                  style={[
                    styles.emptyIconCircle,
                    { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' },
                  ]}
                >
                  <Icon name="moon" size={28} color={colors.textSecondary} />
                </View>
                <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.md }]}>
                  Сон не синхронизирован
                </Text>
                <Text
                  style={[typography.small, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }]}
                >
                  Носи часы ночью, и данные о сне появятся здесь.
                </Text>
              </View>
            )}
          </Card>
        </FadeIn>

        {/* 5 — Devices */}
        <FadeIn delay={200}>
          <Text
            style={[typography.metaLabel, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}
          >
            ПОДКЛЮЧЁННЫЕ УСТРОЙСТВА
          </Text>
          <Card style={{ marginBottom: spacing.lg }} padding={spacing.md}>
            {devices.length === 0 ? (
              <Text
                style={[typography.small, { color: colors.textSecondary, padding: spacing.sm }]}
              >
                Спарь часы через системные настройки Health Connect (Android) или Health (iOS) — данные появятся
                автоматически. Для отдельного пульсометра (Polar H10, Wahoo TICKR, generic BLE) используй кнопку ниже.
              </Text>
            ) : (
              devices.map((d: ConnectedDevice, i: number) => (
                <View
                  key={d.id}
                  style={[
                    styles.deviceRow,
                    i !== devices.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.divider,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.bannerIcon,
                      { backgroundColor: colors.primary + '18', borderColor: colors.primary + '40' },
                    ]}
                  >
                    {/* TODO(icon): no `watch` glyph in the 38-icon set; using `link`
                        (paired-device semantic) as fallback. */}
                    <Icon name="link" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                      {d.displayName}
                    </Text>
                    <Text
                      style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
                      numberOfLines={1}
                    >
                      {d.kind}
                      {d.lastSyncAt
                        ? ` · ${formatDistanceToNow(new Date(d.lastSyncAt), { locale: ru, addSuffix: true })}`
                        : ' · ни разу не синхронизировано'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUnpair(d)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Отвязать ${d.displayName}`}
                  >
                    <Text style={[typography.smallMedium, { color: colors.error }]}>
                      Отвязать
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <Button
              title={scanningBle ? 'Сканирую…' : 'Подключить пульсометр (BLE)'}
              onPress={handleScanBle}
              variant="secondary"
              disabled={scanningBle}
              style={{ marginTop: spacing.sm }}
            />
          </Card>
        </FadeIn>

        {/* 6 — Footer disclaimer */}
        <FadeIn delay={250}>
          <Text
            style={[
              typography.caption,
              {
                color: colors.textTertiary,
                textAlign: 'center',
                marginTop: spacing.md,
                paddingHorizontal: spacing.md,
              },
            ]}
          >
            AI получает эти данные для рекомендаций. Данные хранятся зашифрованно (152-ФЗ).
          </Text>
        </FadeIn>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },

  content: {
    padding: spacing.xl,
    paddingBottom: spacing.huge,
  },

  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  bannerIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // KPI grid: 2 columns. Using width-based flex so spacing stays clean
  // without needing a 3rd-party `AdaptiveGrid` (which doesn't exist in
  // this codebase yet — Card + flexBasis is the established pattern).
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },

  kpiCellWrap: {
    width: '48.5%',
    marginBottom: spacing.md,
  },

  kpiCard: {
    padding: spacing.md,
  },

  kpiIconCircle: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyInner: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },

  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
});
