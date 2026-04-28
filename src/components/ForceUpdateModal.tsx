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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: { fontSize: 64, color: '#F59E0B', marginBottom: 16, fontWeight: '900' },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, color: '#D1D5DB', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  versionBox: {
    backgroundColor: '#15151F',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
  },
  versionLine: { fontSize: 13, color: '#9CA3AF', marginVertical: 2, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4B5563',
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  secondaryBtnText: { color: '#D1D5DB', fontSize: 16, fontWeight: '600' },
  footnote: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
  },
});
