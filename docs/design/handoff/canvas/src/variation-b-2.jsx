/* global React, Icons, Ring, Bar, Placeholder, TabBar */
// Variation B — Workouts, Profile, News

const B_T3 = window.IG_TOKENS.B;

// ═══════════ B — Workouts list ═══════════
window.B_Workouts = function B_Workouts() {
  const t = B_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textDim, letterSpacing: 1.8 }}>НЕДЕЛЯ 04 · ПУШ/ПУЛЛ/НОГИ</div>
            <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, textTransform: 'uppercase', marginTop: 4 }}>ТРЕНИРОВКИ</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.search size={18}/></div>
        </div>

        {/* Week calendar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[
            { d: 'ПН', n: 21, done: true },
            { d: 'ВТ', n: 22, active: true },
            { d: 'СР', n: 23, rest: true },
            { d: 'ЧТ', n: 24 },
            { d: 'ПТ', n: 25 },
            { d: 'СБ', n: 26, rest: true },
            { d: 'ВС', n: 27 },
          ].map((d, i) => (
            <div key={i} style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: d.active ? t.accent : d.done ? t.chipBg : t.surface,
              border: `1px solid ${d.active ? t.accent : t.line}`,
              textAlign: 'center', color: d.active ? '#0A0A0A' : d.done ? t.accent : t.textSub
            }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1, opacity: 0.75 }}>{d.d}</div>
              <div style={{ fontFamily: t.fontH, fontSize: 14, fontWeight: 800, marginTop: 2 }}>{d.n}</div>
              {d.done && <Icons.check size={10} sw={3}/>}
              {d.rest && <div style={{ fontSize: 8, marginTop: 2, opacity: 0.5 }}>⏸</div>}
            </div>
          ))}
        </div>

        {/* Today workout hero */}
        <div style={{ background: t.accent, borderRadius: 22, padding: 20, marginBottom: 12, color: '#0A0A0A', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -30, top: -30, opacity: 0.1 }}><Icons.dumbbell size={180} sw={0.8}/></div>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, opacity: 0.65 }}>СЕГОДНЯ · ПУШ</div>
          <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginTop: 4, textTransform: 'uppercase', lineHeight: 1 }}>ГРУДЬ<br/>+ ТРИЦЕПС</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14, fontFamily: t.fontM, fontSize: 11 }}>
            <span>⏱ 45 МИН</span><span>🏋 7 УПР</span><span>🔥 540 ККАЛ</span>
          </div>
          <button style={{ marginTop: 14, height: 44, padding: '0 22px', borderRadius: 11, background: '#0A0A0A', color: t.accent, border: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            НАЧАТЬ <Icons.play size={14}/>
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
          {['ВСЁ', 'МОИ', 'ПРОГРАММЫ', 'КАРДИО', 'МОБИЛЬНОСТЬ'].map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: 8, background: i === 0 ? t.text : t.surface, color: i === 0 ? t.bg : t.textSub, fontSize: 10, fontWeight: 700, border: `1px solid ${i === 0 ? t.text : t.line}`, letterSpacing: 1 }}>{l}</div>
          ))}
        </div>

        {/* Programs */}
        <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, marginBottom: 10 }}>ПРОГРАММЫ · АКТИВНАЯ</div>

        {[
          { t: 'GROW', s: 'Гипертрофия · 12 недель', p: 0.33, w: 'Неделя 4 из 12', accent: true },
          { t: 'POWER 5×5', s: 'Сила · 8 недель', p: 0, w: 'Подписка PRO', locked: true },
          { t: 'SHRED', s: 'Сушка · 6 недель', p: 0, w: 'Не начата' },
        ].map((p, i) => (
          <div key={i} style={{ background: t.surface, border: `1px solid ${p.accent ? t.accent : t.line}`, borderRadius: 16, padding: 14, marginBottom: 8, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>{p.t}</div>
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{p.s}</div>
              </div>
              {p.locked ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: t.chipBg, color: t.accent, fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>
                  <Icons.lock size={10}/> PRO
                </div>
              ) : (
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: p.accent ? t.accent : t.textSub }}>{p.w}</div>
              )}
            </div>
            {p.p > 0 && <Bar value={p.p} color={t.accent} track={t.lineStrong} h={3}/>}
          </div>
        ))}

        {/* Create with AI */}
        <div style={{ background: t.surface, border: `1px dashed ${t.accent}`, borderRadius: 16, padding: 14, marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: t.chipBg, color: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.spark size={18} sw={2.2}/></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: t.fontH, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>ПРОГРАММА ОТ ИИ</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>За 30 сек под вашу цель и график</div>
          </div>
          <Icons.arrow size={16}/>
        </div>
      </div>
      <TabBar theme={t} active={1}/>
    </div>
  );
};

