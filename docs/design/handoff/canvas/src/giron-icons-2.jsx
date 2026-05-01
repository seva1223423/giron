/* global React */
// Giron — серия 2: ещё 12 направлений иконки
const G_T2 = window.IG_TOKENS.A;

function squircleClip(id, size = 200) {
  const r = size * 0.2237;
  return <clipPath id={id}><rect x="0" y="0" width={size} height={size} rx={r} ry={r}/></clipPath>;
}

function IconFrame2({ id, size = 200, bg, children, defs }) {
  const cid = `clip2-${id}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>{squircleClip(cid, size)}{defs}</defs>
      <g clipPath={`url(#${cid})`}>
        <rect x="0" y="0" width={size} height={size} fill={bg}/>
        {children}
      </g>
    </svg>
  );
}

const goldDef = (id) => (
  <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stopColor="#F4D69E"/>
    <stop offset="55%" stopColor="#D4B07A"/>
    <stop offset="100%" stopColor="#8E6B3E"/>
  </linearGradient>
);

// === 13. Шестерёнка-силовая ===
function I_Gear({ size = 200 }) {
  const cx = size/2, cy = size/2;
  const teeth = 8;
  const outer = size*0.36, inner = size*0.30;
  const path = [];
  for (let i = 0; i < teeth*2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / teeth;
    path.push(`${i === 0 ? 'M' : 'L'} ${cx + r*Math.cos(a)} ${cy + r*Math.sin(a)}`);
  }
  path.push('Z');
  return (
    <IconFrame2 id="gear" size={size} bg="#0E0E0F" defs={goldDef('gold-13')}>
      <path d={path.join(' ')} fill="none" stroke="url(#gold-13)" strokeWidth={size*0.025} strokeLinejoin="round"/>
      <circle cx={cx} cy={cy} r={size*0.12} fill="none" stroke="url(#gold-13)" strokeWidth={size*0.025}/>
      <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.16}
        fill="url(#gold-13)">G</text>
    </IconFrame2>
  );
}

// === 14. Гантель ===
function I_Dumbbell({ size = 200 }) {
  return (
    <IconFrame2 id="db" size={size} bg="#0E0E0F" defs={goldDef('gold-14')}>
      <g transform={`translate(${size/2}, ${size/2}) rotate(-30)`}>
        <rect x={-size*0.30} y={-size*0.10} width={size*0.07} height={size*0.20} rx={size*0.018} fill="url(#gold-14)"/>
        <rect x={-size*0.22} y={-size*0.06} width={size*0.04} height={size*0.12} rx={size*0.012} fill="url(#gold-14)"/>
        <rect x={-size*0.18} y={-size*0.02} width={size*0.36} height={size*0.04} rx={size*0.01} fill="url(#gold-14)"/>
        <rect x={size*0.18} y={-size*0.06} width={size*0.04} height={size*0.12} rx={size*0.012} fill="url(#gold-14)"/>
        <rect x={size*0.23} y={-size*0.10} width={size*0.07} height={size*0.20} rx={size*0.018} fill="url(#gold-14)"/>
      </g>
    </IconFrame2>
  );
}

// === 15. Кольцо силы (3D-эффект, металлическое) ===
function I_Ring3D({ size = 200 }) {
  const cx = size/2, cy = size/2;
  return (
    <IconFrame2 id="ring3d" size={size} bg="#0E0E0F" defs={
      <>
        <radialGradient id="metal-15" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#F8E0B0"/>
          <stop offset="50%" stopColor="#D4B07A"/>
          <stop offset="100%" stopColor="#5A4326"/>
        </radialGradient>
        <radialGradient id="metalIn-15" cx="50%" cy="65%" r="50%">
          <stop offset="0%" stopColor="#5A4326"/>
          <stop offset="100%" stopColor="#1A1208"/>
        </radialGradient>
      </>
    }>
      <circle cx={cx} cy={cy} r={size*0.36} fill="url(#metal-15)"/>
      <circle cx={cx} cy={cy} r={size*0.22} fill="url(#metalIn-15)"/>
      <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="900" fontSize={size*0.22}
        fill="#F4D69E">G</text>
    </IconFrame2>
  );
}

