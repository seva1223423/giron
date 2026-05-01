/* global React, Icons, Ring, Bar, Placeholder, TabBar */
// Variation C (Energy) — Onboarding, Workouts, Nutrition, Progress, Profile, News

const C_T2 = window.IG_TOKENS.C;

// ═══════════ C — Onboarding ═══════════
window.C_Onboarding = function C_Onboarding() {
  const t = C_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', position: 'relative', fontFamily: t.fontB, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accent2} 100%)`, clipPath: 'ellipse(120% 100% at 50% 0%)' }}/>
      <div style={{ position: 'absolute', top: 60, right: 20, opacity: 0.3 }}>
        <Icons.bolt size={80}/>
      </div>

      <div style={{ padding: '24px 22px', position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(20px)', color: '#FFF', fontSize: 11, fontWeight: 700 }}>
          <Icons.bolt size={12}/> IRON GYM
        </div>
        <button style={{ background: 'transparent', border: 0, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 500 }}>Пропустить</button>
      </div>

      <div style={{ flex: 1, padding: '0 22px', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ background: t.surface, borderRadius: 28, padding: 24, marginBottom: 16, border: `1px solid ${t.line}`, boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>Шаг 1 из 4</div>
          <h1 style={{ fontFamily: t.fontH, fontSize: 36, fontWeight: 700, lineHeight: 1.02, letterSpacing: -1.5, margin: '12px 0 0' }}>
            Привет! <br/>
            Я <span style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>твой тренер</span>
          </h1>
          <p style={{ fontSize: 14, color: t.textSub, lineHeight: 1.5, marginTop: 14 }}>
            Расскажу, помогу, напомню. Спроси что угодно — от плана тренировки до состава ужина.
          </p>

          <div style={{ marginTop: 18, padding: 12, background: t.surfaceHi, borderRadius: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icons.spark size={18} sw={2.2}/></div>
            <div style={{ fontSize: 12, color: t.text, lineHeight: 1.4 }}>
              «Составлю программу под твои цели за 30 секунд — нужно только ответить на 4 вопроса»
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, margin: '18px 0 14px' }}>
            {[1,0,0,0].map((a, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 99, background: a ? `linear-gradient(90deg, ${t.accent}, ${t.accent2})` : t.lineStrong }}/>)}
          </div>

          <button style={{ width: '100%', height: 54, borderRadius: 18, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', border: 0, fontSize: 15, fontWeight: 700, boxShadow: `0 15px 30px -10px ${t.accent}99`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            Погнали <Icons.arrow size={18} sw={2.2}/>
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════ C — Workouts ═══════════
window.C_Workouts = function C_Workouts() {
  const t = C_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: t.textSub, fontWeight: 500 }}>Неделя 4 из 12 🔥</div>
            <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, marginTop: 2 }}>Тренировки</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={18}/></div>
        </div>

        {/* Week strip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[
            { d: 'Пн', n: 21, done: true },
            { d: 'Вт', n: 22, active: true },
            { d: 'Ср', n: 23, rest: true },
            { d: 'Чт', n: 24 },
            { d: 'Пт', n: 25 },
            { d: 'Сб', n: 26, rest: true },
            { d: 'Вс', n: 27 },
          ].map((d, i) => (
            <div key={i} style={{
              flex: 1, padding: '10px 0', borderRadius: 14,
              background: d.active ? `linear-gradient(135deg, ${t.accent}, ${t.accent2})` : d.done ? t.chipBg : t.surface,
              border: `1px solid ${d.active ? 'transparent' : t.line}`,
              textAlign: 'center', color: d.active ? '#FFF' : d.done ? t.accent : t.textSub,
              boxShadow: d.active ? `0 10px 20px -8px ${t.accent}88` : 'none'
            }}>
              <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 500 }}>{d.d}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 700, marginTop: 2 }}>{d.n}</div>
              {d.done && <div style={{ fontSize: 9, marginTop: 1 }}>✓</div>}
              {d.rest && <div style={{ fontSize: 9, marginTop: 1, opacity: 0.5 }}>rest</div>}
            </div>
          ))}
        </div>

        {/* Today hero with gradient */}
        <div style={{
          background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accent2} 100%)`,
          borderRadius: 26, padding: 22, marginBottom: 14, color: '#FFF', position: 'relative', overflow: 'hidden',
          boxShadow: `0 20px 50px -15px ${t.accent}99`
        }}>
          <div style={{ position: 'absolute', right: -30, bottom: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }}/>
          <div style={{ fontSize: 11, opacity: 0.85, fontWeight: 600, letterSpacing: 0.5 }}>🔥 СЕГОДНЯ</div>
          <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 700, letterSpacing: -0.8, marginTop: 4, lineHeight: 1.02 }}>Взрывная грудь</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {['45 мин', '7 упр', '540 ккал'].map((c, i) => (
              <div key={i} style={{ padding: '5px 12px', borderRadius: 99, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', fontSize: 11, fontWeight: 600 }}>{c}</div>
            ))}
          </div>
          <button style={{ marginTop: 16, height: 44, padding: '0 22px', borderRadius: 14, background: '#FFF', color: t.accent, border: 0, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Поехали <Icons.play size={14}/>
          </button>
        </div>

        {/* Categories */}
        <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 700, marginBottom: 10, marginTop: 6 }}>Мои программы</div>

        {[
          { t: 'GROW', s: '💪 Гипертрофия · 12 нед', p: 0.33, grad: `linear-gradient(135deg, ${t.accent}, ${t.accent2})` },
          { t: 'POWER 5×5', s: '⚡ Сила · 8 нед', p: 0, locked: true },
          { t: 'SHRED', s: '🔥 Сушка · 6 нед', p: 0 },
        ].map((p, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: p.grad || t.surfaceHi, border: p.grad ? 0 : `1px solid ${t.line}`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {p.locked ? <Icons.lock size={18}/> : <Icons.dumbbell size={18}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 700 }}>{p.t}</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{p.s}</div>
              {p.p > 0 && <div style={{ marginTop: 8 }}><Bar value={p.p} color={t.accent} track={t.lineStrong} h={3}/></div>}
              {p.locked && <div style={{ fontSize: 10, color: t.accent, fontWeight: 700, marginTop: 6 }}>PRO подписка</div>}
            </div>
          </div>
        ))}

        {/* AI CTA */}
        <div style={{ background: t.surface, border: `1px dashed ${t.accent}`, borderRadius: 18, padding: 14, marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={18}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Собрать программу с ИИ ✨</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>Под цели, график, инвентарь</div>
          </div>
          <Icons.arrow size={18}/>
        </div>
      </div>
      <TabBar theme={t} active={1}/>
    </div>
  );
};

// ═══════════ C — Nutrition ═══════════
window.C_Nutrition = function C_Nutrition() {
  const t = C_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: t.textSub, fontWeight: 500 }}>Сегодня 🍽</div>
            <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, marginTop: 2 }}>Питание</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.scan size={18}/></div>
        </div>

        {/* Big calorie hero */}
        <div style={{
          background: `linear-gradient(135deg, ${t.surface} 0%, ${t.surfaceHi} 100%)`,
          border: `1px solid ${t.line}`, borderRadius: 26, padding: 22, marginBottom: 12, position: 'relative', overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}33, transparent 65%)` }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, color: t.textSub, letterSpacing: 0.5 }}>Осталось на сегодня</div>
              <div style={{ fontFamily: t.fontH, fontSize: 52, fontWeight: 700, letterSpacing: -2, lineHeight: 1, marginTop: 6 }}>
                760 <span style={{ fontSize: 16, color: t.textSub, fontWeight: 500 }}>ккал</span>
              </div>
              <div style={{ fontSize: 12, color: t.accent, marginTop: 6, fontWeight: 600 }}>1 640 из 2 400 ✓</div>
            </div>
            <Ring size={80} stroke={6} value={0.68} color={t.accent}>
              <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 700 }}>68%</div>
            </Ring>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16, position: 'relative' }}>
            {[
              { l: 'Белки', v: 98, m: 160, c: t.accent, e: '💪' },
              { l: 'Жиры', v: 52, m: 80, c: t.warn, e: '🥑' },
              { l: 'Углеводы', v: 190, m: 280, c: t.accent2, e: '🍚' },
            ].map((r, i) => (
              <div key={i} style={{ padding: 10, borderRadius: 14, background: 'rgba(0,0,0,0.25)' }}>
                <div style={{ fontSize: 10, color: t.textSub, display: 'flex', gap: 4, alignItems: 'center' }}><span>{r.e}</span>{r.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 700, marginTop: 4 }}>{r.v}<span style={{ fontSize: 10, color: t.textSub, marginLeft: 2 }}>/{r.m}</span></div>
                <div style={{ marginTop: 6 }}><Bar value={r.v / r.m} color={r.c} track="rgba(255,255,255,0.1)" h={3}/></div>
              </div>
            ))}
          </div>
        </div>

        {/* Water */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>💧 Вода</div>
            <div style={{ fontSize: 12, color: t.textSub }}>1.2 / 2.5 л</div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,1,1,1,1,0.5,0,0,0,0].map((v, i) => (
              <div key={i} style={{ flex: 1, height: 32, borderRadius: 8, background: v === 1 ? t.accent2 : v > 0 ? `linear-gradient(180deg, ${t.accent2} 50%, rgba(168,85,247,0.15) 50%)` : 'rgba(168,85,247,0.1)' }}/>
            ))}
          </div>
        </div>

        {/* AI scan CTA */}
        <div style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, borderRadius: 20, padding: 16, marginBottom: 14, color: '#FFF', display: 'flex', gap: 12, alignItems: 'center', boxShadow: `0 15px 30px -10px ${t.accent}88` }}>
          <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.camera size={22}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Сфоткай — получи КБЖУ 📸</div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>ИИ определит за 3 секунды</div>
          </div>
          <Icons.arrow size={18} sw={2.2}/>
        </div>

        {/* Meals */}
        {[
          { t: 'Завтрак', e: '🥣', c: 420, items: ['Овсянка · 80г', 'Яйца · 3шт', 'Кофе'] },
          { t: 'Обед', e: '🍗', c: 680, items: ['Куриная грудка · 200г', 'Рис · 150г', 'Салат'] },
          { t: 'Ужин', e: '🍽', empty: true },
        ].map((m, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{m.e}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{m.t}</div>
                  <div style={{ fontSize: 11, color: m.empty ? t.accent : t.textSub, marginTop: 2 }}>{m.empty ? 'Добавить' : `${m.c} ккал`}</div>
                </div>
              </div>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: m.empty ? `linear-gradient(135deg, ${t.accent}, ${t.accent2})` : t.surfaceHi, color: m.empty ? '#FFF' : t.textSub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={16} sw={2.4}/></div>
            </div>
            {!m.empty && (
              <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
                {m.items.map((it, j) => <div key={j} style={{ padding: '4px 9px', borderRadius: 8, background: t.surfaceHi, border: `1px solid ${t.line}`, fontSize: 11, color: t.textSub }}>{it}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
      <TabBar theme={t} active={3}/>
    </div>
  );
};

// ═══════════ C — Progress ═══════════
window.C_Progress = function C_Progress() {
  const t = C_T2;
  const pts = [68, 70, 67, 72, 70, 68, 65, 67, 64, 62, 60, 58];
  const max = Math.max(...pts), min = Math.min(...pts);
  const path = pts.map((p, i) => `${(i / (pts.length - 1)) * 300},${80 - ((p - min) / (max - min)) * 60}`).join(' ');
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, marginBottom: 14 }}>Прогресс 📈</div>

        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {['Неделя','Месяц','3 мес','Год'].map((l, i) => (
            <div key={i} style={{ padding: '7px 13px', borderRadius: 12, background: i === 1 ? `linear-gradient(135deg, ${t.accent}, ${t.accent2})` : t.surface, color: i === 1 ? '#FFF' : t.textSub, fontSize: 12, fontWeight: 600, border: `1px solid ${i === 1 ? 'transparent' : t.line}`, boxShadow: i === 1 ? `0 8px 20px -6px ${t.accent}77` : 'none' }}>{l}</div>
          ))}
        </div>

        {/* Weight */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 18, marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}22, transparent 70%)` }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, position: 'relative' }}>
            <div>
              <div style={{ fontSize: 11, color: t.textSub, fontWeight: 500 }}>Вес</div>
              <div style={{ fontFamily: t.fontH, fontSize: 40, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1, marginTop: 4 }}>
                78.4 <span style={{ fontSize: 14, color: t.textSub, fontWeight: 500 }}>кг</span>
              </div>
            </div>
            <div style={{ padding: '6px 12px', borderRadius: 99, background: `linear-gradient(135deg, ${t.good}33, ${t.good}11)`, color: t.good, fontSize: 11, fontWeight: 700, alignSelf: 'flex-start' }}>↓ 3.2 кг за мес</div>
          </div>
          <svg width="100%" height="90" viewBox="0 0 300 90" preserveAspectRatio="none">
            <defs>
              <linearGradient id="cgrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={t.accent} stopOpacity="0.35"/>
                <stop offset="1" stopColor={t.accent2} stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="cline" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor={t.accent}/>
                <stop offset="1" stopColor={t.accent2}/>
              </linearGradient>
            </defs>
            <polyline points={`0,90 ${path} 300,90`} fill="url(#cgrad)"/>
            <polyline points={path} fill="none" stroke="url(#cline)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { e: '🔥', l: 'Стрик', v: '47', s: 'дней' },
            { e: '🏋', l: 'Объём', v: '124', s: 'тонн' },
            { e: '🏆', l: 'Рекорды', v: '12', s: 'в этом месяце' },
            { e: '⚡', l: 'Форма', v: '87', s: '/100' },
          ].map((m, i) => (
            <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14 }}>
              <div style={{ fontSize: 22 }}>{m.e}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1, marginTop: 8 }}>{m.v}</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 4 }}>{m.l} · {m.s}</div>
            </div>
          ))}
        </div>

        {/* PRs */}
        <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Свежие рекорды 🏆</div>
        {[
          { ex: 'Жим лёжа', v: '120 кг', dy: '+5', d: '22 апр' },
          { ex: 'Становая', v: '160 кг', dy: '+10', d: '18 апр' },
          { ex: 'Присед', v: '140 кг', dy: '+2.5', d: '15 апр' },
        ].map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.trophy size={16}/></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.ex}</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{p.d}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 700 }}>{p.v}</div>
              <div style={{ fontSize: 11, color: t.good, fontWeight: 600 }}>+{p.dy} кг</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════ C — Profile ═══════════
window.C_Profile = function C_Profile() {
  const t = C_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>

        {/* Hero */}
        <div style={{
          background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accent2} 100%)`,
          borderRadius: 28, padding: 22, marginBottom: 12, color: '#FFF', position: 'relative', overflow: 'hidden',
          boxShadow: `0 20px 40px -15px ${t.accent}88`
        }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{ width: 66, height: 66, borderRadius: 20, background: '#FFF', color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontSize: 28, fontWeight: 700 }}>А</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700 }}>Артём 👊</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Уровень 12 · 47 тренировок</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                <Icons.bolt size={11}/> PRO
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 18, position: 'relative' }}>
            {[{ e: '🔥', v: '47', l: 'стрик' }, { e: '🏋', v: '47', l: 'сессий' }, { e: '🏆', v: '12', l: 'ачивок' }].map((s, i) => (
              <div key={i} style={{ padding: '10px 4px', borderRadius: 14, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(10px)', textAlign: 'center' }}>
                <div style={{ fontSize: 18 }}>{s.e}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 700, marginTop: 2 }}>{s.v}</div>
                <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
          <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 700 }}>Ачивки 🏆</div>
          <div style={{ fontSize: 12, color: t.accent, fontWeight: 600 }}>Все →</div>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
          {[{ e: '🔥', l: 'Стрик 30' }, { e: '🏋', l: '100 сетов' }, { e: '💪', l: 'PR жим' }, { e: '🎯', l: 'Цель' }, { e: '⚡', l: 'закрыто' }, { e: '🏆', l: 'закрыто' }].map((a, idx) => {
            const on = idx < 4;
            return (
              <div key={idx} style={{ minWidth: 90, aspectRatio: '1/1.1', borderRadius: 18, background: on ? t.surface : 'transparent', border: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: on ? 1 : 0.4 }}>
                <div style={{ fontSize: 28, filter: on ? 'none' : 'grayscale(1)' }}>{a.e}</div>
                <div style={{ fontSize: 10, color: on ? t.text : t.textDim, fontWeight: 600, textAlign: 'center' }}>{a.l}</div>
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {[
          { e: '🎯', l: 'Цели', s: 'Набрать 3 кг мышц' },
          { e: '🔔', l: 'Напоминания', s: '3 активных' },
          { e: '❤️', l: 'Здоровье', s: 'Нет ограничений' },
          { e: '⚙️', l: 'Настройки', s: '' },
          { e: '🔒', l: 'Приватность и 152‑ФЗ', s: '' },
        ].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, marginBottom: 6 }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{r.e}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{r.l}</div>
              {r.s && <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{r.s}</div>}
            </div>
            <Icons.chev size={16} sw={1.8}/>
          </div>
        ))}
      </div>
      <TabBar theme={t} active={4}/>
    </div>
  );
};