// ═══════════ B — Profile ═══════════
window.B_Profile = function B_Profile() {
  const t = B_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, textTransform: 'uppercase' }}>ПРОФИЛЬ</div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.settings size={18}/></div>
        </div>

        {/* Identity card */}
        <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 22, padding: 18, marginBottom: 12, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -20, right: -20, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}22, transparent 65%)` }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontSize: 26, fontWeight: 800 }}>А</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 800, textTransform: 'uppercase' }}>АРТЁМ С.</div>
              <div style={{ fontSize: 11, color: t.textSub, fontFamily: t.fontM, marginTop: 2 }}>УРОВЕНЬ 12 · 47 СЕССИЙ</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '4px 10px', borderRadius: 4, background: t.accent, color: '#0A0A0A', fontSize: 9, fontWeight: 800, letterSpacing: 1.5 }}>
                <Icons.bolt size={10}/> PRO UNLOCKED
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 18 }}>
            {[
              { l: 'ОБЪЁМ', v: '124т' },
              { l: 'СТРИК', v: '47д' },
              { l: 'PR', v: '12' },
              { l: 'АЧИВОК', v: '12/20' },
            ].map((s, i) => (
              <div key={i} style={{ padding: 8, borderRadius: 10, background: t.surfaceHi, border: `1px solid ${t.line}`, textAlign: 'center' }}>
                <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>{s.v}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 8, color: t.textDim, letterSpacing: 1, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Achievements strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub }}>АЧИВКИ · 12 ИЗ 20</div>
          <div style={{ fontSize: 11, color: t.accent, fontWeight: 700, letterSpacing: 1 }}>ВСЕ →</div>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16 }}>
          {['flame','trophy','target','bolt','heart','spark','dumbbell'].map((i, idx) => {
            const IcC = Icons[i]; const on = idx < 4;
            return (
              <div key={idx} style={{ minWidth: 82, aspectRatio: '1/1.1', borderRadius: 14, background: on ? t.surface : 'transparent', border: `1px solid ${t.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: on ? 1 : 0.35 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: on ? t.chipBg : 'transparent', color: on ? t.accent : t.textDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcC size={18}/></div>
                <div style={{ fontFamily: t.fontM, fontSize: 8, letterSpacing: 1, color: on ? t.text : t.textDim, fontWeight: 700 }}>{on ? 'УНЛОК' : 'ЛОК'}</div>
              </div>
            );
          })}
        </div>

        {/* Rows */}
        {[
          { i: 'target', l: 'ЦЕЛИ', s: 'Набрать 3 кг мышц' },
          { i: 'bell', l: 'НАПОМИНАНИЯ', s: '3 активных' },
          { i: 'heart', l: 'ЗДОРОВЬЕ', s: 'Нет ограничений' },
          { i: 'chart', l: 'ЭКСПОРТ · CSV/PDF', s: 'Последний 18 апр' },
          { i: 'lock', l: 'ПРИВАТНОСТЬ · 152-ФЗ', s: '' },
          { i: 'settings', l: 'НАСТРОЙКИ', s: '' },
        ].map((r, i) => {
          const IcC = Icons[r.i];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 12, marginBottom: 5 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: t.surfaceHi, color: t.textSub, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IcC size={15}/></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: t.fontH, fontSize: 12, fontWeight: 800, letterSpacing: 0.5 }}>{r.l}</div>
                {r.s && <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>{r.s}</div>}
              </div>
              <Icons.chev size={14} sw={1.8}/>
            </div>
          );
        })}
      </div>
      <TabBar theme={t} active={4}/>
    </div>
  );
};