// === 16. Сетка / data — для AI-тренера ===
function I_Grid({ size = 200 }) {
  return (
    <IconFrame2 id="grid" size={size} bg="#0E0E0F" defs={goldDef('gold-16')}>
      {Array.from({ length: 4 }).map((_, r) =>
        Array.from({ length: 4 }).map((_, c) => {
          const isG = (r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1);
          return (
            <rect key={`${r}-${c}`} x={size*(0.18 + c*0.16)} y={size*(0.18 + r*0.16)}
              width={size*0.12} height={size*0.12} rx={size*0.025}
              fill={isG ? 'url(#gold-16)' : 'rgba(212,176,122,0.15)'}/>
          );
        })
      )}
    </IconFrame2>
  );
}

// === 17. Кубок / трофей ===
function I_Trophy({ size = 200 }) {
  return (
    <IconFrame2 id="trophy" size={size} bg="#0E0E0F" defs={goldDef('gold-17')}>
      {/* Чаша */}
      <path d={`M ${size*0.30} ${size*0.22}
                L ${size*0.70} ${size*0.22}
                L ${size*0.66} ${size*0.50}
                Q ${size*0.66} ${size*0.62}, ${size*0.50} ${size*0.62}
                Q ${size*0.34} ${size*0.62}, ${size*0.34} ${size*0.50}
                Z`} fill="url(#gold-17)"/>
      {/* Ушки */}
      <path d={`M ${size*0.30} ${size*0.28} Q ${size*0.18} ${size*0.30}, ${size*0.20} ${size*0.42} L ${size*0.28} ${size*0.42}`} fill="none" stroke="url(#gold-17)" strokeWidth={size*0.025}/>
      <path d={`M ${size*0.70} ${size*0.28} Q ${size*0.82} ${size*0.30}, ${size*0.80} ${size*0.42} L ${size*0.72} ${size*0.42}`} fill="none" stroke="url(#gold-17)" strokeWidth={size*0.025}/>
      {/* Ножка + база */}
      <rect x={size*0.46} y={size*0.62} width={size*0.08} height={size*0.10} fill="url(#gold-17)"/>
      <rect x={size*0.34} y={size*0.72} width={size*0.32} height={size*0.07} rx={size*0.012} fill="url(#gold-17)"/>
      {/* G */}
      <text x="50%" y="42%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.16}
        fill="#1A1208">G</text>
    </IconFrame2>
  );
}

// === 18. Сердцебиение / пульс ===
function I_Pulse({ size = 200 }) {
  return (
    <IconFrame2 id="pulse" size={size} bg="#0E0E0F" defs={goldDef('gold-18')}>
      <path d={`M ${size*0.10} ${size*0.50}
                L ${size*0.30} ${size*0.50}
                L ${size*0.36} ${size*0.32}
                L ${size*0.46} ${size*0.68}
                L ${size*0.54} ${size*0.40}
                L ${size*0.62} ${size*0.50}
                L ${size*0.90} ${size*0.50}`}
        fill="none" stroke="url(#gold-18)" strokeWidth={size*0.05} strokeLinecap="round" strokeLinejoin="round"/>
      <text x="50%" y="78%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.14}
        fill="url(#gold-18)" letterSpacing={1}>GIRON</text>
    </IconFrame2>
  );
}

