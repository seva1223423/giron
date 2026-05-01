/* global React, Icons, Ring, Bar, Placeholder, Phone, TabBar */
// Variation B — Neon Dark (Whoop/Gymshark tech vibe)
// Mood: cold, data-dense, technology. Lime neon. Wide display type.

const B_T = window.IG_TOKENS.B;

window.B_Home = function B_Home() {
  const t = B_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textDim, letterSpacing: 2, textTransform: 'uppercase' }}>22.04 · ВТ</div>
            <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, textTransform: 'uppercase' }}>АРТЁМ</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.bell size={17}/></div>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.grid size={17}/></div>
          </div>
        </div>

        {/* Readiness hero — Whoop-style */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 24, padding: 22, marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 2, textTransform: 'uppercase' }}>Готовность</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <div style={{ fontFamily: t.fontH, fontSize: 72, fontWeight: 800, letterSpacing: -3, lineHeight: 0.9, color: t.accent }}>87</div>
                <div style={{ fontFamily: t.fontM, fontSize: 16, color: t.textSub }}>/100</div>
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 10, padding: '4px 10px', borderRadius: 6, background: t.chipBg, color: t.accent, fontSize: 11, fontFamily: t.fontM, letterSpacing: 0.5 }}>
                ↑ +12 с вчера · отличный сон
              </div>
            </div>
            <Ring size={110} stroke={3} value={0.87} color={t.accent} track={t.lineStrong} rounded={false}>
              <Icons.bolt size={32}/>
            </Ring>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 18 }}>
            {[
              { l: 'СОН', v: '7:42', s: '94%' },
              { l: 'ЧСС ПОКОЯ', v: '52', s: 'уд/мин' },
              { l: 'УСТАЛОСТЬ', v: '↓↓', s: 'низкая' },
            ].map((m, i) => (
              <div key={i} style={{ padding: 10, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}` }}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1.2 }}>{m.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 700, letterSpacing: -0.3, marginTop: 4 }}>{m.v}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub }}>{m.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Today's workout — huge CTA */}
        <div style={{ background: t.accent, borderRadius: 24, padding: 20, marginBottom: 12, color: '#0A0A0A', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: -20, opacity: 0.15 }}>
            <Icons.dumbbell size={160} sw={1}/>
          </div>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.6 }}>СЕГОДНЯ · 45 МИН · 7 УПРАЖНЕНИЙ</div>
          <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginTop: 6, textTransform: 'uppercase', lineHeight: 1 }}>ГРУДЬ +<br/>ТРИЦЕПС</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={{ flex: 1, height: 46, borderRadius: 12, background: '#0A0A0A', color: t.accent, border: 0, fontSize: 13, fontWeight: 700, fontFamily: t.fontB, letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              Начать <Icons.play size={14}/>
            </button>
            <button style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(10,10,10,0.15)', border: 0, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icons.spark size={18} sw={2.2}/>
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.accent, marginBottom: 8 }}>
              <Icons.flame size={14}/><span style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase' }}>Стрик</span>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>47</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 4 }}>дней без пропуска</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.accent2, marginBottom: 8 }}>
              <Icons.target size={14}/><span style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase' }}>Неделя</span>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>3/5</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 4 }}>тренировок</div>
          </div>
        </div>

        {/* Nutrition strip */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.3, color: t.textSub, textTransform: 'uppercase' }}>Питание сегодня</div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.accent }}>осталось 760</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>1 640</div>
            <div style={{ fontSize: 12, color: t.textSub }}>/ 2 400 ккал</div>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
            <div style={{ flex: 0.3, height: 4, background: t.accent, borderRadius: 99 }}/>
            <div style={{ flex: 0.15, height: 4, background: '#FFB547', borderRadius: 99 }}/>
            <div style={{ flex: 0.23, height: 4, background: t.accent2, borderRadius: 99 }}/>
            <div style={{ flex: 0.32, height: 4, background: t.lineStrong, borderRadius: 99 }}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: t.fontM, fontSize: 10, color: t.textSub }}>
            <span>Б 98</span><span>Ж 52</span><span>У 190</span><span style={{ color: t.textDim }}>ост</span>
          </div>
        </div>
      </div>
      <TabBar theme={t} active={0}/>
    </div>
  );
};

window.B_Active = function B_Active() {
  const t = B_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.chevDn size={18}/></div>
        <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, letterSpacing: 1.5, textTransform: 'uppercase' }}>24:18 · УПР 3/7</div>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={17}/></div>
      </div>

      {/* Progress */}
      <div style={{ padding: '0 18px', display: 'flex', gap: 3, marginBottom: 14 }}>
        {[1,1,0.5,0,0,0,0].map((s, i) => (
          <div key={i} style={{ flex: 1, height: 2, background: s === 1 ? t.accent : s > 0 ? `linear-gradient(90deg, ${t.accent} 50%, ${t.lineStrong} 50%)` : t.lineStrong }}/>
        ))}
      </div>

      {/* Video */}
      <div style={{ margin: '0 18px 14px', borderRadius: 18, overflow: 'hidden', position: 'relative', height: 170 }}>
        <Placeholder label="техника · жим лёжа" h={170} radius={18} tint="rgba(198,255,61,0.06)" fg="rgba(198,255,61,0.02)"/>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: 99, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.play size={22}/></div>
        </div>
      </div>

      <div style={{ padding: '0 18px', marginBottom: 14 }}>
        <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase' }}>ПОДХОД 3 ИЗ 4 · ПРОШЛЫЙ 100×8</div>
        <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, textTransform: 'uppercase' }}>ЖИМ ЛЁЖА</div>
      </div>

      {/* Active set — stepper style */}
      <div style={{ margin: '0 18px 12px', background: t.surface, border: `2px solid ${t.accent}`, borderRadius: 22, padding: 18 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 1.2 }}>ВЕС · КГ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontWeight: 700, fontSize: 16 }}>−</div>
              <div style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 800, letterSpacing: -1.5, color: t.accent, minWidth: 80 }}>102.5</div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontWeight: 700, fontSize: 16 }}>+</div>
            </div>
          </div>
          <div style={{ width: 1, background: t.line }}/>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 1.2 }}>ПОВТОРЫ</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontWeight: 700, fontSize: 16 }}>−</div>
              <div style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 800, letterSpacing: -1.5, color: t.accent, minWidth: 48 }}>8</div>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontWeight: 700, fontSize: 16 }}>+</div>
            </div>
          </div>
        </div>
        <button style={{ width: '100%', height: 54, borderRadius: 14, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 15, fontWeight: 800, fontFamily: t.fontB, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icons.check size={20} sw={2.4}/> ПОДХОД ВЫПОЛНЕН
        </button>
      </div>

      {/* Done sets */}
      <div style={{ padding: '0 18px' }}>
        {[{ s: '1 · РАЗМ', w: 60, r: 10 }, { s: '2', w: 100, r: 8 }].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, marginBottom: 6 }}>
            <div style={{ width: 20, height: 20, borderRadius: 99, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.check size={12} sw={3}/></div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, letterSpacing: 1 }}>{s.s}</div>
            <div style={{ flex: 1 }}/>
            <div style={{ fontFamily: t.fontM, fontSize: 13 }}>{s.w} кг × {s.r}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

window.B_Paywall = function B_Paywall() {
  const t = B_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 100%, ${t.accent}22, transparent 60%)` }}/>
      <div style={{ padding: '16px 18px 20px', overflow: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: t.chipBg, color: t.accent, fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>
            <Icons.bolt size={12}/> IRON PRO
          </div>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textSub }}>✕</div>
        </div>

        <h1 style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 800, lineHeight: 0.98, letterSpacing: -1.5, margin: 0, textTransform: 'uppercase' }}>
          РАЗБЛОКИРУЙ<br/>
          <span style={{ color: t.accent }}>МАКСИМУМ.</span>
        </h1>
        <p style={{ fontSize: 14, color: t.textSub, marginTop: 14, lineHeight: 1.5 }}>
          Безлимитный ИИ, все программы, сканер еды, углублённая аналитика. Тренируйся на уровне профи.
        </p>

        {/* Comparison grid */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 0, marginTop: 20, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', fontFamily: t.fontM, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: t.textDim, padding: '12px 14px', borderBottom: `1px solid ${t.line}` }}>
            <div></div><div style={{ textAlign: 'center' }}>Free</div><div style={{ textAlign: 'center', color: t.accent }}>Pro</div>
          </div>
          {[
            { l: 'ИИ‑сообщений', f: '10 / день', p: 'Без лимита' },
            { l: 'Программы', f: '3', p: '50+' },
            { l: 'Сканер еды', f: '5 / день', p: '∞' },
            { l: 'Аналитика', f: 'Базовая', p: 'Полная' },
            { l: 'Экспорт', f: '—', p: 'CSV / PDF' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', padding: '12px 14px', borderTop: i ? `1px solid ${t.line}` : 0, fontSize: 13, alignItems: 'center' }}>
              <div>{r.l}</div>
              <div style={{ textAlign: 'center', color: t.textSub, fontFamily: t.fontM, fontSize: 12 }}>{r.f}</div>
              <div style={{ textAlign: 'center', color: t.accent, fontWeight: 600, fontFamily: t.fontM, fontSize: 12 }}>{r.p}</div>
            </div>
          ))}
        </div>

        {/* Plans */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: 16, borderRadius: 16, background: t.surface, border: `2px solid ${t.accent}`, position: 'relative' }}>
            <div style={{ position: 'absolute', top: -9, left: 16, padding: '3px 8px', background: t.accent, color: '#0A0A0A', fontFamily: t.fontM, fontSize: 9, fontWeight: 700, letterSpacing: 1, borderRadius: 4 }}>ВЫГОДНО −56%</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 800, textTransform: 'uppercase' }}>ГОД</div>
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 2, fontFamily: t.fontM }}>249 ₽ / мес</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800 }}>2 990 ₽</div>
                <div style={{ fontSize: 10, color: t.textDim, textDecoration: 'line-through', fontFamily: t.fontM }}>6 788 ₽</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 16, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 800, textTransform: 'uppercase' }}>МЕСЯЦ</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>Отмена в любой момент</div>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 800 }}>569 ₽</div>
          </div>
        </div>

        {/* Social proof */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, padding: '12px 14px', background: t.surface, borderRadius: 12, border: `1px solid ${t.line}` }}>
          <div style={{ display: 'flex' }}>
            {[0,1,2,3].map(i => <div key={i} style={{ width: 24, height: 24, borderRadius: 99, background: `hsl(${i*80}, 30%, 40%)`, border: `2px solid ${t.surface}`, marginLeft: i ? -6 : 0 }}/>)}
          </div>
          <div style={{ fontSize: 11, color: t.textSub, fontFamily: t.fontM }}>128К+ качают с нами · ★ 4.9</div>
        </div>

        {/* Payment */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, color: t.textDim, fontSize: 10, fontFamily: t.fontM, letterSpacing: 1 }}>
          ЮKASSA · СБП · МИР · APPLE PAY
        </div>

        <button style={{ width: '100%', height: 56, borderRadius: 16, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 15, fontWeight: 800, marginTop: 14, fontFamily: t.fontB, textTransform: 'uppercase', letterSpacing: 1 }}>
          7 ДНЕЙ БЕСПЛАТНО →
        </button>
        <div style={{ textAlign: 'center', fontSize: 10, color: t.textDim, marginTop: 10, fontFamily: t.fontM, letterSpacing: 0.5 }}>Далее 2 990 ₽ / год · отмена в один клик</div>
      </div>
    </div>
  );
};
