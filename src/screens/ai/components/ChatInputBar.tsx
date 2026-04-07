import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useThemeStore } from '../../../store';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  value: string;
  onChange: (text: string) => void;
  isTyping: boolean;
  onSend: () => void;
}

export const ChatInputBar: React.FC<Props> = ({ value, onChange, isTyping, onSend }) => {
  const { colors } = useThemeStore();
  const canSend = !!value.trim() && !isTyping;

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
      <TextInput
        style={[styles.input, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
        value={value}
        onChangeText={onChange}
        placeholder="Спроси что-нибудь..."
        placeholderTextColor={colors.inputPlaceholder}
        multiline
        maxLength={2000}
      />
      <TouchableOpacity
        onPress={onSend}
        disabled={!canSend}
        style={[styles.sendBtn, { backgroundColor: canSend ? colors.primary : colors.inputBackground }]}
      >
        <Text style={{ color: canSend ? '#FFF' : colors.textTertiary, fontSize: 18, fontWeight: '700' }}>↑</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: 1, paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: borderRadius.xl, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 16, marginRight: spacing.sm },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