// === 19. Стрелка вверх (рост / прогресс) ===
function I_Arrow({ size = 200 }) {
  return (
    <IconFrame2 id="arrow" size={size} bg="#0E0E0F" defs={goldDef('gold-19')}>
      <path d={`M ${size*0.50} ${size*0.18}
                L ${size*0.78} ${size*0.46}
                L ${size*0.62} ${size*0.46}
                L ${size*0.62} ${size*0.82}
                L ${size*0.38} ${size*0.82}
                L ${size*0.38} ${size*0.46}
                L ${size*0.22} ${size*0.46} Z`} fill="url(#gold-19)"/>
    </IconFrame2>
  );
}

// === 20. Огонь / streak ===
function I_Flame({ size = 200 }) {
  return (
    <IconFrame2 id="flame" size={size} bg="#0E0E0F" defs={
      <linearGradient id="flame-20" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#8E6B3E"/>
        <stop offset="50%" stopColor="#D4B07A"/>
        <stop offset="100%" stopColor="#F4D69E"/>
      </linearGradient>
    }>
      <path d={`M ${size*0.50} ${size*0.16}
                C ${size*0.36} ${size*0.32}, ${size*0.26} ${size*0.42}, ${size*0.30} ${size*0.58}
                C ${size*0.34} ${size*0.74}, ${size*0.42} ${size*0.86}, ${size*0.50} ${size*0.86}
                C ${size*0.58} ${size*0.86}, ${size*0.70} ${size*0.78}, ${size*0.72} ${size*0.62}
                C ${size*0.74} ${size*0.50}, ${size*0.66} ${size*0.42}, ${size*0.62} ${size*0.50}
                C ${size*0.62} ${size*0.34}, ${size*0.56} ${size*0.24}, ${size*0.50} ${size*0.16} Z`}
        fill="url(#flame-20)"/>
      <text x="50%" y="68%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.14}
        fill="#1A1208">G</text>
    </IconFrame2>
  );
}

// === 21. Кран (cross / hex / X) — техно ===
function I_Hex({ size = 200 }) {
  const cx = size/2, cy = size/2, r = size*0.34;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI / 3) - Math.PI/2;
    pts.push(`${cx + r*Math.cos(a)},${cy + r*Math.sin(a)}`);
  }
  return (
    <IconFrame2 id="hex" size={size} bg="#0E0E0F" defs={goldDef('gold-21')}>
      <polygon points={pts.join(' ')} fill="none" stroke="url(#gold-21)" strokeWidth={size*0.025}/>
      <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.30}
        fill="url(#gold-21)">G</text>
    </IconFrame2>
  );
}

// === 22. Пик / гора (вершина) ===
function I_Peak({ size = 200 }) {
  return (
    <IconFrame2 id="peak" size={size} bg="#0E0E0F" defs={goldDef('gold-22')}>
      <path d={`M ${size*0.14} ${size*0.78}
                L ${size*0.36} ${size*0.40}
                L ${size*0.50} ${size*0.56}
                L ${size*0.64} ${size*0.30}
                L ${size*0.86} ${size*0.78} Z`} fill="url(#gold-22)"/>
      <circle cx={size*0.64} cy={size*0.30} r={size*0.04} fill="#0E0E0F"/>
    </IconFrame2>
  );
}

// === 23. Embossed leather — премиум ===
function I_Leather({ size = 200 }) {
  return (
    <IconFrame2 id="leather" size={size} bg="#1F1814" defs={
      <>
        {goldDef('gold-23')}
        <radialGradient id="leatherBg-23" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#3A2D1F"/>
          <stop offset="100%" stopColor="#15100A"/>
        </radialGradient>
      </>
    }>
      <rect width={size} height={size} fill="url(#leatherBg-23)"/>
      {/* Stitched border */}
      <rect x={size*0.10} y={size*0.10} width={size*0.80} height={size*0.80} rx={size*0.16}
        fill="none" stroke="url(#gold-23)" strokeWidth={size*0.008} strokeDasharray="3 3"/>
      <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle"
        fontFamily="'Manrope', sans-serif" fontWeight="900" fontSize={size*0.42}
        fill="url(#gold-23)" letterSpacing={-2}>G</text>
    </IconFrame2>
  );
}

