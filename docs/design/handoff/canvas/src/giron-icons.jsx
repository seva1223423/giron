/* global React */
// Giron — варианты иконки приложения
// Поза: квадрат с iOS squircle (radius ~22.37%), 12 направлений
// Размер по умолчанию 200, но иконки векторные — масштабируются на 1024

const G_T = window.IG_TOKENS.A;

// === iOS squircle path (G2 continuity) ===
function squircleClip(id, size = 200) {
  const r = size * 0.2237; // iOS app icon radius
  return (
    <clipPath id={id}>
      <rect x="0" y="0" width={size} height={size} rx={r} ry={r}/>
    </clipPath>
  );
}

function IconFrame({ id, size = 200, bg, children, ring }) {
  const cid = `clip-${id}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <defs>
        {squircleClip(cid, size)}
        {ring}
      </defs>
      <g clipPath={`url(#${cid})`}>
        <rect x="0" y="0" width={size} height={size} fill={bg}/>
        {children}
      </g>
    </svg>
  );
}

// ====== 1) Монограмма G — золото на графите ======
function Icon_GMono({ size = 200 }) {
  return (
    <IconFrame id="g-mono" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="55%" stopColor="#D4B07A"/>
          <stop offset="100%" stopColor="#8E6B3E"/>
        </linearGradient>
        <radialGradient id="glowA" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#D4B07A" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="#D4B07A" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width={size} height={size} fill="url(#glowA)"/>
      {/* Стилизованная G — окружность с разрезом и горизонтальной перекладиной */}
      <g transform={`translate(${size/2}, ${size/2})`}>
        <circle r={size*0.32} fill="none" stroke="url(#goldA)" strokeWidth={size*0.075} strokeLinecap="round" pathLength="100"
                strokeDasharray="76 24" transform="rotate(-30)"/>
        <rect x={size*0.02} y={-size*0.035} width={size*0.27} height={size*0.07} rx={size*0.012} fill="url(#goldA)"/>
      </g>
    </IconFrame>
  );
}

// ====== 2) Гриф штанги, образующий G ======
function Icon_BarbellG({ size = 200 }) {
  const cx = size/2, cy = size/2;
  return (
    <IconFrame id="bar-g" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="100%" stopColor="#9A7544"/>
        </linearGradient>
      </defs>
      {/* блин слева */}
      <rect x={size*0.14} y={size*0.32} width={size*0.07} height={size*0.36} rx={size*0.02} fill="url(#goldB)"/>
      <rect x={size*0.235} y={size*0.40} width={size*0.04} height={size*0.20} rx={size*0.012} fill="url(#goldB)"/>
      {/* блин справа */}
      <rect x={size*0.79} y={size*0.32} width={size*0.07} height={size*0.36} rx={size*0.02} fill="url(#goldB)"/>
      <rect x={size*0.725} y={size*0.40} width={size*0.04} height={size*0.20} rx={size*0.012} fill="url(#goldB)"/>
      {/* гриф изогнутый в дугу G */}
      <path d={`M ${size*0.27} ${cy} Q ${cx} ${size*0.30} ${size*0.73} ${cy}`} stroke="#E8DCC4" strokeWidth={size*0.04} fill="none" strokeLinecap="round"/>
      <path d={`M ${size*0.27} ${cy} Q ${cx} ${size*0.70} ${size*0.73} ${cy}`} stroke="#E8DCC4" strokeWidth={size*0.04} fill="none" strokeLinecap="round"/>
      {/* перекладина G */}
      <rect x={cx-size*0.03} y={cy-size*0.02} width={size*0.18} height={size*0.04} rx={size*0.01} fill="url(#goldB)"/>
    </IconFrame>
  );
}

