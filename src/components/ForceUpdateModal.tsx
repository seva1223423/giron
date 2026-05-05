import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { onClientTooOld } from '../services/api';
import { applyDownloadedNow } from '../services/otaUpdater';

/**
 * Force-update modal (CLIENT-VERSION-01 + OTA-01).
 *
 * Mounts once at the App.tsx root and listens for the `clientTooOld` bus
 * event raised by the api.ts response interceptor when the server returns
 * 426. When fired, the modal becomes visible, is non-dismissible, and
 * gives the user two paths forward:
 *
 *   1. "Обновить сейчас" — first tries the OTA path (applyDownloadedNow):
 *      if a JS-only fix exists in the cache from the silent on-launch
 *      check, this restarts the bundle in-place and the user is unblocked
 *      without leaving the app. This is the fast path for the common case
 *      where a server contract change ships with a matching JS update on
 *      the same channel.
 *
 *   2. "Открыть в магазине" — falls back to the store URL the server
 *      provided in the 426 payload (RuStore for Android, App Store for
 *      iOS). Used when the breaking change requires a native rebuild
 *      (new native module, version bump that invalidates the OTA channel).
 *
 * The modal stays mounted forever once shown — there's no path back to
 * the app while the server is rejecting our requests, and dismissing it
 * would just lead to the next request bouncing off 426 again. User has
 * to update or kill the app.
 */
export const ForceUpdateModal: React.FC = () => {
  const [payload, setPayload] = useState<{
    clientVersion: string;
    minVersion: string;
    updateUrl: string | null;
    message: string;
  } | null>(null);

  useEffect(() => {
    return onClientTooOld((p) => {
      // First payload wins. Subsequent 426s on the same session shouldn't
      // re-trigger the modal — it's already visible, and updating the
      // payload would just flicker the version numbers if they differ
      // for any reason.
      setPayload((prev) => prev ?? p);
    });
  }, []);

  if (!payload) return null;

  const handleUpdateNow = async () => {
    // Try OTA first — the cheapest possible fix. If a fresh bundle was
    // downloaded by the silent on-launch check, this reload loads it and
    // the user is back in business. If nothing is cached, the call is a
    // no-op and we fall through to the store CTA below.
    await applyDownloadedNow();
  };

  const handleOpenStore = () => {
    if (payload.updateUrl) {
      Linking.openURL(payload.updateUrl).catch(() => {});
    }
  };

  return (
    <Modal visible animationType="fade" transparent={false} onRequestClose={() => {
      // Block the Android hardware back button — there's no escape path.
    }}>
      <View style={styles.container}>
        <Text style={styles.icon}>!</Text>
        <Text style={styles.title}>Обнови приложение</Text>
        <Text style={styles.message}>{payload.message}</Text>
        <View style={styles.versionBox}>
          <Text style={styles.versionLine}>Твоя версия: {payload.clientVersion}</Text>
          <Text style={styles.versionLine}>Минимально поддерживается: {payload.minVersion}</Text>
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleUpdateNow}>
          <Text style={styles.primaryBtnText}>Перезапустить приложение</Text>
        </TouchableOpacity>
        {payload.updateUrl && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleOpenStore}>
            <Text style={styles.secondaryBtnText}>Открыть в магазине</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.footnote}>
          Это сообщение появилось потому, что сервер обновился, а версия твоего приложения устарела.
          Обновление загрузится автоматически или открой страницу приложения в магазине.
        </Text>
      </View>
    </Modal>
  );
};

// Round 233 (2026-05-02 audit): replaced banned legacy palette
// (#8B5CF6 purple, #F59E0B Apple amber, #4B5563/#D1D5DB/#9CA3AF/#6B7280
// Tailwind greys) with Direction A graphite + champagne gold tokens.
// Hardcoded since this modal may render on a 426 response before
// any theme provider state is reliable; ALL VALUES MIRROR
// `darkColors` from src/theme/colors.ts.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0F',           // colors.background dark
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: { fontSize: 64, color: '#D4B07A', marginBottom: 16, fontWeight: '900' },  // primary gold (was banned amber)
  title: { fontSize: 24, fontWeight: '800', color: '#F4F1EA', marginBottom: 12, textAlign: 'center' },  // text cream
  message: { fontSize: 15, color: '#A8A49C', textAlign: 'center', marginBottom: 24, lineHeight: 22 },   // textSecondary
  versionBox: {
    backgroundColor: '#1E1E22',           // surfaceElevated
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  versionLine: { fontSize: 13, color: '#A8A49C', marginVertical: 2, textAlign: 'center' },  // textSecondary
  primaryBtn: {
    backgroundColor: '#D4B07A',           // primary gold (was old purple)
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#17171A', fontSize: 16, fontWeight: '700' },  // textInverse — dark on gold (Direction A rule)
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)', // border dark
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  secondaryBtnText: { color: '#F4F1EA', fontSize: 16, fontWeight: '600' },  // text cream
  footnote: {
    fontSize: 11,
    color: '#6B6860',                     // textTertiary dark
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
  },
});
