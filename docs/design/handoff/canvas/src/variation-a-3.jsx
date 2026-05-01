/* global React, Icons, Ring, Bar, Placeholder, Phone, TabBar */
// Variation A (Graphite+Gold) — part 3: Nutrition, Progress, AI, News, Paywall, Profile

const A_T3 = window.IG_TOKENS.A;

// ═══════════ Nutrition ═══════════
window.A_Nutrition = function A_Nutrition() {
  const t = A_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Сегодня</div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5 }}>Питание</div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.scan size={20} sw={2}/></div>
        </div>

        {/* Calories big card */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 26, padding: 22, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div>
              <div style={{ fontFamily: t.fontH, fontSize: 48, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1 }}>1 640</div>
              <div style={{ fontSize: 12, color: t.textSub, marginTop: 4 }}>из 2 400 ккал · осталось 760</div>
            </div>
            <Ring size={72} stroke={6} value={0.68} color={t.accent} track={t.lineStrong}>
              <div style={{ fontFamily: t.fontM, fontSize: 14, fontWeight: 600 }}>68%</div>
            </Ring>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { l: 'Белки', v: '98', m: '160', c: t.accent, p: 0.61 },
              { l: 'Жиры',  v: '52', m: '80',  c: '#E8A36A', p: 0.65 },
              { l: 'Углев', v: '190', m: '280', c: '#9AC28C', p: 0.68 },
            ].map((m, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.textSub, marginBottom: 4 }}><span>{m.l}</span><span style={{ fontFamily: t.fontM, color: t.text }}>{m.v}<span style={{ opacity: 0.5 }}>/{m.m}</span></span></div>
                <Bar value={m.p} color={m.c} track={t.lineStrong} h={4}/>
              </div>
            ))}
          </div>
        </div>

        {/* Water */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#7AE6FF' }}>
              <Icons.water size={18}/>
              <span style={{ fontSize: 12, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase' }}>Вода</span>
            </div>
            <span style={{ fontFamily: t.fontM, fontSize: 13 }}>1.2 / 2.5 л</span>
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            {[1,1,1,1,1,0.5,0,0,0,0].map((v, i) => (
              <div key={i} style={{ flex: 1, height: 34, borderRadius: 8, background: v === 1 ? '#7AE6FF' : v > 0 ? 'linear-gradient(180deg, #7AE6FF 50%, rgba(122,230,255,0.2) 50%)' : 'rgba(122,230,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: v > 0 ? '#0A0A0A' : 'transparent' }}>
                {v === 1 && <Icons.check size={12} sw={3}/>}
              </div>
            ))}
          </div>
        </div>

        {/* AI scan CTA */}
        <div style={{ background: `linear-gradient(135deg, #1E1810, #2A1F12)`, border: `1px solid ${t.line}`, borderRadius: 22, padding: 18, display: 'flex', gap: 14, marginBottom: 16, alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icons.camera size={22}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Сфотографируйте еду</div>
            <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>ИИ определит состав и КБЖУ</div>
          </div>
          <Icons.arrow size={18}/>
        </div>

        {/* Meals */}
        {[
          { t: 'Завтрак', sub: '08:30 · 420 ккал', items: ['Овсянка · 80 г', 'Яйца · 3 шт', 'Кофе · 1 чашка'] },
          { t: 'Обед', sub: '13:10 · 680 ккал', items: ['Куриная грудка · 200 г', 'Рис · 150 г', 'Салат'] },
          { t: 'Ужин', sub: 'Добавить', empty: true },
        ].map((m, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: m.empty ? 0 : 10 }}>
              <div>
                <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 500 }}>{m.t}</div>
                <div style={{ fontSize: 12, color: m.empty ? t.accent : t.textSub, marginTop: 2 }}>{m.sub}</div>
              </div>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: m.empty ? t.accent : t.surfaceHi, color: m.empty ? '#0A0A0A' : t.textSub, display: 'flex', alignItems: 'center', justifyContent: 'center', border: m.empty ? 0 : `1px solid ${t.line}` }}>
                <Icons.plus size={16} sw={2.4}/>
              </div>
            </div>
            {!m.empty && m.items.map((it, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: j === 0 ? `1px solid ${t.line}` : 0, fontSize: 13, color: t.textSub }}>
                <div style={{ width: 6, height: 6, borderRadius: 99, background: t.accent, opacity: 0.6 }}/>
                {it}
              </div>
            ))}
          </div>
        ))}
      </div>
      <TabBar theme={t} active={3}/>
    </div>
  );
};