// ====== 3) Геральдический щит с G ======
function Icon_Shield({ size = 200 }) {
  return (
    <IconFrame id="shield" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldC" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F0CC8F"/>
          <stop offset="100%" stopColor="#9A7544"/>
        </linearGradient>
      </defs>
      <path d={`M ${size*0.5} ${size*0.13}
                L ${size*0.83} ${size*0.25}
                L ${size*0.83} ${size*0.55}
                C ${size*0.83} ${size*0.75}, ${size*0.65} ${size*0.85}, ${size*0.5} ${size*0.92}
                C ${size*0.35} ${size*0.85}, ${size*0.17} ${size*0.75}, ${size*0.17} ${size*0.55}
                L ${size*0.17} ${size*0.25} Z`}
            fill="none" stroke="url(#goldC)" strokeWidth={size*0.03}/>
      {/* G внутри */}
      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle"
            fontFamily="'Manrope', -apple-system, sans-serif"
            fontWeight="800" fontSize={size*0.40}
            fill="url(#goldC)" letterSpacing={-1}>G</text>
    </IconFrame>
  );
}

// ====== 4) Штанговый блин — диск с G в центре ======
function Icon_Plate({ size = 200 }) {
  const cx = size/2, cy = size/2;
  return (
    <IconFrame id="plate" size={size} bg="#0E0E0F">
      <defs>
        <radialGradient id="plateG" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#2A2A30"/>
          <stop offset="100%" stopColor="#15151A"/>
        </radialGradient>
        <linearGradient id="plateRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="100%" stopColor="#8E6B3E"/>
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={size*0.36} fill="url(#plateG)"/>
      <circle cx={cx} cy={cy} r={size*0.36} fill="none" stroke="url(#plateRing)" strokeWidth={size*0.025}/>
      <circle cx={cx} cy={cy} r={size*0.30} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*0.008}/>
      <circle cx={cx} cy={cy} r={size*0.075} fill="none" stroke="url(#plateRing)" strokeWidth={size*0.012}/>
      <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle"
            fontFamily="'Manrope', -apple-system, sans-serif"
            fontWeight="800" fontSize={size*0.30}
            fill="url(#plateRing)" letterSpacing={-1}>G</text>
    </IconFrame>
  );
}

// ====== 5) Полный плоский логотип GIRON ======
function Icon_Wordmark({ size = 200 }) {
  return (
    <IconFrame id="word" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldD" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="100%" stopColor="#B89060"/>
        </linearGradient>
      </defs>
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle"
            fontFamily="'Manrope', -apple-system, sans-serif"
            fontWeight="800" fontSize={size*0.16}
            fill="url(#goldD)" letterSpacing={size*0.012}>GIRON</text>
      <line x1={size*0.30} y1={size*0.62} x2={size*0.70} y2={size*0.62} stroke="url(#goldD)" strokeWidth={size*0.008}/>
      <text x="50%" y="73%" textAnchor="middle" dominantBaseline="middle"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="500" fontSize={size*0.052}
            fill="#A8A49C" letterSpacing={size*0.014}>GYM · IRON</text>
    </IconFrame>
  );
}

// ====== 6) Молния-G ======
function Icon_Bolt({ size = 200 }) {
  return (
    <IconFrame id="bolt" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldE" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="100%" stopColor="#9A7544"/>
        </linearGradient>
        <radialGradient id="glowE" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#D4B07A" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#D4B07A" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width={size} height={size} fill="url(#glowE)"/>
      {/* Молния, конец которой загибается в дугу G */}
      <path d={`M ${size*0.55} ${size*0.15}
                L ${size*0.30} ${size*0.52}
                L ${size*0.46} ${size*0.52}
                L ${size*0.36} ${size*0.85}
                L ${size*0.72} ${size*0.50}
                L ${size*0.55} ${size*0.50}
                Z`} fill="url(#goldE)"/>
    </IconFrame>
  );
}

