/* global React */
// Adaptive Showcase — render the same A_Home screen in many breakpoints
// side-by-side, so the team can see how the new responsive system reflows.
//
// Each cell scales the 390pt canvas to its column width, so the *content*
// in the iframe is identical — you're just seeing how the artboard would
// look on a 320pt SE vs a 1024pt iPad landscape.

const A_RP_T = window.IG_TOKENS.A;

// Real device snapshots we want to support. Width in logical px.
const A_RP_DEVICES = [
  { id: 'fold',    label: 'Galaxy Z Fold cover',  w: 280, h: 653, bp: 'xs',     note: '<360 · самый узкий' },
  { id: 'se',      label: 'iPhone SE / 320pt',    w: 320, h: 568, bp: 'xs',     note: 'короткий, без notch' },
  { id: 'mini',    label: 'iPhone 13 mini',       w: 375, h: 812, bp: 'sm',     note: '375 · стандарт SE 2/3' },
  { id: 'pro',     label: 'iPhone 14/15 Pro',     w: 393, h: 852, bp: 'md',     note: 'baseline макета' },
  { id: 'maxx',    label: 'iPhone 15 Pro Max',    w: 430, h: 932, bp: 'lg',     note: 'просторный' },
  { id: 'ipad',    label: 'iPad mini portrait',   w: 744, h: 1133, bp: 'tablet', note: '2 колонки, шире gutter' },
  { id: 'ipadL',   label: 'iPad landscape',       w: 1024, h: 768, bp: 'desktop', note: 'центрировано, max-width' },
];

