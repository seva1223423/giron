// Desktop Admin Dashboard — 1440×900
// Styled in the same graphite + champagne gold language as the user app,
// but with denser SaaS-style layout (Linear/Stripe/Notion vibes).

(() => {
  const T = window.ADM_T;
  const D = window.ADM_DATA;

  // ─── Reusable atoms ─────────────────────────────────────────────────────
  const SidebarItem = ({ icon, label, badge, active, onClick }) => (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        background: active ? T.surfaceHi : 'transparent',
        color: active ? T.text : T.textSub,
        fontSize: 13,
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        position: 'relative',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textSub; } }}
    >
      {active && <div style={{ position: 'absolute', left: -16, top: 8, bottom: 8, width: 2, background: T.accent, borderRadius: 1 }}/>}
      <span style={{ fontSize: 14, opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          background: typeof badge === 'string' ? T.accent : T.surfaceHi,
          color: typeof badge === 'string' ? '#0A0A0A' : T.textSub,
          fontFamily: T.fontM, fontSize: 9, fontWeight: 600,
          padding: '2px 6px', borderRadius: 4,
          minWidth: 16, textAlign: 'center',
        }}>{badge}</span>
      )}
    </div>
  );

  const KPICard = ({ label, value, unit, trend, sub, accent }) => (
    <div style={{
      background: T.surface, border: `1px solid ${T.line}`,
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.5, color: T.textSub, textTransform: 'uppercase' }}>{label}</span>
        {trend != null && (
          <span style={{
            fontFamily: T.fontM, fontSize: 10, fontWeight: 500,
            color: trend > 0 ? T.good : trend < 0 ? T.danger : T.textSub,
          }}>{trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
        <span style={{ fontFamily: T.fontH, fontSize: 28, fontWeight: 400, letterSpacing: -0.8, color: accent || T.text, lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: T.textSub }}>{unit}</span>}
      </div>
      {sub && <span style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>{sub}</span>}
    </div>
  );

  // Multi-line interactive area chart with hover tooltip
  const TimelineChart = ({ data, height = 200 }) => {
    const W = 800, H = height;
    const PAD_T = 20, PAD_B = 28, PAD_L = 36, PAD_R = 12;
    const innerW = W - PAD_L - PAD_R, innerH = H - PAD_T - PAD_B;
    const series = [
      { key: 'workouts', label: 'Тренировки', color: T.accent },
      { key: 'signups', label: 'Регистрации', color: T.info },
      { key: 'ai', label: 'ИИ-чат', color: T.good },
    ];
    const allVals = series.flatMap(s => data.map(d => d[s.key]));
    const max = Math.max(...allVals);
    const min = 0;
    const xAt = i => PAD_L + (i / (data.length - 1)) * innerW;
    const yAt = v => PAD_T + (1 - (v - min) / (max - min)) * innerH;
    const [hover, setHover] = React.useState(null);
    const svgRef = React.useRef(null);

    const handleMove = e => {
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      let bestI = 0, bestD = Infinity;
      data.forEach((_, i) => { const d = Math.abs(xAt(i) - x); if (d < bestD) { bestD = d; bestI = i; } });
      setHover(bestI);
    };

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', cursor: 'crosshair' }}
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + f * innerH} y2={PAD_T + f * innerH} stroke={T.line} strokeWidth="0.6"/>
              <text x={PAD_L - 8} y={PAD_T + f * innerH + 3} textAnchor="end" fontFamily={T.fontM} fontSize="9" fill={T.textDim}>
                {Math.round(max - f * (max - min))}
              </text>
            </g>
          ))}
          {/* defs */}
          <defs>
            {series.map(s => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity="0.15"/>
                <stop offset="1" stopColor={s.color} stopOpacity="0"/>
              </linearGradient>
            ))}
          </defs>
          {/* area + lines */}
          {series.map(s => {
            const pts = data.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d[s.key]).toFixed(1)}`).join(' ');
            const area = `${PAD_L},${PAD_T + innerH} ${pts} ${W - PAD_R},${PAD_T + innerH}`;
            return (
              <g key={s.key}>
                <polyline points={area} fill={`url(#grad-${s.key})`}/>
                <polyline points={pts} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
            );
          })}
          {/* hover */}
          {hover !== null && (
            <g>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_T} y2={PAD_T + innerH} stroke={T.accent} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5"/>
              {series.map(s => (
                <circle key={s.key} cx={xAt(hover)} cy={yAt(data[hover][s.key])} r="3.5" fill={s.color} stroke={T.bg} strokeWidth="1.5"/>
              ))}
            </g>
          )}
          {/* x-axis (months / day labels) */}
          {data.map((d, i) => {
            const show = i === 0 || i === data.length - 1 || i % 5 === 0;
            if (!show) return null;
            return (
              <text key={i} x={xAt(i)} y={H - 10} textAnchor="middle" fontFamily={T.fontM} fontSize="9" fill={T.textDim}>{d.label}</text>
            );
          })}
        </svg>

        {/* legend + tooltip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {series.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.fontM, fontSize: 10, color: T.textSub }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }}/>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {hover !== null && (
          <div style={{
            position: 'absolute',
            left: `${(xAt(hover) / W) * 100}%`,
            top: 0,
            transform: 'translate(-50%, -8px)',
            background: T.bgDeep,
            border: `1px solid ${T.lineStrong}`,
            borderRadius: 8,
            padding: '8px 10px',
            fontFamily: T.fontM, fontSize: 10,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 2,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ color: T.textSub, marginBottom: 4, letterSpacing: 0.5 }}>{data[hover].label}</div>
            {series.map(s => (
              <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: T.text, fontSize: 11 }}>
                <span style={{ color: s.color }}>● {s.label}</span>
                <span style={{ fontWeight: 600 }}>{data[hover][s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Plan distribution donut
  const SubDonut = ({ subs }) => {
    const total = subs.reduce((s, x) => s + x.count, 0);
    const colors = { free: T.planFree, pro: T.planPro, trainer: T.planTrainer, club: T.planClub };
    let acc = 0;
    const R = 56, C = 2 * Math.PI * R;
    return (
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={R} fill="none" stroke={T.surfaceHi} strokeWidth="14"/>
          {subs.map(s => {
            const len = (s.count / total) * C;
            const dash = `${len} ${C - len}`;
            const offset = -acc;
            acc += len;
            return (
              <circle key={s.plan} cx="70" cy="70" r={R} fill="none"
                stroke={colors[s.plan]} strokeWidth="14"
                strokeDasharray={dash} strokeDashoffset={offset}
                transform="rotate(-90 70 70)"/>
            );
          })}
          <text x="70" y="68" textAnchor="middle" fontFamily={T.fontH} fontSize="22" fill={T.text} fontWeight="500">{total.toLocaleString('ru')}</text>
          <text x="70" y="84" textAnchor="middle" fontFamily={T.fontM} fontSize="9" fill={T.textSub} letterSpacing="2">USERS</text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {subs.map(s => (
            <div key={s.plan} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[s.plan] }}/>
              <span style={{ flex: 1, color: T.text, textTransform: 'capitalize', fontWeight: 500 }}>{s.plan}</span>
              <span style={{ fontFamily: T.fontM, color: T.textSub, fontSize: 11 }}>{s.count.toLocaleString('ru')}</span>
              <span style={{ fontFamily: T.fontM, color: T.textDim, fontSize: 10, width: 36, textAlign: 'right' }}>{Math.round(s.count / total * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ─── Sidebar (shared layout) ───────────────────────────────────────────
  window.AdminSidebar = function AdminSidebar({ active }) {
    return (
      <div style={{
        width: 220,
        background: T.bgDeep,
        borderRight: `1px solid ${T.line}`,
        padding: '20px 16px',
        display: 'flex', flexDirection: 'column', gap: 4,
        flexShrink: 0,
      }}>
        {/* logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', marginBottom: 18 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: T.accent, color: '#0A0A0A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: T.fontH, fontSize: 16, fontWeight: 600,
          }}>I</div>
          <div>
            <div style={{ fontFamily: T.fontH, fontSize: 14, fontWeight: 500, color: T.text, letterSpacing: -0.3 }}>Giron</div>
            <div style={{ fontFamily: T.fontM, fontSize: 8, letterSpacing: 2, color: T.textDim }}>ADMIN</div>
          </div>
        </div>

        {/* search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px',
          background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
          marginBottom: 14,
        }}>
          <span style={{ fontSize: 12, color: T.textDim }}>⌕</span>
          <span style={{ fontSize: 12, color: T.textDim, flex: 1 }}>Поиск...</span>
          <span style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, padding: '1px 5px', border: `1px solid ${T.line}`, borderRadius: 3 }}>⌘K</span>
        </div>

        <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, padding: '4px 12px', marginTop: 2, marginBottom: 4 }}>ОБЗОР</div>
        <SidebarItem icon="◐" label="Дашборд" active={active === 'dash'}/>
        <SidebarItem icon="≣" label="Аналитика" active={active === 'analytics'}/>

        <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, padding: '4px 12px', marginTop: 14, marginBottom: 4 }}>ПОЛЬЗОВАТЕЛИ</div>
        <SidebarItem icon="○" label="Все пользователи" badge="12.8k" active={active === 'users'}/>
        <SidebarItem icon="✕" label="Заблокированные" badge={27} active={active === 'banned'}/>
        <SidebarItem icon="!" label="Жалобы" badge="3" active={active === 'reports'}/>

        <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, padding: '4px 12px', marginTop: 14, marginBottom: 4 }}>БИЗНЕС</div>
        <SidebarItem icon="$" label="Подписки" active={active === 'subs'}/>
        <SidebarItem icon="△" label="Финансы" active={active === 'finance'}/>
        <SidebarItem icon="✎" label="Контент"/>
        <SidebarItem icon="◇" label="Программы"/>
        <SidebarItem icon="▦" label="Расписание"/>

        <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, padding: '4px 12px', marginTop: 14, marginBottom: 4 }}>ПОДДЕРЖКА</div>
        <SidebarItem icon="✉" label="Тикеты" badge="18" active={active === 'support'}/>
        <SidebarItem icon="◉" label="Чат с клиентами" badge="2"/>

        <div style={{ flex: 1 }}/>

        <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.8, color: T.textDim, padding: '4px 12px', marginTop: 14, marginBottom: 4 }}>СИСТЕМА</div>
        <SidebarItem icon="◑" label="Логи"/>
        <SidebarItem icon="⚙" label="Настройки"/>

        {/* admin user */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', marginTop: 10,
          background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: T.accentSoft, color: T.accent,
            border: `1px solid ${T.lineActive}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: T.fontH, fontSize: 12, fontWeight: 500,
          }}>ВА</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.text, lineHeight: 1.2 }}>Виктория А.</div>
            <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, letterSpacing: 1, textTransform: 'uppercase' }}>SUPER ADMIN</div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Dashboard screen ───────────────────────────────────────────────────
  window.AdminDashboard = function AdminDashboard() {
    const s = D.stats;
    return (
      <div style={{ background: T.bg, color: T.text, height: '100%', display: 'flex', fontFamily: T.fontB, overflow: 'hidden' }}>
        <window.AdminSidebar active="dash"/>

        {/* main */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* topbar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 28px',
            borderBottom: `1px solid ${T.line}`,
            background: T.bg,
            position: 'sticky', top: 0, zIndex: 5,
          }}>
            <div>
              <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 2, color: T.textDim, textTransform: 'uppercase', marginBottom: 4 }}>ПАНЕЛЬ УПРАВЛЕНИЯ</div>
              <div style={{ fontFamily: T.fontH, fontSize: 22, fontWeight: 400, letterSpacing: -0.5 }}>
                Доброе утро, <span style={{ fontStyle: 'italic', color: T.accent }}>Виктория</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textSub, padding: '6px 10px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 6 }}>
                <span style={{ color: T.good }}>●</span> live · обновлено 2 сек назад
              </div>
              <div style={{ display: 'flex', gap: 4, padding: 3, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8 }}>
                {['7д','30д','90д'].map((p, i) => (
                  <div key={p} style={{
                    padding: '5px 12px', borderRadius: 5,
                    background: i === 1 ? T.accent : 'transparent',
                    color: i === 1 ? '#0A0A0A' : T.textSub,
                    fontSize: 11, fontFamily: T.fontM, fontWeight: 600, cursor: 'pointer',
                  }}>{p}</div>
                ))}
              </div>
              <button style={{
                padding: '7px 14px', borderRadius: 8,
                background: T.accent, color: '#0A0A0A',
                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: T.fontB,
              }}>↗ Экспорт</button>
            </div>
          </div>

          <div style={{ padding: '20px 28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Alert banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: `${T.warn}10`, border: `1px solid ${T.warn}30`,
              borderRadius: 10, padding: '10px 14px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.warn }}/>
              <span style={{ fontSize: 12, color: T.text, flex: 1 }}>
                <strong style={{ color: T.warn }}>{s.expiringSoon}</strong> подписок истекает в ближайшие 7 дней ·
                <span style={{ color: T.textSub }}> рекомендуем запустить ретеншн-кампанию</span>
              </span>
              <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.warn, fontWeight: 600, cursor: 'pointer' }}>СМОТРЕТЬ →</span>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
              <KPICard label="ВСЕГО ЮЗЕРОВ" value="12 847" trend={4.2} sub="+312 за неделю"/>
              <KPICard label="АКТИВНЫЕ 7Д" value="4 216" trend={8.1} sub={`${Math.round(4216/12847*100)}% от базы`}/>
              <KPICard label="ВЫРУЧКА / МЕС" value="$31.2k" unit="" trend={12.4} sub="ARR ≈ $374k" accent={T.accent}/>
              <KPICard label="ИИ ЗАПРОСОВ" value="1 842" sub="сегодня · 384k токенов"/>
              <KPICard label="ТРЕНИРОВОК" value="412" trend={-2.8} sub="сегодня"/>
            </div>

            {/* Main row: chart + donut */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }}>
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: T.fontH, fontSize: 17, fontWeight: 500, letterSpacing: -0.3 }}>Активность платформы</div>
                    <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>Регистрации · Тренировки · ИИ-чат за 30 дней</div>
                  </div>
                </div>
                <TimelineChart data={D.timeline} height={210}/>
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: T.fontH, fontSize: 17, fontWeight: 500, letterSpacing: -0.3 }}>Подписки</div>
                    <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>распределение по планам</div>
                  </div>
                  <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.good, fontWeight: 600 }}>↑ 12.4%</span>
                </div>
                <SubDonut subs={s.subscriptions}/>
                <div style={{ marginTop: 16, padding: 12, background: T.bgDeep, border: `1px solid ${T.line}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: T.textSub }}>Конверсия в платных</span>
                    <span style={{ fontFamily: T.fontM, fontSize: 12, color: T.accent, fontWeight: 600 }}>23.5%</span>
                  </div>
                  <div style={{ height: 4, background: T.surfaceHi, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '23.5%', background: T.accent }}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom row: activity feed + system + support */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14 }}>
              {/* Recent activity */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontFamily: T.fontH, fontSize: 15, fontWeight: 500 }}>Последние действия</div>
                  <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.textSub, cursor: 'pointer' }}>смотреть все →</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[
                    { who: 'Алексей Волков', act: 'выдал подписку CLUB', who2: 'Дмитрию К.', t: '2 мин', icon: '↑', color: T.good },
                    { who: 'Виктория А.', act: 'заблокировала пользователя', who2: 'Роман Лебедев', t: '14 мин', icon: '✕', color: T.danger },
                    { who: 'Ольга М.', act: 'закрыла тикет #1284', who2: 'Жалоба на тренировку', t: '32 мин', icon: '✓', color: T.good },
                    { who: 'Система', act: 'отправлено напоминание', who2: '47 пользователям', t: '1 ч', icon: '⟳', color: T.info },
                    { who: 'Дмитрий О.', act: 'опубликовал программу', who2: '"Push/Pull/Legs · Pro"', t: '2 ч', icon: '◇', color: T.accent },
                    { who: 'Виктория А.', act: 'изменила роль', who2: 'Анна К. → trainer', t: '3 ч', icon: '▷', color: T.info },
                  ].map((a, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0',
                      borderBottom: i < 5 ? `1px solid ${T.line}` : 'none',
                    }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 7,
                        background: `${a.color}15`, color: a.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12,
                      }}>{a.icon}</div>
                      <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 500 }}>{a.who}</span>
                        <span style={{ color: T.textSub }}> {a.act} </span>
                        <span style={{ color: T.text, fontWeight: 500 }}>{a.who2}</span>
                      </div>
                      <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim }}>{a.t}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* System health */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontFamily: T.fontH, fontSize: 15, fontWeight: 500 }}>Здоровье системы</div>
                  <div style={{
                    fontFamily: T.fontM, fontSize: 10, fontWeight: 600,
                    color: T.good, padding: '2px 8px',
                    background: `${T.good}18`, borderRadius: 4,
                  }}>92 / 100 · ОТЛИЧНО</div>
                </div>

                {[
                  { l: 'Uptime', v: '16д 0ч', sub: '99.97%', good: true },
                  { l: 'DB ping', v: '42 мс', sub: 'p95: 68 мс', good: true },
                  { l: 'Память', v: '612 / 1024 МБ', sub: '60%', pct: 60, good: true },
                  { l: 'Загрузка CPU', v: '0.42', sub: 'load avg 1m', pct: 42, good: true },
                  { l: 'Ошибок ИИ сегодня', v: '3', sub: 'из 1842', good: true },
                ].map((m, i) => (
                  <div key={i} style={{ marginBottom: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: T.textSub }}>{m.l}</span>
                      <span style={{ fontFamily: T.fontM, fontSize: 11, color: T.text, fontWeight: 500 }}>{m.v}</span>
                    </div>
                    {m.pct != null ? (
                      <div style={{ height: 3, background: T.surfaceHi, borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${m.pct}%`, background: m.good ? T.good : T.warn, borderRadius: 2 }}/>
                      </div>
                    ) : (
                      <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim }}>{m.sub}</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Support queue */}
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontFamily: T.fontH, fontSize: 15, fontWeight: 500 }}>Поддержка</div>
                  <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.textSub, cursor: 'pointer' }}>все →</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: T.bgDeep, padding: 10, borderRadius: 8, border: `1px solid ${T.danger}30` }}>
                    <div style={{ fontFamily: T.fontH, fontSize: 22, fontWeight: 500, color: T.danger, lineHeight: 1 }}>2</div>
                    <div style={{ fontSize: 10, color: T.textSub, marginTop: 4 }}>срочные</div>
                  </div>
                  <div style={{ background: T.bgDeep, padding: 10, borderRadius: 8, border: `1px solid ${T.line}` }}>
                    <div style={{ fontFamily: T.fontH, fontSize: 22, fontWeight: 500, color: T.text, lineHeight: 1 }}>18</div>
                    <div style={{ fontSize: 10, color: T.textSub, marginTop: 4 }}>открыты</div>
                  </div>
                </div>
                {[
                  { p: 'urgent', subj: 'Не могу оплатить PRO', user: 'Анна К.', wait: '4ч', color: T.danger },
                  { p: 'high', subj: 'Жалоба на тренера', user: 'Сергей Н.', wait: '2ч', color: T.warn },
                  { p: 'normal', subj: 'Вопрос по программе', user: 'Юлия Р.', wait: '1ч', color: T.info },
                ].map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 7,
                    background: T.bgDeep, marginBottom: 6,
                    borderLeft: `2px solid ${t.color}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: T.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subj}</div>
                      <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, marginTop: 1 }}>{t.user}</div>
                    </div>
                    <span style={{ fontFamily: T.fontM, fontSize: 10, color: t.color, fontWeight: 600 }}>{t.wait}</span>
                  </div>
                ))}
                <div style={{ marginTop: 10, padding: '8px 10px', background: T.bgDeep, border: `1px solid ${T.line}`, borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: T.textSub }}>Среднее время ответа</span>
                  <span style={{ fontFamily: T.fontM, fontSize: 12, color: T.good, fontWeight: 600 }}>1.4ч</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
})();
