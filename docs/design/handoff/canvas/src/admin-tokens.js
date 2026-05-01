// Admin design tokens — same graphite + gold language as user app A,
// but tuned for desktop density.
window.ADM_T = {
  bg: '#0B0B0C',
  bgDeep: '#070708',
  surface: '#131316',
  surfaceHi: '#1A1A1E',
  surfaceHov: '#1F1F24',
  line: 'rgba(255,255,255,0.06)',
  lineStrong: 'rgba(255,255,255,0.12)',
  lineActive: 'rgba(212,176,122,0.4)',
  text: '#F4F1EA',
  textSub: '#9C988F',
  textDim: '#5E5B54',
  accent: '#D4B07A',
  accent2: '#8E6B3E',
  accentSoft: 'rgba(212,176,122,0.10)',
  good: '#9AC28C',
  warn: '#E8A36A',
  danger: '#E07A6B',
  info: '#7BA3C2',
  // Plan colors (from real backend tokens)
  planFree: '#6B7280',
  planPro: '#D4B07A',
  planTrainer: '#E8A36A',
  planClub: '#9AC28C',
  fontH: `'GT Sectra', 'Cormorant Garamond', 'Playfair Display', serif`,
  fontB: `'Inter', -apple-system, system-ui, sans-serif`,
  fontM: `'JetBrains Mono', 'SF Mono', monospace`,
};

