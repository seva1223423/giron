/* global React, Icons, Ring, Bar, Placeholder, Phone, TabBar */
// Variation B extras + Variation C (Energy)

const B_T2 = window.IG_TOKENS.B;
const C_T = window.IG_TOKENS.C;

// ═══════════ B — Onboarding ═══════════
window.B_Onboarding = function B_Onboarding() {
  const t = B_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', position: 'relative', fontFamily: t.fontB, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, transparent 40%, ${t.accent}0D 100%)` }}/>
      <div style={{ padding: '24px 18px 20px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: t.chipBg, color: t.accent, fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
            <Icons.bolt size={11}/> IRON GYM
          </div>
          <button style={{ background: 'transparent', border: 0, color: t.textSub, fontSize: 13 }}>ПРОПУСТИТЬ</button>
        </div>

        <div style={{ marginTop: 48, flex: 1 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.accent, letterSpacing: 2 }}>01/04 · СТАРТ</div>
          <h1 style={{ fontFamily: t.fontH, fontSize: 44, fontWeight: 800, lineHeight: 0.98, letterSpacing: -1.5, marginTop: 16, textTransform: 'uppercase' }}>
            СТАНЬ<br/>СИЛЬНЕЕ.<br/><span style={{ color: t.accent }}>С ДАННЫМИ.</span>
          </h1>
          <p style={{ color: t.textSub, fontSize: 14, marginTop: 18, lineHeight: 1.5, maxWidth: 300 }}>
            Точный трекинг каждого подхода, ИИ‑тренер в кармане, готовность тела в реальном времени.
          </p>
        </div>

        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={20} sw={2}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>ИИ‑тренер</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>Программа за 30 сек под ваши цели</div>
          </div>
          <Icons.arrow size={16}/>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {[1,0,0,0].map((a, i) => <div key={i} style={{ flex: 1, height: 3, background: a ? t.accent : t.lineStrong }}/>)}
        </div>

        <button style={{ height: 56, borderRadius: 14, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 15, fontWeight: 800, fontFamily: t.fontB, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          НАЧАТЬ <Icons.arrow size={18} sw={2.2}/>
        </button>
      </div>
    </div>
  );
};

// ═══════════ B — AI chat ═══════════
window.B_AI = function B_AI() {
  const t = B_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: t.fontB }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${t.line}` }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={20} sw={2.2}/></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>ИИ‑ТРЕНЕР</div>
          <div style={{ fontSize: 10, color: t.accent, fontFamily: t.fontM, letterSpacing: 1 }}>● ONLINE · PRO</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ alignSelf: 'center', fontSize: 9, color: t.textDim, fontFamily: t.fontM, letterSpacing: 1.2 }}>СЕГОДНЯ 09:42</div>

        <div style={{ maxWidth: '84%', background: t.surface, border: `1px solid ${t.line}`, borderRadius: '14px 14px 14px 2px', padding: 12, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>Артём, готовность 87/100. Можно попробовать PR в жиме лёжа — 122.5 кг × 5. Рассчитал по прогрессии.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <div style={{ padding: '6px 10px', borderRadius: 8, background: t.accent, color: '#0A0A0A', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>В план</div>
            <div style={{ padding: '6px 10px', borderRadius: 8, background: t.surfaceHi, color: t.text, border: `1px solid ${t.line}`, fontSize: 11, fontWeight: 600 }}>Разбей на 3×5</div>
          </div>
        </div>

        <div style={{ maxWidth: '84%', background: t.accent, color: '#0A0A0A', borderRadius: '14px 14px 2px 14px', padding: 12, alignSelf: 'flex-end', fontSize: 13, fontWeight: 500 }}>
          Сколько белка сегодня добрать?
        </div>

        <div style={{ maxWidth: '86%', background: t.surface, border: `1px solid ${t.line}`, borderRadius: '14px 14px 14px 2px', padding: 12, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>Нужно ещё <span style={{ color: t.accent, fontWeight: 700 }}>62 г</span>. Варианты:</div>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Творог 5% · 300 г · 54 г', 'Куриная грудка · 250 г · 58 г', 'Протеин + 2 яйца · 60 г'].map((s, i) => (
              <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: t.surfaceHi, fontSize: 12, display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM }}>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 14px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['Сделай план недели', 'Почему я не расту', 'Разбор техники'].map((s, i) => (
          <div key={i} style={{ whiteSpace: 'nowrap', padding: '7px 11px', borderRadius: 8, background: t.surface, border: `1px solid ${t.line}`, fontSize: 11, color: t.textSub }}>{s}</div>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${t.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: '6px 8px 6px 12px' }}>
          <div style={{ flex: 1, fontSize: 13, color: t.textSub }}>Спросите тренера…</div>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.mic size={15}/></div>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.send size={15}/></div>
        </div>
      </div>
    </div>
  );
};

// ═══════════ B — Nutrition ═══════════
window.B_Nutrition = function B_Nutrition() {
  const t = B_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, textTransform: 'uppercase' }}>ПИТАНИЕ</div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.scan size={18} sw={2}/></div>
        </div>

        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 18, marginBottom: 12 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 1.5 }}>КАЛОРИИ</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <div style={{ fontFamily: t.fontH, fontSize: 52, fontWeight: 800, letterSpacing: -2, lineHeight: 1, color: t.accent }}>1 640</div>
            <div style={{ fontSize: 14, color: t.textSub, fontFamily: t.fontM }}>/ 2 400</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16 }}>
            {[
              { l: 'БЕЛКИ', v: '98', m: '160', p: 0.61 },
              { l: 'ЖИРЫ', v: '52', m: '80', p: 0.65 },
              { l: 'УГЛЕВ', v: '190', m: '280', p: 0.68 },
            ].map((r, i) => (
              <div key={i}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1 }}>{r.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{r.v}<span style={{ fontSize: 10, color: t.textSub, marginLeft: 3 }}>/{r.m}</span></div>
                <Bar value={r.p} color={t.accent} track={t.lineStrong} h={3}/>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: t.accent, borderRadius: 18, padding: 16, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', color: '#0A0A0A' }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#0A0A0A', color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.camera size={20}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 800, textTransform: 'uppercase' }}>СКАН ЕДЫ</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>Сфоткай — ИИ определит КБЖУ</div>
          </div>
          <Icons.arrow size={18} sw={2.2}/>
        </div>

        {[
          { t: 'ЗАВТРАК', c: '420', items: ['Овсянка 80г', 'Яйца 3шт', 'Кофе'] },
          { t: 'ОБЕД', c: '680', items: ['Куриная грудка 200г', 'Рис 150г', 'Салат'] },
          { t: 'УЖИН', c: '+', empty: true },
        ].map((m, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: t.fontH, fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>{m.t}</div>
              <div style={{ fontFamily: t.fontM, fontSize: 12, color: m.empty ? t.accent : t.textSub }}>{m.c}{m.empty ? '' : ' ккал'}</div>
            </div>
            {!m.empty && (
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                {m.items.map((it, j) => <div key={j} style={{ padding: '4px 8px', borderRadius: 6, background: t.surfaceHi, border: `1px solid ${t.line}`, fontSize: 11, color: t.textSub, fontFamily: t.fontM }}>{it}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
      <TabBar theme={t} active={3}/>
    </div>
  );
};

// ═══════════ B — Progress ═══════════
window.B_Progress = function B_Progress() {
  const t = B_T2;
  const pts = [68, 70, 67, 72, 70, 68, 65, 67, 64, 62, 60, 58];
  const max = Math.max(...pts), min = Math.min(...pts);
  const path = pts.map((p, i) => `${(i / (pts.length - 1)) * 300},${80 - ((p - min) / (max - min)) * 60}`).join(' ');
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, textTransform: 'uppercase', marginBottom: 16 }}>ПРОГРЕСС</div>

        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 18, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 1.3 }}>ВЕС · 30 ДНЕЙ</div>
              <div style={{ fontFamily: t.fontH, fontSize: 36, fontWeight: 800, letterSpacing: -1.5, marginTop: 4, lineHeight: 1 }}>78.4<span style={{ fontSize: 14, color: t.textSub, marginLeft: 3 }}>КГ</span></div>
            </div>
            <div style={{ padding: '6px 10px', borderRadius: 6, background: t.chipBg, color: t.accent, fontSize: 11, fontFamily: t.fontM, alignSelf: 'flex-start', fontWeight: 700 }}>↓ 3.2 КГ</div>
          </div>
          <svg width="100%" height="90" viewBox="0 0 300 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="bgrad" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={t.accent} stopOpacity="0.35"/><stop offset="1" stopColor={t.accent} stopOpacity="0"/></linearGradient>
            </defs>
            <polyline points={`0,90 ${path} 300,90`} fill="url(#bgrad)"/>
            <polyline points={path} fill="none" stroke={t.accent} strokeWidth="2.2"/>
          </svg>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            { l: 'ТРЕНИРОВОК', v: '47', s: 'за всё время', c: t.accent },
            { l: 'ОБЪЁМ', v: '2.4 т', s: 'за неделю', c: t.accent2 },
            { l: 'PR РЕКОРДОВ', v: '12', s: 'в этом месяце', c: t.accent },
            { l: 'СОН СРЕДНИЙ', v: '7:34', s: 'за неделю', c: t.accent2 },
          ].map((m, i) => (
            <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: 14 }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1.2 }}>{m.l}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: m.c, marginTop: 4, lineHeight: 1 }}>{m.v}</div>
              <div style={{ fontSize: 10, color: t.textSub, marginTop: 4, fontFamily: t.fontM }}>{m.s}</div>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 10 }}>РЕКОРДЫ</div>
        {[
          { ex: 'Жим штанги лёжа', v: '120', u: 'КГ', dy: '+5' },
          { ex: 'Становая тяга', v: '160', u: 'КГ', dy: '+10' },
          { ex: 'Приседания', v: '140', u: 'КГ', dy: '+2.5' },
        ].map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.trophy size={16}/></div>
            <div style={{ flex: 1, fontSize: 13 }}>{p.ex}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 800 }}>{p.v}<span style={{ fontSize: 10, color: t.textSub, marginLeft: 3 }}>{p.u}</span></div>
              <div style={{ fontSize: 10, color: t.accent, fontFamily: t.fontM }}>+{p.dy} КГ</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════ C — Energy variation (Home + Active + Paywall) ═══════════
window.C_Home = function C_Home() {
  const t = C_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: t.textSub, fontWeight: 500 }}>Привет 👊</div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginTop: 2 }}>Артём</div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF' }}>
              <Icons.flame size={20}/>
            </div>
          </div>
        </div>

        {/* Workout hero with gradient */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accent2} 100%)`,
          borderRadius: 28, padding: 24, marginBottom: 14, color: '#FFF', minHeight: 180
        }}>
          <div style={{ position: 'absolute', right: -30, bottom: -30, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }}/>
          <div style={{ position: 'absolute', right: 20, top: 20, width: 40, height: 40, borderRadius: 12, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.play size={18}/>
          </div>
          <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, letterSpacing: 0.5 }}>ТРЕНИРОВКА СЕГОДНЯ</div>
          <div style={{ fontFamily: t.fontH, fontSize: 32, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05, marginTop: 6, maxWidth: 220 }}>
            Взрывная грудь
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {['45 МИН', '7 УПР', 'СРЕДНЕ'].map((c, i) => (
              <div key={i} style={{ padding: '4px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>{c}</div>
            ))}
          </div>
          <button style={{ marginTop: 18, height: 44, padding: '0 20px', borderRadius: 14, background: '#FFF', color: t.accent, border: 0, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ПОЕХАЛИ <Icons.arrow size={16} sw={2.4}/>
          </button>
        </div>

        {/* AI assistant */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 16, marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${t.accent2}, ${t.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={22} sw={2}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Тренер знает цель</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>«На этой неделе жим 125 кг реален»</div>
          </div>
          <Icons.arrow size={18}/>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          {[
            { i: 'flame', v: '47', l: 'стрик', c: t.accent },
            { i: 'trophy', v: '12', l: 'PR', c: t.warn },
            { i: 'bolt', v: '87', l: 'форма', c: t.accent2 },
          ].map((s, i) => {
            const IcC = Icons[s.i];
            return (
              <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, textAlign: 'center' }}>
                <div style={{ color: s.c, display: 'flex', justifyContent: 'center', marginBottom: 4 }}><IcC size={20}/></div>
                <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>{s.v}</div>
                <div style={{ fontSize: 10, color: t.textSub, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{s.l}</div>
              </div>
            );
          })}
        </div>

        {/* Nutrition compact */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🍽 Питание</div>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 600 }}>+ Добавить</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Ring size={56} stroke={5} value={0.68} color={t.accent}>
              <div style={{ fontSize: 10, fontWeight: 700 }}>68%</div>
            </Ring>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>1 640 <span style={{ fontSize: 12, color: t.textSub, fontWeight: 400 }}>/ 2 400</span></div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: t.textSub, marginTop: 2 }}>
                <span>Б <b style={{ color: t.text }}>98</b></span><span>Ж <b style={{ color: t.text }}>52</b></span><span>У <b style={{ color: t.text }}>190</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <TabBar theme={t} active={0}/>
    </div>
  );
};

window.C_Paywall = function C_Paywall() {
  const t = C_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 400, background: `radial-gradient(ellipse at 50% 0%, ${t.accent}55, transparent 70%)` }}/>
      <div style={{ padding: '20px 20px 20px', overflow: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 30 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textSub }}>✕</div>
        </div>

        <div style={{ width: 80, height: 80, borderRadius: 26, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, boxShadow: `0 20px 40px -10px ${t.accent}66` }}>
          <Icons.bolt size={40}/>
        </div>

        <div style={{ fontSize: 12, color: t.accent, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>7 дней бесплатно</div>
        <h1 style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 700, lineHeight: 1.02, letterSpacing: -1.5, margin: '12px 0 14px' }}>
          IRON <span style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>PRO</span>
        </h1>
        <p style={{ fontSize: 15, color: t.textSub, lineHeight: 1.5, marginBottom: 24 }}>
          Полный арсенал: ИИ без лимитов, все программы, точный сканер еды.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {[
            { i: 'spark', t: 'ИИ‑тренер без лимитов' },
            { i: 'camera', t: 'Сканер еды по фото' },
            { i: 'dumbbell', t: '50+ программ и авторские' },
            { i: 'chart', t: 'Глубокая аналитика + экспорт' },
          ].map((f, i) => {
            const IcC = Icons[f.i];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcC size={16}/></div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{f.t}</div>
                <Icons.check size={18} sw={2.4}/>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ padding: 16, borderRadius: 20, background: t.surface, border: `2px solid ${t.accent}`, position: 'relative' }}>
            <div style={{ position: 'absolute', top: -10, right: 16, padding: '4px 10px', borderRadius: 99, background: t.accent, color: '#FFF', fontSize: 10, fontWeight: 800, letterSpacing: 0.5 }}>ВЫГОДНО −56%</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Год</div>
                <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>249 ₽ / мес</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700 }}>2 990 ₽</div>
                <div style={{ fontSize: 11, color: t.textDim, textDecoration: 'line-through' }}>6 788 ₽</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 20, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Месяц</div>
              <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>Отмена в любой момент</div>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700 }}>569 ₽</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 14, color: t.textSub, fontSize: 11, fontWeight: 500 }}>
          <span>ЮKassa</span><span>·</span><span>СБП</span><span>·</span><span>МИР</span><span>·</span><span>Apple Pay</span>
        </div>

        <button style={{ width: '100%', height: 58, borderRadius: 20, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', border: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: `0 20px 40px -10px ${t.accent}66` }}>
          Активировать триал <Icons.arrow size={18} sw={2.2}/>
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: t.textDim, marginTop: 10 }}>Далее 2 990 ₽ / год · отмена в один клик</div>
      </div>
    </div>
  );
};