// ═══════════ C — News ═══════════
window.C_News = function C_News() {
  const t = C_T2;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: t.textSub }}>🔥 +12 новых</div>
            <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 700, letterSpacing: -0.5 }}>Лента</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.search size={18}/></div>
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
          {['Всё ✨', 'Блогеры', 'Наука', 'Тренинг', 'Питание', 'Добавки'].map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', padding: '7px 14px', borderRadius: 12, background: i === 0 ? `linear-gradient(135deg, ${t.accent}, ${t.accent2})` : t.surface, color: i === 0 ? '#FFF' : t.textSub, fontSize: 12, fontWeight: 600, border: `1px solid ${i === 0 ? 'transparent' : t.line}` }}>{l}</div>
          ))}
        </div>

        {/* Featured */}
        <div style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 14, position: 'relative', height: 220 }}>
          <Placeholder label="блогер · видео" h={220} radius={24} tint="rgba(255,90,54,0.1)" fg="rgba(168,85,247,0.08)"/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(10,7,16,0.95) 100%)' }}/>
          <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 99, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#FFF', fontSize: 10, fontWeight: 700 }}>
            <Icons.play size={10}/> ВИДЕО · 12 МИН
          </div>
          <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)', fontSize: 10, fontWeight: 600 }}>🔥 2.1к</div>
          <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 600, letterSpacing: 0.5 }}>Денис Гусев · YouTube</div>
            <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 700, marginTop: 4, lineHeight: 1.1, letterSpacing: -0.3 }}>
              Как набрать 5 кг мышц за год без фармы
            </div>
          </div>
        </div>

        {/* Items */}
        {[
          { e: '💪', src: 'Юрий Спасокукоцкий', cat: 'Тренинг', t: 'Разбор 5 ошибок в становой тяге', time: '1 ч' },
          { e: '🍗', src: 'Алексей Шредер', cat: 'Питание', t: 'Белок после 40: сколько реально нужно', time: '3 ч' },
          { e: '🧪', src: 'Hard Training', cat: 'Наука', t: 'Мета‑анализ 2026: оптимальное число подходов', time: '5 ч' },
          { e: '💊', src: 'Food Lab', cat: 'Добавки', t: 'Креатин моногидрат vs HCL — есть ли разница', time: '1 дн' },
        ].map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: 12, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, marginBottom: 8 }}>
            <div style={{ width: 64, height: 64, borderRadius: 14, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>{n.e}</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div>
                <div style={{ fontSize: 10, color: t.accent, fontWeight: 600 }}>{n.cat}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3, lineHeight: 1.3 }}>{n.t}</div>
              </div>
              <div style={{ fontSize: 11, color: t.textDim }}>{n.src} · {n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
