import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useThemeStore } from '../../../store';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

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
}

export const ChatInputBar: React.FC<Props> = ({ value, onChange, isStreaming, isTyping, onSend, onStop }) => {
  const { colors } = useThemeStore();
  // While streaming we want the stop button enabled even without input text —
  // canSend would otherwise lock the button out.
  const canSend = !!value.trim() && !isTyping && !isStreaming;
  const showStop = (isStreaming || isTyping) && !!onStop;

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <TextInput
        style={[
          styles.input,
          typography.body,
          { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder="Спроси что-нибудь..."
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        maxLength={2000}
      />
      {showStop ? (
        <TouchableOpacity
          onPress={onStop}
          style={[styles.sendBtn, { backgroundColor: colors.error }]}
          accessibilityLabel="Остановить ответ"
        >
          <View style={[styles.stopSquare, { backgroundColor: colors.textInverse }]} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onSend}
          disabled={!canSend}
          style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.inputBackground }]}
          accessibilityLabel="Отправить сообщение"
        >
          <Icon name="send" size={20} color={canSend ? colors.textInverse : colors.textTertiary} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: borderRadius.xl, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginRight: spacing.sm },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 12, height: 12, borderRadius: 2 },
});
