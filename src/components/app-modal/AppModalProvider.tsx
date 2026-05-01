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

// Direction A tokens, mirrored from canvas/src/tokens.js. Kept inline so this
// component stays self-contained — anyone copying the file into another RN
// project gets the look without dragging the theme module along.
export const IronGymTheme = {
  bg: '#0E0E0F',
  surface: '#17171A',
  surfaceHi: '#1E1E22',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  text: '#F4F1EA',
  textSub: '#A8A49C',
  textDim: '#6B6860',
  accent: '#D4B07A',
  accent2: '#8E6B3E',
  good: '#9AC28C',
  warn: '#E8A36A',
  danger: '#E07A6B',
  scrim: 'rgba(0,0,0,0.62)',
} as const;

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

  if (hasDestructive) return 'destructive';
  if (/удал|отмен|выйти|сброс|очист|закрыть тикет/.test(blob)) return 'destructive';
  if (/ошиб|не удалось|нет доступа|тайм-аут|неверн|истек/.test(blob)) {
    if (/истек/.test(blob)) return 'info';
    return 'error';
  }
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

const ICON_MAP: Record<ModalKind, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  error: { name: 'alert-circle', color: T.danger },
  success: { name: 'checkmark-circle', color: T.good },
  info: { name: 'information-circle', color: T.accent },
  confirm: { name: 'shield-checkmark', color: T.accent },
  destructive: { name: 'trash', color: T.danger },
};

function ModalIcon({ kind }: { kind: ModalKind }) {
  const { name, color } = ICON_MAP[kind] ?? ICON_MAP.info;
  return (
    <View style={[styles.iconRing, { borderColor: color, backgroundColor: color + '1A', shadowColor: color }]}>
      <Ionicons name={name} size={28} color={color} />
    </View>
  );
}

export function AppModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ShowOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  const close = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.96, duration: 140, useNativeDriver: true }),
    ]).start(() => setState(null));
  }, [opacity, scale]);

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

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal
        visible={!!state}
        transparent
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
      >
        <Animated.View style={[styles.scrim, { opacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              const cancel = buttons.find((b) => b?.style === 'cancel');
              cancel?.onPress?.();
              close();
            }}
          />
          <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
            <View style={styles.head}>
              <ModalIcon kind={kind} />
              {!!state?.title && <Text style={styles.title}>{state.title}</Text>}
            </View>

            {!!state?.message && <Text style={styles.message}>{state.message}</Text>}

            <View style={styles.actions}>
              {buttons.slice(0, 3).map((b, i) => {
                const isPrimary = i === buttons.length - 1 && b.style !== 'cancel';
                const isDestructive = b.style === 'destructive' || (isPrimary && kind === 'destructive');
                const isCancel = b.style === 'cancel';
                return (
                  <Pressable
                    key={i}
                    onPress={() => {
                      close();
                      b.onPress?.();
                    }}
                    style={({ pressed }) => [
                      styles.btn,
                      isPrimary && (isDestructive ? styles.btnDanger : styles.btnPrimary),
                      isCancel && styles.btnGhost,
                      !isPrimary && !isCancel && styles.btnGhost,
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnText,
                        isPrimary && (isDestructive ? styles.btnTextDanger : styles.btnTextPrimary),
                        (isCancel || (!isPrimary && !isCancel)) && styles.btnTextGhost,
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
  Alert.alert = ((title?: string, message?: string, buttons?: ModalButton[], options?: unknown) => {
    if (!_global) {
      original(title as string, message, buttons as never, options as never);
      return;
    }
    _global.show({ title, message, buttons });
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