// Sample admin data — modeled on the real backend types from
// AdminStats / AdminUserSummary / AdminAnalytics.
window.ADM_DATA = {
  stats: {
    users: { total: 12847, active7d: 4216, newThisWeek: 312, banned: 27 },
    workouts: { total: 84219, today: 412, thisWeek: 2876 },
    ai: { messagesToday: 1842, errorsToday: 3, tokensToday: 384200 },
    support: { openTickets: 18, urgentTickets: 2, overdueTickets: 1, avgResponseHours: 1.4 },
    server: { uptimeSec: 1382400, dbPingMs: 42, memoryUsedMb: 612, memoryTotalMb: 1024, systemMemUsedPct: 64, loadAvg: [0.42, 0.38, 0.31] },
    subscriptions: [
      { plan: 'free', status: 'active', count: 9831 },
      { plan: 'pro', status: 'active', count: 2104 },
      { plan: 'trainer', status: 'active', count: 612 },
      { plan: 'club', status: 'active', count: 273 },
    ],
    expiringSoon: 47,
  },
  // 30-day timeline
  timeline: (() => {
    const days = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const phase = (i / 29);
      days.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        signups: Math.floor(8 + Math.random() * 14 + (1 - phase) * 8),
        workouts: Math.floor(60 + Math.random() * 45 + (1 - phase) * 35),
        ai: Math.floor(40 + Math.random() * 30 + (1 - phase) * 25),
        cardio: Math.floor(15 + Math.random() * 12),
      });
    }
    return days;
  })(),
  users: [
    { id: '1', firstName: 'Алексей', lastName: 'Волков', email: 'a.volkov@mail.ru', role: 'client', plan: 'club', planEnd: '2026-08-12', workouts: 142, ai: 38, lastWorkout: 0, eng: 92, joined: '2024-03-14', isBanned: false, isNew: false, churnRisk: false, city: 'Москва' },
    { id: '2', firstName: 'Мария', lastName: 'Соколова', email: 'maria.sk@gmail.com', role: 'client', plan: 'pro', planEnd: '2026-05-04', workouts: 89, ai: 51, lastWorkout: 1, eng: 78, joined: '2024-08-22', isBanned: false, isNew: false, churnRisk: false, city: 'СПб' },
    { id: '3', firstName: 'Дмитрий', lastName: 'Орлов', email: 'orlov.d@yandex.ru', role: 'trainer', plan: 'trainer', planEnd: '2026-07-19', workouts: 234, ai: 12, lastWorkout: 0, eng: 88, joined: '2023-11-08', isBanned: false, isNew: false, churnRisk: false, city: 'Москва' },
    { id: '4', firstName: 'Анна', lastName: 'Ким', email: 'a.kim@protonmail.com', role: 'client', plan: 'pro', planEnd: '2026-05-21', workouts: 56, ai: 22, lastWorkout: 4, eng: 64, joined: '2024-12-03', isBanned: false, isNew: false, churnRisk: false, city: 'Казань' },
    { id: '5', firstName: 'Игорь', lastName: 'Петров', email: 'igor.p@mail.ru', role: 'client', plan: 'free', workouts: 8, ai: 3, lastWorkout: 12, eng: 21, joined: '2026-04-01', isBanned: false, isNew: true, churnRisk: false, city: 'Новосибирск' },
    { id: '6', firstName: 'Елена', lastName: 'Васильева', email: 'lenavas@gmail.com', role: 'client', plan: 'pro', planEnd: '2026-05-08', workouts: 18, ai: 5, lastWorkout: 28, eng: 18, joined: '2024-10-12', isBanned: false, isNew: false, churnRisk: true, city: 'Екатеринбург' },
    { id: '7', firstName: 'Никита', lastName: 'Соловьёв', email: 'nikita.solo@yandex.ru', role: 'client', plan: 'club', planEnd: '2026-12-04', workouts: 178, ai: 67, lastWorkout: 0, eng: 95, joined: '2023-07-18', isBanned: false, isNew: false, churnRisk: false, city: 'Москва' },
    { id: '8', firstName: 'Роман', lastName: 'Лебедев', email: 'romeo.l@mail.ru', role: 'client', plan: 'free', workouts: 47, ai: 18, lastWorkout: 6, eng: 51, joined: '2024-05-22', isBanned: true, banReason: 'Спам в комментариях', isNew: false, churnRisk: false, city: 'Самара' },
    { id: '9', firstName: 'Ольга', lastName: 'Морозова', email: 'olga.morozova@gmail.com', role: 'support', plan: 'free', workouts: 22, ai: 8, lastWorkout: 2, eng: 44, joined: '2024-02-14', isBanned: false, isNew: false, churnRisk: false, city: 'Москва' },
    { id: '10', firstName: 'Сергей', lastName: 'Новиков', email: 'novikov.serg@yandex.ru', role: 'client', plan: 'pro', planEnd: '2026-04-30', workouts: 31, ai: 14, lastWorkout: 5, eng: 48, joined: '2025-01-09', isBanned: false, isNew: false, churnRisk: false, city: 'Краснодар' },
    { id: '11', firstName: 'Дарья', lastName: 'Иванова', email: 'd.ivanova@gmail.com', role: 'client', plan: 'club', planEnd: '2026-06-15', workouts: 124, ai: 42, lastWorkout: 1, eng: 86, joined: '2024-01-20', isBanned: false, isNew: false, churnRisk: false, city: 'Москва' },
    { id: '12', firstName: 'Артём', lastName: 'Кузнецов', email: 'artem.k@mail.ru', role: 'client', plan: 'trainer', planEnd: '2026-09-01', workouts: 67, ai: 28, lastWorkout: 2, eng: 71, joined: '2024-06-30', isBanned: false, isNew: false, churnRisk: false, city: 'СПб' },
    { id: '13', firstName: 'Виктория', lastName: 'Андреева', email: 'vika.andreeva@gmail.com', role: 'admin', plan: 'club', planEnd: '2027-01-01', workouts: 95, ai: 33, lastWorkout: 0, eng: 99, joined: '2023-04-12', isBanned: false, isNew: false, churnRisk: false, city: 'Москва' },
    { id: '14', firstName: 'Павел', lastName: 'Захаров', email: 'pavel.z@yandex.ru', role: 'client', plan: 'free', workouts: 3, ai: 1, lastWorkout: 18, eng: 8, joined: '2026-04-15', isBanned: false, isNew: true, churnRisk: false, city: 'Уфа' },
    { id: '15', firstName: 'Юлия', lastName: 'Романова', email: 'romanova.jul@gmail.com', role: 'client', plan: 'pro', planEnd: '2026-05-12', workouts: 72, ai: 26, lastWorkout: 3, eng: 68, joined: '2024-09-04', isBanned: false, isNew: false, churnRisk: false, city: 'Воронеж' },
  ],
};
