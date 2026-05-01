/* global React, Icons, Ring, Bar, Placeholder, TabBar */
// Upgraded B (Neon Dark) — Active workout v2 + Food scanner (tech / data-dense)

const B_Tp = window.IG_TOKENS.B;

// ─── B — Active v2 ───
window.B_Active = function B_Active() {
  const t = B_Tp;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB, position: 'relative' }}>
      {/* grid bg */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${t.line} 1px, transparent 1px), linear-gradient(90deg, ${t.line} 1px, transparent 1px)`, backgroundSize: '24px 24px', opacity: 0.6 }}/>

      <div style={{ padding: '12px 16px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
        {/* Top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.chevDn size={16}/></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.accent }}>● SESSION LIVE · 24:18</div>
            <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>CHEST · TRI</div>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={16} sw={2.2}/></div>
        </div>

        {/* Exercise segments */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
          {[1,1,0.4,0,0,0,0].map((s, i) => (
            <div key={i} style={{ flex: 1, height: 4, background: s === 1 ? t.accent : s > 0 ? `linear-gradient(90deg, ${t.accent} ${s*100}%, ${t.lineStrong} ${s*100}%)` : t.lineStrong }}/>
          ))}
        </div>

        <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.textSub, textTransform: 'uppercase' }}>EX 03 / 07</div>
        <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1, marginTop: 4 }}>BARBELL BENCH</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6, fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 0.5 }}>
          <span>4×8-10</span><span>·</span><span>RPE 7-8</span><span>·</span><span style={{ color: t.accent }}>PR 120 KG</span>
        </div>

        {/* Hero working set */}
        <div style={{ background: t.surface, border: `1px solid ${t.lineStrong}`, borderRadius: 0, padding: 16, marginTop: 12, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 10, right: 10, fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1 }}>SET_03 / 04</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { l: 'LOAD', v: '102.5', u: 'kg' },
              { l: 'REPS', v: '08', u: 'tgt 8-10' },
              { l: 'RPE',  v: '7.0', u: '/ 10' },
            ].map((m, i) => (
              <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.line}` : 'none', paddingLeft: i > 0 ? 10 : 0 }}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>{m.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 34, fontWeight: 700, color: t.accent, letterSpacing: -0.5, lineHeight: 1, marginTop: 4 }}>{m.v}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, marginTop: 2 }}>{m.u}</div>
              </div>
            ))}
          </div>

          {/* Heart rate + bar power */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
            <div style={{ padding: 10, background: t.bg, border: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>HR_LIVE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                <span style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700, color: t.danger }}>142</span>
                <span style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub }}>bpm · Z3</span>
              </div>
              {/* sparkline */}
              <svg width="100%" height="20" viewBox="0 0 100 20" style={{ marginTop: 4 }}>
                <polyline points="0,12 8,12 11,5 14,18 17,12 25,12 28,4 31,17 34,12 45,12 48,5 51,18 54,12 65,12 68,6 71,16 74,12 100,12" fill="none" stroke={t.danger} strokeWidth="1"/>
              </svg>
            </div>
            <div style={{ padding: 10, background: t.bg, border: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>BAR_VEL</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
                <span style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700, color: t.accent2 }}>0.42</span>
                <span style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub }}>m/s</span>
              </div>
              <div style={{ marginTop: 6, height: 4, background: t.lineStrong, position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '65%', background: t.accent2 }}/>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button style={{ flex: 1, height: 46, background: t.accent, color: '#0A0A0A', border: 0, fontFamily: t.fontH, fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>✓ SET DONE</button>
            <button style={{ width: 46, height: 46, background: t.surface, color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.mic size={18}/></button>
          </div>
        </div>

        {/* Session telemetry */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 0, marginTop: 12, border: `1px solid ${t.line}`, background: t.surface }}>
          {[
            { l: 'TONNAGE', v: '2.46', u: 'T' },
            { l: 'SETS',    v: '08/28', u: '' },
            { l: 'VOLUME',  v: '+12%', u: 'vs last' },
            { l: 'TUT',     v: '03:42', u: 'min' },
          ].map((m, i) => (
            <div key={i} style={{ padding: 10, borderRight: i < 3 ? `1px solid ${t.line}` : 'none' }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>{m.l}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 700, marginTop: 3, lineHeight: 1 }}>{m.v}</div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, marginTop: 2 }}>{m.u}</div>
            </div>
          ))}
        </div>

        {/* Sets log */}
        <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5, marginTop: 14, marginBottom: 6 }}>SET_LOG ▸</div>
        <div style={{ border: `1px solid ${t.line}`, background: t.surface }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 30px', padding: '8px 10px', fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, borderBottom: `1px solid ${t.line}` }}>
            <span>#</span><span>WEIGHT</span><span>REPS</span><span>RPE</span><span/>
          </div>
          {[
            { n: 'W1', w: 40, r: 10, rpe: 4, done: true },
            { n: 'W2', w: 60, r: 8, rpe: 5, done: true },
            { n: '01', w: 80, r: 10, rpe: 6, done: true },
            { n: '02', w: 100, r: 8, rpe: 6.5, done: true },
            { n: '03', w: '-', r: '-', rpe: '-', active: true },
          ].map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 30px', padding: '8px 10px', fontFamily: t.fontM, fontSize: 11, borderTop: i > 0 ? `1px solid ${t.line}` : 'none', background: s.active ? `${t.accent}11` : 'transparent' }}>
              <span style={{ color: s.active ? t.accent : t.textSub }}>{s.n}</span>
              <span>{s.w}{s.w !== '-' && ' kg'}</span>
              <span>{s.r}</span>
              <span>{s.rpe}</span>
              <span>{s.done ? <Icons.check size={12} sw={2.4}/> : s.active ? '●' : ''}</span>
            </div>
          ))}
        </div>

        {/* AI */}
        <div style={{ border: `1px solid ${t.accent}`, background: `${t.accent}08`, padding: 12, marginTop: 12, display: 'flex', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icons.spark size={14} sw={2.2}/></div>
          <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.text, lineHeight: 1.5 }}>
            <span style={{ color: t.accent, letterSpacing: 1, fontWeight: 700 }}>AI_HINT:</span> bar velocity +8% vs last session at same load. Ready to progress → <span style={{ color: t.accent }}>104 kg × 8</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── B — Food scanner ───