// ═══════════ B — News ═══════════
window.B_News = function B_News() {
  const t = B_T3;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 18px 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textDim }}>22 АПР · ОБНОВЛЕНО СЕЙЧАС</div>
            <div style={{ fontFamily: t.fontH, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, textTransform: 'uppercase' }}>ЛЕНТА</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.search size={18}/></div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', marginBottom: 14 }}>
          {['ВСЁ', 'БЛОГЕРЫ', 'НАУКА', 'ТРЕНИНГ', 'ПИТАНИЕ', 'ДОБАВКИ'].map((l, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', padding: '6px 12px', borderRadius: 6, background: i === 0 ? t.accent : t.surface, color: i === 0 ? '#0A0A0A' : t.textSub, fontSize: 10, fontWeight: 800, letterSpacing: 1, border: `1px solid ${i === 0 ? t.accent : t.line}` }}>{l}</div>
          ))}
        </div>

        {/* Featured */}
        <div style={{ borderRadius: 20, overflow: 'hidden', marginBottom: 12, position: 'relative', height: 200 }}>
          <Placeholder label="блогер · видео" h={200} radius={20} tint="rgba(198,255,61,0.08)" fg="rgba(198,255,61,0.03)"/>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 35%, rgba(7,7,10,0.95) 100%)' }}/>
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, background: t.accent, color: '#0A0A0A', fontSize: 9, fontWeight: 800, letterSpacing: 1.5 }}>
            <Icons.play size={10}/> LIVE · 2.1K
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.5 }}>ДЕНИС ГУСЕВ · YOUTUBE</div>
            <div style={{ fontFamily: t.fontH, fontSize: 18, fontWeight: 800, marginTop: 4, lineHeight: 1.1, textTransform: 'uppercase', letterSpacing: -0.3 }}>
              Как набрать 5 кг мышц без фармы
            </div>
          </div>
        </div>

        {/* Updates banner */}
        <div style={{ background: t.chipBg, border: `1px solid ${t.accent}44`, borderRadius: 14, padding: 12, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: t.accent, boxShadow: `0 0 10px ${t.accent}` }}/>
          <div style={{ fontSize: 12, color: t.text, flex: 1 }}>+12 новых публикаций за последний час</div>
          <Icons.refresh size={14}/>
        </div>

        {/* Items */}
        {[
          { src: 'Юрий Спасокукоцкий', cat: 'ТРЕНИНГ', t: 'Разбор 5 ошибок в становой тяге — видео 8 мин', time: '1 ч' },
          { src: 'Алексей Шредер', cat: 'ПИТАНИЕ', t: 'Белок после 40: сколько реально нужно', time: '3 ч' },
          { src: 'Hard Training', cat: 'НАУКА', t: 'Мета‑анализ 2026: 6 подходов оптимальны для гипертрофии', time: '5 ч' },
          { src: 'Food Lab', cat: 'ДОБАВКИ', t: 'Креатин моногидрат vs HCL — есть ли разница', time: '1 дн' },
          { src: 'Денис Минин', cat: 'БЛОГЕРЫ', t: 'Моя программа на массу без жира — 12 недель', time: '2 дн' },
        ].map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: i < 4 ? `1px solid ${t.line}` : 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: 10, background: `repeating-linear-gradient(135deg, rgba(198,255,61,0.04) 0 8px, rgba(198,255,61,0.01) 8px 16px)`, flexShrink: 0 }}/>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div>
                <div style={{ fontFamily: t.fontM, fontSize: 9, color: t.accent, letterSpacing: 1.3 }}>{n.cat}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{n.t}</div>
              </div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textDim, letterSpacing: 0.5 }}>{n.src} · {n.time} назад</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