// ═══════════ Progress ═══════════
window.A_Progress = function A_Progress() {
  const t = A_T3;
  const pts = [81.6, 80.9, 80.2, 79.5, 78.4];
  const months = ['ЯНВ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ'];
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5, marginBottom: 18 }}>Прогресс</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {['Неделя', 'Месяц', '3 мес', 'Год'].map((l, i) => (
            <div key={i} style={{ padding: '7px 14px', borderRadius: 10, background: i === 1 ? t.accent : t.surface, color: i === 1 ? '#0A0A0A' : t.textSub, fontSize: 12, fontWeight: 600, border: `1px solid ${i === 1 ? t.accent : t.line}` }}>{l}</div>
          ))}
        </div>

        {/* Weight chart */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 24, padding: 20, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: t.textSub }}>Вес тела</div>
              <div style={{ fontFamily: t.fontH, fontSize: 36, fontWeight: 500, letterSpacing: -1, lineHeight: 1, marginTop: 4 }}>78.4<span style={{ fontSize: 16, color: t.textSub, marginLeft: 4 }}>кг</span></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 99, background: 'rgba(154,194,140,0.12)', color: '#9AC28C', fontSize: 12, fontFamily: t.fontM, alignSelf: 'flex-start' }}>
              ↓ 3.2 кг за мес
            </div>
          </div>
          <window.InteractiveChart
            data={pts}
            months={months}
            accent={t.accent}
            line={t.line}
            textSub={t.textSub}
            text={t.text}
            bg={t.bg}
            fontH={t.fontH}
            fontM={t.fontM}
            unit="кг"
            height={120}
            gradId="agrad"
          />
        </div>

        {/* Body measurements grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { l: 'Грудь', v: '108', d: '+2 см', good: true },
            { l: 'Талия', v: '84', d: '−3 см', good: true },
            { l: 'Бицепс', v: '38', d: '+1 см', good: true },
            { l: 'Бедро', v: '60', d: '+1.5 см', good: true },
          ].map((m, i) => (
            <div key={i} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 18, padding: 14 }}>
              <div style={{ fontSize: 11, color: t.textSub, letterSpacing: 0.5 }}>{m.l}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.5 }}>{m.v}</div>
                <div style={{ fontSize: 11, color: t.textSub }}>см</div>
                <div style={{ marginLeft: 'auto', fontSize: 11, color: m.good ? '#9AC28C' : t.warn, fontFamily: t.fontM }}>{m.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* PRs */}
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 500 }}>Рекорды</div>
          <div style={{ fontSize: 12, color: t.accent, fontWeight: 500 }}>Все →</div>
        </div>
        {[
          { ex: 'Жим штанги лёжа', v: '120 кг', d: '22 апр', dy: '+5 кг' },
          { ex: 'Становая тяга', v: '160 кг', d: '18 апр', dy: '+10 кг' },
          { ex: 'Приседания', v: '140 кг', d: '15 апр', dy: '+2.5 кг' },
        ].map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.trophy size={18}/></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.ex}</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{p.d}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 500 }}>{p.v}</div>
              <div style={{ fontSize: 11, color: '#9AC28C', fontFamily: t.fontM }}>{p.dy}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════ AI chat ═══════════
