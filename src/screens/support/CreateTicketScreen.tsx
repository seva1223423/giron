import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSupportStore } from '../../store/useSupportStore';
import { useThemeColors } from '../../store';
import { typography } from '../../theme';
import type { TicketCategory } from '../../types';

type RootStackParamList = {
  SupportTicketScreen: { ticketId: string };
};
type Nav = NativeStackNavigationProp<RootStackParamList>;

const CATEGORIES: { value: TicketCategory; label: string; icon: string }[] = [
  { value: 'technical', label: 'Технический вопрос', icon: '⚙️' },
  { value: 'billing', label: 'Оплата / подписка', icon: '💳' },
  { value: 'account', label: 'Аккаунт', icon: '👤' },
  { value: 'bug', label: 'Ошибка в приложении', icon: '🐛' },
  { value: 'feature_request', label: 'Предложение', icon: '💡' },
  { value: 'other', label: 'Другое', icon: '📝' },
];

export default function CreateTicketScreen() {
  const navigation = useNavigation<Nav>();
  const colors = useThemeColors();
  const { createTicket, sending } = useSupportStore();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('technical');
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (sending) return;
    const trimSubject = subject.trim();
    const trimMessage = message.trim();
    if (!trimSubject) { Alert.alert('Укажите тему обращения'); return; }
    if (trimMessage.length < 10) { Alert.alert('Опишите проблему подробнее (минимум 10 символов)'); return; }

    try {
      const ticket = await createTicket({ subject: trimSubject, category, message: trimMessage });
      navigation.replace('SupportTicketScreen', { ticketId: ticket.id });
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать обращение. Попробуйте ещё раз.');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Тема обращения</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
          placeholder="Кратко опишите проблему"
          placeholderTextColor={colors.inputPlaceholder}
          value={subject}
          onChangeText={setSubject}
          maxLength={100}
          accessibilityLabel="Тема обращения"
        />

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Категория</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((c) => {
            const selected = category === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                style={[
                  styles.categoryBtn,
                  {
                    backgroundColor: selected ? colors.surfaceElevated : colors.surface,
                    borderColor: selected ? colors.primary : 'transparent',
                  },
                ]}
                onPress={() => setCategory(c.value)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={c.label}
              >
                <Text style={styles.categoryIcon}>{c.icon}</Text>
                <Text
                  style={[
                    styles.categoryLabel,
                    { color: selected ? colors.text : colors.textSecondary, fontWeight: selected ? '600' : '400' },
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Описание</Text>
        <TextInput
          style={[styles.input, styles.textarea, { backgroundColor: colors.surface, color: colors.text }]}
          placeholder="Подробно опишите проблему или вопрос..."
          placeholderTextColor={colors.inputPlaceholder}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          maxLength={2000}
          accessibilityLabel="Описание проблемы"
        />
        <Text style={[styles.charCount, { color: colors.textTertiary }]}>{message.length} / 2000</Text>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.primary }, sending && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={sending}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Отправить обращение"
          accessibilityState={{ disabled: sending, busy: sending }}
        >
          {sending
            ? <ActivityIndicator color={colors.textInverse} />
            : <Text style={[styles.submitText, { color: colors.textInverse }]}>Отправить обращение</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Colours and text styles come from the theme at the usage sites. This screen
// previously imported neither: it hardcoded a black background, greys from a
// palette the app no longer uses, and six arbitrary font sizes — so the whole
// feedback flow rendered black-on-black in light mode and had no accessibility
// props at all (audit R22).
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: { ...typography.captionMedium, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 10 },
  input: {
    ...typography.body,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  textarea: { minHeight: 120, paddingTop: 14 },
  charCount: { ...typography.caption, textAlign: 'right', marginTop: 6 },
  categories: { gap: 8 },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  categoryIcon: { fontSize: 20 },
  categoryLabel: { ...typography.body, flex: 1 },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { ...typography.bodySemibold },
});
