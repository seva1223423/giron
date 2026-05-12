/* global React, Icons, Ring, Bar, Placeholder, Phone, TabBar */
// Giron — Variation A: Premium Graphite + Gold
// Mood: premium, warm, intentional. Geometric sans. Lots of negative space.

const A_T = window.IG_TOKENS.A;

// ═══════════ Onboarding ═══════════
window.A_Onboarding = function A_Onboarding() {
  const t = A_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: t.fontB }}>
      {/* backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(212,176,122,0.18), transparent 60%)' }}/>
      <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(90deg, transparent 0 79px, ${t.line} 79px 80px)`, opacity: 0.4 }}/>
      <div style={{ padding: '0 24px', position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* brand mark */}
        <div style={{ paddingTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.accent }}>
            <Icons.logo size={22}/>
            <span style={{ fontFamily: t.fontH, fontWeight: 500, letterSpacing: 3, fontSize: 13 }}>GIRON</span>
          </div>
          <button style={{ background: 'transparent', border: 0, color: t.textSub, fontSize: 14, fontWeight: 500 }}>Пропустить</button>
        </div>

        {/* hero */}
        <div style={{ marginTop: 48, flex: 1 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' }}>01 · Добро пожаловать</div>
          <h1 style={{ fontFamily: t.fontH, fontSize: 44, lineHeight: 1.02, fontWeight: 500, letterSpacing: -1.5, margin: '16px 0 0', textWrap: 'pretty' }}>
            Спортзал,<br/>которым управляет <span style={{ color: t.accent, fontStyle: 'italic', fontWeight: 400 }}>интеллект</span>.
          </h1>
          <p style={{ color: t.textSub, fontSize: 15, lineHeight: 1.5, margin: '20px 0 0', maxWidth: 300 }}>
            Персональный AI‑тренер, умное расписание, точный трекинг. Без лишнего — только то, что ведёт к результату.
          </p>
        </div>

        {/* AI assistant preview card */}
        <div style={{
          background: t.surface, border: `1px solid ${t.line}`, borderRadius: 24, padding: 18,
          display: 'flex', gap: 14, alignItems: 'center', marginBottom: 20
        }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0A0A' }}>
            <Icons.spark size={22} sw={2}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>ИИ‑тренер уже готов</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>Составит программу за 30 секунд</div>
          </div>
          <Icons.arrow size={18}/>
        </div>

        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 18 }}>
          <div style={{ width: 28, height: 4, borderRadius: 99, background: t.accent }}/>
          <div style={{ width: 12, height: 4, borderRadius: 99, background: t.lineStrong }}/>
          <div style={{ width: 12, height: 4, borderRadius: 99, background: t.lineStrong }}/>
          <div style={{ width: 12, height: 4, borderRadius: 99, background: t.lineStrong }}/>
        </div>

        <button style={{
          height: 58, borderRadius: 20, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 16, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24, fontFamily: t.fontB
        }}>
          Начать путь <Icons.arrow size={18} sw={2.2}/>
        </button>
      </div>
    </div>
  );
};

