import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { useThemeStore } from './src/store';
import { ErrorBoundary, ForceUpdateModal } from './src/components';
import {
  AppModalProvider,
  _AppModalGlobalBridge,
  ToastHost,
  installAppAlert,
} from './src/components/app-modal';
// Touching the wrapper at module load triggers the lazy Sentry init the
// first time reportError() / setUser() / addBreadcrumb() runs. We call
// addBreadcrumb here to mark "app booted" with no PII so the very first
// crash report has useful context. No-op when Sentry isn't installed yet.
import { addBreadcrumb } from './src/utils/errorReporter';
import { checkAndApplyUpdate } from './src/services/otaUpdater';
import { registerHealthBackgroundTask } from './src/services/health';

addBreadcrumb('app:boot', { ts: new Date().toISOString() });

// Patch RN.Alert.alert globally so all 270+ existing call sites render in
// the Direction A modal (graphite + gold) instead of the OS default. Safe
// to call at module scope: idempotent, and a no-op until the bridge inside
// <AppModalProvider> mounts and wires up the show() handle.
installAppAlert();

export default function App() {
  const { isDark } = useThemeStore();

  // OTA update check (OTA-01). Fires once on initial mount, then again
  // every time the app returns from background. Both passes are silent
  // and non-blocking — even if the network call hangs, the user never
  // waits on a spinner. The downloaded bundle activates on the *next*
  // cold start, never mid-session, to avoid wiping state under the user
  // (active workout, AI chat input). expo-updates handles dedupe so
  // these calls are safe to fire frequently.
  useEffect(() => {
    checkAndApplyUpdate({ silent: true });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAndApplyUpdate({ silent: true });
      }
    });
    return () => sub.remove();
  }, []);

  // Round 240 — Phase B: register the background Health Connect sync.
  // Idempotent and best-effort: no-op on iOS (Phase C pending), no-op
  // when the OS denies background fetch. Foreground pull-on-open still
  // works regardless, so failure here just means no daily passive sync.
  useEffect(() => {
    registerHealthBackgroundTask();
  }, []);

  return (
    // Top-level ErrorBoundary catches render crashes that happen above the
    // navigator (theme load, safe area, gesture handler init). The
    // navigator has its own inner boundaries for tab-level isolation.
    <ErrorBoundary scope="app-root">
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {/* AppModalProvider wraps the navigator so its <Modal> overlay
              sits above every screen. _AppModalGlobalBridge captures the
              provider's show() handle into module scope so the patched
              Alert.alert (and the toast.* helpers) can fire from anywhere
              — even outside the React tree (axios interceptors, etc.). */}
          <AppModalProvider>
            <_AppModalGlobalBridge />
            <AppNavigator />
            {/* Sits at the root so the modal overlays every screen, including
                auth/onboarding. Mounts once for the lifetime of the app and
                is internally driven by the api.ts event bus. */}
            <ForceUpdateModal />
            <ToastHost />
          </AppModalProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
