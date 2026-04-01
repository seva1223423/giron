import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Modal, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../store';
import { Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { NewsArticle, NewsCategory } from '../../types';
import { newsService, getApiError } from '../../services';

const CATEGORIES: { key: NewsCategory | 'all' | 'saved'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'saved', label: '🔖 Сохранённые' },
  { key: 'russian', label: 'Россия' },
  { key: 'powerlifting', label: 'Силовые' },
  { key: 'records', label: 'Рекорды' },
  { key: 'championships', label: 'Чемпионаты' },
  { key: 'club', label: 'Клуб' },
];

// Fallback data when server is unavailable
const FALLBACK_NEWS: NewsArticle[] = [
  {
    id: '1',
    title: 'Юрий Белкин установил новый мировой рекорд в становой тяге',
    summary: 'На чемпионате WRPF Юрий Белкин поднял 440 кг в категории до 110 кг, побив свой прежний рекорд. Выступление прошло в Москве при полных трибунах.',
    content: 'На прошедшем в Москве чемпионате WRPF Юрий Белкин совершил то, что многие считали невозможным — поднял 440 кг в становой тяге в весовой категории до 110 кг.\n\nПопытка прошла безупречно: Белкин уверенно зафиксировал штангу и получил три белых флага от судей. Предыдущий мировой рекорд составлял 432.5 кг и принадлежал ему же.\n\n«Я готовился к этому подъёму шесть месяцев. Программа была полностью перестроена под этот рекорд», — сказал атлет после взвешивания.\n\nЗал встретил рекорд стоячими овациями. Белкин — один из лучших пауэрлифтеров России, неоднократный чемпион WRPF и абсолютный рекордсмен страны в становой тяге.',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-30T10:00:00Z',
    isSaved: false,
  },
  {
    id: '2',
    title: 'Рекорд дня: Жим лёжа 200 кг в категории 82.5 кг',
    summary: 'Российский атлет Дмитрий Иноземцев выжал 200 кг на соревнованиях IPF в Москве. Результат засчитан с тремя белыми флагами.',
    content: 'На открытых соревнованиях IPF в Москве Дмитрий Иноземцев установил новый рекорд России в жиме лёжа в весовой категории 82.5 кг — 200 кг.\n\nЭто знаковое достижение: двести килограммов в относительно лёгкой весовой категории — результат, который доступен единицам в мире. Иноземцев шёл к этой отметке три года.\n\nСтарт был заявлен с 190 кг (первый подход), затем 197.5 кг (второй подход) и финальные 200 кг. Все три подхода засчитаны чисто.\n\n«Тренировал жим по методу Шейко последние два года. Результаты говорят сами за себя», — рассказал атлет в интервью после турнира.',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-29T14:00:00Z',
    isSaved: false,
  },
  {
    id: '3',
    title: 'Чемпионат России по пауэрлифтингу 2026: итоги',
    summary: 'Подводим итоги главного национального турнира — 12 новых рекордов страны, 8 регионов-призёров, более 300 участников из 62 городов.',
    content: 'Чемпионат России по пауэрлифтингу 2026 прошёл в Москве и собрал рекордные 312 участников из 62 городов страны. По итогам турнира обновлено 12 рекордов страны.\n\n🏆 Главные результаты:\n\n— Антон Плесецкий (93 кг): сумма 820 кг без экипировки — новый рекорд России\n— Виктория Соловьёва (63 кг): жим лёжа 122.5 кг — рекорд страны среди женщин\n— Алексей Громов (120+ кг): становая тяга 382.5 кг\n\n🥇 Командный зачёт:\n1. Москва\n2. Санкт-Петербург\n3. Свердловская область\n\nСледующий крупный старт — Кубок России, сентябрь 2026.',
    category: ['russian', 'championships', 'powerlifting'],
    publishedAt: '2026-03-28T09:00:00Z',
    isSaved: false,
  },
  {
    id: '4',
    title: '5 научно обоснованных способов ускорить восстановление',
    summary: 'Разбираем методы восстановления, подтверждённые исследованиями: сон, питание, активное восстановление, ледяные ванны и правильная разминка.',
    content: 'Восстановление — такая же часть тренировочного процесса, как и сами тренировки. Разбираем пять методов с доказанной эффективностью.\n\n1️⃣ Сон (самый важный)\nИсследования показывают, что 8–9 часов сна дают на 20–30% лучший синтез белка по сравнению с 6-часовым сном. Приоритет — стабильный режим.\n\n2️⃣ Белок сразу после тренировки\nАнаболическое окно — не миф. 30–40 г белка в течение 30 минут после тренировки ускоряют восстановление мышечных волокон.\n\n3️⃣ Активное восстановление\n20 минут лёгкого кардио или растяжки на следующий день улучшают кровоток и выводят продукты распада из мышц.\n\n4️⃣ Контрастный душ\nЧередование горячей и холодной воды (3 цикла × 30/30 сек) снижает воспаление и DOMS.\n\n5️⃣ Магний перед сном\n300–400 мг магния цитрата улучшают качество сна и снижают мышечные судороги.',
    category: ['russian'],
    publishedAt: '2026-03-27T12:00:00Z',
    isSaved: false,
  },
  {
    id: '5',
    title: 'Как правильно делать присед: разбор техники',
    summary: 'Детальный разбор биомеханики приседа со штангой от тренера сборной России по пауэрлифтингу. Частые ошибки и способы их устранить.',
    content: 'Присед — фундаментальное силовое упражнение. Неправильная техника ведёт к травмам и снижению результатов. Разбираем ключевые точки.\n\n📍 Стартовое положение\n— Штанга лежит на верхней части трапеции (низкое положение) или на дельтах (высокое)\n— Ноги на ширине плеч или чуть шире, носки развёрнуты 25–35°\n— Хват широкий, локти направлены вниз-назад\n\n📍 Фаза опускания\n— Движение начинается с отведения таза назад и вниз\n— Колени движутся в сторону носков (не внутрь!)\n— Спина сохраняет нейтральное положение\n— Глубина — бёдра параллельно полу или ниже\n\n📍 Фаза подъёма\n— Отталкивайтесь пятками\n— Таз и плечи поднимаются одновременно\n— Не теряйте грудь вперёд при подъёме\n\n❌ Частые ошибки: «пещера» в пояснице, отрыв пяток, падение коленей внутрь, наклон корпуса вперёд.',
    category: ['powerlifting'],
    publishedAt: '2026-03-26T08:00:00Z',
    isSaved: false,
  },
  {
    id: '6',
    title: 'Клубный рекорд побит: присед 250 кг в Iron Gym',
    summary: 'Алексей Громов из нашего клуба установил новый рекорд зала — 250 кг в приседе без снаряжения! Поздравляем чемпиона.',
    content: '',
    category: ['club', 'records'],
    publishedAt: '2026-03-31T18:00:00Z',
    isSaved: false,
  },
  {
    id: '7',
    title: 'Открытый Кубок Москвы по жиму лёжа: результаты',
    summary: 'В Москве прошёл Открытый кубок по жиму лёжа среди любителей. Победитель в абсолюте — Сергей Воронов с результатом 182.5 кг.',
    content: '',
    category: ['russian', 'championships'],
    publishedAt: '2026-03-25T15:00:00Z',
    isSaved: false,
  },
  {
    id: '8',
    title: 'Разбор: периодизация нагрузки для силового атлета',
    summary: 'Линейная, волнообразная, блочная — разбираем три подхода к периодизации и объясняем, какой выбрать в зависимости от уровня и целей.',
    content: 'Периодизация — это плановое изменение нагрузки, интенсивности и объёма тренировок во времени. Без неё прогресс рано или поздно останавливается.\n\n📊 Линейная периодизация\nКаждую неделю нагрузка плавно растёт: начинаем с большого объёма и малым весом, заканчиваем малым объёмом и большим весом. Идеально для новичков — прогресс предсказуем и прост.\n\n📊 Волнообразная периодизация\nНагрузка меняется внутри недели: понедельник — тяжёлый день, среда — средний, пятница — лёгкий. Или нелинейно: каждый микроцикл отличается от предыдущего. Подходит опытным атлетам — тело не адаптируется к одному стимулу.\n\n📊 Блочная периодизация\nТренировочный цикл делится на блоки: накопление (объём), трансформация (интенсивность), реализация (соревновательные веса). Оптимальна для пауэрлифтеров с конкретной датой старта.\n\n💡 Рекомендация: новичкам — линейная, атлетам со стажем 1–2 года — волнообразная, спортсменам с целевым стартом — блочная.',
    category: ['powerlifting'],
    publishedAt: '2026-03-24T11:00:00Z',
    isSaved: false,
  },
  {
    id: '9',
    title: 'Кирилл Сарычев: «Генетика важна, но без труда она ничто»',
    summary: 'Интервью с обладателем мирового рекорда по жиму лёжа. О подготовке, диете, травмах и планах на 2026 год.',
    content: '',
    category: ['russian', 'records'],
    publishedAt: '2026-03-23T09:30:00Z',
    isSaved: false,
  },
  {
    id: '10',
    title: 'Первенство России среди молодёжи: новые имена пауэрлифтинга',
    summary: 'На Первенстве России 2026 сразу 5 молодых атлетов выполнили норматив мастера спорта. Рассказываем о самых ярких выступлениях.',
    content: '',
    category: ['russian', 'championships', 'powerlifting'],
    publishedAt: '2026-03-22T14:00:00Z',
    isSaved: false,
  },
  {
    id: '11',
    title: 'Топ-10 упражнений для развития взрывной силы',
    summary: 'Тренеры ФПРС составили список упражнений для развития взрывной мощи — незаменимы для пауэрлифтеров и спринтеров.',
    content: '',
    category: ['russian', 'powerlifting'],
    publishedAt: '2026-03-21T10:00:00Z',
    isSaved: false,
  },
  {
    id: '12',
    title: 'Клуб Iron Gym проводит открытую тренировку в эти выходные',
    summary: 'Приглашаем всех желающих на открытую тренировку с тренерами клуба. Без ограничений по уровню подготовки. Суббота, 10:00.',
    content: '',
    category: ['club'],
    publishedAt: '2026-03-20T08:00:00Z',
    isSaved: false,
  },
  {
    id: '13',
    title: 'Рекорд России в троеборье без снаряжения обновлён',
    summary: 'Антон Плесецкий набрал сумму 850 кг в категории 93 кг, превысив прежний рекорд страны на 7.5 кг. Выступление прошло в Санкт-Петербурге.',
    content: '',
    category: ['russian', 'records', 'powerlifting'],
    publishedAt: '2026-03-19T16:00:00Z',
    isSaved: false,
  },
  {
    id: '14',
    title: 'Питание для силовых тренировок: белок, углеводы и жиры',
    summary: 'Спортивный нутрициолог сборной России рассказывает, как правильно рассчитать КБЖУ для набора силы без лишнего жира.',
    content: '',
    category: ['russian'],
    publishedAt: '2026-03-18T12:00:00Z',
    isSaved: false,
  },
  {
    id: '15',
    title: 'Новый рекорд зала по становой тяге — 270 кг',
    summary: 'Максим Коваль из Iron Gym установил рекорд клуба в становой тяге — 270 кг. Великолепное достижение после 3 лет тренировок!',
    content: '',
    category: ['club', 'records'],
    publishedAt: '2026-03-17T19:00:00Z',
    isSaved: false,
  },
];

