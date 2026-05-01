// Desktop Admin User Detail — 1440×900
(() => {
  const T = window.ADM_T;
  const D = window.ADM_DATA;
  const PLAN_COLOR = { free: T.planFree, pro: T.planPro, trainer: T.planTrainer, club: T.planClub };

  // Mini interactive chart for user activity (12 months)
  const UserActivity = () => {
    const data = [4, 6, 8, 5, 9, 12, 14, 11, 16, 18, 22, 24];
    const months = ['ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК','ЯНВ','ФЕВ','МАР','АПР','МАЙ'];
    const [hov, setHov] = React.useState(null);
    const W = 480, H = 110, PAD_T = 12, PAD_B = 22, PAD_X = 8;
    const max = Math.max(...data);
    const xAt = i => PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
    const yAt = v => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);
    const pts = data.map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' ');
    const ai = hov ?? data.length - 1;

    return (
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={e => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            let bi = 0, bd = Infinity;
            data.forEach((_, i) => { const d = Math.abs(xAt(i) - x); if (d < bd) { bd = d; bi = i; } });
            setHov(bi);
          }}
          onMouseLeave={() => setHov(null)}
        >
          <defs>
            <linearGradient id="udga" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={T.accent} stopOpacity="0.25"/>
              <stop offset="1" stopColor={T.accent} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polyline points={`${PAD_X},${H-PAD_B} ${pts} ${W-PAD_X},${H-PAD_B}`} fill="url(#udga)"/>
          <polyline points={pts} fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          {data.map((v, i) => (
            <circle key={i} cx={xAt(i)} cy={yAt(v)} r={i === ai ? 3 : 1.4} fill={i === ai ? T.accent : 'rgba(255,255,255,0.3)'}/>
          ))}
          {hov !== null && <line x1={xAt(hov)} x2={xAt(hov)} y1={PAD_T} y2={H-PAD_B} stroke={T.accent} strokeDasharray="2 2" strokeWidth="0.8" opacity="0.5"/>}
          {months.map((m, i) => (
            <text key={i} x={xAt(i)} y={H - 6} textAnchor="middle" fontFamily={T.fontM} fontSize="8" fill={hov === i ? T.accent : T.textDim}>{m}</text>
          ))}
        </svg>
        {hov !== null && (
          <div style={{ position: 'absolute', left: `${(xAt(hov)/W)*100}%`, top: -2, transform: 'translateX(-50%)', background: T.bgDeep, border: `1px solid ${T.lineStrong}`, borderRadius: 6, padding: '4px 8px', fontFamily: T.fontM, fontSize: 10, color: T.text, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            <strong>{data[hov]}</strong> тр. · {months[hov]}
          </div>
        )}
      </div>
    );
  };

  window.AdminUserDetail = function AdminUserDetail() {
    const u = D.users[0]; // Алексей Волков · CLUB
    const planColor = PLAN_COLOR[u.plan];

    return (
      <div style={{ background: T.bg, color: T.text, height: '100%', display: 'flex', fontFamily: T.fontB, overflow: 'hidden' }}>
        <window.AdminSidebar active="users"/>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* breadcrumb topbar */}
          <div style={{ padding: '14px 28px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: T.bg, zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.textSub }}>
              <span style={{ cursor: 'pointer' }}>← Пользователи</span>
              <span style={{ color: T.textDim }}>/</span>
              <span style={{ color: T.text }}>{u.firstName} {u.lastName}</span>
              <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, padding: '2px 6px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 3 }}>ID · {u.id}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '6px 12px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 7, color: T.text, fontSize: 11, cursor: 'pointer' }}>↗ Сообщение</button>
              <button style={{ padding: '6px 12px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 7, color: T.text, fontSize: 11, cursor: 'pointer' }}>⏰ Продлить</button>
              <button style={{ padding: '6px 12px', background: 'transparent', border: `1px solid ${T.danger}40`, borderRadius: 7, color: T.danger, fontSize: 11, cursor: 'pointer' }}>✕ Заблокировать</button>
            </div>
          </div>

          <div style={{ padding: '24px 28px 32px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18 }}>
            {/* MAIN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Hero */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: 22, display: 'flex', gap: 20 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: `${planColor}25`, border: `2px solid ${planColor}50`,
                  color: planColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.fontH, fontSize: 30, fontWeight: 500, flexShrink: 0,
                }}>{u.firstName[0]}{u.lastName[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                    <div style={{ fontFamily: T.fontH, fontSize: 26, fontWeight: 400, letterSpacing: -0.5 }}>{u.firstName} {u.lastName}</div>
                    <span style={{ fontFamily: T.fontM, fontSize: 9, color: planColor, padding: '2px 7px', background: `${planColor}18`, border: `1px solid ${planColor}40`, borderRadius: 4, letterSpacing: 1, fontWeight: 600 }}>CLUB</span>
                  </div>
                  <div style={{ fontFamily: T.fontM, fontSize: 11, color: T.textSub, marginBottom: 12 }}>{u.email} · {u.city} · с {new Date(u.joined).toLocaleDateString('ru', { month: 'long', year: 'numeric' })}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                    {[
                      { l: 'ТРЕНИРОВОК', v: u.workouts, sub: 'всего' },
                      { l: 'ИИ-ЧАТ', v: u.ai, sub: 'сообщений' },
                      { l: 'ENGAGEMENT', v: u.eng, sub: 'из 100', color: T.good },
                      { l: 'ВЫРУЧКА', v: '$179', sub: 'LTV', color: T.accent },
                    ].map((s, i) => (
                      <div key={i}>
                        <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.5, color: T.textDim, marginBottom: 3 }}>{s.l}</div>
                        <div style={{ fontFamily: T.fontH, fontSize: 22, fontWeight: 400, color: s.color || T.text, lineHeight: 1 }}>{s.v}</div>
                        <div style={{ fontSize: 10, color: T.textSub, marginTop: 3 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${T.line}`, padding: '0 4px' }}>
                {['Обзор', 'Тренировки', 'Подписка', 'ИИ-чат', 'Сессии', 'Логи'].map((tab, i) => (
                  <div key={tab} style={{
                    padding: '10px 16px',
                    fontSize: 12, fontWeight: i === 0 ? 600 : 400,
                    color: i === 0 ? T.accent : T.textSub,
                    borderBottom: `2px solid ${i === 0 ? T.accent : 'transparent'}`,
                    cursor: 'pointer', marginBottom: -1,
                  }}>{tab}{i === 3 ? <span style={{ fontFamily: T.fontM, fontSize: 9, marginLeft: 6, color: T.textDim }}>38</span> : null}</div>
                ))}
              </div>

              {/* Activity chart */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontFamily: T.fontH, fontSize: 16, fontWeight: 500 }}>Активность за 12 месяцев</div>
                    <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>тренировок в месяц · стабильный рост</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 6, background: `${T.good}15`, color: T.good, fontSize: 11, fontFamily: T.fontM, fontWeight: 600 }}>↑ +14%</div>
                </div>
                <UserActivity/>
              </div>

              {/* Recent workouts */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontFamily: T.fontH, fontSize: 16, fontWeight: 500 }}>Последние тренировки</div>
                  <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.textSub, cursor: 'pointer' }}>все 142 →</span>
                </div>
                {[
                  { d: 'Сегодня · 09:14', t: 'Push · грудь, плечи', dur: '52 мин', tonn: '4,820 кг', pr: 'PR жим 110×3' },
                  { d: 'Вчера · 19:42', t: 'Кардио · HIIT', dur: '28 мин', tonn: '—', cal: '342 ккал' },
                  { d: '2 дня назад · 08:50', t: 'Pull · спина, бицепс', dur: '61 мин', tonn: '5,140 кг' },
                  { d: '4 дня назад · 09:20', t: 'Legs · ноги, ягодицы', dur: '67 мин', tonn: '7,280 кг', pr: 'PR присед 140×5' },
                ].map((w, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 90px 110px 1fr', gap: 12, padding: '10px 0', borderBottom: i < 3 ? `1px solid ${T.line}` : 'none', alignItems: 'center', fontSize: 12 }}>
                    <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim, letterSpacing: 0.5 }}>{w.d}</div>
                    <div style={{ fontWeight: 500 }}>{w.t}</div>
                    <div style={{ color: T.textSub }}>{w.dur}</div>
                    <div style={{ fontFamily: T.fontM, color: T.textSub, fontSize: 11 }}>{w.tonn || w.cal}</div>
                    <div>{w.pr && <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.accent, fontWeight: 600, padding: '2px 7px', background: T.accentSoft, borderRadius: 4 }}>★ {w.pr}</span>}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SIDE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Subscription */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, marginBottom: 8 }}>ПОДПИСКА</div>
                <div style={{ fontFamily: T.fontH, fontSize: 20, fontWeight: 500, color: planColor }}>CLUB</div>
                <div style={{ fontSize: 11, color: T.textSub, marginTop: 4 }}>Активна до {new Date(u.planEnd).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div style={{ marginTop: 10, height: 4, background: T.surfaceHi, borderRadius: 2 }}>
                  <div style={{ width: '78%', height: '100%', background: planColor, borderRadius: 2 }}/>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: T.fontM, fontSize: 9, color: T.textDim }}>
                  <span>78 дней пройдено</span><span>22 осталось</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button style={{ flex: 1, padding: '6px', background: T.bgDeep, border: `1px solid ${T.line}`, borderRadius: 6, color: T.text, fontSize: 11, cursor: 'pointer' }}>+30 дней</button>
                  <button style={{ flex: 1, padding: '6px', background: T.bgDeep, border: `1px solid ${T.line}`, borderRadius: 6, color: T.text, fontSize: 11, cursor: 'pointer' }}>+90 дней</button>
                </div>
                <button style={{ width: '100%', marginTop: 6, padding: '6px', background: 'transparent', border: `1px solid ${T.danger}30`, borderRadius: 6, color: T.danger, fontSize: 11, cursor: 'pointer' }}>Отозвать подписку</button>
              </div>

              {/* Role / permissions */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, marginBottom: 8 }}>РОЛЬ</div>
                {['client', 'trainer', 'support', 'admin'].map(r => (
                  <div key={r} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', marginBottom: 4, borderRadius: 6,
                    background: u.role === r ? T.accentSoft : 'transparent',
                    border: `1px solid ${u.role === r ? T.lineActive : 'transparent'}`,
                    cursor: 'pointer', fontSize: 12,
                    color: u.role === r ? T.accent : T.textSub, fontWeight: u.role === r ? 600 : 400,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${u.role === r ? T.accent : T.lineStrong}`, background: u.role === r ? T.accent : 'transparent' }}/>
                    {{client:'Клиент',trainer:'Тренер',support:'Поддержка',admin:'Админ'}[r]}
                  </div>
                ))}
              </div>

              {/* Admin note */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim }}>ЗАМЕТКА АДМИНА</span>
                  <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.accent, cursor: 'pointer' }}>✎ ред.</span>
                </div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, fontStyle: 'italic' }}>
                  «VIP-клиент. Бывший участник чемпионата по жиму. Просил персональную программу — передан Дмитрию О. 12 марта.»
                </div>
                <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, marginTop: 8 }}>Виктория А. · 12 мар 2026</div>
              </div>

              {/* Recent log */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, marginBottom: 10 }}>ИСТОРИЯ ИЗМЕНЕНИЙ</div>
                {[
                  { a: 'CHANGE_SUBSCRIPTION', d: 'free → club', who: 'Виктория А.', t: '12 мар' },
                  { a: 'CHANGE_ROLE', d: 'visitor → client', who: 'Система', t: '14 мар 2024' },
                  { a: 'LOGIN', d: 'iPhone 15 · Москва', who: '—', t: 'сегодня 09:12' },
                ].map((l, i) => (
                  <div key={i} style={{ paddingBottom: 10, marginBottom: 10, borderBottom: i < 2 ? `1px solid ${T.line}` : 'none' }}>
                    <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.accent, letterSpacing: 1, fontWeight: 600 }}>{l.a}</div>
                    <div style={{ fontSize: 11, color: T.text, marginTop: 2 }}>{l.d}</div>
                    <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, marginTop: 2 }}>{l.who} · {l.t}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
})();