// === 24. Минимальная двойная линия G/I ===
function I_DoubleLine({ size = 200 }) {
  return (
    <IconFrame2 id="dblline" size={size} bg="#0E0E0F" defs={goldDef('gold-24')}>
      <g transform={`translate(${size*0.5}, ${size*0.5})`}>
        <circle r={size*0.26} fill="none" stroke="url(#gold-24)" strokeWidth={size*0.025} strokeDasharray="68 32" pathLength="100" transform="rotate(-30)" strokeLinecap="round"/>
        <line x1={size*0.04} y1="0" x2={size*0.20} y2="0" stroke="url(#gold-24)" strokeWidth={size*0.025} strokeLinecap="round"/>
        <line x1={-size*0.06} y1={size*0.18} x2={-size*0.06} y2={-size*0.18} stroke="url(#gold-24)" strokeWidth={size*0.025} strokeLinecap="round"/>
      </g>
    </IconFrame2>
  );
}

// === Сборка экрана ===
window.A_GironIcons2 = function A_GironIcons2() {
  const t = G_T2;
  const items = [
    { c: I_Gear,       name: 'Gear',         desc: 'Шестерёнка — механика силы' },
    { c: I_Dumbbell,   name: 'Dumbbell',     desc: 'Гантель — спорт-классика' },
    { c: I_Ring3D,     name: 'Coin',         desc: 'Объёмный медальон, 3D-металл' },
    { c: I_Grid,       name: 'Grid',         desc: 'Сетка данных — AI-тренер' },
    { c: I_Trophy,     name: 'Trophy',       desc: 'Кубок — достижения, PR' },
    { c: I_Pulse,      name: 'Pulse',        desc: 'Пульс / кардио' },
    { c: I_Arrow,      name: 'Arrow Up',     desc: 'Стрелка роста — прогресс' },
    { c: I_Flame,      name: 'Flame',        desc: 'Огонь — streak / серия' },
    { c: I_Hex,        name: 'Hex',          desc: 'Шестиугольник — техно' },
    { c: I_Peak,       name: 'Peak',         desc: 'Горный пик — вершина' },
    { c: I_Leather,    name: 'Leather',      desc: 'Тиснёная кожа — премиум-сегмент' },
    { c: I_DoubleLine, name: 'Doubleline',   desc: 'Минимализм G + I вместе' },
  ];

  return (
    <div style={{ background: t.bg, minHeight: '100%', padding: '40px 32px 60px', fontFamily: t.fontB, color: t.text }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase', marginBottom: 10 }}>App identity · Giron · Серия 2</div>
          <div style={{ fontFamily: t.fontH, fontSize: 44, fontWeight: 800, color: t.text, letterSpacing: -1 }}>Ещё 12 направлений</div>
          <div style={{ fontSize: 15, color: t.textSub, marginTop: 8, maxWidth: 620, lineHeight: 1.5 }}>
            Метафоры: техника (Gear, Hex, Grid), достижения (Trophy, Peak, Arrow), процесс (Pulse, Flame), премиум-материалы (Leather, Coin) и абстрактный минимализм.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
          {items.map((v, i) => {
            const C = v.c;
            return (
              <div key={i} style={{ padding: 20, background: t.surface, borderRadius: 20, border: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                  <C size={120}/>
                  <div style={{ position: 'absolute', top: -8, left: -8, fontFamily: t.fontM, fontSize: 9, color: t.textDim, background: t.surfaceHi, padding: '3px 7px', borderRadius: 6, border: `1px solid ${t.line}` }}>
                    {String(i+13).padStart(2, '0')}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 600, color: t.text }}>{v.name}</div>
                  <div style={{ fontSize: 11.5, color: t.textSub, marginTop: 2, lineHeight: 1.4 }}>{v.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, opacity: 0.7 }}>
                  <C size={36}/>
                  <C size={28}/>
                  <C size={20}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
