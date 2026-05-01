/* global React, Icons, Ring, Bar, Placeholder, TabBar */
// Direction A — Premium Graphite: deeper screens
// Program detail, Cardio/HIIT workout, Nutrition diary, Workouts list v2

const A_T4 = window.IG_TOKENS.A;

// ═══════════ Workouts list v2 — richer program cards ═══════════
window.A_Workouts = function A_Workouts() {
  const t = A_T4;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Твой план</div>
            <div style={{ fontFamily: t.fontH, fontSize: 30, fontWeight: 500, letterSpacing: -0.8, marginTop: 2 }}>Тренировки</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.search size={16}/></div>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={20} sw={2.4}/></div>
          </div>
        </div>

        {/* Week strip with volume */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase' }}>Неделя 4 · объём 8.4 т</div>
            <div style={{ fontSize: 11, color: t.accent, fontWeight: 600 }}>Неделя →</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { d: 'Пн', v: 'Грудь', load: 0.9, done: true },
              { d: 'Вт', v: 'Сегодня', load: 1, active: true },
              { d: 'Ср', v: 'Кардио', load: 0.3 },
              { d: 'Чт', v: 'Спина', load: 0.95 },
              { d: 'Пт', v: '—', load: 0 },
              { d: 'Сб', v: 'Ноги', load: 1 },
              { d: 'Вс', v: '—', load: 0 },
            ].map((d, i) => (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ textAlign: 'center', padding: '8px 2px', borderRadius: 12, background: d.active ? t.accent : t.surfaceHi, color: d.active ? '#0A0A0A' : t.text, border: `1px solid ${d.active ? t.accent : t.line}` }}>
                  <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1, opacity: d.active ? 0.65 : 0.5, textTransform: 'uppercase' }}>{d.d}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, marginTop: 4, lineHeight: 1.1 }}>{d.v}</div>
                </div>
                <div style={{ height: 3, background: t.lineStrong, borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${d.load * 100}%`, background: d.done ? t.good : d.active ? t.accent : d.load > 0 ? t.textDim : 'transparent' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI CTA */}
        <div style={{ background: `linear-gradient(135deg, #1E1810 0%, #2A1F12 100%)`, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}33, transparent 70%)` }}/>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', position: 'relative' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={22} sw={2}/></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Создать программу с ИИ</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>4 вопроса · план за 30 секунд</div>
            </div>
            <div style={{ padding: '6px 12px', borderRadius: 99, background: t.accent, color: '#0A0A0A', fontSize: 11, fontWeight: 600 }}>Погнали</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
          {[
            { l: 'Мои', active: true },
            { l: 'Силовые' },
            { l: 'Гипертр.' },
            { l: 'Кардио' },
            { l: 'Домашние' },
          ].map((c, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 10, background: c.active ? t.accent : 'transparent', color: c.active ? '#0A0A0A' : t.textSub, border: `1px solid ${c.active ? t.accent : t.line}`, fontSize: 12, fontWeight: 600 }}>{c.l}</div>
          ))}
        </div>

        {/* Featured running program */}
        <div style={{ background: t.surface, border: `1px solid ${t.accent}`, borderRadius: 24, padding: 18, marginBottom: 10, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 14, right: 14, padding: '3px 8px', borderRadius: 6, background: t.chipBg, color: t.accent, fontFamily: t.fontM, fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Текущая</div>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginBottom: 4 }}>Push · Pull · Legs</div>
          <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.5, lineHeight: 1.1 }}>Гипертрофия для среднего уровня</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {['6 нед · 3×/нед', 'Штанга + гантели', '45 мин'].map((c, i) => (
              <div key={i} style={{ padding: '4px 8px', borderRadius: 7, background: t.surfaceHi, border: `1px solid ${t.line}`, fontSize: 10, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3 }}>{c}</div>
            ))}
          </div>

          {/* progress week map */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM, fontSize: 10, letterSpacing: 0.5, color: t.textSub, marginBottom: 4 }}>
              <span>Неделя 4 из 6</span>
              <span style={{ color: t.accent }}>67%</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(18, 1fr)', gap: 3 }}>
              {Array.from({ length: 18 }, (_, i) => {
                const done = i < 10;
                const today = i === 10;
                return <div key={i} style={{ height: 22, borderRadius: 4, background: done ? t.accent : today ? `${t.accent}55` : t.lineStrong }}/>;
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button style={{ flex: 1, height: 42, borderRadius: 12, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 13, fontWeight: 600 }}>Начать сегодня</button>
            <button style={{ width: 42, height: 42, borderRadius: 12, background: t.surfaceHi, color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.chev size={16}/></button>
          </div>
        </div>

        {/* Other programs */}
        {[
          { n: 'Сила · 5×5', sub: 'Stronglifts методика', tag: 'Начинающий', m: '12 нед · 3×/нед', pr: 0.25 },
          { n: 'Жиросжигание', sub: 'Циркулярные тренировки', tag: 'HIIT', m: '4 нед · 4×/нед', pr: 0 },
          { n: 'Домашние без инвентаря', sub: 'С собственным весом', tag: 'Дом', m: '8 нед · 5×/нед', pr: 0 },
        ].map((p, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg, ${t.surfaceHi}, ${t.surface})`, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icons.dumbbell size={22}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.n}</div>
                <div style={{ padding: '2px 6px', borderRadius: 5, background: t.surfaceHi, border: `1px solid ${t.line}`, fontSize: 9, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3, textTransform: 'uppercase' }}>{p.tag}</div>
              </div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{p.sub}</div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textDim, letterSpacing: 0.3, marginTop: 4 }}>{p.m}</div>
            </div>
            <Icons.chev size={16} sw={1.8}/>
          </div>
        ))}
      </div>
      <TabBar theme={t} active={1}/>
    </div>
  );
};

// ═══════════ Program detail ═══════════
window.A_Program = function A_Program() {
  const t = A_T4;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ overflow: 'auto', height: '100%' }}>
        {/* Hero cover */}
        <div style={{ position: 'relative', height: 240, background: `linear-gradient(135deg, #2A1F12 0%, #1E1810 100%)`, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 20% 80%, ${t.accent}44, transparent 60%)` }}/>
          <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(90deg, transparent 0 39px, ${t.line} 39px 40px)`, opacity: 0.5 }}/>

          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.chev size={16} sw={2.2}/></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.heart size={16}/></div>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.send size={16}/></div>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase' }}>Программа · Гипертрофия</div>
            <div style={{ fontFamily: t.fontH, fontSize: 32, fontWeight: 500, letterSpacing: -1, lineHeight: 1.05, marginTop: 6, color: '#fff' }}>Push Pull Legs</div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: t.fontM }}>
              <span>★ 4.8</span><span>·</span><span>24 тыс. учеников</span><span>·</span><span>6 недель</span>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px 120px' }}>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginBottom: 16, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, overflow: 'hidden' }}>
            {[
              { l: 'Дней', v: '3', u: 'в неделю' },
              { l: 'Время', v: '45', u: 'минут' },
              { l: 'Уровень', v: 'Ср.', u: 'опыт 6 мес+' },
              { l: 'Где', v: 'Зал', u: 'штанга' },
            ].map((m, i) => (
              <div key={i} style={{ padding: 12, borderRight: i < 3 ? `1px solid ${t.line}` : 'none', textAlign: 'center' }}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, textTransform: 'uppercase' }}>{m.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 500, letterSpacing: -0.3, marginTop: 3 }}>{m.v}</div>
                <div style={{ fontSize: 9, color: t.textDim, marginTop: 2, fontFamily: t.fontM }}>{m.u}</div>
              </div>
            ))}
          </div>

          {/* About */}
          <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 500, letterSpacing: -0.3, marginBottom: 8 }}>О программе</div>
          <div style={{ fontSize: 13, color: t.textSub, lineHeight: 1.55, marginBottom: 16 }}>
            Классическое разделение — толкающие, тянущие и ноги. Оптимально для набора мышечной массы на среднем уровне. ИИ адаптирует нагрузку каждую неделю.
          </div>

          {/* What you'll do */}
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginBottom: 8 }}>Что будешь делать</div>
          {[
            { k: 'Barbell', t: '8 базовых упражнений', s: 'Жим, тяга, присед + изоляция' },
            { k: 'Bolt', t: 'Прогрессия по тоннажу', s: '+2.5 кг / неделю при RPE ≤ 8' },
            { k: 'PR', t: 'PR каждые 2 недели', s: 'По жиму, приседу, тяге' },
          ].map((c, i) => {
            const S = window.IGStickers && window.IGStickers[c.k];
            return (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, marginBottom: 5, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {S ? <S size={40}/> : null}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.t}</div>
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{c.s}</div>
              </div>
            </div>
            );
          })}

          {/* Week breakdown */}
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 }}>6 недель · 18 тренировок</div>

          {[
            { w: 1, phase: 'Адаптация', sessions: ['Push A · 6 упр', 'Pull A · 6 упр', 'Legs A · 7 упр'], done: true },
            { w: 2, phase: 'База', sessions: ['Push B · 7 упр', 'Pull B · 7 упр', 'Legs B · 8 упр'], done: true },
            { w: 3, phase: 'Объём', sessions: ['Push A+ · 8 упр', 'Pull A+ · 8 упр', 'Legs A+ · 8 упр'], done: true },
            { w: 4, phase: 'Интенсив', sessions: ['Push B+ · 8 упр', 'Сегодня · 7 упр', 'Legs · 8 упр'], active: true },
            { w: 5, phase: 'Пик', sessions: ['3 сессии'] },
            { w: 6, phase: 'Тест PR', sessions: ['Проверка 1ПМ'] },
          ].map((w, i) => (
            <div key={i} style={{ borderLeft: `2px solid ${w.done ? t.accent : w.active ? t.accent : t.lineStrong}`, paddingLeft: 14, paddingBottom: i === 5 ? 0 : 14, position: 'relative' }}>
              <div style={{ position: 'absolute', left: -6, top: 0, width: 10, height: 10, borderRadius: '50%', background: w.done ? t.accent : w.active ? t.accent : t.surface, border: `2px solid ${w.done ? t.accent : w.active ? t.accent : t.lineStrong}`, boxShadow: w.active ? `0 0 0 5px ${t.accent}22` : 'none' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1, color: t.textDim, textTransform: 'uppercase' }}>Неделя {w.w}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: w.done ? t.textSub : t.text, marginTop: 1 }}>{w.phase}</div>
                </div>
                {w.done && <Icons.check size={14} sw={2.4}/>}
                {w.active && <div style={{ padding: '3px 7px', borderRadius: 99, background: t.chipBg, color: t.accent, fontSize: 9, fontFamily: t.fontM, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>сейчас</div>}
              </div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 4, lineHeight: 1.5 }}>{w.sessions.join(' · ')}</div>
            </div>
          ))}

          {/* CTA */}
          <button style={{ width: '100%', height: 56, borderRadius: 18, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 15, fontWeight: 600, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icons.play size={18}/> Начать тренировку · неделя 4
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════ Cardio / HIIT active ═══════════
window.A_Cardio = function A_Cardio() {
  const t = A_T4;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB, position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 10%, ${t.accent}15, transparent 60%)` }}/>

      <div style={{ padding: '12px 20px', position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Top */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.chevDn size={18}/></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' }}>HIIT · Интервалы 40/20</div>
            <div style={{ fontFamily: t.fontH, fontSize: 15, fontWeight: 500, marginTop: 2 }}>Раунд 4 из 8</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.mic size={18}/></div>
        </div>

        {/* Phase label + huge timer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
          <div style={{ padding: '6px 14px', borderRadius: 99, background: `${t.danger}22`, color: t.danger, fontFamily: t.fontM, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
            ● Работа
          </div>

          <div style={{ position: 'relative', marginTop: 20 }}>
            <Ring size={280} stroke={2} value={0.62} color={t.accent} track={t.lineStrong}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 2, color: t.textSub, textTransform: 'uppercase' }}>Осталось</div>
                <div style={{ fontFamily: t.fontH, fontSize: 84, fontWeight: 400, letterSpacing: -3, lineHeight: 1, color: t.text, margin: '2px 0' }}>0:15</div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, letterSpacing: 0.3 }}>из 0:40</div>
              </div>
            </Ring>
          </div>

          {/* Exercise */}
          <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 500, letterSpacing: -0.5, marginTop: 22 }}>Burpees</div>
          <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, letterSpacing: 0.3, marginTop: 4 }}>
            Темп: максимум · следующее: Jump squat
          </div>

          {/* Biometrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 26, width: '100%' }}>
            {[
              { l: 'ПУЛЬС', v: '172', u: 'уд/мин', c: t.danger, z: 'Z4 · макс' },
              { l: 'КАЛОРИИ', v: '248', u: 'ккал', c: t.accent, z: '12:34 мин' },
              { l: 'ЗОНА', v: '92%', u: 'цели', c: t.good, z: 'ура!' },
            ].map((m, i) => (
              <div key={i} style={{ padding: 12, borderRadius: 16, background: t.surface, border: `1px solid ${t.line}`, textAlign: 'center' }}>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, textTransform: 'uppercase' }}>{m.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, color: m.c, letterSpacing: -0.5, marginTop: 3, lineHeight: 1 }}>{m.v}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, marginTop: 3 }}>{m.u}</div>
                <div style={{ fontSize: 10, color: t.textSub, marginTop: 4 }}>{m.z}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Round segments */}
        <div style={{ padding: '16px 0 8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, marginBottom: 5 }}>
            <span>Раунды</span>
            <span>4/8</span>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: 8 }).map((_, i) => {
              const state = i < 3 ? 'done' : i === 3 ? 'active' : 'rest';
              return (
                <div key={i} style={{ flex: 1, display: 'flex', gap: 2 }}>
                  <div style={{ flex: 2, height: 4, borderRadius: 2, background: state === 'done' ? t.accent : state === 'active' ? t.danger : t.lineStrong }}/>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: state === 'done' ? `${t.accent}44` : t.lineStrong }}/>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingBottom: 10 }}>
          <button style={{ width: 52, height: 52, borderRadius: 16, background: t.surface, color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontM, fontWeight: 600 }}>−15</button>
          <button style={{ width: 68, height: 68, borderRadius: 22, background: t.accent, color: '#0A0A0A', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.pause size={26}/>
          </button>
          <button style={{ width: 52, height: 52, borderRadius: 16, background: t.surface, color: t.text, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontM, fontWeight: 600 }}>⇥</button>
        </div>
      </div>
    </div>
  );
};

// ═══════════ Nutrition diary (after scan — full day) ═══════════
window.A_Diary = function A_Diary() {
  const t = A_T4;
  // SVG meal icons — sun (breakfast), midday (lunch), apple (snack), moon (dinner)
  const MealIcon = ({ kind }) => {
    const c = t.accent;
    if (kind === 'sun') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" fill={c}/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>;
    if (kind === 'noon') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M7 12h10M12 7v10"/></svg>;
    if (kind === 'snack') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="14" r="6"/><path d="M12 8v-2M11 6c0-1 1-2 2-2"/></svg>;
    if (kind === 'moon') return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14a8 8 0 0 1-10-10 8 8 0 1 0 10 10z"/></svg>;
    return null;
  };
  const meals = [
    { t: 'Завтрак', e: 'sun', time: '08:30', c: 420, p: 28, f: 14, cb: 48, items: [
      { n: 'Овсянка с ягодами', g: 250, c: 280 },
      { n: 'Яйца варёные', g: 120, c: 140 },
    ]},
    { t: 'Обед', e: 'noon', time: '13:00', c: 680, p: 52, f: 14, cb: 68, items: [
      { n: 'Куриная грудка', g: 180, c: 198 },
      { n: 'Рис отварной', g: 150, c: 195 },
      { n: 'Брокколи', g: 80, c: 27 },
      { n: 'Салат с маслом', g: 100, c: 260 },
    ], featured: true },
    { t: 'Перекус', e: 'snack', time: '16:30', c: 220, p: 8, f: 12, cb: 22, items: [
      { n: 'Яблоко', g: 150, c: 77 },
      { n: 'Орехи миндаль', g: 30, c: 173 },
    ]},
    { t: 'Ужин', e: 'moon', time: '19:30', empty: true },
  ];

  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Header with date slider */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Сегодня · 22 апр</div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5 }}>Дневник</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.scan size={18}/></div>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={18} sw={2.4}/></div>
          </div>
        </div>

        {/* Week strip */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {[
            { d: 'Сб', n: 19, c: 2350 },
            { d: 'Вс', n: 20, c: 2180 },
            { d: 'Пн', n: 21, c: 2420 },
            { d: 'Вт', n: 22, c: 1540, today: true },
            { d: 'Ср', n: 23 },
            { d: 'Чт', n: 24 },
            { d: 'Пт', n: 25 },
          ].map((d, i) => (
            <div key={i} style={{ flex: 1, padding: '8px 0', borderRadius: 11, background: d.today ? t.accent : t.surface, color: d.today ? '#0A0A0A' : t.text, border: `1px solid ${d.today ? t.accent : t.line}`, textAlign: 'center' }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1, opacity: d.today ? 0.7 : 0.55, textTransform: 'uppercase' }}>{d.d}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 500, marginTop: 2 }}>{d.n}</div>
              <div style={{ fontFamily: t.fontM, fontSize: 8, opacity: d.today ? 0.7 : 0.45, marginTop: 2 }}>{d.c || '—'}</div>
            </div>
          ))}
        </div>

        {/* Daily totals */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 18, marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}22, transparent 70%)` }}/>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', position: 'relative' }}>
            <Ring size={100} stroke={7} value={0.64} color={t.accent} track={t.lineStrong}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 20, fontWeight: 500, letterSpacing: -0.3, lineHeight: 1 }}>1540</div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, marginTop: 2 }}>КЕ</div>
              </div>
            </Ring>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3 }}>Съедено из 2 400 ккал</div>
              <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 500, letterSpacing: -0.5, marginTop: 2 }}>Осталось 860</div>
              <div style={{ fontSize: 11, color: t.accent, marginTop: 2, fontWeight: 500 }}>Хорошо идёшь — в пределах ± 3%</div>
            </div>
          </div>

          {/* Macro bars */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 14, position: 'relative' }}>
            {[
              { l: 'Белок', v: 88, m: 160, u: 'г', c: t.accent },
              { l: 'Жиры', v: 40, m: 80, u: 'г', c: '#E8A36A' },
              { l: 'Углев.', v: 138, m: 280, u: 'г', c: '#9AC28C' },
            ].map((r, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 4, fontFamily: t.fontM }}>
                  <span style={{ color: t.textSub, display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: r.c }}/>{r.l}</span>
                  <span>{r.v}/{r.m}{r.u}</span>
                </div>
                <div style={{ height: 4, background: t.lineStrong, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(r.v/r.m)*100}%`, background: r.c, borderRadius: 2 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI smart tip */}
        <div style={{ background: `linear-gradient(135deg, ${t.surface}, ${t.surfaceHi})`, border: `1px solid ${t.line}`, borderRadius: 16, padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icons.spark size={15} sw={2.2}/>
          </div>
          <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5 }}>
            <span style={{ color: t.text, fontWeight: 600 }}>Тренер:</span> до нормы белка не хватает 72 г. На ужин добавь творог 200 г — закроешь дефицит и попадёшь в калории.
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <div style={{ padding: '4px 9px', borderRadius: 7, background: t.chipBg, color: t.accent, fontSize: 11, fontWeight: 600 }}>Добавить творог</div>
              <div style={{ padding: '4px 9px', borderRadius: 7, background: t.surfaceHi, border: `1px solid ${t.line}`, fontSize: 11, color: t.text, fontWeight: 500 }}>Ещё идеи</div>
            </div>
          </div>
        </div>

        {/* Meals */}
        <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginBottom: 8 }}>Приёмы пищи</div>

        {meals.map((m, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${m.featured ? t.accent : t.line}`, borderRadius: 18, padding: 14, marginBottom: 8, position: 'relative' }}>
            {m.featured && <div style={{ position: 'absolute', top: 12, right: 14, fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1, textTransform: 'uppercase' }}>+ только что</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: m.empty ? 0 : 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: t.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MealIcon kind={m.e}/></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{m.t}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, marginTop: 2, letterSpacing: 0.3 }}>
                  {m.time}{!m.empty && ` · ${m.c} ккал · Б${m.p} Ж${m.f} У${m.cb}`}
                </div>
              </div>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: m.empty ? t.accent : t.surfaceHi, color: m.empty ? '#0A0A0A' : t.textSub, border: m.empty ? 0 : `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icons.plus size={16} sw={2.4}/>
              </div>
            </div>
            {!m.empty && (
              <div style={{ paddingLeft: 52 }}>
                {m.items.map((it, j) => (
                  <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM, fontSize: 11, padding: '4px 0', borderTop: j === 0 ? `1px solid ${t.line}` : 'none', color: t.text }}>
                    <span style={{ color: t.textSub }}>{it.n}</span>
                    <span>{it.g} г · <span style={{ color: t.accent }}>{it.c} ккал</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Water */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, padding: 14, marginTop: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: t.surfaceHi, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.water size={16}/></div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Вода</div>
                <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, marginTop: 1 }}>1.2 из 2.5 л</div>
              </div>
            </div>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={16} sw={2.4}/></div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,1,1,1,0.5,0,0,0,0,0].map((v, i) => (
              <div key={i} style={{ flex: 1, height: 28, borderRadius: 7, background: v === 1 ? t.accent : v > 0 ? `linear-gradient(180deg, ${t.accent} 50%, ${t.chipBg} 50%)` : t.chipBg }}/>
            ))}
          </div>
        </div>
      </div>
      <TabBar theme={t} active={3}/>
    </div>
  );
};
