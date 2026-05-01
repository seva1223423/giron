/* global React */
// Iron Gym — фирменные стикеры (SVG)
// Используют золото на графите. Каждый — самодостаточный SVG, можно вставлять как декор.

const ST = window.IG_TOKENS.A;

// Базовая обёртка
const Sticker = ({ size = 96, children, rotate = 0, style = {} }) => (
  <div style={{ width: size, height: size, transform: `rotate(${rotate}deg)`, filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.35))', ...style }}>
    <svg viewBox="0 0 100 100" width="100%" height="100%">{children}</svg>
  </div>
);

// 1. PR — золотой жетон
const StickerPR = (props) => (
  <Sticker {...props}>
    <defs>
      <linearGradient id="prGrad" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#E8C895"/>
        <stop offset="1" stopColor="#A87F48"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="44" fill="url(#prGrad)" stroke="#0A0A0A" strokeWidth="2"/>
    <circle cx="50" cy="50" r="38" fill="none" stroke="#0A0A0A" strokeWidth="1" strokeDasharray="2 3" opacity="0.4"/>
    <text x="50" y="44" fontFamily="Manrope, sans-serif" fontSize="11" fontWeight="700" textAnchor="middle" fill="#0A0A0A" letterSpacing="2">NEW</text>
    <text x="50" y="68" fontFamily="Manrope, sans-serif" fontSize="26" fontWeight="700" textAnchor="middle" fill="#0A0A0A" letterSpacing="-1">PR</text>
    <path d="M22 50 L18 46 M82 50 L78 46 M22 50 L18 54 M82 50 L78 54" stroke="#0A0A0A" strokeWidth="1.5" fill="none" opacity="0.6"/>
  </Sticker>
);

// 2. Огонь стрика
const StickerStreak = (props) => (
  <Sticker {...props}>
    <defs>
      <linearGradient id="flGrad" x1="0" x2="0" y1="1" y2="0">
        <stop offset="0" stopColor="#E07A6B"/>
        <stop offset="0.6" stopColor="#E8A36A"/>
        <stop offset="1" stopColor="#FFD27A"/>
      </linearGradient>
    </defs>
    <path d="M50 12 C 60 28, 78 38, 78 60 a 28 28 0 0 1 -56 0 c 0 -14 8 -22 16 -28 c -2 9 4 14 9 14 c 0 -18 0 -28 3 -34 z"
      fill="url(#flGrad)" stroke="#0A0A0A" strokeWidth="2"/>
    <text x="50" y="78" fontFamily="Manrope, sans-serif" fontSize="14" fontWeight="800" textAnchor="middle" fill="#0A0A0A">47</text>
  </Sticker>
);

// 3. Гриф со «штангой» — наклейка
const StickerBarbell = (props) => (
  <Sticker {...props}>
    <rect x="6" y="44" width="88" height="12" rx="3" fill={ST.accent} stroke="#0A0A0A" strokeWidth="2"/>
    <rect x="14" y="34" width="10" height="32" rx="2" fill="#0A0A0A"/>
    <rect x="76" y="34" width="10" height="32" rx="2" fill="#0A0A0A"/>
    <rect x="26" y="38" width="6" height="24" rx="1" fill="#E07A6B" stroke="#0A0A0A" strokeWidth="1"/>
    <rect x="68" y="38" width="6" height="24" rx="1" fill="#E07A6B" stroke="#0A0A0A" strokeWidth="1"/>
    <text x="50" y="86" fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" textAnchor="middle" fill={ST.text} letterSpacing="2">IRON</text>
  </Sticker>
);

// 4. Молния — буст
const StickerBolt = (props) => (
  <Sticker {...props}>
    <circle cx="50" cy="50" r="42" fill="#0E0E0F" stroke={ST.accent} strokeWidth="2.5"/>
    <path d="M55 18 L30 54 L48 54 L42 82 L70 44 L52 44 Z" fill={ST.accent} stroke="#0A0A0A" strokeWidth="1.5" strokeLinejoin="round"/>
  </Sticker>
);

// 5. Кубок — ачивка
const StickerTrophy = (props) => (
  <Sticker {...props}>
    <circle cx="50" cy="50" r="44" fill={ST.accent} stroke="#0A0A0A" strokeWidth="2"/>
    <path d="M34 22 L66 22 L66 38 a 16 16 0 0 1 -32 0 Z" fill="#0A0A0A"/>
    <path d="M34 28 L26 28 L26 34 a 8 8 0 0 0 8 8 M66 28 L74 28 L74 34 a 8 8 0 0 1 -8 8" fill="none" stroke="#0A0A0A" strokeWidth="2"/>
    <rect x="44" y="56" width="12" height="8" fill="#0A0A0A"/>
    <rect x="36" y="64" width="28" height="6" rx="1" fill="#0A0A0A"/>
    <text x="50" y="82" fontFamily="Manrope, sans-serif" fontSize="9" fontWeight="800" textAnchor="middle" fill="#0A0A0A" letterSpacing="2">CHAMPION</text>
  </Sticker>
);

