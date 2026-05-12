import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { AchievementSticker } from '../../../components/Sticker';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { ACHIEVEMENT_DEFINITIONS, Achievement } from '../../../utils/achievements';

interface AchievementsTabProps {
  colors: any;
  achievements: Achievement[];
  unlockedCount: number;
}

export const AchievementsTab: React.FC<AchievementsTabProps> = ({ colors, achievements, unlockedCount }) => (
  <>
    <FadeIn delay={0}>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        {/* Replaced unicode glyph `◉` (banned per CLAUDE.md brand contract) with a
            branded trophy sticker — same role: header anchor. */}
        <AchievementSticker
          achievement={{ id: 'big3_300', category: 'strength', unlocked: true }}
          size={56}
        />
        <Text style={[typography.h3, { color: colors.text, marginTop: spacing.md }]}>
          Достижения
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
          {unlockedCount} из {ACHIEVEMENT_DEFINITIONS.length} получено
        </Text>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.accent,
                width: `${(unlockedCount / ACHIEVEMENT_DEFINITIONS.length) * 100}%` as any,
              },
            ]}
          />
        </View>
      </View>
    </FadeIn>
    {(['workout', 'strength', 'streak', 'exploration', 'nutrition'] as const).map((cat) => {
      const catAchievements = achievements.filter((a) => a.category === cat);
      const catLabels: Record<string, string> = {
        workout: 'Тренировки',
        strength: 'Сила',
        streak: 'Серии',
        exploration: 'Разнообразие',
        nutrition: 'Питание',
      };
      return (
        <FadeIn key={cat} delay={80}>
          <Text
            style={[
              typography.h4,
              { color: colors.text, marginBottom: spacing.md, marginTop: spacing.lg },
            ]}
          >
            {catLabels[cat]}
          </Text>
          {catAchievements.map((a) => (
            <Card key={a.id} style={{ marginBottom: spacing.sm, opacity: a.unlocked ? 1 : 0.55 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                {/* The sticker carries its own colour & ring per design; we
                    no longer need a coloured circle around it. Just give it
                    a 48pt slot so layout doesn't shift between unlocked and
                    locked rows. */}
                <View style={styles.stickerSlot}>
                  <AchievementSticker achievement={a} size={48} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      typography.bodySemibold,
                      { color: a.unlocked ? colors.text : colors.textSecondary },
                    ]}
                  >
                    {a.title}
                  </Text>
                  <Text
                    style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}
                  >
                    {a.description}
                  </Text>
                  {!a.unlocked && a.progress !== undefined && (
                    <>
                      <View
                        style={{
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: colors.border,
                          marginTop: spacing.sm,
                        }}
                      >
                        <View
                          style={{
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: colors.accent,
                            width: `${a.progress * 100}%` as any,
                          }}
                        />
                      </View>
                      <Text
                        style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}
                      >
                        {a.progressLabel}
                      </Text>
                    </>
                  )}
                </View>
                {a.unlocked && <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success }}>✓</Text>}
              </View>
            </Card>
          ))}
        </FadeIn>
      );
    })}
  </>
);

const styles = StyleSheet.create({
  progressBar: {
    height: 6,
    borderRadius: 3,
    width: '70%',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  stickerSlot: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
