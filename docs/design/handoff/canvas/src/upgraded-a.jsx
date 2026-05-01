/* global React, Icons, Ring, Bar, Placeholder, TabBar */
// Upgraded screens: richer Active workout + full Food scanner flow
// v2 versions — replace the originals in the canvas.

const { useState: useStateP } = React;

// ═══════════════════════════════════════════════════════════════
// A — Premium Graphite: Active workout v2 + Food scanner
// ═══════════════════════════════════════════════════════════════
const A_Tp = window.IG_TOKENS.A;

// ─────── A — Active v2 ───────
window.A_Active = function A_Active() {
  const t = A_Tp;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ padding: '12px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.chevDn size={18}/>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.textSub, textTransform: 'uppercase' }}>Упр 3 из 7 · 00:24:18</div>
            <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 500 }}>Грудь · трицепс</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.spark size={18} sw={2.2}/>
          </div>
        </div>

        {/* Exercise strip */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, marginBottom: 14 }}>
          {[1,1,0.5,0,0,0,0].map((s, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: s === 1 ? t.accent : s > 0 ? `linear-gradient(90deg, ${t.accent} 50%, ${t.lineStrong} 50%)` : t.lineStrong }}/>
          ))}
        </div>

        {/* Exercise title */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 500, letterSpacing: -0.8, lineHeight: 1 }}>Жим штанги лёжа</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3 }}>
            <span>4 × 8–10</span>
            <span>·</span>
            <span>RPE 7–8</span>
            <span>·</span>
            <span style={{ color: t.accent }}>PR 120 кг</span>
          </div>
        </div>

        {/* Current set — huge */}
        <div style={{ background: t.accent, borderRadius: 26, padding: 18, marginBottom: 12, color: '#0A0A0A', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, position: 'relative' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.65 }}>Подход 3 из 4 · рабочий</div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, opacity: 0.65 }}>Прошлый: 100×8</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, position: 'relative' }}>
            <div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.5, opacity: 0.6, textTransform: 'uppercase' }}>Вес</div>
              <div style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1, marginTop: 2 }}>102.5</div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, opacity: 0.55, marginTop: 2 }}>кг</div>
            </div>
            <div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.5, opacity: 0.6, textTransform: 'uppercase' }}>Повт.</div>
              <div style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1, marginTop: 2 }}>8</div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, opacity: 0.55, marginTop: 2 }}>цель 8–10</div>
            </div>
            <div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.5, opacity: 0.6, textTransform: 'uppercase' }}>RPE</div>
              <div style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1, marginTop: 2 }}>7</div>
              <div style={{ fontFamily: t.fontM, fontSize: 9, opacity: 0.55, marginTop: 2 }}>восприятие</div>
            </div>
          </div>
          {/* RPE scale */}
          <div style={{ marginTop: 10, position: 'relative' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v, i) => (
                <div key={i} style={{ flex: 1, height: 6, borderRadius: 2, background: i < 1 ? 'rgba(10,10,10,0.75)' : 'rgba(10,10,10,0.2)' }}/>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: t.fontM, fontSize: 9, opacity: 0.6, letterSpacing: 0.3 }}>
              <span>легко</span><span>в отказ</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, position: 'relative' }}>
            <button style={{ flex: 1, height: 50, borderRadius: 14, background: '#0A0A0A', color: t.accent, border: 0, fontSize: 14, fontWeight: 600, fontFamily: t.fontB, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icons.check size={18} sw={2.4}/> Подход выполнен
            </button>
            <button style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(10,10,10,0.15)', color: '#0A0A0A', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icons.mic size={20}/>
            </button>
          </div>
        </div>

        {/* Session summary */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[
            { l: 'Тоннаж', v: '2 460', u: 'кг' },
            { l: 'Подходы', v: '8/28', u: '' },
            { l: 'Пульс', v: '142', u: 'уд/мин' },
          ].map((m, i) => (
            <div key={i} style={{ flex: 1, padding: 10, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14 }}>
              <div style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.5, textTransform: 'uppercase' }}>{m.l}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 500, letterSpacing: -0.3, marginTop: 2 }}>{m.v}<span style={{ fontSize: 10, color: t.textSub, marginLeft: 3 }}>{m.u}</span></div>
            </div>
          ))}
        </div>

        {/* Done sets list */}
        <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginBottom: 6 }}>Выполнено в упражнении</div>
        {[
          { s: 'РАЗМ', w: 40, r: 10, rpe: 4 },
          { s: 'РАЗМ', w: 60, r: 8, rpe: 5 },
          { s: '1', w: 80, r: 10, rpe: 6 },
          { s: '2', w: 100, r: 8, rpe: 6.5 },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, marginBottom: 4 }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontM, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{s.s}</div>
            <div style={{ flex: 1, display: 'flex', gap: 14, fontFamily: t.fontM, fontSize: 13 }}>
              <span>{s.w} <span style={{ color: t.textSub, fontSize: 10 }}>кг</span></span>
              <span>×</span>
              <span>{s.r}</span>
              <span style={{ color: t.textSub, fontSize: 11 }}>· RPE {s.rpe}</span>
            </div>
            <Icons.check size={14} sw={2.4}/>
          </div>
        ))}

        {/* AI hint */}
        <div style={{ background: `linear-gradient(135deg, ${t.surface}, ${t.surfaceHi})`, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icons.spark size={16} sw={2.2}/>
          </div>
          <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5, flex: 1 }}>
            <span style={{ color: t.text, fontWeight: 600 }}>Тренер:</span> последний подход — RPE 6.5, можно добавить <span style={{ color: t.accent }}>+2.5 кг</span> на следующем. Или сделать 10 повторов на 102.5.
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <div style={{ padding: '5px 10px', borderRadius: 8, background: t.chipBg, color: t.accent, fontSize: 11, fontWeight: 600 }}>Добавить 2.5 кг</div>
              <div style={{ padding: '5px 10px', borderRadius: 8, background: t.surfaceHi, color: t.text, fontSize: 11, fontWeight: 500, border: `1px solid ${t.line}` }}>10 повторов</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────── A — Food scanner flow ───────