// 6. Sweat / капля пота
const StickerSweat = (props) => (
  <Sticker {...props}>
    <defs>
      <linearGradient id="dropG" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#7AE6FF"/>
        <stop offset="1" stopColor="#3B7BB0"/>
      </linearGradient>
    </defs>
    <path d="M50 14 C 65 32, 78 46, 78 60 a 28 28 0 0 1 -56 0 C 22 46, 35 32, 50 14 z" fill="url(#dropG)" stroke="#0A0A0A" strokeWidth="2"/>
    <ellipse cx="42" cy="46" rx="6" ry="10" fill="#fff" opacity="0.45"/>
    <text x="50" y="80" fontFamily="JetBrains Mono, monospace" fontSize="7" fontWeight="700" textAnchor="middle" fill="#0A0A0A" letterSpacing="1.5">SWEAT</text>
  </Sticker>
);

// 7. Бицепс — сила
const StickerBeast = (props) => (
  <Sticker {...props}>
    <circle cx="50" cy="50" r="42" fill="#1E1810" stroke={ST.accent} strokeWidth="2.5"/>
    <path d="M22 58 Q 22 44 36 44 L42 44 Q 50 30 60 38 Q 76 36 78 56 Q 70 58 60 56 Q 56 64 50 60 L40 60 Q 28 60 22 58 Z" fill={ST.accent}/>
    <circle cx="64" cy="48" r="4" fill="#0A0A0A"/>
    <text x="50" y="82" fontFamily="Manrope, sans-serif" fontSize="11" fontWeight="800" textAnchor="middle" fill={ST.accent} letterSpacing="3">BEAST</text>
  </Sticker>
);

// 8. Сердечко HR
const StickerHR = (props) => (
  <Sticker {...props}>
    <path d="M50 84 C 12 60, 12 28, 32 22 C 42 18, 50 26, 50 32 C 50 26, 58 18, 68 22 C 88 28, 88 60, 50 84 Z" fill="#E07A6B" stroke="#0A0A0A" strokeWidth="2"/>
    <path d="M22 52 L34 52 L40 40 L48 64 L56 46 L62 52 L78 52" stroke="#0A0A0A" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </Sticker>
);

// 9. «100%» — выполнено
const Sticker100 = (props) => (
  <Sticker {...props}>
    <circle cx="50" cy="50" r="44" fill={ST.good} stroke="#0A0A0A" strokeWidth="2"/>
    <text x="50" y="60" fontFamily="Manrope, sans-serif" fontSize="22" fontWeight="800" textAnchor="middle" fill="#0A0A0A" letterSpacing="-1">100%</text>
    <text x="50" y="78" fontFamily="JetBrains Mono, monospace" fontSize="7" fontWeight="700" textAnchor="middle" fill="#0A0A0A" letterSpacing="2">DONE</text>
    <path d="M50 18 L52 22 L56 20 L55 24 L58 26 L54 28 L54 32 L50 30 L46 32 L46 28 L42 26 L45 24 L44 20 L48 22 Z" fill="#0A0A0A"/>
  </Sticker>
);

// 10. ИИ-искра
const StickerAI = (props) => (
  <Sticker {...props}>
    <rect x="8" y="8" width="84" height="84" rx="16" fill="#0E0E0F" stroke={ST.accent} strokeWidth="2.5"/>
    <path d="M50 22 L54 42 L74 46 L54 50 L50 70 L46 50 L26 46 L46 42 Z" fill={ST.accent}/>
    <circle cx="32" cy="28" r="3" fill={ST.accent}/>
    <circle cx="72" cy="76" r="3" fill={ST.accent}/>
    <text x="50" y="92" fontFamily="JetBrains Mono, monospace" fontSize="8" fontWeight="700" textAnchor="middle" fill={ST.accent} letterSpacing="2">AI COACH</text>
  </Sticker>
);

// 11. Сон — луна
const StickerSleep = (props) => (
  <Sticker {...props}>
    <circle cx="50" cy="50" r="42" fill="#1E1830" stroke="#0A0A0A" strokeWidth="2"/>
    <path d="M62 28 a 24 24 0 1 0 12 36 a 18 18 0 0 1 -12 -36 z" fill="#E8E0D0"/>
    <circle cx="34" cy="32" r="1.5" fill="#fff"/>
    <circle cx="28" cy="44" r="1" fill="#fff"/>
    <circle cx="38" cy="58" r="1.5" fill="#fff"/>
    <text x="50" y="82" fontFamily="JetBrains Mono, monospace" fontSize="8" fontWeight="700" textAnchor="middle" fill={ST.text} letterSpacing="2">REST</text>
  </Sticker>
);

// 12. «GO» — старт
const StickerGo = (props) => (
  <Sticker {...props}>
    <circle cx="50" cy="50" r="44" fill={ST.danger} stroke="#0A0A0A" strokeWidth="2"/>
    <text x="50" y="62" fontFamily="Manrope, sans-serif" fontSize="32" fontWeight="800" textAnchor="middle" fill="#0A0A0A" letterSpacing="-1">GO</text>
    <path d="M50 14 L54 8 L46 8 Z" fill="#0A0A0A"/>
    <path d="M50 86 L54 92 L46 92 Z" fill="#0A0A0A"/>
  </Sticker>
);

