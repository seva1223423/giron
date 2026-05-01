/* global React, Icons, Ring, Bar, Placeholder, Phone, TabBar */
// Variation A (Graphite+Gold) — part 2: Workouts list, Active workout, Rest timer

const A_T2 = window.IG_TOKENS.A;

// ═══════════ Workouts list ═══════════
window.A_Workouts = function A_Workouts() {
  const t = A_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5 }}>Тренировки</div>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={20} sw={2.4}/></div>
        </div>

        {/* AI builder CTA */}
        <div style={{ background: `linear-gradient(135deg, ${t.surfaceHi}, ${t.surface})`, border: `1px solid ${t.line}`, borderRadius: 22, padding: 18, marginBottom: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.spark size={22} sw={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Создать программу с ИИ</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>30 секунд · под ваши цели</div>
          </div>
          <Icons.arrow size={18}/>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: t.surface, padding: 4, borderRadius: 14, border: `1px solid ${t.line}` }}>
          {['Мои', 'Готовые', 'История'].map((l, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 0', fontSize: 13, fontWeight: 600, borderRadius: 10, background: i === 0 ? t.accent : 'transparent', color: i === 0 ? '#0A0A0A' : t.textSub }}>{l}</div>
          ))}
        </div>

        {/* Programs */}
        {[
          { name: 'Push · Pull · Legs', sub: '6 недель · средний уровень', days: '3×/нед', pr: 0.6, featured: true },
          { name: 'Сила: 5×5', sub: '12 недель · продвинутый', days: '3×/нед', pr: 0.25 },
          { name: 'Жиросжигание', sub: '4 недели · начинающий', days: '4×/нед', pr: 0 },
        ].map((p, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${p.featured ? t.accent : t.line}`, borderRadius: 22, padding: 18, marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
            {p.featured && <div style={{ position: 'absolute', top: 14, right: 14, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1, color: t.accent, textTransform: 'uppercase' }}>Текущая</div>}
            <div style={{ fontFamily: t.fontH, fontSize: 20, fontWeight: 500, letterSpacing: -0.3 }}>{p.name}</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 4, marginBottom: 14 }}>{p.sub}</div>
            {p.pr > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.textSub, marginBottom: 6 }}>
                  <span>Прогресс</span><span style={{ fontFamily: t.fontM, color: t.accent }}>{Math.round(p.pr * 100)}%</span>
                </div>
                <Bar value={p.pr} color={t.accent} track={t.lineStrong} h={4}/>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {[p.days, 'Штанга', '45 мин'].map((c, j) => (
                <div key={j} style={{ padding: '6px 10px', borderRadius: 99, background: t.surfaceHi, border: `1px solid ${t.line}`, fontSize: 11, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3 }}>{c}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <TabBar theme={t} active={1}/>
    </div>
  );
};

// ═══════════ Active workout (minimal, focus mode) ═══════════
window.A_Active = function A_Active() {
  const t = A_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      {/* Header */}
      <div style={{ padding: '16px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icons.chevDn size={18}/>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.textSub, textTransform: 'uppercase' }}>УПР 3 ИЗ 7</div>
          <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 500 }}>Грудь · трицепс</div>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.accent }}>
          <Icons.spark size={18}/>
        </div>
      </div>

      {/* Progress segments */}
      <div style={{ padding: '0 20px', display: 'flex', gap: 4, marginBottom: 14 }}>
        {[1,1,0.5,0,0,0,0].map((s, i) => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: s === 1 ? t.accent : s > 0 ? `linear-gradient(90deg, ${t.accent} 50%, ${t.lineStrong} 50%)` : t.lineStrong }}/>
        ))}
      </div>

      {/* Video */}
      <div style={{ margin: '0 20px 16px', borderRadius: 22, overflow: 'hidden', position: 'relative', height: 200 }}>
        <Placeholder label="техника · жим штанги лёжа" h={200} radius={22} tint="rgba(212,176,122,0.08)" fg="rgba(212,176,122,0.04)"/>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 58, height: 58, borderRadius: 99, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px -5px ${t.accent}66` }}>
            <Icons.play size={24}/>
          </div>
        </div>
        <div style={{ position: 'absolute', top: 12, right: 12, padding: '5px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', fontSize: 11, color: '#fff', fontFamily: t.fontM }}>HD · 0:12</div>
      </div>

      {/* Exercise name */}
      <div style={{ padding: '0 20px', marginBottom: 16 }}>
        <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5 }}>Жим штанги лёжа</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: t.textSub, fontFamily: t.fontM }}>
          <span>4 × 8–10</span>
          <span>·</span>
          <span>Отдых 2:00</span>
          <span>·</span>
          <span style={{ color: t.accent }}>PR 120 кг</span>
        </div>
      </div>

      {/* Current set — huge */}
      <div style={{ margin: '0 20px 14px', background: t.accent, borderRadius: 26, padding: 22, color: '#0A0A0A' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.7 }}>Подход 3 из 4</div>
          <div style={{ fontFamily: t.fontM, fontSize: 11, opacity: 0.7 }}>Прошлый: 100×8</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, opacity: 0.65, textTransform: 'uppercase' }}>Вес, кг</div>
            <div style={{ fontFamily: t.fontH, fontSize: 56, fontWeight: 500, letterSpacing: -2, lineHeight: 1 }}>102.5</div>
          </div>
          <div style={{ width: 1, height: 48, background: 'rgba(10,10,10,0.2)' }}/>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, opacity: 0.65, textTransform: 'uppercase' }}>Повторы</div>
            <div style={{ fontFamily: t.fontH, fontSize: 56, fontWeight: 500, letterSpacing: -2, lineHeight: 1 }}>8</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button style={{ flex: 1, height: 50, borderRadius: 16, background: '#0A0A0A', color: t.accent, border: 0, fontSize: 15, fontWeight: 600, fontFamily: t.fontB, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icons.check size={18} sw={2.4}/> Подход выполнен
          </button>
          <button style={{ width: 50, height: 50, borderRadius: 16, background: 'rgba(10,10,10,0.15)', color: '#0A0A0A', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.mic size={20}/>
          </button>
        </div>
      </div>

      {/* Done sets + AI hint */}
      <div style={{ padding: '0 20px' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { s: 1, w: 60, r: 10, warm: true },
            { s: 2, w: 100, r: 8 },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '8px 12px', borderRadius: 14, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: 99, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.check size={12} sw={3}/></div>
              <div>
                <div style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.5 }}>{s.warm ? 'РАЗМИНКА' : `ПОДХОД ${s.s}`}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 13 }}>{s.w} кг × {s.r}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginTop: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 28, height: 28, borderRadius: 9, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icons.spark size={14}/>
          </div>
          <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
            <span style={{ color: t.text, fontWeight: 600 }}>ИИ:</span> прошлая сессия — 8 повторов без замедления. Можно добавить 2.5 кг или попробовать 10 повторов.
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════ Rest timer (fullscreen) ═══════════
window.A_Rest = function A_Rest() {
  const t = A_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 30%, ${t.accent}22, transparent 60%)` }}/>

      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase' }}>Отдых · подход 3/4</div>
        <div style={{ fontSize: 13, color: t.accent, fontWeight: 600 }}>Пропустить</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100% - 100px)', position: 'relative', padding: 20 }}>
        <div style={{ position: 'relative' }}>
          <Ring size={300} stroke={3} value={0.55} color={t.accent} track={t.lineStrong}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 2, color: t.textSub, textTransform: 'uppercase' }}>Отдых</div>
              <div style={{ fontFamily: t.fontH, fontSize: 96, fontWeight: 400, letterSpacing: -4, lineHeight: 1, color: t.text, margin: '6px 0' }}>1:23</div>
              <div style={{ fontFamily: t.fontM, fontSize: 12, color: t.textSub }}>из 2:00</div>
            </div>
          </Ring>
        </div>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.textSub, textTransform: 'uppercase' }}>Следующий</div>
          <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, marginTop: 6, letterSpacing: -0.3 }}>Жим штанги · 105 кг × 8</div>
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
          <button style={{ width: 56, height: 56, borderRadius: 18, background: t.surface, color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: t.fontM, fontSize: 13, fontWeight: 600 }}>−15</span>
          </button>
          <button style={{ width: 72, height: 72, borderRadius: 22, background: t.accent, color: '#0A0A0A', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.pause size={28}/>
          </button>
          <button style={{ width: 56, height: 56, borderRadius: 18, background: t.surface, color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: t.fontM, fontSize: 13, fontWeight: 600 }}>+15</span>
          </button>
        </div>
      </div>
    </div>
  );
};
