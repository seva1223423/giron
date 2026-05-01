/**
 * AdminGuard — two-layer protection for admin screens
 *
 * Layer 1: Role check — user.role must be 'admin' or 'support' (client-side fast gate).
 *          The real enforcement is server-side (requireAdmin middleware + JWT + DB query),
 *          but this prevents accidental navigation and gives a clean UX.
 *
 * Layer 2 (requireVerified): PIN prompt — admin must enter a 6-digit PIN stored in
 *          SecureStore (set via ProfileScreen → Admin entry). Session flag is stored
 *          in memory so they only enter it once per app session.
 *          This adds friction against physical device access (e.g., unlocked phone).
 *
 * Brute-force protection: 5 wrong attempts → 60-second lockout (in-memory, resets on restart).
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../../store';

const ADMIN_PIN_KEY = 'iron_gym_admin_pin';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;
// In-memory flag — cleared when the app process restarts (e.g. force quit).
// Keyed by userId so a re-login or user switch resets the verified state.
const sessionVerifiedByUser: Record<string, boolean> = {};

interface Props {
  children: React.ReactNode;
  requireVerified?: boolean; // deeper screens skip the PIN prompt if already verified this session
}

export const AdminGuard: React.FC<Props> = ({ children, requireVerified = false }) => {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [pinStored, setPinStored] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<'enter' | 'confirm'>('enter');
  const [setupFirst, setSetupFirst] = useState('');
  const inputRef = useRef<TextInput>(null);
  // Brute-force protection (in-memory — resets on app restart, sufficient for this use case)
  const failedAttempts = useRef(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  // Re-render trigger when sessionVerifiedByUser changes (module-level, can't observe directly)
  const [, forceUpdate] = useState(0);

  // Role check — immediate, synchronous
  const isAllowed = user?.role === 'admin' || user?.role === 'support';
  const sessionVerified = !!userId && !!sessionVerifiedByUser[userId];

  useEffect(() => {
    // Reset PIN state when user changes (logout/re-login)
    setPinStored(null);
    setLoaded(false);
    SecureStore.getItemAsync(ADMIN_PIN_KEY).then((pin) => {
      setPinStored(pin);
      setLoaded(true);
    }).catch(() => {
      // Fail CLOSED on SecureStore error — show "unable to verify" rather than
      // letting anyone past the PIN gate if keystore is unavailable.
      setPinStored('__unavailable__');
      setLoaded(true);
    });
  }, [userId]);

  // Tick state drives countdown display without mutating lockedUntil
  const [, setTick] = useState(0);
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => {
      if (lockedUntil <= Date.now()) {
        setLockedUntil(0);
        clearInterval(id);
      } else {
        setTick((t) => t + 1); // force re-render to refresh countdown
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" size="large" />
      </View>
    );
  }

  // Role gate
  if (!isAllowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.deny}>⛔</Text>
        <Text style={styles.denyTitle}>Доступ запрещён</Text>
        <Text style={styles.denySub}>Эта область доступна только администраторам.</Text>
      </View>
    );
  }

  // Deep screens (requireVerified=true) need PIN verified this session
  if (requireVerified && !sessionVerified) {
    // If no PIN set yet — show setup flow on the Dashboard first
    // This guard just shows a blocking placeholder until Dashboard verifies
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" />
        <Text style={styles.denySub}>Подтвердите личность на главной странице администратора.</Text>
      </View>
    );
  }

  // Dashboard (requireVerified=false) — handle PIN setup / verification
  if (!requireVerified && !sessionVerified) {
    // No PIN configured yet — show setup
    if (!pinStored) {
      return (
        <View style={styles.pinContainer}>
          <Text style={styles.pinTitle}>Установить PIN-код администратора</Text>
          <Text style={styles.pinSub}>
            {setupStep === 'enter'
              ? 'Придумайте 6-значный PIN для защиты панели администратора.'
              : 'Введите PIN ещё раз для подтверждения.'}
          </Text>

          <TextInput
            ref={inputRef}
            style={styles.pinInput}
            allowFontScaling={false}
            value={input}
            onChangeText={(t) => { setInput(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            placeholder="••••••"
            placeholderTextColor="#4B5563"
            autoFocus
            accessibilityLabel="6-значный PIN-код"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.pinBtn, input.length !== 6 && styles.pinBtnDisabled]}
            disabled={input.length !== 6}
            onPress={() => {
              if (setupStep === 'enter') {
                setSetupFirst(input);
                setInput('');
                setSetupStep('confirm');
              } else {
                if (input === setupFirst) {
                  SecureStore.setItemAsync(ADMIN_PIN_KEY, input).then(() => {
                    setPinStored(input);
                    sessionVerifiedByUser[userId] = true;
                    forceUpdate((n) => n + 1);
                    setInput('');
                  }).catch(() => {});
                } else {
                  setError('PIN-коды не совпадают. Попробуйте снова.');
                  setInput('');
                  setSetupStep('enter');
                  setSetupFirst('');
                }
              }
            }}
          >
            <Text style={styles.pinBtnText}>
              {setupStep === 'enter' ? 'Далее' : 'Сохранить PIN'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // PIN configured — ask for it
    const now = Date.now();
    const isLocked = lockedUntil > now;
    const lockSecondsLeft = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;

    const verify = () => {
      if (isLocked) return;
      if (pinStored === '__unavailable__') {
        setError('Не удалось открыть защищённое хранилище. Перезапустите приложение.');
        return;
      }
      if (input === pinStored) {
        sessionVerifiedByUser[userId] = true;
        forceUpdate((n) => n + 1);
        failedAttempts.current = 0;
        setInput('');
        setError('');
      } else {
        failedAttempts.current += 1;
        const remaining = MAX_PIN_ATTEMPTS - failedAttempts.current;
        if (failedAttempts.current >= MAX_PIN_ATTEMPTS) {
          failedAttempts.current = 0;
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setError(`Слишком много попыток. Подождите ${LOCKOUT_SECONDS} секунд.`);
        } else {
          setError(`Неверный PIN-код. Осталось попыток: ${remaining}`);
        }
        setInput('');
        inputRef.current?.focus();
      }
    };

    return (
      <View style={styles.pinContainer}>
        <Text style={styles.pinTitle}>Панель администратора</Text>
        <Text style={styles.pinSub}>{isLocked ? `Доступ заблокирован. Подождите ${lockSecondsLeft} с.` : 'Введите PIN-код для входа'}</Text>

        <TextInput
          ref={inputRef}
          style={[styles.pinInput, isLocked && { opacity: 0.4 }]}
          allowFontScaling={false}
          value={input}
          onChangeText={(t) => { if (!isLocked) { setInput(t.replace(/\D/g, '').slice(0, 6)); setError(''); } }}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          placeholder="••••••"
          placeholderTextColor="#4B5563"
          autoFocus
          accessibilityLabel="6-значный PIN-код для разблокировки админ-панели"
          editable={!isLocked}
          onSubmitEditing={verify}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.pinBtn, (input.length !== 6 || isLocked) && styles.pinBtnDisabled]}
          disabled={input.length !== 6 || isLocked}
          onPress={verify}
        >
          <Text style={styles.pinBtnText}>Войти</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resetLink}
          onPress={() => {
            Alert.alert(
              'Сбросить PIN?',
              'Это потребует создания нового PIN-кода. Продолжить?',
              [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Сбросить',
                  style: 'destructive',
                  onPress: () => {
                    SecureStore.deleteItemAsync(ADMIN_PIN_KEY).catch(() => {});
                    setPinStored(null);
                    failedAttempts.current = 0;
                    setLockedUntil(0);
                    setInput('');
                    setSetupStep('enter');
                    setSetupFirst('');
                    setError('');
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.resetLinkText}>Забыли PIN?</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0F0F0F', justifyContent: 'center', alignItems: 'center', padding: 32 },
  deny: { fontSize: 48, marginBottom: 16 },
  denyTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 8 },
  denySub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },

  pinContainer: {
    flex: 1, backgroundColor: '#0F0F0F', justifyContent: 'center',
    alignItems: 'center', padding: 32,
  },
  pinTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  pinSub: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 32, lineHeight: 20 },

  pinInput: {
    backgroundColor: '#1C1C1E', borderRadius: 16, borderWidth: 1.5, borderColor: '#374151',
    // 6-digit PIN: fontSize matches typography.h2 (28pt). letterSpacing
    // 12 spaces dots/digits visibly. allowFontScaling=false on the
    // TextInput prevents AX5 (310%) Dynamic Type from blowing this past
    // the 320pt iPhone SE width.
    color: '#FFFFFF', fontSize: 28, letterSpacing: 12, textAlign: 'center',
    paddingVertical: 18, paddingHorizontal: 32, width: '100%', marginBottom: 12,
  },

  pinBtn: {
    backgroundColor: '#6366F1', borderRadius: 14, paddingVertical: 16,
    paddingHorizontal: 48, marginTop: 8, width: '100%', alignItems: 'center',
  },
  pinBtnDisabled: { opacity: 0.4 },
  pinBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  errorText: { color: '#EF4444', fontSize: 13, marginBottom: 8 },

  resetLink: { marginTop: 24 },
  resetLinkText: { color: '#6B7280', fontSize: 13, textDecorationLine: 'underline' },
});
