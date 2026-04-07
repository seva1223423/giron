import React from 'react';
import { Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

const DAILY_QUOTES = [
  { text: 'Штанга не знает сколько ты устал. Она знает только сколько ты поднял.', author: 'Iron Coach' },
  { text: 'Прогресс — это не прямая линия. Это серпантин в гору.', author: 'Iron Coach' },
  { text: 'Дисциплина — это выбор между тем чего ты хочешь сейчас и тем чего хочешь по-настоящему.', author: 'Iron Coach' },
  { text: 'Тело всегда слушается мозга. Натренируй оба.', author: 'Iron Coach' },
  { text: 'Каждый профессионал когда-то был новичком, который не бросил.', author: 'Iron Coach' },
  { text: 'Мышцы не растут во время тренировки. Они растут пока ты спишь и ешь правильно.', author: 'Спортивная наука' },
  { text: 'Не ищи мотивацию. Создавай дисциплину. Мотивация уйдёт — дисциплина останется.', author: 'Iron Coach' },
  { text: 'Слабые моменты строят сильных людей.', author: 'Iron Coach' },
  { text: 'Каждый день маленький шаг вперёд — через год ты не узнаешь себя.', author: 'Iron Coach' },
  { text: 'Сравнивай себя только с собой вчерашним.', author: 'Iron Coach' },
  { text: 'Боль от тренировки временна. Гордость от результата навсегда.', author: 'Iron Coach' },
  { text: 'Ты не проигрываешь. Ты либо выигрываешь, либо учишься.', author: 'Iron Coach' },
  { text: 'Когда ты думаешь что достиг предела — ты использовал только 40% своих возможностей.', author: 'Iron Coach' },
  { text: 'Тело достигает того, что задумал разум.', author: 'Iron Coach' },
  { text: 'Нет плохих тренировок. Есть только тренировки которые ты не сделал.', author: 'Iron Coach' },
  { text: 'Каждый подход — это голосование за того человека которым ты хочешь стать.', author: 'Iron Coach' },
  { text: 'Восстановление — часть тренировки. Пренебрегать им — значит тренироваться неправильно.', author: 'Спортивная наука' },
  { text: 'Великие результаты требуют великого отношения к базовым вещам: сон, белок, объём.', author: 'Спортивная наука' },
  { text: 'Сила — это не только мышцы. Это привычка не отступать.', author: 'Iron Coach' },
  { text: 'Начни там где ты есть. Используй то что имеешь. Делай что можешь.', author: 'Iron Coach' },
  { text: 'Тренировка без цели — это просто усталость. Тренировка с целью — инвестиция.', author: 'Iron Coach' },
  { text: 'Гравитация одинакова для всех. Работа со штангой — честный бизнес.', author: 'Iron Coach' },
  { text: 'Никогда не пропускай понедельник. И среду. И пятницу.', author: 'Iron Coach' },
  { text: 'Тело — это долгосрочный проект. Не спринт.', author: 'Iron Coach' },
  { text: 'Лучшая программа — та, которой ты придерживаешься. Лучшая диета — тоже.', author: 'Спортивная наука' },
  { text: 'Страдания сейчас, преимущество потом.', author: 'Iron Coach' },
  { text: 'Тренировки не делают тебя лучше. Восстановление после тренировок — делает.', author: 'Спортивная наука' },
  { text: 'Маленький прогресс каждый день складывается в большие результаты.', author: 'Iron Coach' },
  { text: 'Делай сложное пока оно не стало лёгким.', author: 'Iron Coach' },
  { text: 'Подними больше. Спи дольше. Ешь лучше. Повтори.', author: 'Iron Coach' },
];

function getDailyQuote() {
  const start = new Date(2024, 0, 1).getTime();
  const dayIndex = Math.floor((Date.now() - start) / 86400000);
  return DAILY_QUOTES[dayIndex % DAILY_QUOTES.length];
}

export const DailyQuoteCard: React.FC = () => {
  const { colors } = useThemeStore();
  const quote = getDailyQuote();

  return (
    <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '08' }}>
      <Text style={[typography.captionMedium, { color: colors.primary, marginBottom: spacing.sm }]}>
        ЦИТАТА ДНЯ
      </Text>
      <Text style={[typography.body, { color: colors.text, fontStyle: 'italic', lineHeight: 22 }]}>
        "{quote.text}"
      </Text>
      <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.sm }]}>
        — {quote.author}
      </Text>
    </Card>
  );
};