window.A_Scanner = function A_Scanner() {
  const t = A_Tp;
  // 3-column flow: Camera → Recognition → Correction
  const Col = ({ children, label }) => (
    <div style={{ position: 'relative', height: '100%', background: t.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 10, left: 14, zIndex: 20, fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase', background: 'rgba(20,18,16,0.75)', backdropFilter: 'blur(10px)', padding: '3px 8px', borderRadius: 6 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: t.bg }}>
      {/* ── Column 1: Camera ── */}
      <Col label="Шаг 1 · Камера">
        <div style={{ height: '100%', background: `linear-gradient(135deg, #1a1410, #0a0806)`, position: 'relative', color: t.text, fontFamily: t.fontB }}>
          {/* Simulated photo: plate */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)', width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #3a2a18, #1a1208)', boxShadow: 'inset 0 10px 30px rgba(0,0,0,0.5)' }}/>
            {/* chicken */}
            <div style={{ position: 'absolute', top: '32%', left: '28%', width: 60, height: 50, borderRadius: '45% 55% 50% 50%', background: '#b88a5c', boxShadow: 'inset -5px -3px 0 rgba(0,0,0,0.15)', transform: 'rotate(-15deg)' }}/>
            {/* rice */}
            <div style={{ position: 'absolute', top: '42%', right: '28%', width: 70, height: 55, borderRadius: 12, background: '#e8d4a8', opacity: 0.9 }}/>
            {/* broccoli */}
            <div style={{ position: 'absolute', top: '38%', left: '45%', width: 40, height: 40, borderRadius: '50%', background: '#5a7a3a' }}/>
          </div>

          {/* Bracket corners */}
          <div style={{ position: 'absolute', inset: '25% 15%' }}>
            {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v, h], i) => (
              <div key={i} style={{ position: 'absolute', [v]: 0, [h]: 0, width: 24, height: 24, [`border${v[0].toUpperCase()+v.slice(1)}`]: `2px solid ${t.accent}`, [`border${h[0].toUpperCase()+h.slice(1)}`]: `2px solid ${t.accent}` }}/>
            ))}
          </div>

          {/* Scanning beam */}
          <div style={{ position: 'absolute', top: '45%', left: '15%', right: '15%', height: 2, background: `linear-gradient(90deg, transparent, ${t.accent}, transparent)`, boxShadow: `0 0 20px ${t.accent}` }}/>

          {/* Top bar */}
          <div style={{ position: 'absolute', top: 50, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.chevDn size={16}/></div>
            <div style={{ padding: '6px 12px', borderRadius: 99, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', fontSize: 11, color: '#fff', fontWeight: 500 }}>Наведите на блюдо</div>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.bolt size={16}/></div>
          </div>

          {/* Bottom modes */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.9))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 16, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>
              <span style={{ color: t.textSub }}>Штрихкод</span>
              <span style={{ color: t.accent }}>Блюдо</span>
              <span style={{ color: t.textSub }}>Этикетка</span>
              <span style={{ color: t.textSub }}>Голос</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid rgba(255,255,255,0.1)` }}>
                <Icons.grid size={20}/>
              </div>
              <div style={{ width: 76, height: 76, borderRadius: '50%', background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 0 4px rgba(212,176,122,0.25)` }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: t.accent, border: '3px solid #0a0806' }}/>
              </div>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid rgba(255,255,255,0.1)` }}>
                <Icons.refresh size={20}/>
              </div>
            </div>
          </div>
        </div>
      </Col>

      {/* ── Column 2: Recognition ── */}
      <Col label="Шаг 2 · ИИ распознал">
        <div style={{ height: '100%', background: t.bg, color: t.text, fontFamily: t.fontB, padding: '50px 14px 16px', boxSizing: 'border-box', overflow: 'auto' }}>
          {/* Thumbnail with tags */}
          <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginBottom: 14, background: '#1a1208', height: 130 }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 130, height: 130, borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #3a2a18, #1a1208)' }}/>
              <div style={{ position: 'absolute', top: '28%', left: '22%', width: 42, height: 34, borderRadius: '50%', background: '#b88a5c', transform: 'rotate(-15deg)' }}/>
              <div style={{ position: 'absolute', top: '38%', right: '20%', width: 50, height: 38, borderRadius: 10, background: '#e8d4a8' }}/>
              <div style={{ position: 'absolute', top: '34%', left: '44%', width: 30, height: 30, borderRadius: '50%', background: '#5a7a3a' }}/>
            </div>
            {/* AI tags */}
            {[
              { t: '180 г', l: '25%', top: '35%', c: t.accent },
              { t: '150 г', l: '65%', top: '50%', c: '#9AC28C' },
              { t: '80 г', l: '48%', top: '28%', c: '#E07A6B' },
            ].map((tag, i) => (
              <div key={i} style={{ position: 'absolute', left: tag.l, top: tag.top, transform: 'translate(-50%,-50%)', padding: '2px 6px', borderRadius: 6, background: 'rgba(10,8,6,0.85)', color: tag.c, fontFamily: t.fontM, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, border: `1px solid ${tag.c}66` }}>{tag.t}</div>
            ))}
          </div>

          <div style={{ fontFamily: t.fontH, fontSize: 19, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1.1 }}>Куриная грудка, рис, брокколи</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, marginBottom: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.good, boxShadow: `0 0 8px ${t.good}` }}/>
            <span style={{ fontSize: 10, color: t.good, fontFamily: t.fontM, letterSpacing: 0.3 }}>Точность 94%</span>
            <span style={{ fontSize: 10, color: t.textDim, fontFamily: t.fontM }}>·</span>
            <span style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM }}>3.2 сек</span>
          </div>

          {/* KBZU ring */}
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Ring size={64} stroke={5} value={0.7} color={t.accent} track={t.lineStrong}>
                <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 500 }}>680</div>
              </Ring>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, color: t.textSub, fontFamily: t.fontM, letterSpacing: 1, textTransform: 'uppercase' }}>Калорий</div>
                <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1, marginTop: 2 }}>680 ккал</div>
                <div style={{ fontSize: 10, color: t.textSub, marginTop: 3 }}>28% дневной нормы</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 10 }}>
              {[
                { l: 'Б', v: '52 г', c: t.accent },
                { l: 'Ж', v: '14 г', c: '#E8A36A' },
                { l: 'У', v: '68 г', c: '#9AC28C' },
              ].map((m, i) => (
                <div key={i} style={{ padding: 8, borderRadius: 10, background: t.surfaceHi, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: t.textSub, fontFamily: t.fontM, letterSpacing: 1 }}>{m.l}</div>
                  <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 500, color: m.c, marginTop: 2 }}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Items list */}
          {[
            { n: 'Куриная грудка', g: 180, c: 198, type: 'meat' },
            { n: 'Рис отварной', g: 150, c: 195, type: 'grain' },
            { n: 'Брокколи', g: 80, c: 27, type: 'veg' },
          ].map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, marginBottom: 5 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center', color: it.type === 'meat' ? '#E07A6B' : it.type === 'grain' ? '#E8C895' : '#9AC28C' }}>
                {it.type === 'meat' && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4c-3 0-6 2-6 6 0 3 2 5 2 7l-2 1 2 2 2-1c1 1 3 1 4 0l1 1 2-2-1-1c0-2 2-4 2-7 0-4-3-6-6-6z"/></svg>}
                {it.type === 'grain' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="2"/><circle cx="7" cy="9" r="1.5"/><circle cx="17" cy="9" r="1.5"/><circle cx="7" cy="15" r="1.5"/><circle cx="17" cy="15" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>}
                {it.type === 'veg' && <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="12" cy="13" r="3"/><rect x="11" y="14" width="2" height="6" rx="1"/></svg>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.n}</div>
                <div style={{ fontSize: 9, color: t.textSub, fontFamily: t.fontM }}>{it.g} г · {it.c} ккал</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: t.surfaceHi, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.chev size={12}/>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={{ flex: 1, height: 40, borderRadius: 12, background: t.surface, color: t.text, border: `1px solid ${t.line}`, fontSize: 11, fontWeight: 500 }}>Не то блюдо</button>
            <button style={{ flex: 1, height: 40, borderRadius: 12, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 11, fontWeight: 600 }}>Уточнить →</button>
          </div>
        </div>
      </Col>

      {/* ── Column 3: Correction ── */}
      <Col label="Шаг 3 · Коррекция">
        <div style={{ height: '100%', background: t.bg, color: t.text, fontFamily: t.fontB, padding: '50px 14px 16px', boxSizing: 'border-box', overflow: 'auto' }}>
          <div style={{ fontFamily: t.fontH, fontSize: 19, fontWeight: 500, letterSpacing: -0.3 }}>Куриная грудка</div>
          <div style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, marginBottom: 12 }}>Редактирование порции</div>

          {/* Visual portion adjuster */}
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, letterSpacing: 1, textTransform: 'uppercase' }}>Вес порции</span>
              <span style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 500, letterSpacing: -0.8 }}>180<span style={{ fontSize: 12, color: t.textSub, marginLeft: 2 }}>г</span></span>
            </div>
            {/* Slider */}
            <div style={{ height: 4, borderRadius: 2, background: t.lineStrong, position: 'relative', marginBottom: 6 }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: '60%', height: '100%', background: t.accent, borderRadius: 2 }}/>
              <div style={{ position: 'absolute', left: '60%', top: '50%', transform: 'translate(-50%,-50%)', width: 16, height: 16, borderRadius: '50%', background: t.accent, boxShadow: `0 0 0 4px rgba(212,176,122,0.2)` }}/>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: t.textDim, fontFamily: t.fontM }}>
              <span>0 г</span><span>150</span><span>300 г</span>
            </div>

            {/* Quick quantity presets */}
            <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
              {[
                { l: '½', v: '90 г' },
                { l: '1', v: '180', active: true },
                { l: '1½', v: '270' },
                { l: '2', v: '360' },
              ].map((q, i) => (
                <div key={i} style={{ flex: 1, padding: '6px 0', borderRadius: 9, background: q.active ? t.accent : t.surfaceHi, color: q.active ? '#0A0A0A' : t.text, border: `1px solid ${q.active ? t.accent : t.line}`, textAlign: 'center' }}>
                  <div style={{ fontFamily: t.fontH, fontSize: 13, fontWeight: 500 }}>{q.l}</div>
                  <div style={{ fontSize: 8, opacity: 0.6, fontFamily: t.fontM }}>{q.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Unit toggle */}
          <div style={{ display: 'flex', gap: 4, padding: 3, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, marginBottom: 10 }}>
            {['граммы', 'штуки', 'ложки', 'чашки'].map((u, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '5px 0', fontSize: 10, fontWeight: 500, borderRadius: 7, background: i === 0 ? t.surfaceHi : 'transparent', color: i === 0 ? t.text : t.textSub }}>{u}</div>
            ))}
          </div>

          {/* KBZU live update */}
          <div style={{ background: t.accent, borderRadius: 14, padding: 12, marginBottom: 10, color: '#0A0A0A' }}>
            <div style={{ fontSize: 9, fontFamily: t.fontM, letterSpacing: 1, opacity: 0.7, textTransform: 'uppercase' }}>Итого для 180 г</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'baseline' }}>
              <div><span style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.5 }}>198</span><span style={{ fontSize: 9, opacity: 0.65, marginLeft: 2 }}>ккал</span></div>
              <div style={{ fontSize: 9, opacity: 0.7, fontFamily: t.fontM }}>Б52 · Ж2 · У0</div>
            </div>
          </div>

          {/* Meal target */}
          <div style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, marginTop: 4 }}>Добавить в</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {[
              { l: 'Завтрак', d: '08:30 · 420 ккал' },
              { l: 'Обед', d: '13:00 · 680 ккал', active: true },
              { l: 'Ужин', d: 'пусто' },
              { l: 'Перекус', d: '+ новый' },
            ].map((m, i) => (
              <div key={i} style={{ padding: 8, borderRadius: 10, background: m.active ? t.chipBg : t.surface, border: `1px solid ${m.active ? t.accent : t.line}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: m.active ? t.accent : t.text }}>{m.l}</div>
                <div style={{ fontSize: 9, color: t.textSub, fontFamily: t.fontM, marginTop: 1 }}>{m.d}</div>
              </div>
            ))}
          </div>

          <button style={{ width: '100%', height: 44, borderRadius: 14, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 13, fontWeight: 600, marginTop: 10 }}>
            Добавить в обед
          </button>
        </div>
      </Col>
    </div>
  );
};