// ═══════════ Home dashboard ═══════════
window.A_Home = function A_Home() {
  const t = A_T;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Вторник · 22 апреля</div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5, marginTop: 4 }}>Привет, Артём</div>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ width: 40, height: 40, borderRadius: 14, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icons.bell size={18}/>
            </div>
            <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 99, background: t.accent, border: `2px solid ${t.bg}` }}/>
          </div>
        </div>

        {/* AI coach featured card */}
        <div style={{
          position: 'relative',
          background: `linear-gradient(135deg, #1E1810 0%, #2A1F12 60%, #382612 100%)`,
          border: `1px solid ${t.line}`, borderRadius: 28, padding: 22, marginBottom: 16, overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}33, transparent 70%)` }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.accent, marginBottom: 16, position: 'relative' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icons.spark size={16} sw={2.2}/>
            </div>
            <span style={{ fontSize: 12, letterSpacing: 1.2, fontWeight: 600, textTransform: 'uppercase' }}>Тренер рекомендует</span>
          </div>
          <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, lineHeight: 1.15, letterSpacing: -0.3, maxWidth: 280, position: 'relative' }}>
            Сегодня — грудь и трицепс. Жим штанги на 2.5 кг больше прошлой сессии.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 18, position: 'relative' }}>
            <button style={{ flex: 1, height: 44, borderRadius: 14, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 14, fontWeight: 600 }}>Начать тренировку</button>
            <button style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.08)', color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icons.refresh size={18}/>
            </button>
          </div>
        </div>

        {/* Ring stats */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 24, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <Ring size={110} stroke={8} value={0.68} color={t.accent} track={t.lineStrong}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 500, letterSpacing: -0.5 }}>68%</div>
                <div style={{ fontSize: 10, color: t.textSub, letterSpacing: 1, marginTop: -2 }}>ДЕНЬ</div>
              </div>
            </Ring>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { l: 'Калории', v: '1 640 / 2 400', p: 0.68, c: '#E07A6B' },
                { l: 'Белок',   v: '98 / 160 г',   p: 0.61, c: t.accent },
                { l: 'Шаги',    v: '7 824 / 10 000', p: 0.78, c: '#9AC28C' },
              ].map((r, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: t.textSub }}>{r.l}</span>
                    <span style={{ fontFamily: t.fontM, color: t.text }}>{r.v}</span>
                  </div>
                  <Bar value={r.p} color={r.c} track={t.lineStrong} h={4}/>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Streak */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.accent, marginBottom: 10 }}>
              <Icons.flame size={18}/>
              <span style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>Стрик</span>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 42, fontWeight: 500, letterSpacing: -1, lineHeight: 1 }}>47<span style={{ fontSize: 16, color: t.textSub, marginLeft: 6 }}>дней</span></div>
            <div style={{ display: 'flex', gap: 3, marginTop: 12 }}>
              {[1,1,1,1,1,1,0].map((d, i) => (
                <div key={i} style={{ flex: 1, height: 22, borderRadius: 5, background: d ? t.accent : t.lineStrong, opacity: d ? 1 : 0.6 }}/>
              ))}
            </div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.textSub, marginBottom: 10 }}>
              <Icons.trophy size={18}/>
              <span style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>Рекорд</span>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1 }}>120<span style={{ fontSize: 14, color: t.textSub, marginLeft: 4 }}>кг</span></div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 6 }}>Жим штанги · новый PR</div>
          </div>
        </div>

        {/* Plan for the week */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
            <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 500, letterSpacing: -0.3 }}>План недели</div>
            <div style={{ fontSize: 12, color: t.accent, fontWeight: 500 }}>Все →</div>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {[
              { d: 'Пн', t: 'Грудь + трицепс', done: true },
              { d: 'Вт', t: 'Сегодня', active: true },
              { d: 'Ср', t: 'Кардио 30мин' },
              { d: 'Чт', t: 'Спина + бицепс' },
              { d: 'Пт', t: 'Отдых' },
            ].map((d, i) => (
              <div key={i} style={{
                minWidth: 96, padding: 14, borderRadius: 18,
                background: d.active ? t.accent : t.surface,
                color: d.active ? '#0A0A0A' : t.text,
                border: `1px solid ${d.active ? t.accent : t.line}`,
              }}>
                <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, opacity: d.active ? 0.7 : 0.5, textTransform: 'uppercase' }}>{d.d}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.2 }}>{d.t}</div>
                {d.done && <Icons.check size={14} sw={2.4}/>}
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { i: 'scan', l: 'Сканировать еду', s: 'ИИ определит КБЖУ' },
            { i: 'chart', l: 'Добавить вес', s: 'Утреннее взвешивание' },
          ].map((q, i) => {
            const IcC = Icons[q.i];
            return (
              <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <IcC size={16}/>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{q.l}</div>
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{q.s}</div>
              </div>
            );
          })}
        </div>
      </div>
      <TabBar theme={t} active={0}/>
    </div>
  );
};
