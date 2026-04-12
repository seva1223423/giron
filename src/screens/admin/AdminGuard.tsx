/**
 * AdminGuard — two-layer protection for admin screens
 *
 * Layer 1: Role check — user.role must be 'admin' or 'support' (client-side fast gate).
 *          The real enforcement is server-side (requireAdmin middleware + JWT + DB query),
 *          but this prevents accidental navigation and gives a clean UX.
 *
 * Layer 2 (requireVerified): PIN prompt — admin must enter a 6-digit PIN stored in
 *          AsyncStorage (set via ProfileScreen → Admin entry). Session flag is stored
 *          in memory so they only enter it once per app session.
 *          This adds friction against physical device access (e.g., unlocked phone).
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store';

const ADMIN_PIN_KEY = 'iron_gym_admin_pin';
// In-memory flag — cleared when the app process restarts (e.g. force quit)
let sessionVerified = false;

interface Props {
  children: React.ReactNode;
  requireVerified?: boolean; // deeper screens skip the PIN prompt if already verified this session
}

export const AdminGuard: React.FC<Props> = ({ children, requireVerified = false }) => {
  const { user } = useAuthStore();
  const [pinStored, setPinStored] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<'enter' | 'confirm'>('enter');
  const [setupFirst, setSetupFirst] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Role check — immediate, synchronous
  const isAllowed = user?.role === 'admin' || user?.role === 'support';

  useEffect(() => {
    AsyncStorage.getItem(ADMIN_PIN_KEY).then((pin) => {
      setPinStored(pin);
      setLoaded(true);
    }).catch(() => {
      setLoaded(true); // fail open so screen doesn't hang on spinner
    });
  }, []);

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
            value={input}
            onChangeText={(t) => { setInput(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            placeholder="••••••"
            placeholderTextColor="#4B5563"
            autoFocus
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
                  AsyncStorage.setItem(ADMIN_PIN_KEY, input).then(() => {
                    setPinStored(input);
                    sessionVerified = true;
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
    const verify = () => {
      if (input === pinStored) {
        sessionVerified = true;
        setInput('');
        setError('');
      } else {
        setError('Неверный PIN-код');
        setInput('');
        inputRef.current?.focus();
      }
    };

    return (
      <View style={styles.pinContainer}>
        <Text style={styles.pinTitle}>Панель администратора</Text>
        <Text style={styles.pinSub}>Введите PIN-код для входа</Text>

        <TextInput
          ref={inputRef}
          style={styles.pinInput}
          value={input}
          onChangeText={(t) => { setInput(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          placeholder="••••••"
          placeholderTextColor="#4B5563"
          autoFocus
          onSubmitEditing={verify}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.pinBtn, input.length !== 6 && styles.pinBtnDisabled]}
          disabled={input.length !== 6}
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
                    AsyncStorage.removeItem(ADMIN_PIN_KEY);
                    setPinStored(null);
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