// Экспорт стикеров
window.IGStickers = {
  PR: StickerPR,
  Streak: StickerStreak,
  Barbell: StickerBarbell,
  Bolt: StickerBolt,
  Trophy: StickerTrophy,
  Sweat: StickerSweat,
  Beast: StickerBeast,
  HR: StickerHR,
  Hundred: Sticker100,
  AI: StickerAI,
  Sleep: StickerSleep,
  Go: StickerGo,
};

// ═══════════ Витрина стикеров (в приложении) ═══════════
window.A_Stickers = function A_Stickers() {
  const t = window.IG_TOKENS.A;
  const TabBar = window.TabBar;
  const Icons = window.Icons;
  const items = [
    { c: StickerPR, n: 'New PR', d: 'За личный рекорд', cat: 'Достижения' },
    { c: StickerTrophy, n: 'Champion', d: 'Серия из 30 побед', cat: 'Достижения' },
    { c: Sticker100, n: '100%', d: 'Программа выполнена', cat: 'Достижения' },
    { c: StickerStreak, n: 'On Fire', d: 'Стрик 7+ дней', cat: 'Стрики' },
    { c: StickerBolt, n: 'Boost', d: 'Тренировка завершена', cat: 'Активность' },
    { c: StickerBarbell, n: 'Iron', d: 'Силовая в зале', cat: 'Активность' },
    { c: StickerSweat, n: 'Sweat', d: 'Высокая интенсивность', cat: 'Активность' },
    { c: StickerHR, n: 'Heart', d: 'Кардио-зона', cat: 'Активность' },
    { c: StickerBeast, n: 'Beast Mode', d: 'PR + RPE 10', cat: 'Эпик' },
    { c: StickerAI, n: 'AI Coach', d: 'План от ИИ', cat: 'Эпик' },
    { c: StickerSleep, n: 'Recovery', d: 'День восстановления', cat: 'Восстан.' },
    { c: StickerGo, n: 'Go!', d: 'Старт челленджа', cat: 'Активность' },
  ];

  const cats = ['Все', 'Достижения', 'Стрики', 'Активность', 'Эпик', 'Восстан.'];
  const [active, setActive] = React.useState(0);

  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Награды</div>
            <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 500, letterSpacing: -0.8 }}>Стикеры</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.send size={16}/>
          </div>
        </div>

        {/* Hero — featured sticker */}
        <div style={{ background: `linear-gradient(135deg, #1E1810, #2A1F12)`, border: `1px solid ${t.accent}66`, borderRadius: 24, padding: 22, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}33, transparent 70%)` }}/>
          <div style={{ position: 'absolute', top: -20, right: -10, opacity: 0.15 }}>
            <StickerPR size={180} rotate={-12}/>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' }}>● Получено сегодня</div>
            <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.5, marginTop: 8, lineHeight: 1.15, maxWidth: 220 }}>Ты выбил<br/>новый рекорд<br/>в жиме лёжа</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button style={{ padding: '8px 14px', borderRadius: 10, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 12, fontWeight: 700 }}>Поделиться</button>
              <button style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: t.text, border: `1px solid ${t.line}`, fontSize: 12, fontWeight: 600 }}>В коллекцию</button>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { l: 'Получено', v: '23' },
            { l: 'Закрыто', v: '5' },
            { l: 'Эпик', v: '2' },
          ].map((s, i) => (
            <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: 12, textAlign: 'center' }}>
              <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.5 }}>{s.v}</div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
          {cats.map((c, i) => (
            <div key={i} onClick={() => setActive(i)} style={{ whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 10, background: i === active ? t.accent : 'transparent', color: i === active ? '#0A0A0A' : t.textSub, border: `1px solid ${i === active ? t.accent : t.line}`, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{c}</div>
          ))}
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items.filter(it => active === 0 || it.cat === cats[active]).map((it, i) => {
            const C = it.c;
            const locked = i > 7;
            return (
              <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', overflow: 'hidden' }}>
                <div style={{ background: `radial-gradient(circle at 50% 50%, ${t.surfaceHi}, ${t.surface})`, width: '100%', height: 96, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: locked ? 'grayscale(1) opacity(0.35)' : 'none' }}>
                  <C size={70} rotate={i % 3 === 0 ? -6 : i % 3 === 1 ? 4 : 0}/>
                </div>
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>{it.n}</div>
                  <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, marginTop: 2 }}>{it.d}</div>
                </div>
                {locked && (
                  <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 7, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textDim }}>
                    <Icons.lock size={11}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Use in chat hint */}
        <div style={{ marginTop: 16, padding: 14, background: `linear-gradient(135deg, ${t.surface}, ${t.surfaceHi})`, border: `1px solid ${t.line}`, borderRadius: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icons.message size={16}/>
          </div>
          <div style={{ flex: 1, fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
            <span style={{ color: t.text, fontWeight: 600 }}>Используй в чатах:</span> кидай стикеры друзьям после тренировок и рекордов.
          </div>
          <Icons.chev size={16}/>
        </div>
      </div>
      <TabBar theme={t} active={4}/>
    </div>
  );
};
