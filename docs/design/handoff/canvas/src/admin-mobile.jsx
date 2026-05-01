// Mobile Admin — 390×844 — graphite/gold language, dense yet calm
// Three screens: Dashboard, Users list, User detail
(() => {
  const T = window.IG_TOKENS.A;
  const ADM = window.ADM_T;
  const D = window.ADM_DATA;
  const I = window.Icons || {};

  const PLAN = {
    free: { c: ADM.planFree, l: 'FREE' },
    pro: { c: ADM.planPro, l: 'PRO' },
    trainer: { c: ADM.planTrainer, l: 'TRAINER' },
    club: { c: ADM.planClub, l: 'CLUB' },
  };

  // ─── Reusable mobile chrome ────────────────────────────────────────────
  const StatusBar = () => (
    <div style={{
      height: 44, padding: '0 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: T.fontB, fontSize: 14, fontWeight: 600,
      color: T.text,
    }}>
      <span>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor"><path d="M1 7h2v2H1zM5 5h2v4H5zM9 3h2v6H9zM13 1h2v8h-2z"/></svg>
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 5a7 7 0 0 1 10 0M4.5 7a4 4 0 0 1 5 0M7 9.2v.01"/></svg>
        <svg width="22" height="10" viewBox="0 0 22 10" fill="none"><rect x="0.5" y="0.5" width="18" height="9" rx="2" stroke="currentColor"/><rect x="2" y="2" width="13" height="6" rx="1" fill="currentColor"/><rect x="19" y="3.5" width="1.5" height="3" rx="0.5" fill="currentColor"/></svg>
      </div>
    </div>
  );

  const HomeIndicator = () => (
    <div style={{ height: 34, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
      <div style={{ width: 134, height: 5, borderRadius: 3, background: T.text, opacity: 0.85 }}/>
    </div>
  );

  // Bottom tab bar — admin-specific (4 tabs: Главная / Юзеры / Тикеты / Я)
  const TabBar = ({ active }) => {
    const tabs = [
      { id: 'home', label: 'Главная', icon: I.chart },
      { id: 'users', label: 'Юзеры', icon: I.user },
      { id: 'tickets', label: 'Тикеты', icon: I.bell },
      { id: 'me', label: 'Я', icon: I.settings },
    ];
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'rgba(11,11,12,0.92)',
        backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${ADM.line}`,
        paddingTop: 6,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', padding: '6px 4px' }}>
          {tabs.map(t => {
            const on = t.id === active;
            const Icon = t.icon;
            return (
              <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: on ? T.accent : T.textDim, position: 'relative' }}>
                {Icon && <Icon size={22} sw={1.6}/>}
                <span style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 0.5, fontWeight: on ? 600 : 400 }}>{t.label}</span>
                {t.id === 'tickets' && (
                  <span style={{ position: 'absolute', top: -2, right: 18, minWidth: 14, height: 14, borderRadius: 7, background: ADM.danger, color: '#0A0A0A', fontFamily: T.fontM, fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>2</span>
                )}
              </div>
            );
          })}
        </div>
        <HomeIndicator/>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SCREEN 1 · DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════
  window.A_AdminHome = function A_AdminHome() {
    const s = D.stats;

    // little spark for new-user trend
    const spark = D.timeline.slice(-14).map(d => d.signups);
    const max = Math.max(...spark);

    return (
      <div style={{ width: 390, height: 844, background: T.bg, color: T.text, fontFamily: T.fontB, position: 'relative', overflow: 'hidden' }}>
        <StatusBar/>

        <div style={{ height: 'calc(100% - 44px - 84px)', overflow: 'auto' }}>
          {/* greeting */}
          <div style={{ padding: '8px 22px 18px' }}>
            <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Админ · Виктория</div>
            <div style={{ fontFamily: T.fontH, fontSize: 32, fontWeight: 400, letterSpacing: -0.6, marginTop: 4, lineHeight: 1.05 }}>
              Сегодня <span style={{ color: T.accent, fontStyle: 'italic' }}>спокойно.</span>
            </div>
            <div style={{ fontSize: 13, color: T.textSub, marginTop: 6 }}>3 ошибки ИИ · 2 срочных тикета · сервер OK</div>
          </div>

          {/* Urgent banner */}
          <div style={{ margin: '0 16px 14px', padding: '14px 16px', background: `${ADM.danger}10`, border: `1px solid ${ADM.danger}30`, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${ADM.danger}20`, color: ADM.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.fontH, fontSize: 18, fontWeight: 600 }}>!</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>2 срочных тикета</div>
              <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>Один просрочен на 4 ч · оплата</div>
            </div>
            <div style={{ color: ADM.danger, fontSize: 18 }}>›</div>
          </div>

          {/* KPI grid 2x2 */}
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { l: 'Всего юзеров', v: '12 847', d: '+312', dc: ADM.good, sub: 'за неделю' },
              { l: 'Активны 7 дн', v: '4 216', d: '33%', dc: T.accent, sub: 'от базы' },
              { l: 'Тренировок', v: '412', d: '+18%', dc: ADM.good, sub: 'сегодня' },
              { l: 'Выручка MRR', v: '$24.1k', d: '+$1.8k', dc: ADM.good, sub: 'к прошл. мес.' },
            ].map((k, i) => (
              <div key={i} style={{ background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.2, textTransform: 'uppercase' }}>{k.l}</div>
                <div style={{ fontFamily: T.fontH, fontSize: 26, fontWeight: 400, marginTop: 6, letterSpacing: -0.4, lineHeight: 1 }}>{k.v}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <span style={{ fontFamily: T.fontM, fontSize: 10, color: k.dc, fontWeight: 600 }}>{k.d}</span>
                  <span style={{ fontSize: 10, color: T.textDim }}>{k.sub}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Signups sparkline card */}
          <div style={{ margin: '0 16px 14px', background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.2 }}>РЕГИСТРАЦИИ · 14 ДНЕЙ</div>
                <div style={{ fontFamily: T.fontH, fontSize: 22, fontWeight: 400, marginTop: 4, letterSpacing: -0.4 }}>312 <span style={{ fontSize: 12, color: T.textSub, fontFamily: T.fontB }}>чел.</span></div>
              </div>
              <div style={{ padding: '4px 8px', borderRadius: 6, background: `${ADM.good}15`, color: ADM.good, fontFamily: T.fontM, fontSize: 10, fontWeight: 600 }}>↑ 22%</div>
            </div>
            <svg viewBox="0 0 320 60" width="100%" height="60" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="ma-spark" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={T.accent} stopOpacity="0.35"/>
                  <stop offset="1" stopColor={T.accent} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {(() => {
                const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 320},${50 - (v / max) * 42}`).join(' ');
                return (
                  <>
                    <polyline points={`0,60 ${pts} 320,60`} fill="url(#ma-spark)"/>
                    <polyline points={pts} fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    {spark.map((v, i) => (
                      <circle key={i} cx={(i / (spark.length - 1)) * 320} cy={50 - (v / max) * 42} r={i === spark.length - 1 ? 3.5 : 0} fill={T.accent}/>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>

          {/* Quick actions */}
          <div style={{ padding: '0 22px', marginBottom: 8 }}>
            <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>Быстрые действия</div>
          </div>
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { l: 'Найти юзера', s: 'по email/имени', i: '🔍', c: T.accent },
              { l: 'Продлить план', s: 'выдать дни', i: '⏱', c: ADM.good },
              { l: 'Логи ИИ', s: '3 ошибки', i: '✦', c: ADM.warn },
              { l: 'Бэкап БД', s: 'последний 04:00', i: '⌘', c: T.textSub },
            ].map((a, i) => (
              <div key={i} style={{ background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 12, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.c}15`, color: a.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 500 }}>{a.i}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{a.l}</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{a.s}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Subscription mix */}
          <div style={{ margin: '0 16px 14px', background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.2 }}>МИКС ПОДПИСОК</span>
              <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.textSub }}>2 989 платных</span>
            </div>
            {/* segmented bar */}
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: '76.5%', background: ADM.planFree }}/>
              <div style={{ width: '16.4%', background: ADM.planPro }}/>
              <div style={{ width: '4.8%', background: ADM.planTrainer }}/>
              <div style={{ width: '2.1%', background: ADM.planClub }}/>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              {[
                { c: ADM.planFree, l: 'Free', n: '9 831' },
                { c: ADM.planPro, l: 'Pro', n: '2 104' },
                { c: ADM.planTrainer, l: 'Trainer', n: '612' },
                { c: ADM.planClub, l: 'Club', n: '273' },
              ].map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: p.c }}/>
                  <span style={{ fontSize: 12, color: T.textSub }}>{p.l}</span>
                  <span style={{ fontFamily: T.fontM, fontSize: 11, color: T.text, marginLeft: 'auto', fontWeight: 500 }}>{p.n}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Server pulse */}
          <div style={{ margin: '0 16px 24px', padding: '14px 16px', background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: ADM.good, boxShadow: `0 0 0 4px ${ADM.good}25` }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Сервер · в норме</div>
              <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim, marginTop: 2, letterSpacing: 0.3 }}>uptime 16d · DB 42ms · MEM 60%</div>
            </div>
          </div>
        </div>

        <TabBar active="home"/>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SCREEN 2 · USERS LIST
  // ═══════════════════════════════════════════════════════════════════════
  window.A_AdminUsers = function A_AdminUsers() {
    const [filter, setFilter] = React.useState('all');
    const filters = [
      { id: 'all', l: 'Все', n: D.users.length },
      { id: 'paid', l: 'Платные', n: D.users.filter(u => u.plan !== 'free').length },
      { id: 'churn', l: 'Риск', n: D.users.filter(u => u.churnRisk).length },
      { id: 'banned', l: 'Бан', n: D.users.filter(u => u.isBanned).length },
    ];

    let users = D.users;
    if (filter === 'paid') users = users.filter(u => u.plan !== 'free');
    else if (filter === 'churn') users = users.filter(u => u.churnRisk);
    else if (filter === 'banned') users = users.filter(u => u.isBanned);

    return (
      <div style={{ width: 390, height: 844, background: T.bg, color: T.text, fontFamily: T.fontB, position: 'relative', overflow: 'hidden' }}>
        <StatusBar/>

        {/* Header */}
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim, letterSpacing: 1.5 }}>{D.users.length} · ВСЕГО</div>
              <div style={{ fontFamily: T.fontH, fontSize: 28, fontWeight: 400, letterSpacing: -0.5, marginTop: 2 }}>Пользователи</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: ADM.surface, border: `1px solid ${ADM.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text, fontSize: 18 }}>+</div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 12, marginBottom: 12 }}>
            <span style={{ color: T.textDim, fontSize: 14 }}>🔍</span>
            <span style={{ fontSize: 13, color: T.textDim, flex: 1 }}>Email, имя или ID</span>
            <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, padding: '2px 6px', border: `1px solid ${ADM.line}`, borderRadius: 4 }}>⌘K</span>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ padding: '0 22px 14px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          {filters.map(f => {
            const on = f.id === filter;
            return (
              <div key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '7px 12px', borderRadius: 8,
                background: on ? T.accent : ADM.surface,
                border: `1px solid ${on ? T.accent : ADM.line}`,
                color: on ? '#0A0A0A' : T.textSub,
                fontSize: 12, fontWeight: on ? 600 : 500,
                whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6,
                cursor: 'pointer',
              }}>
                {f.l}
                <span style={{ fontFamily: T.fontM, fontSize: 10, opacity: on ? 0.7 : 1, color: on ? '#0A0A0A' : T.textDim, fontWeight: 500 }}>{f.n}</span>
              </div>
            );
          })}
        </div>

        {/* List */}
        <div style={{ height: 'calc(100% - 44px - 84px - 220px)', overflow: 'auto', padding: '0 16px' }}>
          {users.map((u, i) => {
            const plan = PLAN[u.plan];
            const lastWoLabel = u.lastWorkout === 0 ? 'сегодня' : `${u.lastWorkout} дн.`;
            return (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 8px',
                borderBottom: i < users.length - 1 ? `1px solid ${ADM.line}` : 'none',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: `${plan.c}25`, border: `1.5px solid ${plan.c}50`,
                  color: plan.c, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: T.fontH, fontSize: 16, fontWeight: 500, flexShrink: 0,
                  position: 'relative',
                }}>
                  {u.firstName[0]}{u.lastName[0]}
                  {u.isBanned && (
                    <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, background: ADM.danger, color: '#0A0A0A', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${T.bg}` }}>✕</span>
                  )}
                  {u.isNew && !u.isBanned && (
                    <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, background: ADM.good, color: '#0A0A0A', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${T.bg}` }}>★</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{u.firstName} {u.lastName}</span>
                    <span style={{ fontFamily: T.fontM, fontSize: 8, color: plan.c, padding: '1px 5px', background: `${plan.c}18`, borderRadius: 3, letterSpacing: 0.8, fontWeight: 700 }}>{plan.l}</span>
                    {u.churnRisk && <span style={{ fontFamily: T.fontM, fontSize: 8, color: ADM.warn, letterSpacing: 0.5, fontWeight: 600 }}>⚠ ЧРН</span>}
                  </div>
                  <div style={{ fontSize: 11, color: T.textSub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontFamily: T.fontM, fontSize: 9, color: T.textDim }}>
                    <span>{u.workouts} тр.</span>
                    <span>·</span>
                    <span>{lastWoLabel}</span>
                    <span>·</span>
                    <span style={{ color: u.eng > 70 ? ADM.good : u.eng > 40 ? T.accent : ADM.warn, fontWeight: 600 }}>ENG {u.eng}</span>
                  </div>
                </div>
                <span style={{ color: T.textDim, fontSize: 18 }}>›</span>
              </div>
            );
          })}
        </div>

        <TabBar active="users"/>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SCREEN 3 · USER DETAIL
  // ═══════════════════════════════════════════════════════════════════════
  window.A_AdminUserDetail = function A_AdminUserDetail() {
    const u = D.users[0]; // Алексей Волков · CLUB
    const plan = PLAN[u.plan];

    return (
      <div style={{ width: 390, height: 844, background: T.bg, color: T.text, fontFamily: T.fontB, position: 'relative', overflow: 'hidden' }}>
        <StatusBar/>

        {/* Top bar */}
        <div style={{ padding: '6px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: ADM.surface, border: `1px solid ${ADM.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text, fontSize: 14 }}>‹</div>
          <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.2 }}>ID · {u.id}</div>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: ADM.surface, border: `1px solid ${ADM.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text, fontSize: 16 }}>⋯</div>
        </div>

        <div style={{ height: 'calc(100% - 44px - 84px - 56px)', overflow: 'auto', padding: '0 16px 12px' }}>
          {/* Hero */}
          <div style={{ textAlign: 'center', padding: '16px 0 20px' }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: `${plan.c}25`, border: `2px solid ${plan.c}50`,
              color: plan.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.fontH, fontSize: 32, fontWeight: 500, marginBottom: 12,
            }}>{u.firstName[0]}{u.lastName[0]}</div>
            <div style={{ fontFamily: T.fontH, fontSize: 26, fontWeight: 400, letterSpacing: -0.4 }}>{u.firstName} {u.lastName}</div>
            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontFamily: T.fontM, fontSize: 9, color: plan.c, padding: '3px 8px', background: `${plan.c}18`, border: `1px solid ${plan.c}40`, borderRadius: 4, letterSpacing: 1.2, fontWeight: 700 }}>{plan.l}</span>
              <span style={{ fontSize: 12, color: T.textSub }}>{u.city}</span>
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 4, fontFamily: T.fontM }}>{u.email}</div>
          </div>

          {/* Action row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
            {[
              { i: '✉', l: 'Сообщ.', c: T.accent },
              { i: '⏱', l: '+30 дн', c: ADM.good },
              { i: '✕', l: 'Бан', c: ADM.danger },
            ].map((a, i) => (
              <div key={i} style={{ background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
                <div style={{ color: a.c, fontSize: 18, marginBottom: 4 }}>{a.i}</div>
                <div style={{ fontSize: 11, color: T.text, fontWeight: 500 }}>{a.l}</div>
              </div>
            ))}
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            {[
              { l: 'Тренировок', v: u.workouts, c: T.text },
              { l: 'ИИ-сообщений', v: u.ai, c: T.text },
              { l: 'Engagement', v: u.eng, sub: '/ 100', c: ADM.good },
              { l: 'LTV', v: '$179', c: T.accent },
            ].map((s, i) => (
              <div key={i} style={{ background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 12, padding: 14 }}>
                <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.2, textTransform: 'uppercase' }}>{s.l}</div>
                <div style={{ fontFamily: T.fontH, fontSize: 24, fontWeight: 400, marginTop: 4, color: s.c, lineHeight: 1 }}>
                  {s.v}{s.sub && <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontB, marginLeft: 4 }}>{s.sub}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Subscription card */}
          <div style={{ background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.2 }}>ПОДПИСКА · CLUB</div>
                <div style={{ fontSize: 14, color: T.text, marginTop: 4, fontWeight: 500 }}>До 12 авг 2026</div>
              </div>
              <span style={{ fontFamily: T.fontM, fontSize: 10, color: ADM.good, fontWeight: 600 }}>● актив.</span>
            </div>
            <div style={{ marginTop: 12, height: 4, background: ADM.surfaceHi, borderRadius: 2 }}>
              <div style={{ width: '78%', height: '100%', background: plan.c, borderRadius: 2 }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: T.fontM, fontSize: 9, color: T.textDim }}>
              <span>78 дней</span>
              <span>22 осталось</span>
            </div>
          </div>

          {/* Recent activity */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1.5, marginBottom: 10, padding: '0 6px' }}>ПОСЛЕДНЯЯ АКТИВНОСТЬ</div>
            <div style={{ background: ADM.surface, border: `1px solid ${ADM.line}`, borderRadius: 14, overflow: 'hidden' }}>
              {[
                { t: 'Push · грудь, плечи', d: 'сегодня · 09:14', m: '52 мин · 4.8т', pr: true },
                { t: 'HIIT кардио', d: 'вчера · 19:42', m: '28 мин · 342 ккал' },
                { t: 'Pull · спина', d: '2 дня · 08:50', m: '61 мин · 5.1т' },
              ].map((w, i) => (
                <div key={i} style={{ padding: '12px 14px', borderBottom: i < 2 ? `1px solid ${ADM.line}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: w.pr ? T.accent : ADM.good }}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{w.t}{w.pr && <span style={{ fontFamily: T.fontM, fontSize: 8, color: T.accent, marginLeft: 6, fontWeight: 700, padding: '1px 5px', background: `${T.accent}18`, borderRadius: 3, letterSpacing: 0.5 }}>★ PR</span>}</div>
                    <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, marginTop: 2 }}>{w.d}  ·  {w.m}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Admin note */}
          <div style={{ background: `${T.accent}08`, border: `1px solid ${T.accent}22`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.accent, letterSpacing: 1.2, fontWeight: 600 }}>ЗАМЕТКА АДМИНА</span>
              <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim }}>В.А. · 12 мар</span>
            </div>
            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, fontStyle: 'italic' }}>
              «VIP-клиент. Передан Дмитрию О. для персональной программы.»
            </div>
          </div>
        </div>

        <TabBar active="users"/>
      </div>
    );
  };
})();