// Render a phone-shaped frame with A_Home inside, scaled to fit `frameW` width.
// We approximate the responsive system: tighter padding on xs, wider on tablet+.
function A_RP_Frame({ device, frameW = 280 }) {
  const t = A_RP_T;
  const { w, h, label, bp, note } = device;
  // Scale so frame width matches the column width.
  const scale = frameW / w;
  // Bigger devices keep their aspect ratio; cap visible height.
  const innerH = Math.min(h, 760 / scale);

  // Visual breakpoint badge color
  const bpColor = bp === 'xs' ? '#E4936A' : bp === 'sm' ? '#A67BFF' : bp === 'md' ? t.accent : bp === 'lg' ? '#7AC8B6' : bp === 'tablet' ? '#7AB1FF' : '#FFD27A';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {/* Caption above each device */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: 56, justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: bpColor, color: '#0A0A0A', fontFamily: t.fontM, fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 6px', borderRadius: 4 }}>{bp}</span>
          <span style={{ color: t.text, fontFamily: t.fontH, fontSize: 13, fontWeight: 500 }}>{label}</span>
        </div>
        <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 0.4 }}>{w}×{h} · {note}</div>
      </div>

      {/* Device frame */}
      <div style={{
        width: frameW,
        height: innerH * scale,
        borderRadius: Math.max(16, frameW * 0.07),
        border: `2px solid ${t.line}`,
        background: '#000',
        padding: 4,
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        position: 'relative',
        flexShrink: 0,
      }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: Math.max(12, frameW * 0.055),
          overflow: 'hidden',
          position: 'relative',
          background: t.bg,
        }}>
          <div style={{
            width: w,
            height: innerH,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}>
            <A_RP_HomeForBP bp={bp} width={w}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reflowed Home — adapts gutters, font sizes and column count by breakpoint.
function A_RP_HomeForBP({ bp, width }) {
  const t = A_RP_T;
  const Icons = window.Icons;

  // Breakpoint-aware tokens
  const gutter = bp === 'xs' ? 14 : bp === 'sm' ? 16 : bp === 'md' ? 20 : bp === 'lg' ? 22 : bp === 'tablet' ? 32 : 48;
  const heroSize = bp === 'xs' ? 26 : bp === 'sm' ? 30 : bp === 'md' ? 34 : bp === 'lg' ? 38 : 42;
  const cardCols = bp === 'tablet' ? 2 : bp === 'desktop' ? 3 : 1;
  const tileCols = bp === 'xs' ? 2 : bp === 'sm' || bp === 'md' || bp === 'lg' ? 3 : bp === 'tablet' ? 4 : 6;
  const maxContent = bp === 'tablet' ? 720 : bp === 'desktop' ? 920 : 9999;
  const showSubtitleOnHero = bp !== 'xs';

  const chips = ['Сегодня', 'План', 'Тренировки', 'Питание', 'Прогресс'];
  const tiles = [
    { ic: Icons.dumbbell, l: 'Грудь · трицепс', s: '54 мин · 6 упр' },
    { ic: Icons.flame,    l: 'HIIT 20 мин',     s: 'кардио' },
    { ic: Icons.apple,    l: '1 840 ккал',      s: '152/180 г белка' },
    { ic: Icons.water,    l: '1.6 / 2.5 л',     s: 'вода' },
    { ic: Icons.heart,    l: '64 уд',           s: 'покой' },
    { ic: Icons.moon,     l: '7ч 12м',          s: 'сон' },
  ];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: t.bg,
      color: t.text,
      fontFamily: t.fontB,
      overflow: 'hidden',
      padding: `${bp === 'xs' ? 14 : 18}px ${gutter}px ${gutter}px`,
      boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: maxContent, margin: '0 auto', height: '100%' }}>
        {/* Status row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: bp === 'xs' ? 14 : 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: bp === 'xs' ? 28 : 34, height: bp === 'xs' ? 28 : 34, borderRadius: 999, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0A0A', fontFamily: t.fontH, fontSize: bp === 'xs' ? 12 : 14, fontWeight: 600 }}>М</div>
            {bp !== 'xs' && (
              <div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: t.textSub }}>сегодня</div>
                <div style={{ fontFamily: t.fontH, fontSize: 13, fontWeight: 500, lineHeight: 1.1 }}>Привет, Михаил</div>
              </div>
            )}
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textSub }}>
            <Icons.bell size={14}/>
          </div>
        </div>

        {/* Hero block */}
        <div style={{ marginBottom: bp === 'xs' ? 14 : 18 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: t.textSub }}>день 18 · цикл «масса»</div>
          <div style={{ fontFamily: t.fontH, fontSize: heroSize, fontWeight: 500, letterSpacing: -1.0, lineHeight: 1.0, marginTop: 6, textWrap: 'pretty' }}>Сегодня — грудь и трицепс</div>
          {showSubtitleOnHero && (
            <div style={{ fontFamily: t.fontB, fontSize: bp === 'sm' ? 12 : 13, color: t.textSub, marginTop: 8, lineHeight: 1.4 }}>54 минуты · 6 упражнений · ИИ‑адаптация под вчерашний RPE</div>
          )}
        </div>

        {/* Chips row — overflow scrolls in real RN, here just clipped */}
        <div style={{
          display: 'flex',
          gap: 6,
          marginBottom: bp === 'xs' ? 14 : 16,
          overflow: 'hidden',
          maskImage: 'linear-gradient(to right, black 85%, transparent)',
        }}>
          {chips.slice(0, bp === 'xs' ? 3 : chips.length).map((c, i) => (
            <div key={i} style={{
              padding: bp === 'xs' ? '6px 10px' : '7px 12px',
              borderRadius: 99,
              background: i === 0 ? t.accent : t.surfaceHi,
              color: i === 0 ? '#0A0A0A' : t.text,
              border: `1px solid ${i === 0 ? t.accent : t.line}`,
              fontFamily: t.fontM,
              fontSize: bp === 'xs' ? 10 : 11,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}>{c}</div>
          ))}
        </div>

        {/* CTA card */}
        <div style={{
          background: t.surface,
          borderRadius: 22,
          border: `1px solid ${t.line}`,
          padding: bp === 'xs' ? 14 : 16,
          marginBottom: bp === 'xs' ? 12 : 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: t.textSub }}>начни сейчас</div>
            <div style={{ fontFamily: t.fontH, fontSize: bp === 'xs' ? 16 : 18, fontWeight: 500, marginTop: 4 }}>Старт тренировки</div>
            {bp !== 'xs' && (
              <div style={{ fontFamily: t.fontB, fontSize: 11, color: t.textSub, marginTop: 4 }}>5 рабочих, 1 разминка</div>
            )}
          </div>
          <div style={{
            width: bp === 'xs' ? 40 : 44,
            height: bp === 'xs' ? 40 : 44,
            borderRadius: 14,
            background: t.accent,
            color: '#0A0A0A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}><Icons.play size={18}/></div>
        </div>

        {/* Tiles grid — adapts cols by breakpoint */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${tileCols}, 1fr)`,
          gap: 8,
        }}>
          {tiles.slice(0, tileCols * 2).map((tile, i) => (
            <div key={i} style={{
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 16,
              padding: bp === 'xs' ? 10 : 12,
              minHeight: bp === 'xs' ? 70 : 86,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: t.surfaceHi, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <tile.ic size={14}/>
              </div>
              <div style={{ fontFamily: t.fontH, fontSize: bp === 'xs' ? 12 : 13, fontWeight: 500, lineHeight: 1.1, textWrap: 'pretty' }}>{tile.l}</div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 0.3 }}>{tile.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Showcase artboard: a horizontal strip with all device frames inside.
window.A_AdaptiveShowcase = function A_AdaptiveShowcase() {
  const t = A_RP_T;
  // The artboard width is dictated by DCArtboard. Inside we make a horizontal
  // scroller with all frames at their real proportions.
  return (
    <div style={{
      background: t.bg,
      color: t.text,
      width: '100%',
      height: '100%',
      overflow: 'auto',
      fontFamily: t.fontB,
      padding: '20px 24px 24px',
      boxSizing: 'border-box',
    }}>
      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: t.textSub }}>responsive system · 2026</div>
        <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.6, marginTop: 6 }}>Главная — на всех устройствах</div>
        <div style={{ fontFamily: t.fontB, fontSize: 12, color: t.textSub, marginTop: 6, lineHeight: 1.4, maxWidth: 560 }}>
          Один и тот же экран в шести брейкпоинтах. Сетка плиток, размер заголовка и плотность отступов перетекают плавно — нет ни одного «слипшегося» элемента или горизонтального скролла.
        </div>
      </div>

      {/* Strip */}
      <div style={{
        display: 'flex',
        gap: 24,
        alignItems: 'flex-start',
        paddingBottom: 12,
      }}>
        {A_RP_DEVICES.map((d, i) => {
          // Visible frame width inside the strip — narrower for narrow devices,
          // proportional so iPad doesn't dwarf the iPhones.
          const frameW = Math.round(d.w * (d.bp === 'desktop' ? 0.36 : d.bp === 'tablet' ? 0.42 : 0.62));
          return <A_RP_Frame key={d.id} device={d} frameW={frameW}/>;
        })}
      </div>

      {/* Legend */}
      <div style={{
        marginTop: 28,
        padding: '14px 16px',
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 14,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        alignItems: 'center',
      }}>
        <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: t.textSub }}>что меняется</div>
        {[
          { c: '#E4936A', l: 'xs · скрыт subtitle, 2 плитки в ряд' },
          { c: '#A67BFF', l: 'sm · короткий hero' },
          { c: t.accent, l: 'md · базовый макет (393pt)' },
          { c: '#7AC8B6', l: 'lg · просторнее' },
          { c: '#7AB1FF', l: 'tablet · 4 плитки, шире gutter' },
          { c: '#FFD27A', l: 'desktop · max-width 920, 6 плиток' },
        ].map((row, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: row.c }}/>
            <div style={{ fontFamily: t.fontB, fontSize: 11, color: t.text }}>{row.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