window.A_AI = function A_AI() {
  const t = A_T3;
  const [water, setWater] = React.useState(5); // 250ml glasses, target 10
  const [protein, setProtein] = React.useState(88);
  const [recording, setRecording] = React.useState(false);

  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: t.fontB }}>
      {/* Header */}
      <div style={{ padding: '14px 18px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${t.line}` }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2 || '#A87F48'})`, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <Icons.spark size={20} sw={2}/>
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', background: '#9AC28C', border: `2px solid ${t.bg}` }}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>ИИ‑тренер <span style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, padding: '2px 6px', borderRadius: 5, background: t.accent + '22', letterSpacing: 1 }}>PRO</span></div>
          <div style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3 }}>Знает: 47 тренировок · 12 PR · ваш ритм</div>
        </div>
        <div style={{ width: 34, height: 34, borderRadius: 11, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.more size={14}/></div>
      </div>

      {/* Quick stats strip — context AI sees */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${t.line}`, display: 'flex', gap: 6, overflowX: 'auto' }}>
        {[
          { l: 'КБЖУ', v: '1 540/2 400', c: t.accent },
          { l: 'Белок', v: `${protein}/160 г`, c: protein >= 140 ? '#9AC28C' : t.accent },
          { l: 'Вода', v: `${(water * 0.25).toFixed(2)} л`, c: water >= 8 ? '#9AC28C' : '#7AC0E8' },
          { l: 'Сон', v: '7ч 12м' },
          { l: 'Шаги', v: '8 420' },
        ].map((s, i) => (
          <div key={i} style={{ flexShrink: 0, padding: '5px 9px', borderRadius: 9, background: t.surface, border: `1px solid ${t.line}`, fontFamily: t.fontM, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 8, color: t.textDim, letterSpacing: 1, textTransform: 'uppercase' }}>{s.l}</span>
            <span style={{ fontSize: 11, color: s.c || t.text, fontWeight: 600, marginTop: 1 }}>{s.v}</span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 4px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ alignSelf: 'center', padding: '3px 12px', borderRadius: 99, background: t.surface, border: `1px solid ${t.line}`, fontSize: 9, color: t.textSub, fontFamily: t.fontM, letterSpacing: 1.5, textTransform: 'uppercase' }}>Сегодня · 19:42</div>

        {/* AI msg with water counter widget */}
        <div style={{ maxWidth: '88%', alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: '16px 16px 16px 4px', padding: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>Артём, до сна 3 часа. Воды выпито <span style={{ color: t.accent, fontWeight: 700 }}>{(water * 0.25).toFixed(2)} л</span>, цель 2.5. Подскажу когда добавить?</div>
          </div>
          {/* Water counter widget */}
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, textTransform: 'uppercase' }}>Вода · стаканы</div>
              <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 500 }}>{water}/10</div>
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} onClick={() => setWater(i + 1)} style={{ flex: 1, height: 34, borderRadius: 5, background: i < water ? `linear-gradient(180deg, #7AC0E8, #3B7BB0)` : t.surfaceHi, border: `1px solid ${i < water ? '#3B7BB0' : t.line}`, cursor: 'pointer', position: 'relative' }}>
                  {i === water - 1 && <div style={{ position: 'absolute', top: -2, left: 0, right: 0, textAlign: 'center', fontSize: 8, color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>+</div>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setWater(Math.max(0, water - 1))} style={{ flex: 1, height: 32, borderRadius: 9, background: t.surfaceHi, color: t.text, border: `1px solid ${t.line}`, fontSize: 12, fontWeight: 600, fontFamily: t.fontM }}>− 250 мл</button>
              <button onClick={() => setWater(Math.min(10, water + 1))} style={{ flex: 1, height: 32, borderRadius: 9, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 12, fontWeight: 700, fontFamily: t.fontM }}>+ 250 мл</button>
              <button onClick={() => setWater(Math.min(10, water + 2))} style={{ height: 32, padding: '0 10px', borderRadius: 9, background: t.surfaceHi, color: t.accent, border: `1px solid ${t.line}`, fontSize: 12, fontWeight: 600, fontFamily: t.fontM }}>+ 500</button>
            </div>
          </div>
        </div>

        {/* User msg */}
        <div style={{ maxWidth: '82%', background: t.accent, color: '#0A0A0A', borderRadius: '16px 16px 4px 16px', padding: '10px 12px', alignSelf: 'flex-end', fontSize: 13, fontWeight: 500 }}>
          Хочу набрать массу — что сейчас не хватает?
        </div>

        {/* AI msg with macro widget */}
        <div style={{ maxWidth: '90%', alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: '16px 16px 16px 4px', padding: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>Не хватает белка — <span style={{ color: t.accent, fontWeight: 700 }}>72 г до нормы</span>. Подобрал три варианта на ужин:</div>
          </div>
          {/* Quick add macro */}
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: 12 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.textSub, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Добавить в дневник</div>
            {[
              { n: 'Творог 5% · 200 г', kcal: 240, p: 36, ideal: true },
              { n: 'Куриная грудка · 150 г', kcal: 165, p: 31 },
              { n: 'Протеин · 40 г', kcal: 156, p: 32 },
            ].map((m, i) => (
              <div key={i} onClick={() => setProtein(p => Math.min(160, p + m.p))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: m.ideal ? t.accent + '14' : 'transparent', border: `1px solid ${m.ideal ? t.accent + '55' : t.line}`, marginBottom: 5, cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{m.n}</span>
                    {m.ideal && <span style={{ fontFamily: t.fontM, fontSize: 8, color: t.accent, padding: '1px 5px', borderRadius: 4, background: t.accent + '22', letterSpacing: 0.5, textTransform: 'uppercase' }}>ИИ ★</span>}
                  </div>
                  <div style={{ fontSize: 10, color: t.textSub, fontFamily: t.fontM, marginTop: 1 }}>{m.kcal} ккал · Б{m.p} г</div>
                </div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.plus size={14} sw={2.5}/></div>
              </div>
            ))}
          </div>
          {/* Protein progress live */}
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.fontM, fontSize: 10, marginBottom: 5 }}>
              <span style={{ color: t.textSub }}>Белок сегодня</span>
              <span style={{ color: protein >= 140 ? '#9AC28C' : t.accent, fontWeight: 700 }}>{protein}/160 г</span>
            </div>
            <div style={{ height: 6, background: t.lineStrong, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(protein / 160) * 100}%`, background: protein >= 140 ? '#9AC28C' : t.accent, borderRadius: 3, transition: 'all 0.3s' }}/>
            </div>
          </div>
        </div>

        {/* User msg */}
        <div style={{ maxWidth: '82%', background: t.accent, color: '#0A0A0A', borderRadius: '16px 16px 4px 16px', padding: '10px 12px', alignSelf: 'flex-end', fontSize: 13, fontWeight: 500 }}>
          Сделай мне тренировку на 30 минут, без зала
        </div>

        {/* AI msg with workout card */}
        <div style={{ maxWidth: '92%', alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: '16px 16px 16px 4px', padding: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>Готово. Подобрал EMOM на 30 минут — фокус на грудь и кор, без оборудования.</div>
          </div>
          <div style={{ background: t.surface, border: `1px solid ${t.accent}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 90, height: 90, background: `radial-gradient(circle, ${t.accent}33, transparent 70%)` }}/>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>● ИИ‑составил</div>
                <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 500, letterSpacing: -0.3 }}>EMOM · Грудь и кор</div>
                <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, marginTop: 2 }}>30 мин · 6 упр · 280 ккал</div>
              </div>
              <div style={{ padding: '4px 8px', borderRadius: 7, background: t.accent, color: '#0A0A0A', fontFamily: t.fontM, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>ДОМА</div>
            </div>
            {[
              { n: 'Отжимания', s: '15 повт' },
              { n: 'Планка', s: '40 сек' },
              { n: 'Берпи', s: '10 повт' },
              { n: 'Скручивания', s: '20 повт' },
              { n: 'Альп. шаги', s: '30 сек' },
              { n: 'Пик-отдых', s: '45 сек' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: i ? `1px solid ${t.line}` : 0, fontSize: 11 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, background: t.surfaceHi, color: t.accent, fontFamily: t.fontM, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                  {r.n}
                </span>
                <span style={{ fontFamily: t.fontM, color: t.textSub, fontSize: 11 }}>{r.s}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button style={{ flex: 1, height: 36, borderRadius: 10, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icons.play size={12}/>Начать</button>
              <button style={{ height: 36, padding: '0 12px', borderRadius: 10, background: t.surfaceHi, color: t.text, border: `1px solid ${t.line}`, fontSize: 12, fontWeight: 600 }}>Изменить</button>
              <button style={{ width: 36, height: 36, borderRadius: 10, background: t.surfaceHi, color: t.textSub, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.bookmark size={14}/></button>
            </div>
          </div>
        </div>

        {/* AI typing */}
        <div style={{ maxWidth: '40%', alignSelf: 'flex-start', background: t.surface, border: `1px solid ${t.line}`, borderRadius: '16px 16px 16px 4px', padding: '10px 14px', display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, opacity: 0.4 + (i * 0.2), animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }}/>
          ))}
        </div>
      </div>

      {/* Quick action chips */}
      <div style={{ padding: '6px 14px 6px', display: 'flex', gap: 5, overflowX: 'auto' }}>
        {[
          { i: 'camera', l: 'Скан еды' },
          { i: 'dumbbell', l: 'Тренировку 30 мин' },
          { i: 'chart', l: 'Прогресс' },
          { i: 'spark', l: 'Что съесть?' },
          { i: 'plus', l: 'Воды +250' },
        ].map((c, i) => {
          const Ic = Icons[c.i];
          return (
            <div key={i} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 10, background: t.surface, border: `1px solid ${t.line}`, fontSize: 11, color: t.text, fontFamily: t.fontM, fontWeight: 500 }}>
              <Ic size={12}/>{c.l}
            </div>
          );
        })}
      </div>

      {/* Input — rich */}
      <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${t.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: t.surface, border: `1px solid ${recording ? t.accent : t.line}`, borderRadius: 14, padding: '6px 6px 6px 12px', transition: 'border 0.2s' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: t.surfaceHi, color: t.textSub, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icons.plus size={14}/></div>
          <div style={{ flex: 1, fontSize: 13, color: recording ? t.accent : t.textSub, display: 'flex', alignItems: 'center', gap: 6 }}>
            {recording ? <><span style={{ width: 6, height: 6, borderRadius: '50%', background: t.accent, animation: 'pulse 1s infinite' }}/>Слушаю…</> : 'Напиши или нажми микрофон…'}
          </div>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: t.surfaceHi, color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.camera size={14}/></div>
          <div onClick={() => setRecording(!recording)} style={{ width: 32, height: 32, borderRadius: 9, background: recording ? t.accent : t.surfaceHi, color: recording ? '#0A0A0A' : t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icons.mic size={14}/></div>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.send size={14}/></div>
        </div>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
};

// ═══════════ Paywall ═══════════
window.A_Paywall = function A_Paywall() {
  const t = A_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', position: 'relative', fontFamily: t.fontB }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(212,176,122,0.25), transparent 55%)' }}/>
      <div style={{ padding: '16px 20px 20px', overflow: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.accent }}>
            <Icons.logo size={20}/>
            <span style={{ fontFamily: t.fontH, fontWeight: 500, letterSpacing: 3, fontSize: 12 }}>IRON · PRO</span>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textSub }}>✕</div>
        </div>

        <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' }}>7 дней бесплатно</div>
        <h1 style={{ fontFamily: t.fontH, fontSize: 40, lineHeight: 1.02, fontWeight: 500, letterSpacing: -1.5, margin: '14px 0 0' }}>
          Полный доступ<br/>к <span style={{ color: t.accent, fontStyle: 'italic', fontWeight: 400 }}>персональному</span><br/>тренеру.
        </h1>
        <p style={{ color: t.textSub, fontSize: 14, marginTop: 14, lineHeight: 1.5 }}>
          Безлимитный ИИ, программы под вас, анализ фото еды, углублённая аналитика.
        </p>

        {/* Features */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 20 }}>
          {[
            { i: 'spark', t: 'Безлимитный ИИ‑тренер', s: 'Было 10 сообщений в день' },
            { i: 'camera', t: 'Сканер еды по фото', s: 'Точный КБЖУ за 3 секунды' },
            { i: 'dumbbell', t: 'Все программы', s: '50+ профессиональных' },
            { i: 'chart', t: 'Глубокая аналитика', s: 'Тренды, PR, прогнозы' },
          ].map((f, i) => {
            const IcC = Icons[f.i];
            return (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: i < 3 ? `1px solid ${t.line}` : 0, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcC size={18}/></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{f.t}</div>
                  <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>{f.s}</div>
                </div>
                <Icons.check size={16} sw={2.4}/>
              </div>
            );
          })}
        </div>

        {/* Plans */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ padding: 16, borderRadius: 18, background: t.surface, border: `2px solid ${t.accent}`, position: 'relative' }}>
            <div style={{ position: 'absolute', top: -10, right: 16, padding: '4px 10px', borderRadius: 99, background: t.accent, color: '#0A0A0A', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Выгода −56%</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Год</div>
                <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>249 ₽ / мес · списание раз в год</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.3 }}>2 990 ₽</div>
                <div style={{ fontSize: 11, color: t.textSub, textDecoration: 'line-through', fontFamily: t.fontM }}>6 788 ₽</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 18, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Месяц</div>
              <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>Отмена в любой момент</div>
            </div>
            <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500 }}>569 ₽</div>
          </div>
        </div>

        {/* Payment methods */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 16, color: t.textSub, fontSize: 11, fontFamily: t.fontM, letterSpacing: 0.5 }}>
          <span>ЮKassa</span><span>·</span><span>СБП</span><span>·</span><span>МИР</span><span>·</span><span>Apple Pay</span>
        </div>

        <button style={{ width: '100%', height: 58, borderRadius: 20, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 16, fontWeight: 600, marginTop: 16, fontFamily: t.fontB, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          Начать 7 дней бесплатно <Icons.arrow size={18} sw={2.2}/>
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: t.textDim, marginTop: 10 }}>Далее 2 990 ₽ / год · можно отменить в любой момент</div>
      </div>
    </div>
  );
};