// ====== 7) Бицепс-силуэт + G ======
function Icon_Bicep({ size = 200 }) {
  return (
    <IconFrame id="bicep" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldF" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="100%" stopColor="#9A7544"/>
        </linearGradient>
      </defs>
      {/* Стилизованный согнутый бицепс */}
      <path d={`M ${size*0.18} ${size*0.62}
                Q ${size*0.18} ${size*0.42}, ${size*0.40} ${size*0.40}
                Q ${size*0.58} ${size*0.38}, ${size*0.62} ${size*0.30}
                Q ${size*0.66} ${size*0.20}, ${size*0.78} ${size*0.22}
                L ${size*0.82} ${size*0.32}
                Q ${size*0.74} ${size*0.36}, ${size*0.74} ${size*0.50}
                Q ${size*0.74} ${size*0.62}, ${size*0.62} ${size*0.66}
                Q ${size*0.50} ${size*0.70}, ${size*0.42} ${size*0.78}
                L ${size*0.32} ${size*0.78}
                Q ${size*0.22} ${size*0.78}, ${size*0.18} ${size*0.62} Z`}
            fill="url(#goldF)"/>
      <circle cx={size*0.50} cy={size*0.52} r={size*0.06} fill="#0E0E0F"/>
      <text x={size*0.50} y={size*0.555} textAnchor="middle" dominantBaseline="middle"
            fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.10}
            fill="url(#goldF)">G</text>
    </IconFrame>
  );
}

// ====== 8) Минимализм — линия-G ======
function Icon_LineG({ size = 200 }) {
  return (
    <IconFrame id="line" size={size} bg="#0E0E0F">
      <g transform={`translate(${size*0.5}, ${size*0.5})`}>
        <circle r={size*0.30} fill="none" stroke="#D4B07A" strokeWidth={size*0.04} strokeDasharray="80 24" pathLength="100" transform="rotate(-30)" strokeLinecap="round"/>
        <line x1="0" y1="0" x2={size*0.22} y2="0" stroke="#D4B07A" strokeWidth={size*0.04} strokeLinecap="round"/>
      </g>
    </IconFrame>
  );
}

// ====== 9) Светлая (light) версия — для onboarding/web ======
function Icon_Light({ size = 200 }) {
  return (
    <IconFrame id="light" size={size} bg="#F4F1EA">
      <defs>
        <linearGradient id="darkG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1A1208"/>
          <stop offset="100%" stopColor="#3A2D18"/>
        </linearGradient>
      </defs>
      <g transform={`translate(${size*0.5}, ${size*0.5})`}>
        <circle r={size*0.30} fill="none" stroke="url(#darkG)" strokeWidth={size*0.075} strokeDasharray="76 24" pathLength="100" transform="rotate(-30)" strokeLinecap="round"/>
        <rect x={size*0.02} y={-size*0.035} width={size*0.27} height={size*0.07} rx={size*0.012} fill="url(#darkG)"/>
      </g>
    </IconFrame>
  );
}

// ====== 10) Diamond — премиум-вариант с пересечением ======
function Icon_Diamond({ size = 200 }) {
  return (
    <IconFrame id="diamond" size={size} bg="#0E0E0F">
      <defs>
        <linearGradient id="goldG" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F4D69E"/>
          <stop offset="100%" stopColor="#9A7544"/>
        </linearGradient>
      </defs>
      <g transform={`translate(${size*0.5}, ${size*0.5}) rotate(45)`}>
        <rect x={-size*0.30} y={-size*0.30} width={size*0.60} height={size*0.60} fill="none" stroke="url(#goldG)" strokeWidth={size*0.035} rx={size*0.04}/>
      </g>
      <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle"
            fontFamily="'Manrope', sans-serif" fontWeight="800" fontSize={size*0.28}
            fill="url(#goldG)" letterSpacing={-1}>G</text>
    </IconFrame>
  );
}

