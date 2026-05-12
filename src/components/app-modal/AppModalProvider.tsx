/**
 * Giron — branded drop-in replacement for Alert.alert + on-demand modal API.
 *
 * Wraps every `Alert.alert(...)` in the codebase with a Direction A modal
 * (graphite + gold, Ionicons hero, animated scale-in) without rewriting the
 * 270+ existing call sites. The trick is `installAppAlert()` — it patches
 * `RN.Alert.alert` once at boot to forward into our provider's `show`.
 *
 * Tree:
 *   <AppModalProvider>            ← wraps the app, owns modal state
 *     <_AppModalGlobalBridge/>    ← captures show() into module scope
 *     <RootNavigator/>
 *     <ToastHost/>
 *   </AppModalProvider>
 *   installAppAlert();            ← call once on boot
 *
 * Imperative API for code that wants explicit control:
 *   const m = useAppModal();
 *   m.show({ kind: 'destructive', title, message, buttons: [...] });
 *
 * Source: docs/design/handoff/ (Claude Design — Direction A, screens 22–27).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../store/useThemeStore';
import { lightColors, darkColors } from '../../theme/colors';

// Round 233 (2026-05-02 audit): IronGymTheme was previously HARDCODED DARK,
// rendering every Alert.alert + every toast in dark style regardless of
// user's theme choice — a global theme-parity break per design.md §25.
//
// Now: `IronGymTheme` is exported for the dark-fallback case and for
// `toast.tsx` (which can render outside React tree via the global bridge);
// inside the provider we use `useThemeColors()` so the live theme drives
// the modal chrome.
function buildModalTheme(c: typeof darkColors) {
  return {
    bg: c.background,
    surface: c.surface,
    surfaceHi: c.surfaceElevated,
    line: c.border,
    lineStrong: c.borderLight,
    text: c.text,
    textSub: c.textSecondary,
    textDim: c.textTertiary,
    accent: c.primary,
    accent2: c.primaryDark,
    good: c.success,
    warn: c.warning,
    danger: c.error,
    scrim: c.overlay,
    textInverse: c.textInverse,
  } as const;
}

// Dark-mode fallback — used by `toast.tsx` and by render paths that fire
// before the provider hooks into the theme store. Matches dark Direction A.
export const IronGymTheme = buildModalTheme(darkColors);
export const IronGymThemeLight = buildModalTheme(lightColors);
const T = IronGymTheme;

export type ModalKind = 'error' | 'success' | 'info' | 'confirm' | 'destructive';

export interface ModalButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface ShowOptions {
  kind?: ModalKind;
  title?: string;
  message?: string;
  buttons?: ModalButton[];
  /**
   * Mirrors RN.Alert.alert's options.cancelable. When `false`, scrim-press
   * and back-button cannot dismiss — user MUST tap a button. Default true.
   * Critical confirmation flows (e.g. signed-out forced re-login) rely on
   * this; without honoring it, the patched Alert.alert silently weakens
   * the original API contract.
   */
  cancelable?: boolean;
  /** Mirrors RN.Alert.alert's options.onDismiss — fires after any close path. */
  onDismiss?: () => void;
}

interface ModalContextValue {
  show: (opts: ShowOptions) => void;
  close: () => void;
}

// Heuristic for shows that came in through the patched Alert.alert — there's
// no `kind` flag in RN's Alert API, so we infer from the title+message+button
// shape. Keep the regex tight: false-positive types feel jarring (a green
// checkmark on a real error reads as a celebration of the failure).
function inferKind(
  title = '',
  message = '',
  buttons: ModalButton[] = [],
): ModalKind {
  const blob = `${title} ${message}`.toLowerCase();
  const hasDestructive = buttons.some((b) => b?.style === 'destructive');
  const hasCancel = buttons.some((b) => b?.style === 'cancel');

  // Explicit signal — destructive button style — wins over text inference.
  if (hasDestructive) return 'destructive';

  // Error/info BEFORE destructive substring check: "не удалось" otherwise
  // matches `/удал/` (substring of "удалось") and gets a trash-can icon
  // for what is actually a load failure. The "истек" subcase peels off
  // session-expired prompts (info, not error — user-facing tone is
  // "your session timed out" rather than "something broke").
  if (/ошиб|не удалось|нет доступа|тайм-аут|неверн|истек/.test(blob)) {
    if (/истек/.test(blob)) return 'info';
    return 'error';
  }
  // Word-anchored destructive verbs. `удали` (not `удал`) so that
  // "удалось" / "удалённый" don't false-positive — see test spec for
  // the locked contract.
  if (/удали|отмен|выйти|сброс|очист|закрыть тикет/.test(blob)) return 'destructive';
  if (/готово|успешн|сохранен|отправлен|разблокирован|активирован|восстановлен|подтверж/.test(blob)) return 'success';
  if (hasCancel || buttons.length >= 2) return 'confirm';
  return 'info';
}