window.B_Scanner = function B_Scanner() {
  const t = B_Tp;
  const Col = ({ children, label }) => (
    <div style={{ position: 'relative', height: '100%', background: t.bg, overflow: 'hidden', borderRight: `1px solid ${t.line}` }}>
      <div style={{ position: 'absolute', top: 10, left: 14, zIndex: 20, fontFamily: t.fontM, fontSize: 9, letterSpacing: 2, color: t.accent, textTransform: 'uppercase', background: 'rgba(10,10,14,0.85)', padding: '3px 7px', border: `1px solid ${t.accent}55` }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: t.bg }}>
      {/* Col 1 — camera */}
      <Col label="01 · SCAN">
        <div style={{ height: '100%', background: '#050508', position: 'relative', color: t.text, fontFamily: t.fontB }}>
          {/* Food mock */}
          <div style={{ position: 'absolute', inset: 0 }}>
            <div style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #1a1f2e, #06070a)' }}/>
            <div style={{ position: 'absolute', top: '32%', left: '28%', width: 60, height: 50, borderRadius: '50%', background: '#8a6a3c', filter: 'saturate(0.6)' }}/>
            <div style={{ position: 'absolute', top: '42%', right: '28%', width: 70, height: 55, borderRadius: 12, background: '#b8a878', filter: 'saturate(0.6)' }}/>
            <div style={{ position: 'absolute', top: '38%', left: '45%', width: 40, height: 40, borderRadius: '50%', background: '#4a6a2a', filter: 'saturate(0.7)' }}/>
          </div>

          {/* Scan grid overlay */}
          <div style={{ position: 'absolute', inset: '20% 12%', border: `1px solid ${t.accent}`, backgroundImage: `linear-gradient(${t.accent}22 1px, transparent 1px), linear-gradient(90deg, ${t.accent}22 1px, transparent 1px)`, backgroundSize: '30px 30px' }}>
            {/* Corners */}
            {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v, h], i) => (
              <div key={i} style={{ position: 'absolute', [v]: -5, [h]: -5, width: 14, height: 14, background: t.accent, boxShadow: `0 0 15px ${t.accent}` }}/>
            ))}
            {/* Crosshair */}
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: `${t.accent}55` }}/>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: `${t.accent}55` }}/>
          </div>

          {/* Scan beam */}
          <div style={{ position: 'absolute', top: '48%', left: '12%', right: '12%', height: 2, background: t.accent, boxShadow: `0 0 30px ${t.accent}` }}/>

          {/* Top readouts */}
          <div style={{ position: 'absolute', top: 50, left: 0, right: 0, padding: '0 14px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.5 }}>
              ● LIDAR · DEPTH SENSE<br/>
              <span style={{ color: t.textSub }}>OBJECTS: 3</span><br/>
              <span style={{ color: t.textSub }}>CONFIDENCE: 94%</span>
            </div>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5, textAlign: 'right' }}>
              LUX 680<br/>FOV 27°<br/>DIST 32 CM
            </div>
          </div>

          {/* Mode chips */}
          <div style={{ position: 'absolute', top: 130, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
            {['BARCODE', 'DISH', 'LABEL', 'VOICE'].map((m, i) => (
              <div key={i} style={{ padding: '4px 8px', fontFamily: t.fontM, fontSize: 9, letterSpacing: 1, border: `1px solid ${i === 1 ? t.accent : t.line}`, color: i === 1 ? t.accent : t.textSub, background: i === 1 ? `${t.accent}11` : 'transparent' }}>{m}</div>
            ))}
          </div>

          {/* Bottom */}
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.5, marginBottom: 6 }}>▸ ANALYZING</div>
            <div style={{ height: 4, background: t.lineStrong, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '68%', background: t.accent }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: t.fontM, fontSize: 9, color: t.textSub }}>
              <span>0.68</span><span>68%</span>
            </div>

            {/* Shutter */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', marginTop: 16 }}>
              <div style={{ width: 40, height: 40, border: `1px solid ${t.line}`, background: t.surface, color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.grid size={16}/></div>
              <div style={{ width: 64, height: 64, background: t.accent, border: `3px solid #050508`, boxShadow: `0 0 0 3px ${t.accent}, 0 0 30px ${t.accent}` }}/>
              <div style={{ width: 40, height: 40, border: `1px solid ${t.line}`, background: t.surface, color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.refresh size={16}/></div>
            </div>
          </div>
        </div>
      </Col>

      {/* Col 2 — detection */}
      <Col label="02 · DETECT">
        <div style={{ height: '100%', background: t.bg, color: t.text, fontFamily: t.fontB, padding: '50px 12px 16px', boxSizing: 'border-box', overflow: 'auto', position: 'relative' }}>
          {/* thumbnail */}
          <div style={{ position: 'relative', height: 120, background: '#05060b', border: `1px solid ${t.line}`, marginBottom: 10 }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #1a1f2e, #06070a)' }}/>
              <div style={{ position: 'absolute', top: '28%', left: '22%', width: 42, height: 34, borderRadius: '50%', background: '#8a6a3c' }}/>
              <div style={{ position: 'absolute', top: '38%', right: '20%', width: 50, height: 38, borderRadius: 10, background: '#b8a878' }}/>
              <div style={{ position: 'absolute', top: '34%', left: '44%', width: 30, height: 30, borderRadius: '50%', background: '#4a6a2a' }}/>
            </div>
            {/* boxes */}
            {[
              { l: '18%', t: '32%', w: '30%', h: '35%', n: 'chicken', c: 180, col: t.accent },
              { l: '55%', t: '40%', w: '32%', h: '32%', n: 'rice', c: 150, col: t.accent2 },
              { l: '40%', t: '30%', w: '22%', h: '28%', n: 'broccoli', c: 80, col: t.good },
            ].map((b, i) => (
              <div key={i} style={{ position: 'absolute', left: b.l, top: b.t, width: b.w, height: b.h, border: `1px solid ${b.col}`, fontFamily: t.fontM, fontSize: 8, letterSpacing: 0.5 }}>
                <div style={{ position: 'absolute', top: -14, left: -1, padding: '1px 4px', background: b.col, color: '#0A0A0A', textTransform: 'uppercase' }}>{b.n} {b.c}g</div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.5, marginBottom: 4 }}>MATCH · 94%</div>
          <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1.1 }}>CHICKEN · RICE · BROCCOLI</div>

          {/* Macro readout */}
          <div style={{ border: `1px solid ${t.line}`, background: t.surface, padding: 12, marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>KCAL</div>
                <div style={{ fontFamily: t.fontH, fontSize: 32, fontWeight: 700, color: t.accent, letterSpacing: -0.5, lineHeight: 1, marginTop: 2 }}>680</div>
              </div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, textAlign: 'right' }}>
                28% daily<br/>
                <span style={{ color: t.accent }}>rem 760</span>
              </div>
            </div>
            {/* macro bars */}
            {[
              { l: 'PROT', v: 52, m: 160, u: 'g', c: t.accent },
              { l: 'FAT',  v: 14, m: 80, u: 'g', c: t.warn },
              { l: 'CARB', v: 68, m: 280, u: 'g', c: t.accent2 },
            ].map((r, i) => (
              <div key={i} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM, fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: t.textSub, letterSpacing: 1 }}>{r.l}</span>
                  <span>{r.v}/{r.m} {r.u}</span>
                </div>
                <div style={{ height: 3, background: t.lineStrong, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(r.v/r.m)*100}%`, background: r.c }}/>
                </div>
              </div>
            ))}
          </div>

          {/* Items */}
          <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5, marginTop: 12, marginBottom: 4 }}>DETECTED_ITEMS</div>
          {[
            { n: 'CHICKEN BREAST', g: 180, c: 198 },
            { n: 'RICE, COOKED', g: 150, c: 195 },
            { n: 'BROCCOLI', g: 80, c: 27 },
          ].map((it, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 50px', padding: '6px 10px', background: t.surface, border: `1px solid ${t.line}`, borderBottom: i === 2 ? `1px solid ${t.line}` : 'none', marginTop: i === 0 ? 0 : -1, fontFamily: t.fontM, fontSize: 10 }}>
              <span style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{it.n}</span>
              <span style={{ color: t.textSub }}>{it.g} G</span>
              <span style={{ color: t.accent, textAlign: 'right' }}>{it.c} KCAL</span>
            </div>
          ))}

          <button style={{ width: '100%', height: 42, background: t.accent, color: '#0A0A0A', border: 0, fontFamily: t.fontH, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 12 }}>
            ADJUST →
          </button>
        </div>
      </Col>

      {/* Col 3 — adjust */}
      <Col label="03 · ADJUST">
        <div style={{ height: '100%', background: t.bg, color: t.text, fontFamily: t.fontB, padding: '50px 12px 16px', boxSizing: 'border-box', overflow: 'auto' }}>
          <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.5 }}>EDITING · ITEM 01/03</div>
          <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 }}>CHICKEN BREAST</div>

          {/* Portion numeric */}
          <div style={{ border: `1px solid ${t.accent}`, background: `${t.accent}08`, padding: 14, marginTop: 10, position: 'relative' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>PORTION_WEIGHT</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 700, color: t.accent, letterSpacing: -1, lineHeight: 1 }}>180</span>
              <span style={{ fontFamily: t.fontM, fontSize: 12, color: t.textSub, letterSpacing: 1 }}>GRAMS</span>
            </div>
            {/* stepper */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {[-50, -10, -1, '+1', '+10', '+50'].map((v, i) => (
                <div key={i} style={{ flex: 1, height: 26, border: `1px solid ${t.line}`, background: t.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontM, fontSize: 10, color: t.text }}>{v}</div>
              ))}
            </div>
            {/* range bar */}
            <div style={{ marginTop: 10, height: 3, background: t.lineStrong, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '60%', background: t.accent }}/>
              <div style={{ position: 'absolute', left: '60%', top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, background: t.accent, borderRadius: '50%' }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM, fontSize: 9, color: t.textDim, marginTop: 4 }}>
              <span>0</span><span>150</span><span>300 G</span>
            </div>
          </div>

          {/* Unit tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', marginTop: 10, border: `1px solid ${t.line}` }}>
            {['G', 'PCS', 'TBSP', 'CUP'].map((u, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '8px 0', fontFamily: t.fontM, fontSize: 10, fontWeight: 700, letterSpacing: 1, background: i === 0 ? t.accent : 'transparent', color: i === 0 ? '#0A0A0A' : t.textSub, borderRight: i < 3 ? `1px solid ${t.line}` : 'none' }}>{u}</div>
            ))}
          </div>

          {/* Live KBZU */}
          <div style={{ padding: 12, background: t.surface, border: `1px solid ${t.line}`, marginTop: 10 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5 }}>TOTAL · 180G</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
              {[
                { l: 'KCAL', v: '198', c: t.accent },
                { l: 'PROT', v: '52g', c: t.accent },
                { l: 'FAT',  v: '2g', c: t.warn },
                { l: 'CARB', v: '0', c: t.accent2 },
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ fontFamily: t.fontM, fontSize: 8, color: t.textSub, letterSpacing: 1 }}>{m.l}</div>
                  <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 700, color: m.c, marginTop: 2 }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Meal assign */}
          <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1.5, marginTop: 12, marginBottom: 6 }}>ASSIGN_TO</div>
          <div style={{ border: `1px solid ${t.line}` }}>
            {[
              { l: 'BREAKFAST', d: '08:30 · 420', act: false },
              { l: 'LUNCH', d: '13:00 · 680', act: true },
              { l: 'DINNER', d: 'empty', act: false },
              { l: 'SNACK', d: '+ NEW', act: false },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: m.act ? `${t.accent}15` : t.surface, borderTop: i > 0 ? `1px solid ${t.line}` : 'none', color: m.act ? t.accent : t.text }}>
                <span style={{ fontFamily: t.fontM, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{m.l}</span>
                <span style={{ fontFamily: t.fontM, fontSize: 9, color: m.act ? t.accent : t.textSub }}>{m.d}</span>
              </div>
            ))}
          </div>

          <button style={{ width: '100%', height: 42, background: t.accent, color: '#0A0A0A', border: 0, fontFamily: t.fontH, fontSize: 11, fontWeight: 700, letterSpacing: 2, marginTop: 10 }}>
            ADD TO LUNCH →
          </button>
        </div>
      </Col>
    </div>
  );
};