export const NewsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [activeCategory, setActiveCategory] = useState<NewsCategory | 'all' | 'saved'>('all');
  const [news, setNews] = useState<NewsArticle[]>(FALLBACK_NEWS);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);

  const fetchNews = useCallback(async () => {
    try {
      const category = activeCategory === 'all' || activeCategory === 'saved' ? undefined : activeCategory;
      const articles = await newsService.getNews({ category });
      if (articles.length > 0) {
        setNews(articles);
      }
      // Load saved articles
      try {
        const saved = await newsService.getSaved();
        setSavedIds(new Set(saved.map((a) => a.id)));
      } catch {}
    } catch {
      // Keep fallback data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNews();
  };

  const onFetchFreshNews = async () => {
    setRefreshing(true);
    try {
      await newsService.triggerRefresh();
    } catch {
      // ignore — server will have tried its best
    }
    await fetchNews();
  };

  const filteredNews = activeCategory === 'all'
    ? news
    : activeCategory === 'saved'
      ? news.filter((n) => savedIds.has(n.id))
      : news.filter((n) => n.category?.includes(activeCategory as NewsCategory));

  const toggleSave = async (id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    try {
      await newsService.toggleSave(id);
    } catch {
      // Revert on error
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const formatDateFull = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleArticlePress = (article: NewsArticle) => {
    Haptics.selectionAsync();
    setSelectedArticle(article);
  };

  const handleShareArticle = async (article: NewsArticle) => {
    try {
      await Share.share({
        message: `${article.title}\n\n${article.summary}\n\nIron Gym — лучшее фитнес-приложение для зала`,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.md }}>
        <Text style={[typography.h2, { color: colors.text }]}>Новости</Text>
        <TouchableOpacity onPress={onFetchFreshNews} disabled={refreshing}>
          <Text style={[typography.small, { color: refreshing ? colors.textTertiary : colors.primary }]}>
            {refreshing ? 'Обновление...' : '↻ Обновить'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            onPress={() => setActiveCategory(cat.key)}
            style={[
              styles.categoryChip,
              {
                backgroundColor: activeCategory === cat.key ? colors.primary : colors.surface,
                borderColor: activeCategory === cat.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                typography.smallMedium,
                { color: activeCategory === cat.key ? '#FFF' : colors.text },
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Article Detail Modal */}
      <Modal
        visible={selectedArticle !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedArticle(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <TouchableOpacity onPress={() => setSelectedArticle(null)}>
                <Text style={[typography.body, { color: colors.primary }]}>✕ Закрыть</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => selectedArticle && toggleSave(selectedArticle.id)}>
                  <Text style={{ fontSize: 22 }}>
                    {selectedArticle && savedIds.has(selectedArticle.id) ? '🔖' : '📌'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => selectedArticle && handleShareArticle(selectedArticle)}>
                  <Text style={[typography.body, { color: colors.primary }]}>Поделиться</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Category tags */}
              {selectedArticle && (
                <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.sm }}>
                  {(selectedArticle.category || []).map((cat) => (
                    <View key={cat} style={[styles.tag, { backgroundColor: colors.primary + '15' }]}>
                      <Text style={[typography.caption, { color: colors.primary }]}>
                        {CATEGORIES.find((c) => c.key === cat)?.label || cat}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Title */}
              <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>
                {selectedArticle?.title}
              </Text>

              {/* Date */}
              <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.lg }]}>
                {selectedArticle ? formatDateFull(selectedArticle.publishedAt) : ''}
              </Text>

              {/* Summary */}
              <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 22 }]}>
                {selectedArticle?.summary}
              </Text>

              {/* Full content */}
              {selectedArticle?.content ? (
                <Text style={[typography.body, { color: colors.text, lineHeight: 24, marginBottom: spacing.xl }]}>
                  {selectedArticle.content}
                </Text>
              ) : (
                <View style={[styles.tag, { backgroundColor: colors.surface, alignSelf: 'flex-start', paddingVertical: spacing.sm, marginBottom: spacing.xl }]}>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>Полный текст скоро появится</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* News list */}
      <ScrollView
        contentContainerStyle={styles.newsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {loading && news.length === 0 ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.huge }} />
        ) : (
          <>
            {/* Record of the day */}
            {activeCategory !== 'saved' && <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
              <Text style={[typography.captionMedium, { color: colors.accent }]}>РЕКОРД ДНЯ</Text>
              <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
                Присед 350 кг — Андрей Маланичев
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Абсолютный рекорд России в экипировочном пауэрлифтинге
              </Text>
            </Card>}

            {filteredNews.length === 0 && activeCategory === 'saved' && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.huge }}>
                <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🔖</Text>
                <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Пока нет сохранённых статей.{'\n'}Нажми 📌 на любой статье чтобы сохранить.
                </Text>
              </View>
            )}

            {filteredNews.map((article) => (
              <TouchableOpacity
                key={article.id}
                onPress={() => handleArticlePress(article)}
                activeOpacity={0.75}
              >
                <Card style={{ marginBottom: spacing.md }}>
                  <View style={styles.articleHeader}>
                    <View style={styles.categoryTags}>
                      {(article.category || []).map((cat) => (
                        <View
                          key={cat}
                          style={[styles.tag, { backgroundColor: colors.primary + '15' }]}
                        >
                          <Text style={[typography.caption, { color: colors.primary }]}>
                            {CATEGORIES.find((c) => c.key === cat)?.label || cat}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity onPress={() => toggleSave(article.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 20 }}>
                        {savedIds.has(article.id) ? '🔖' : '📌'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[typography.h4, { color: colors.text, marginTop: spacing.sm }]}>
                    {article.title}
                  </Text>
                  <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]} numberOfLines={2}>
                    {article.summary}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md }}>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {formatDate(article.publishedAt)}
                    </Text>
                    {article.content ? (
                      <Text style={[typography.caption, { color: colors.primary }]}>Читать →</Text>
                    ) : null}
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  categories: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  categoryChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  newsList: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.huge,
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryTags: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  tag: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.xl,
    paddingBottom: 48,
    maxHeight: '85%',
  },
});