window.C_Active = function C_Active() {
  const t = C_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.chevDn size={18}/></div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: t.textSub, letterSpacing: 0.5, fontWeight: 600 }}>УПРАЖНЕНИЕ 3/7</div>
          <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 700 }}>Грудь · трицепс</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={18}/></div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', gap: 4, marginBottom: 14 }}>
        {[1,1,0.5,0,0,0,0].map((s, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: s === 1 ? t.accent : s > 0 ? `linear-gradient(90deg, ${t.accent} 50%, ${t.lineStrong} 50%)` : t.lineStrong }}/>
        ))}
      </div>

      <div style={{ margin: '0 20px 16px', borderRadius: 24, overflow: 'hidden', position: 'relative', height: 190 }}>
        <Placeholder label="техника · жим лёжа" h={190} radius={24} tint="rgba(255,90,54,0.08)" fg="rgba(168,85,247,0.06)"/>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 60, height: 60, borderRadius: 99, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 15px 30px -5px ${t.accent}88` }}><Icons.play size={26}/></div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginBottom: 14 }}>
        <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Жим штанги лёжа 🔥</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: t.textSub }}>
          <span>4 × 8–10</span><span>·</span><span>Отдых 2:00</span><span>·</span><span style={{ color: t.accent }}>PR 120</span>
        </div>
      </div>

      <div style={{ margin: '0 20px 14px', background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, borderRadius: 28, padding: 22, color: '#FFF', boxShadow: `0 20px 40px -15px ${t.accent}88` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, letterSpacing: 0.5 }}>ПОДХОД 3 ИЗ 4</div>
          <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>Было: 100 × 8</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1, fontWeight: 600 }}>ВЕС, КГ</div>
            <div style={{ fontFamily: t.fontH, fontSize: 56, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>102.5</div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.25)' }}/>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, letterSpacing: 1, fontWeight: 600 }}>ПОВТОРЫ</div>
            <div style={{ fontFamily: t.fontH, fontSize: 56, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>8</div>
          </div>
        </div>
        <button style={{ width: '100%', height: 50, borderRadius: 16, background: '#FFF', color: t.accent, border: 0, fontSize: 15, fontWeight: 700, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icons.check size={18} sw={2.4}/> Подход выполнен
        </button>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', gap: 6 }}>
        {[{ s: 'РАЗМ', w: 60, r: 10 }, { s: '2', w: 100, r: 8 }].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: 10, borderRadius: 14, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 99, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.check size={12} sw={3}/></div>
            <div style={{ fontSize: 11, color: t.textSub }}>{s.s}</div>
            <div style={{ flex: 1, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{s.w}×{s.r}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

window.C_AI = function C_AI() {
  const t = C_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${t.line}` }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={22} sw={2}/></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 700 }}>Тренер Макс ⚡</div>
          <div style={{ fontSize: 11, color: t.good, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: 99, background: t.good }}/> Всегда с тобой
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ maxWidth: '85%', background: t.surface, border: `1px solid ${t.line}`, borderRadius: '20px 20px 20px 4px', padding: 14, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>Привет! 👋 Я помню, что ты хочешь выйти на жим 125 кг. Сегодня идеальный день — форма 87/100.</div>
        </div>

        <div style={{ maxWidth: '85%', background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', borderRadius: '20px 20px 4px 20px', padding: 14, alignSelf: 'flex-end', fontSize: 14, fontWeight: 500 }}>
          Добавь побольше белка в меню на неделю
        </div>

        <div style={{ maxWidth: '88%', alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: '20px 20px 20px 4px', padding: 14 }}>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>Сделал 🎯 Повысил цель до 180 г/день — это поможет росту мышц.</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.accent}`, borderRadius: 18, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icons.apple size={14} /> <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, letterSpacing: 0.5, textTransform: 'uppercase' }}>Меню недели</span>
            </div>
            {['Завтрак · омлет + овсянка', 'Обед · курица + гречка', 'Перекус · творог + орехи'].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: i ? `1px solid ${t.line}` : 0, fontSize: 12 }}>
                <span>{r}</span><Icons.check size={14} sw={2.4}/>
              </div>
            ))}
            <button style={{ width: '100%', height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', border: 0, fontSize: 13, fontWeight: 700, marginTop: 12 }}>Применить план</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 16px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['План на завтра', 'Разбор техники', 'Сон и восстановление'].map((s, i) => (
          <div key={i} style={{ whiteSpace: 'nowrap', padding: '8px 14px', borderRadius: 14, background: t.surface, border: `1px solid ${t.line}`, fontSize: 12, color: t.textSub }}>{s}</div>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${t.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: '8px 10px 8px 14px' }}>
          <div style={{ flex: 1, fontSize: 14, color: t.textSub }}>Спроси у тренера…</div>
          <div style={{ width: 34, height: 34, borderRadius: 12, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.mic size={16}/></div>
          <div style={{ width: 34, height: 34, borderRadius: 12, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.send size={16}/></div>
        </div>
      </div>
    </div>
  );
};