// ═══════════ News ═══════════
window.A_News = function A_News() {
  const t = A_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5 }}>Лента</div>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.search size={18}/></div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
          {['Всё', 'Блогеры', 'Наука', 'Питание', 'Тренинг', 'Добавки'].map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', padding: '7px 14px', borderRadius: 10, background: i === 0 ? t.accent : t.surface, color: i === 0 ? '#0A0A0A' : t.textSub, fontSize: 12, fontWeight: 600, border: `1px solid ${i === 0 ? t.accent : t.line}` }}>{l}</div>
          ))}
        </div>

        {/* Featured blogger */}
        <div style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 14, position: 'relative', height: 220 }}>
          <Placeholder label="блогер · видео-разбор" h={220} radius={24} tint="rgba(212,176,122,0.1)" fg="rgba(0,0,0,0.3)"/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(10,10,15,0.95) 100%)' }}/>
          <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 99, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
            <div style={{ width: 20, height: 20, borderRadius: 99, background: t.accent }}/>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Денис Гусев</span>
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.accent, letterSpacing: 1.5, textTransform: 'uppercase' }}>Сегодня · 12 мин</div>
            <div style={{ fontFamily: t.fontH, fontSize: 20, fontWeight: 500, marginTop: 4, lineHeight: 1.2 }}>Как набрать 5 кг мышц за год без фармы</div>
          </div>
        </div>

        {/* List */}
        {[
          { src: 'Спорт-Экспресс', t: 'Новое исследование: 6 подходов оптимальны для гипертрофии', time: '2 ч', tag: 'НАУКА' },
          { src: 'Hard Training', t: 'Разбор ошибок в становой тяге от Юрия Спасокукоцкого', time: '5 ч', tag: 'ТРЕНИНГ' },
          { src: 'Food Lab', t: 'Креатин: что говорят мета-анализы 2026 года', time: '1 день', tag: 'ДОБАВКИ' },
        ].map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: i < 2 ? `1px solid ${t.line}` : 0 }}>
            <Placeholder label="" h={72} radius={14} tint="rgba(255,255,255,0.05)" fg="rgba(255,255,255,0.02)"/>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1.3, color: t.accent, textTransform: 'uppercase' }}>{n.tag}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>{n.t}</div>
              </div>
              <div style={{ fontSize: 11, color: t.textDim, fontFamily: t.fontM }}>{n.src} · {n.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════ Profile ═══════════
window.A_Profile = function A_Profile() {
  const t = A_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 20px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>

        <div style={{ position: 'relative', background: `linear-gradient(135deg, #1E1810, #2A1F12)`, border: `1px solid ${t.line}`, borderRadius: 28, padding: 22, marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}33, transparent 70%)` }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontSize: 28, fontWeight: 500, color: '#0A0A0A' }}>А</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.fontH, fontSize: 20, fontWeight: 500 }}>Артём Соколов</div>
              <div style={{ fontSize: 12, color: t.textSub, marginTop: 2 }}>С нами 3 месяца · Уровень 12</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 10px', borderRadius: 99, background: t.accent, color: '#0A0A0A', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
                <Icons.bolt size={11}/> IRON PRO
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 20, position: 'relative' }}>
            {[{ l: 'Тренировок', v: '47' }, { l: 'Стрик', v: '47 дн' }, { l: 'Ачивок', v: '12/20' }].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 12, background: 'rgba(0,0,0,0.25)' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 500 }}>{s.v}</div>
                <div style={{ fontSize: 10, color: t.textSub, marginTop: 2, letterSpacing: 0.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
          <div style={{ fontFamily: t.fontH, fontSize: 17, fontWeight: 500 }}>Ачивки</div>
          <div style={{ fontSize: 12, color: t.accent, fontWeight: 500 }}>Все 20 →</div>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 18 }}>
          {['flame','trophy','target','bolt','heart','spark'].map((i, idx) => {
            const IcC = Icons[i]; const unlocked = idx < 4;
            return (
              <div key={idx} style={{ minWidth: 88, aspectRatio: '1/1.1', borderRadius: 18, background: unlocked ? t.surface : 'transparent', border: `1px solid ${unlocked ? t.line : t.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: unlocked ? 1 : 0.35 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: unlocked ? t.chipBg : 'transparent', color: unlocked ? t.accent : t.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IcC size={22}/>
                </div>
                <div style={{ fontSize: 10, color: unlocked ? t.text : t.textDim, fontWeight: 600, textAlign: 'center' }}>{unlocked ? 'Получено' : 'Закрыто'}</div>
              </div>
            );
          })}
        </div>

        {/* List */}
        {[
          { i: 'target', l: 'Цели', s: 'Набрать 3 кг мышечной' },
          { i: 'bell', l: 'Напоминания', s: 'Вкл · 3 активных' },
          { i: 'heart', l: 'Здоровье', s: 'Нет ограничений' },
          { i: 'settings', l: 'Настройки', s: '' },
        ].map((r, i) => {
          const IcC = Icons[r.i];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: t.surfaceHi, color: t.textSub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcC size={16}/></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.l}</div>
                {r.s && <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{r.s}</div>}
              </div>
              <Icons.chev size={16} sw={1.8}/>
            </div>
          );
        })}
      </div>
      <TabBar theme={t} active={4}/>
    </div>
  );
};