// ====== 11) Цветовая альтернатива — neon (B-направление) ======
function Icon_Neon({ size = 200 }) {
  return (
    <IconFrame id="neon" size={size} bg="#07070A">
      <defs>
        <radialGradient id="limeG" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C6FF3D" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="#C6FF3D" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width={size} height={size} fill="url(#limeG)"/>
      <g transform={`translate(${size*0.5}, ${size*0.5})`}>
        <circle r={size*0.30} fill="none" stroke="#C6FF3D" strokeWidth={size*0.075} strokeDasharray="76 24" pathLength="100" transform="rotate(-30)" strokeLinecap="round"/>
        <rect x={size*0.02} y={-size*0.035} width={size*0.27} height={size*0.07} rx={size*0.012} fill="#C6FF3D"/>
      </g>
    </IconFrame>
  );
}

// ====== 12) Энергия — оранжево-фиолетовый градиент ======
function Icon_Energy({ size = 200 }) {
  return (
    <IconFrame id="energy" size={size}
      bg="url(#energyBg)"
      ring={
        <linearGradient id="energyBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF5A36"/>
          <stop offset="100%" stopColor="#A855F7"/>
        </linearGradient>
      }>
      <g transform={`translate(${size*0.5}, ${size*0.5})`}>
        <circle r={size*0.30} fill="none" stroke="#fff" strokeWidth={size*0.075} strokeDasharray="76 24" pathLength="100" transform="rotate(-30)" strokeLinecap="round"/>
        <rect x={size*0.02} y={-size*0.035} width={size*0.27} height={size*0.07} rx={size*0.012} fill="#fff"/>
      </g>
    </IconFrame>
  );
}

