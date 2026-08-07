import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { startRecording, stopAndTranscribe, cancelRecording } from '../../../services/voiceService';

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** True while the response is streaming. Toggles the send button to a stop button. */
  isStreaming: boolean;
  /** True while typing indicator is visible (request in flight before first chunk). */
  isTyping: boolean;
  onSend: () => void;
  /** Called when user taps the stop button while streaming. */
  onStop?: () => void;
  /** Optional — when provided, shows a camera button left of the input that
   *  opens the food scanner (Direction A ai-chat-pro input dock). */
  onCamera?: () => void;
}

type VoiceState = 'idle' | 'recording' | 'transcribing';

export const ChatInputBar: React.FC<Props> = ({ value, onChange, isStreaming, isTyping, onSend, onStop, onCamera }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);

  // While recording: tick a counter so the UI shows "0:05" growing, and arm a
  // hard 30s stop — Yandex SpeechKit's "short audio" endpoint caps near 30s, so
  // a longer recording would 4xx anyway. The cleanup cancels the timer the
  // moment voiceState leaves 'recording' (user tapped done / cancel).
  useEffect(() => {
    if (voiceState !== 'recording') return;
    setRecordSeconds(0);
    const tick = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    const hardStop = setTimeout(() => { handleMicPress().catch(() => {}); }, 30_000);
    return () => { clearInterval(tick); clearTimeout(hardStop); };
  }, [voiceState]);

  const canSend = !!value.trim() && !isTyping && !isStreaming;
  const showStop = (isStreaming || isTyping) && !!onStop;
  const showSend = canSend || showStop;

  async function handleMicPress() {
    if (voiceState === 'idle') {
      haptic.medium();
      try {
        await startRecording();
        setVoiceState('recording');
      } catch (e: any) {
        if (e?.message === 'mic-permission-denied') {
          Alert.alert('Нужен доступ к микрофону', 'Разреши микрофон в настройках, чтобы пользоваться голосовым вводом.');
        } else {
          Alert.alert('Ошибка', 'Не удалось начать запись. Попробуй ещё раз.');
        }
      }
      return;
    }
    if (voiceState === 'recording') {
      haptic.medium();
      setVoiceState('transcribing');
      try {
        const { text } = await stopAndTranscribe();
        if (text.trim()) {
          // Append to existing input so the user can refine before sending.
          const next = value.trim() ? `${value.trim()} ${text}` : text;
          onChange(next);
          haptic.light();
        } else {
          Alert.alert('Тишина', 'Ничего не распознал. Попробуй говорить ближе к микрофону.');
        }
      } catch (e: any) {
        const msg = e?.message || '';
        if (msg.includes('too-short')) {
          Alert.alert('Слишком коротко', 'Удерживай микрофон и говори хотя бы полсекунды.');
        } else if (msg.startsWith('stt-failed')) {
          Alert.alert('Голос не распознан', msg.replace('stt-failed: ', '') || 'Попробуй ещё раз.');
        } else if (msg === 'mic-permission-denied') {
          Alert.alert('Нужен доступ к микрофону', 'Разреши микрофон в настройках.');
        } else {
          Alert.alert('Ошибка', 'Не удалось распознать. Попробуй ещё раз.');
        }
      } finally {
        setVoiceState('idle');
      }
    }
  }

  function handleCancelRecord() {
    haptic.light();
    cancelRecording().catch(() => {});
    setVoiceState('idle');
  }

  // While recording: swap the text field for a "● Запись… 0:05" bubble with a
  // cancel (×) on the left and a confirm (✓) on the right that stops + transcribes.
  if (voiceState === 'recording') {
    const mm = String(Math.floor(recordSeconds / 60)).padStart(1, '0');
    const ss = String(recordSeconds % 60).padStart(2, '0');
    return (
      <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          onPress={handleCancelRecord}
          style={[styles.sideBtn, { backgroundColor: colors.inputBackground }]}
          accessibilityLabel="Отменить запись"
          accessibilityRole="button"
        >
          {/* No dedicated "×" glyph in the icon set — a 45°-rotated plus reads
              as a close/cancel cross without adding a new icon. */}
          <View style={{ transform: [{ rotate: '45deg' }] }}>
            <Icon name="plus" size={20} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
        <View style={[styles.recordBubble, { backgroundColor: colors.error + '15', borderColor: colors.error + '50' }]}>
          <View style={[styles.recordDot, { backgroundColor: colors.error }]} />
          <Text style={[typography.body, { color: colors.error, fontWeight: '600' }]}>Запись… {mm}:{ss}</Text>
        </View>
        <TouchableOpacity
          onPress={handleMicPress}
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          accessibilityLabel="Готово, распознать"
          accessibilityRole="button"
        >
          <Icon name="check" size={20} color={colors.textInverse} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      {onCamera && (
        <TouchableOpacity
          onPress={onCamera}
          style={[styles.sideBtn, { backgroundColor: colors.inputBackground }]}
          accessibilityLabel="Сканировать еду по фото"
          accessibilityRole="button"
        >
          <Icon name="camera" size={20} color={colors.primary} />
        </TouchableOpacity>
      )}
      <TextInput
        style={[
          styles.input,
          typography.body,
          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={voiceState === 'transcribing' ? 'Распознаю голос…' : 'Спроси что-нибудь...'}
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        maxLength={2000}
        editable={voiceState !== 'transcribing'}
      />
      {/* Mic — real STT via Yandex SpeechKit. Shown only when the input is empty
          and we're not streaming, so it never crowds the send button. */}
      {!showSend && voiceState !== 'transcribing' && (
        <TouchableOpacity
          onPress={handleMicPress}
          style={[styles.micBtn, { backgroundColor: colors.inputBackground }]}
          accessibilityLabel="Голосовой ввод"
          accessibilityRole="button"
        >
          <Icon name="mic" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
      {showStop ? (
        <TouchableOpacity
          onPress={onStop}
          style={[styles.sendBtn, { backgroundColor: colors.error }]}
          accessibilityLabel="Остановить ответ"
        >
          <View style={[styles.stopSquare, { backgroundColor: colors.textInverse }]} />
        </TouchableOpacity>
      ) : showSend ? (
        <TouchableOpacity
          onPress={onSend}
          disabled={!canSend}
          style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.inputBackground }]}
          accessibilityLabel="Отправить сообщение"
        >
          <Icon name="send" size={20} color={canSend ? colors.textInverse : colors.textTertiary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md, gap: spacing.sm },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: borderRadius.xl, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sideBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  micBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 12, height: 12, borderRadius: 2 },
  recordBubble: { flex: 1, minHeight: 40, borderRadius: borderRadius.xl, borderWidth: 1, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  recordDot: { width: 8, height: 8, borderRadius: 4 },
});
