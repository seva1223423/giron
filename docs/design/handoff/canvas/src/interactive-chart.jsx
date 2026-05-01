// Interactive weight chart with hover/touch tooltip and month labels
window.InteractiveChart = function InteractiveChart({
  data,           // array of numbers
  months,         // array of month labels (same length as data)
  accent = '#C7956D',
  line = 'rgba(255,255,255,0.08)',
  textSub = '#9A9A9A',
  text = '#fff',
  bg = '#161616',
  fontH = 'GT Sectra, serif',
  fontM = 'JetBrains Mono, monospace',
  unit = 'кг',
  height = 140,
  gradId = 'igrad',
}) {
  const W = 300, H = 100;
  const PAD_T = 14, PAD_B = 16, PAD_X = 8;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;

  const xAt = (i) => PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2);
  const yAt = (v) => PAD_T + (1 - (v - min) / range) * (H - PAD_T - PAD_B);

  const pts = data.map((v, i) => [xAt(i), yAt(v)]);
  const path = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  const [hover, setHover] = React.useState(null);
  const svgRef = React.useRef(null);

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const x = ((clientX - rect.left) / rect.width) * W;
    // closest index
    let bestI = 0, bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p[0] - x);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    setHover(bestI);
  };
  const clearHover = () => setHover(null);

  const activeIdx = hover !== null ? hover : data.length - 1;
  const ap = pts[activeIdx];

  // y-axis grid lines (3)
  const grid = [0.0, 0.5, 1.0].map(f => PAD_T + f * (H - PAD_T - PAD_B));

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={clearHover}
        onTouchStart={handleMove}
        onTouchMove={handleMove}
        onTouchEnd={clearHover}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity="0.28"/>
            <stop offset="1" stopColor={accent} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* grid */}
        {grid.map((y, i) => (
          <line key={i} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke={line} strokeWidth="0.6" strokeDasharray="2 3"/>
        ))}
        {/* area */}
        <polyline points={`${PAD_X},${H - PAD_B} ${path} ${W - PAD_X},${H - PAD_B}`} fill={`url(#${gradId})`}/>
        {/* line */}
        <polyline points={path} fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        {/* hover guideline */}
        {hover !== null && (
          <line x1={ap[0]} x2={ap[0]} y1={PAD_T - 4} y2={H - PAD_B} stroke={accent} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.6"/>
        )}
        {/* dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === activeIdx ? 3 : 1.4}
            fill={i === activeIdx ? accent : 'rgba(255,255,255,0.35)'}
            stroke={i === activeIdx ? '#0A0A0A' : 'none'}
            strokeWidth={i === activeIdx ? 1 : 0}
          />
        ))}
      </svg>

      {/* tooltip */}
      {hover !== null && (
        <div style={{
          position: 'absolute',
          left: `${(ap[0] / W) * 100}%`,
          top: `${(ap[1] / H) * height - 38}px`,
          transform: 'translateX(-50%)',
          background: bg,
          border: `1px solid ${line}`,
          borderRadius: 8,
          padding: '4px 8px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          fontFamily: fontM,
          fontSize: 10,
          color: text,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          zIndex: 2,
        }}>
          <span style={{ fontWeight: 600 }}>{data[hover]}</span>
          <span style={{ color: textSub, marginLeft: 4 }}>{unit}</span>
          <span style={{ color: textSub, marginLeft: 6 }}>· {months[hover]}</span>
        </div>
      )}

      {/* month axis */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 6,
        padding: `0 ${(PAD_X / W) * 100}%`,
        fontFamily: fontM,
        fontSize: 9,
        color: textSub,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        {months.map((m, i) => {
          // show every other label if many points to avoid overlap
          const show = months.length <= 7 || i % 2 === 0 || i === months.length - 1;
          return (
            <span key={i} style={{
              opacity: show ? (hover === i ? 1 : 0.7) : 0,
              color: hover === i ? accent : textSub,
              fontWeight: hover === i ? 700 : 500,
              transition: 'color 0.12s, opacity 0.12s',
            }}>{m}</span>
          );
        })}
      </div>
    </div>
  );
};