const Ctx = createContext<ModalContextValue | null>(null);

export function useAppModal(): ModalContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppModal must be inside <AppModalProvider>');
  return ctx;
}

function buildIconMap(t: ReturnType<typeof buildModalTheme>):
  Record<ModalKind, { name: keyof typeof Ionicons.glyphMap; color: string }> {
  return {
    error: { name: 'alert-circle', color: t.danger },
    success: { name: 'checkmark-circle', color: t.good },
    info: { name: 'information-circle', color: t.accent },
    confirm: { name: 'shield-checkmark', color: t.accent },
    destructive: { name: 'trash', color: t.danger },
  };
}

function ModalIcon({ kind, t }: { kind: ModalKind; t: ReturnType<typeof buildModalTheme> }) {
  const { name, color } = buildIconMap(t)[kind] ?? buildIconMap(t).info;
  return (
    <View style={[styles.iconRing, { borderColor: color, backgroundColor: color + '1A', shadowColor: color }]}>
      <Ionicons name={name} size={28} color={color} />
    </View>
  );
}

export function AppModalProvider({ children }: { children: React.ReactNode }) {
  const themeColors = useThemeColors();
  // useMemo on colors object identity so theme switches re-render the modal
  // chrome but unrelated store updates don't.
  const t = useMemo(() => buildModalTheme(themeColors), [themeColors]);

  const [state, setState] = useState<ShowOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.96, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      // Capture onDismiss before clearing state — fire after the modal
      // teardown animation so any caller listening for "the dialog is
      // really gone now" gets the right ordering.
      const onDismiss = state?.onDismiss;
      setState(null);
      onDismiss?.();
    });
  }, [opacity, scale, state]);

  const show = useCallback(
    (opts: ShowOptions) => {
      setState(opts);
      opacity.setValue(0);
      scale.setValue(0.96);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
      ]).start();
    },
    [opacity, scale],
  );

  const value = useMemo<ModalContextValue>(() => ({ show, close }), [show, close]);

  const buttons: ModalButton[] = state?.buttons?.length ? state.buttons : [{ text: 'OK' }];
  const kind: ModalKind = state?.kind ?? inferKind(state?.title, state?.message, buttons);
  // RN.Alert defaults to cancelable=true. We mirror that — only an
  // explicit `false` disables scrim-press and back-button dismissal.
  const cancelable = state?.cancelable !== false;

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        visible={!!state}
        transparent
        animationType="none"
        // Android back-button: only dismisses when cancelable. Passing a
        // no-op (instead of undefined) keeps RN happy; it just won't close
        // the modal. User must tap a button — same as native Alert with
        // cancelable: false.
        onRequestClose={cancelable ? close : () => undefined}
        statusBarTranslucent
      >
        <Animated.View style={[styles.scrim, { backgroundColor: t.scrim, opacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            // No onPress = no dismiss when cancelable=false. Pressable
            // still renders to receive the touch (so it doesn't fall
            // through to anything underneath the scrim).
            onPress={
              cancelable
                ? () => {
                    const cancel = buttons.find((b) => b?.style === 'cancel');
                    cancel?.onPress?.();
                    close();
                  }
                : undefined
            }
          />
          <Animated.View style={[styles.card, { backgroundColor: t.surfaceHi, borderColor: t.lineStrong, opacity, transform: [{ scale }] }]}>
            <View style={styles.head}>
              <ModalIcon kind={kind} t={t} />
              {!!state?.title && <Text style={[styles.title, { color: t.text }]}>{state.title}</Text>}
            </View>

            {!!state?.message && <Text style={[styles.message, { color: t.textSub }]}>{state.message}</Text>}

            <View style={[styles.actions, { borderTopColor: t.line }]}>
              {buttons.slice(0, 3).map((b, i) => {
                const isPrimary = i === buttons.length - 1 && b.style !== 'cancel';
                const isDestructive = b.style === 'destructive' || (isPrimary && kind === 'destructive');
                const isCancel = b.style === 'cancel';
                const btnBg = isPrimary
                  ? (isDestructive ? t.danger : t.accent)
                  : 'transparent';
                const btnBorder = isPrimary ? undefined : t.line;
                // Direction A rules:
                //  - gold CTA always has DARK text (textInverse) — cream-on-gold = 2.8:1 WCAG fail
                //  - destructive CTA always has WHITE text (#FFFFFF) — terracotta-on-cream
                //    is 3.9:1 (WCAG fail at 14pt), pure white pushes contrast to 5.6:1
                // The destructive→textInverse fallthrough that lived here was a copy-paste
                // bug (both branches returned textInverse). The modal-screens.jsx spec
                // explicitly hardcodes #fff for the destructive button text.
                const btnTextColor = isPrimary
                  ? (isDestructive ? '#FFFFFF' : t.textInverse)
                  : t.textSub;
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      close();
                      b.onPress?.();
                    }}
                    style={({ pressed }) => [
                      styles.btn,
                      { backgroundColor: btnBg },
                      btnBorder ? { borderWidth: 1, borderColor: btnBorder } : null,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        { color: btnTextColor },
                      ]}
                    >
                      {b.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </Animated.View>
      </Modal>
    </Ctx.Provider>
  );
}

// Module-scope handle, set by the bridge component below. Used by
// installAppAlert() to forward Alert.alert calls without going through React
// context (Alert.alert can be called from anywhere, including outside the
// component tree, e.g. axios interceptors).
let _global: ModalContextValue | null = null;

export function _AppModalGlobalBridge() {
  const m = useAppModal();
  React.useEffect(() => {
    _global = m;
    return () => {
      _global = null;
    };
  }, [m]);
  return null;
}

let _installed = false;

/**
 * Patch RN.Alert.alert once at boot. Idempotent — guarded by `_installed`
 * so React Fast Refresh doesn't double-wrap.
 */
export function installAppAlert(): void {
  if (_installed) return;
  _installed = true;
  const original = Alert.alert.bind(Alert);
  Alert.alert = ((
    title?: string,
    message?: string,
    buttons?: ModalButton[],
    options?: { cancelable?: boolean; onDismiss?: () => void } | null,
  ) => {
    if (!_global) {
      original(title as string, message, buttons as never, options as never);
      return;
    }
    // Forward the RN.Alert options shape so the patched modal matches the
    // original API contract — losing `cancelable: false` on a forced-
    // re-login dialog would let the user scrim-tap past it.
    _global.show({
      title,
      message,
      buttons,
      cancelable: options?.cancelable,
      onDismiss: options?.onDismiss,
    });
  }) as typeof Alert.alert;
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: T.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: T.surfaceHi,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.lineStrong,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 20 },
      },
      android: { elevation: 24 },
    }),
  },
  head: {
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 12,
    alignItems: 'center',
    gap: 14,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    color: T.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    paddingHorizontal: 24,
    paddingBottom: 18,
    color: T.textSub,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: T.line,
    gap: 8,
  },
  btn: {
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: T.accent },
  btnDanger: { backgroundColor: T.danger },
  btnGhost: { borderWidth: 1, borderColor: T.line, backgroundColor: 'transparent' },
  btnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.2 },
  btnTextPrimary: { color: '#1A1208' },
  btnTextDanger: { color: '#FFFFFF' },
  btnTextGhost: { color: T.textSub },
});
