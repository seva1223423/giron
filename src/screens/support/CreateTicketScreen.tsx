import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSupportStore } from '../../store/useSupportStore';
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
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Тема обращения</Text>
        <TextInput
          style={styles.input}
          placeholder="Кратко опишите проблему"
          placeholderTextColor="#6B7280"
          value={subject}
          onChangeText={setSubject}
          maxLength={100}
        />

        <Text style={styles.sectionLabel}>Категория</Text>
        <View style={styles.categories}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.value}
              style={[styles.categoryBtn, category === c.value && styles.categoryBtnActive]}
              onPress={() => setCategory(c.value)}
              activeOpacity={0.7}
            >
              <Text style={styles.categoryIcon}>{c.icon}</Text>
              <Text style={[styles.categoryLabel, category === c.value && styles.categoryLabelActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Описание</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Подробно опишите проблему или вопрос..."
          placeholderTextColor="#6B7280"
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          maxLength={2000}
        />
        <Text style={styles.charCount}>{message.length} / 2000</Text>

        <TouchableOpacity
          style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={sending}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator color="#FFFFFF" />
            : <Text style={styles.submitText}>Отправить обращение</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 24, marginBottom: 10 },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
  },
  textarea: { minHeight: 120, paddingTop: 14 },
  charCount: { fontSize: 12, color: '#6B7280', textAlign: 'right', marginTop: 6 },
  categories: { gap: 8 },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 12,
  },
  categoryBtnActive: { borderColor: '#D4B07A', backgroundColor: '#1E1E2E' },
  categoryIcon: { fontSize: 20 },
  categoryLabel: { fontSize: 15, color: '#9CA3AF', flex: 1 },
  categoryLabelActive: { color: '#FFFFFF', fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#D4B07A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
