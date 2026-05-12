/* global React */
// Giron — shared primitives (icons, bars, rings, device frame helpers)

const { useState, useEffect, useRef, useMemo } = React;

// ── Icons (stroke, 24px grid, inherit currentColor) ─────────────
const Ic = (d, { size = 20, sw = 1.6, fill = 'none' } = {}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
window.Icons = {
  home:    (p) => Ic(<><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>, p),
  dumbbell:(p) => Ic(<><path d="M2 10v4M22 10v4M6 7v10M18 7v10M6 12h12"/></>, p),
  spark:   (p) => Ic(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>, p),
  apple:   (p) => Ic(<><path d="M12 7c1-2 3-3 5-3-.3 2-1.5 4-3 4M12 7c-1-1.5-2.5-3-5-3 .3 2 1.3 3.3 3 4"/><path d="M5 12c0 5 3 9 7 9s7-4 7-9c0-2.5-2-5-5-5-1 0-1.7.4-2 1-.3-.6-1-1-2-1-3 0-5 2.5-5 5Z"/></>, p),
  chart:   (p) => Ic(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>, p),
  user:    (p) => Ic(<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></>, p),
  bell:    (p) => Ic(<><path d="M6 16V10a6 6 0 0 1 12 0v6l1.5 2h-15Z"/><path d="M10 20a2 2 0 0 0 4 0"/></>, p),
  flame:   (p) => Ic(<><path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4-.3 1.5.5 2.5 1.5 2.5 0-3 0-5 1.5-7.5Z"/></>, p),
  trophy:  (p) => Ic(<><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3"/><path d="M9 14h6v2H9zM7 20h10"/><path d="M10 16v4M14 16v4"/></>, p),
  plus:    (p) => Ic(<><path d="M12 5v14M5 12h14"/></>, p),
  play:    (p) => Ic(<><path d="M7 5v14l12-7Z"/></>, { ...p, fill: 'currentColor' }),
  pause:   (p) => Ic(<><rect x="7" y="5" width="3.5" height="14"/><rect x="13.5" y="5" width="3.5" height="14"/></>, { ...p, fill: 'currentColor' }),
  check:   (p) => Ic(<><path d="m5 12 5 5L20 7"/></>, p),
  arrow:   (p) => Ic(<><path d="M5 12h14M13 6l6 6-6 6"/></>, p),
  chev:    (p) => Ic(<><path d="m9 6 6 6-6 6"/></>, p),
  chevDn:  (p) => Ic(<><path d="m6 9 6 6 6-6"/></>, p),
  timer:   (p) => Ic(<><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></>, p),
  camera:  (p) => Ic(<><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></>, p),
  mic:     (p) => Ic(<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>, p),
  news:    (p) => Ic(<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h7M7 13h10M7 17h5"/></>, p),
  scan:    (p) => Ic(<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M3 12h18"/></>, p),
  heart:   (p) => Ic(<><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z"/></>, p),
  settings:(p) => Ic(<><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>, p),
  logo:    (p) => Ic(<><path d="M5 5h3v14H5zM16 5h3v14h-3zM8 10h8v4H8z"/></>, { ...p, fill: 'currentColor', sw: 0 }),
  bolt:    (p) => Ic(<><path d="M13 3 4 14h6l-1 7 9-11h-6z"/></>, { ...p, fill: 'currentColor' }),
  rouble:  (p) => Ic(<><path d="M7 20V4h5a4.5 4.5 0 0 1 0 9H5M5 16h8"/></>, p),
  lock:    (p) => Ic(<><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>, p),
  moon:    (p) => Ic(<><path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/></>, p),
  water:   (p) => Ic(<><path d="M12 3c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13Z"/></>, p),
  target:  (p) => Ic(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></>, p),
  grid:    (p) => Ic(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>, p),
  search:  (p) => Ic(<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, p),
  send:    (p) => Ic(<><path d="m4 12 16-8-5 18-3-8Z"/></>, p),
  refresh: (p) => Ic(<><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></>, p),
  message: (p) => Ic(<><path d="M4 5h16v12H8l-4 4V5Z"/></>, p),
  bookmark:(p) => Ic(<><path d="M6 3h12v18l-6-4-6 4V3Z"/></>, p),
  more:    (p) => Ic(<><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>, p),
};

// ── Progress ring (SVG) ─────────────────────────────
window.Ring = function Ring({ size = 80, stroke = 6, value = 0.65, color = '#D4B07A', track = 'rgba(255,255,255,0.1)', children, rounded = true }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.min(1, Math.max(0, value)));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={track} strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap={rounded ? 'round' : 'butt'} strokeDasharray={C} strokeDashoffset={off}/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
};

// ── Bar (linear progress) ─────────────────────────────
window.Bar = function Bar({ value = 0.5, color = '#D4B07A', track = 'rgba(255,255,255,0.08)', h = 6, radius = 99 }) {
  return (
    <div style={{ height: h, background: track, borderRadius: radius, overflow: 'hidden', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(100, value * 100)}%`, background: color, borderRadius: radius }}/>
    </div>
  );
};

// ── Placeholder media (striped) ─────────────────────────────
window.Placeholder = function Placeholder({ label = 'video', h = 180, radius = 20, tint = 'rgba(255,255,255,0.04)', fg = 'rgba(255,255,255,0.06)' }) {
  return (
    <div style={{
      height: h, borderRadius: radius, background: `repeating-linear-gradient(135deg, ${tint} 0 10px, ${fg} 10px 20px)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono', monospace",
      fontSize: 11, letterSpacing: 1, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase'
    }}>{label}</div>
  );
};

// ── Phone frame (compact, presentational) ─────────────────────────────
window.Phone = function Phone({ children, theme, label, time = '9:41', showHome = true }) {
  const t = theme || window.IG_TOKENS.A;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      {label && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{label}</div>}
      <div style={{
        width: 390, height: 844, borderRadius: 54, background: t.bg, color: t.text,
        padding: 10, boxSizing: 'border-box', position: 'relative',
        boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.06), inset 0 0 0 1px rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.04)',
        fontFamily: t.fontB,
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 44, background: t.bg, overflow: 'hidden', position: 'relative'
        }}>
          {/* status bar */}
          <div style={{ height: 47, display: 'flex', alignItems: 'center', padding: '0 30px', justifyContent: 'space-between', fontSize: 15, fontWeight: 600, color: t.text, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>
            <span>{time}</span>
            <div style={{ width: 120, height: 32, background: '#000', borderRadius: 20, position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 10 }}/>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <svg width="17" height="11" viewBox="0 0 17 11" fill={t.text}><rect y="6" width="3" height="5" rx="0.6"/><rect x="4.5" y="4" width="3" height="7" rx="0.6"/><rect x="9" y="2" width="3" height="9" rx="0.6"/><rect x="13.5" width="3" height="11" rx="0.6"/></svg>
              <svg width="22" height="11" viewBox="0 0 22 11" fill="none" stroke={t.text} strokeWidth="1"><rect x="0.5" y="0.5" width="18" height="10" rx="2.5"/><rect x="2" y="2" width="15" height="7" rx="1" fill={t.text}/><path d="M20 3.5v4" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div style={{ paddingTop: 47, height: 'calc(100% - 0px)', overflow: 'hidden', position: 'relative' }}>
            {children}
          </div>
          {showHome && <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 134, height: 5, borderRadius: 99, background: t.text, opacity: 0.85 }}/>}
        </div>
      </div>
    </div>
  );
};

// ── Tab bar ─────────────────────────────
window.TabBar = function TabBar({ theme, active = 0, items, variant = 'standard' }) {
  const t = theme;
  const defaultItems = items || [
    { icon: 'home', label: 'Главная' },
    { icon: 'dumbbell', label: 'Тренировка' },
    { icon: 'spark', label: 'ИИ', center: true },
    { icon: 'apple', label: 'Питание' },
    { icon: 'user', label: 'Профиль' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 18, height: 72,
      borderRadius: 28, background: 'rgba(20,20,24,0.82)', backdropFilter: 'blur(30px)',
      border: `1px solid ${t.lineStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      padding: '0 10px', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)'
    }}>
      {defaultItems.map((it, i) => {
        const IcComp = window.Icons[it.icon];
        const isActive = i === active;
        if (it.center) {
          return (
            <div key={i} style={{
              width: 56, height: 56, borderRadius: 20, background: t.accent, color: '#0A0A0A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 10px 30px -5px ${t.accent}55`, marginTop: -2
            }}>
              <IcComp size={26} sw={2}/>
            </div>
          );
        }
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: isActive ? t.accent : t.textSub, flex: 1 }}>
            <IcComp size={22}/>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.2 }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
};