// ====== Сборка экрана ======
window.A_GironIcons = function A_GironIcons() {
  const t = G_T;
  const variants = [
    { c: Icon_GMono,    name: 'Mono Gold',     desc: 'Монограмма G — главный кандидат' },
    { c: Icon_BarbellG, name: 'Barbell',       desc: 'Гриф со штангой образует букву G' },
    { c: Icon_Shield,   name: 'Crest',         desc: 'Геральдический щит — премиум' },
    { c: Icon_Plate,    name: 'Plate',         desc: 'Блин штанги — спортивно, узнаваемо' },
    { c: Icon_Bolt,     name: 'Bolt',          desc: 'Молния-G — энергия, скорость' },
    { c: Icon_Bicep,    name: 'Bicep',         desc: 'Силуэт согнутой руки' },
    { c: Icon_LineG,    name: 'Line',          desc: 'Минимализм, тонкая линия' },
    { c: Icon_Diamond,  name: 'Diamond',       desc: 'Бриллиант — премиум-сегмент' },
    { c: Icon_Wordmark, name: 'Wordmark',      desc: 'Полный логотип' },
    { c: Icon_Light,    name: 'Light',         desc: 'Светлая версия (для веба)' },
    { c: Icon_Neon,     name: 'Neon',          desc: 'Альтернативная палитра (lime)' },
    { c: Icon_Energy,   name: 'Energy',        desc: 'Альтернативная палитра (gradient)' },
  ];

  return (
    <div style={{ background: t.bg, minHeight: '100%', padding: '40px 32px 60px', fontFamily: t.fontB, color: t.text }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* Заголовок */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase', marginBottom: 10 }}>App identity · Giron</div>
          <div style={{ fontFamily: t.fontH, fontSize: 44, fontWeight: 800, color: t.text, letterSpacing: -1 }}>Иконка приложения</div>
          <div style={{ fontSize: 15, color: t.textSub, marginTop: 8, maxWidth: 620, lineHeight: 1.5 }}>
            Giron = Gym + Iron. 12 направлений: монограммы, силуэты, абстракция. Все варианты — векторные SVG, экспортируются в любой размер от 60×60 до 1024×1024 без потери качества.
          </div>
        </div>

        {/* Hero — главный кандидат крупно */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 48, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40, background: t.surface, borderRadius: 28, border: `1px solid ${t.line}` }}>
            <Icon_GMono size={220}/>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Icon_GMono size={120}/>
              <Icon_GMono size={60}/>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' }}>1024 / 120 / 60 px</div>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 700, color: t.accent, letterSpacing: -0.4, marginBottom: 8 }}>Mono Gold</div>
            <div style={{ fontSize: 15, color: t.textSub, lineHeight: 1.55, marginBottom: 16 }}>
              Главный рекомендуемый вариант. Стилизованная буква G образована дугой и горизонтальной перекладиной — читается как монограмма и одновременно намекает на гриф штанги. Тёплое золото на графите соответствует Премиум-направлению приложения.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: 12, background: t.surface, borderRadius: 12, border: `1px solid ${t.line}` }}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Палитра</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: '#0E0E0F', border: `1px solid ${t.line}` }}/>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: '#D4B07A' }}/>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: '#F4D69E' }}/>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: '#8E6B3E' }}/>
                </div>
              </div>
              <div style={{ padding: 12, background: t.surface, borderRadius: 12, border: `1px solid ${t.line}` }}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Squircle</div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.text }}>radius · 22.37%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Грид всех вариантов */}
        <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.4, color: t.textDim, textTransform: 'uppercase', marginBottom: 16 }}>Все 12 вариантов</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
          {variants.map((v, i) => {
            const C = v.c;
            return (
              <div key={i} style={{ padding: 20, background: t.surface, borderRadius: 20, border: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                  <C size={120}/>
                  <div style={{ position: 'absolute', top: -8, left: -8, fontFamily: t.fontM, fontSize: 9, color: t.textDim, background: t.surfaceHi, padding: '3px 7px', borderRadius: 6, border: `1px solid ${t.line}` }}>
                    {String(i+1).padStart(2, '0')}
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

        {/* Mock springboard — как иконка смотрится среди других */}
        <div style={{ marginTop: 48, padding: 28, background: t.surface, borderRadius: 24, border: `1px solid ${t.line}` }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.4, color: t.textDim, textTransform: 'uppercase', marginBottom: 16 }}>На рабочем столе iOS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 18, padding: 20, background: 'linear-gradient(180deg, #2a2018 0%, #1a1410 100%)', borderRadius: 16 }}>
            {/* фейковые соседи */}
            <FakeIcon bg="#34C759" letter="" img="msg"/>
            <FakeIcon bg="#007AFF" letter="" img="phone"/>
            <Icon_GMono size={64}/>
            <FakeIcon bg="#FF3B30" letter="" img="cam"/>
            <FakeIcon bg="#FF9500" letter="" img="map"/>
            <FakeIcon bg="#AF52DE" letter="" img="music"/>
          </div>
        </div>

      </div>
    </div>
  );
};

function FakeIcon({ bg, img }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" style={{ display: 'block' }}>
      <defs>
        <clipPath id={`fc-${img}`}>
          <rect x="0" y="0" width="64" height="64" rx="14"/>
        </clipPath>
      </defs>
      <g clipPath={`url(#fc-${img})`}>
        <rect width="64" height="64" fill={bg}/>
        <g fill="#fff" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {img === 'msg' && <path d="M16 24h32v18H32l-8 6v-6h-8z" fill="none"/>}
          {img === 'phone' && <path d="M22 18l6 4-3 6 8 8 6-3 4 6-4 4c-12 0-24-12-24-24z" fill="none"/>}
          {img === 'cam' && <><circle cx="32" cy="34" r="9" fill="none"/><path d="M22 26h20l-2-4H24z" fill="none"/></>}
          {img === 'map' && <><path d="M20 22l8-3 8 3 8-3v22l-8 3-8-3-8 3z" fill="none"/><line x1="28" y1="19" x2="28" y2="41"/><line x1="36" y1="22" x2="36" y2="44"/></>}
          {img === 'music' && <><circle cx="26" cy="42" r="4" fill="none"/><circle cx="42" cy="38" r="4" fill="none"/><path d="M30 42V20l16-2v20" fill="none"/></>}
        </g>
      </g>
    </svg>
  );
}
