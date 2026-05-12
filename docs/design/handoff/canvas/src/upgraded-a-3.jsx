/* global React, Icons, Ring, Bar, Placeholder, TabBar */
// Direction A — Premium Graphite: Part 3
// Exercise detail, Workout summary, Enhanced news feed

const A_T5 = window.IG_TOKENS.A;

// ═══════════ Exercise detail ═══════════
window.A_Exercise = function A_Exercise() {
  const t = A_T5;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ overflow: 'auto', height: '100%' }}>
        {/* Video hero — minimal, no equipment graphic */}
        <div style={{ position: 'relative', height: 320, background: `radial-gradient(ellipse at 30% 20%, #1F1A14 0%, #0E0B08 60%, #050403 100%)`, overflow: 'hidden' }}>
          {/* subtle grid lines for cinematic feel */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${t.line} 1px, transparent 1px), linear-gradient(90deg, ${t.line} 1px, transparent 1px)`, backgroundSize: '40px 40px', opacity: 0.15 }}/>
          {/* gold glow */}
          <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}22 0%, transparent 65%)` }}/>

          {/* exercise index */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -55%)', textAlign: 'center', color: '#fff', pointerEvents: 'none' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: t.accent, letterSpacing: 4, fontWeight: 600, marginBottom: 8 }}>EX · 03</div>
            <div style={{ fontFamily: t.fontH, fontSize: 38, fontWeight: 400, letterSpacing: -0.8, lineHeight: 1.05, color: 'rgba(255,255,255,0.92)' }}>
              Жим <span style={{ fontStyle: 'italic', color: t.accent, fontWeight: 400 }}>лёжа</span>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 3, marginTop: 12, fontWeight: 500 }}>BENCH PRESS · BARBELL</div>
          </div>

          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.chev size={16} sw={2.2}/></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ padding: '6px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', fontFamily: t.fontM, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: '#fff' }}>1.0× ▾</div>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.heart size={16}/></div>
            </div>
          </div>

          {/* Play button */}
          <div style={{ position: 'absolute', bottom: 76, left: '50%', transform: 'translateX(-50%)', width: 64, height: 64, borderRadius: '50%', background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            <Icons.play size={24}/>
          </div>

          {/* View toggle */}
          <div style={{ position: 'absolute', bottom: 16, left: 20, right: 20, display: 'flex', gap: 6 }}>
            {['Видео', 'Анимация 3D', 'Мышцы'].map((l, i) => (
              <div key={i} style={{ flex: 1, padding: '7px 0', textAlign: 'center', borderRadius: 10, background: i === 0 ? 'rgba(212,176,122,0.9)' : 'rgba(0,0,0,0.5)', color: i === 0 ? '#0A0A0A' : '#fff', fontSize: 11, fontWeight: 600, fontFamily: t.fontM, letterSpacing: 0.3, backdropFilter: 'blur(10px)' }}>{l}</div>
            ))}
          </div>
        </div>

        <div style={{ padding: '18px 20px 40px' }}>
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase' }}>Базовое · Толкающее</div>
          <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.6, marginTop: 4 }}>Жим штанги лёжа</div>

          {/* Meta pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {['Грудь · главная', 'Трицепс · ассист', 'Передняя дельта', 'Штанга', 'Скамья'].map((c, i) => (
              <div key={i} style={{ padding: '4px 9px', borderRadius: 7, background: t.surface, border: `1px solid ${t.line}`, fontSize: 11, color: t.textSub, fontFamily: t.fontM, letterSpacing: 0.3 }}>{c}</div>
            ))}
          </div>

          {/* PR card */}
          <div style={{ background: `linear-gradient(135deg, #1E1810, #2A1F12)`, border: `1px solid ${t.accent}66`, borderRadius: 20, padding: 18, marginTop: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: `radial-gradient(circle, ${t.accent}44, transparent 70%)` }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              <Icons.trophy size={16}/>
              <span style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase' }}>Твой рекорд</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8, position: 'relative' }}>
              <div>
                <div style={{ fontFamily: t.fontH, fontSize: 48, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1 }}>120<span style={{ fontSize: 18, color: t.textSub, marginLeft: 4 }}>кг</span></div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 4 }}>1ПМ · 14 апр</div>
              </div>
              <div style={{ height: 48, width: 1, background: t.line }}/>
              <div>
                <div style={{ fontFamily: t.fontH, fontSize: 26, fontWeight: 500, color: t.accent, letterSpacing: -0.5, lineHeight: 1 }}>+12%</div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 4 }}>за 3 мес</div>
              </div>
            </div>

            {/* PR progression mini-chart — interactive */}
            {(() => {
              const data = [72, 75, 78, 80, 85, 90, 95, 100, 105, 110, 115, 120];
              const months12 = ['ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК','ЯНВ','ФЕВ','МАР','АПР','МАЙ'];
              const [hov, setHov] = React.useState(null);
              const max = 120, min = 65;
              return (
                <>
                  <div style={{ marginTop: 14, height: 44, display: 'flex', alignItems: 'flex-end', gap: 3, position: 'relative' }}
                       onMouseLeave={() => setHov(null)}>
                    {data.map((w, i, arr) => {
                      const h = ((w - min) / (max - min)) * 100;
                      const active = hov === i || (hov === null && i === arr.length - 1);
                      return (
                        <div
                          key={i}
                          onMouseEnter={() => setHov(i)}
                          onTouchStart={() => setHov(i)}
                          onTouchEnd={() => setHov(null)}
                          style={{
                            flex: 1, height: `${h}%`, minHeight: 6,
                            background: active ? t.accent : `${t.accent}55`,
                            borderRadius: 2,
                            cursor: 'crosshair',
                            position: 'relative',
                            transition: 'background 0.12s',
                          }}
                        >
                          {hov === i && (
                            <div style={{
                              position: 'absolute',
                              bottom: '100%',
                              left: '50%',
                              transform: 'translate(-50%, -6px)',
                              background: t.bg,
                              border: `1px solid ${t.line}`,
                              borderRadius: 6,
                              padding: '3px 7px',
                              fontFamily: t.fontM,
                              fontSize: 10,
                              color: t.text,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                              boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                              zIndex: 2,
                            }}>
                              <span style={{ fontWeight: 600 }}>{w}</span>
                              <span style={{ color: t.textSub, marginLeft: 3 }}>кг · {months12[i]}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', marginTop: 4, fontFamily: t.fontM, fontSize: 9, color: t.textDim, gap: 3 }}>
                    {months12.map((m, i) => (
                      <div key={i} style={{
                        flex: 1,
                        textAlign: 'center',
                        opacity: i % 2 === 0 || i === months12.length - 1 ? 1 : 0,
                        color: hov === i ? t.accent : t.textDim,
                        fontWeight: hov === i ? 700 : 400,
                        transition: 'color 0.12s',
                      }}>{m.slice(0, 3).toLowerCase()}</div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Technique steps */}
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>Техника · 4 шага</div>
          {[
            { n: 1, t: 'Исходное положение', s: 'Лопатки сведены и опущены, поясница естественно прогнута, ступни жёстко в полу' },
            { n: 2, t: 'Опускание', s: 'Контролируемо на 2–3 секунды, штанга касается нижней части груди по линии сосков' },
            { n: 3, t: 'Пауза', s: 'Короткая остановка внизу без отбива. Сохраняй напряжение в грудных' },
            { n: 4, t: 'Жим', s: 'Мощный выдох, разгибание локтей. Траектория — лёгкая дуга к плечам' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 9, background: t.surface, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontSize: 13, fontWeight: 500, color: t.accent, flexShrink: 0 }}>{step.n}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{step.t}</div>
                <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.5, marginTop: 2 }}>{step.s}</div>
              </div>
            </div>
          ))}

          {/* Common mistakes */}
          <div style={{ background: `${t.danger}11`, border: `1px solid ${t.danger}44`, borderRadius: 16, padding: 14, marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: t.danger, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.fontH, fontSize: 13, fontWeight: 600 }}>!</div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.2, color: t.danger, textTransform: 'uppercase', fontWeight: 700 }}>Частые ошибки</div>
            </div>
            <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.6 }}>
              • Отбив штанги от груди — травмоопасно<br/>
              • Разведённые локти на 90° — нагрузка на плечо<br/>
              • Отрыв таза от скамьи
            </div>
          </div>

          {/* History */}
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 }}>История подходов</div>
          {[
            { d: 'Сегодня · через 10 мин', sets: '4×8 · 100 кг', pr: true },
            { d: '18 апр · Push A', sets: '4×8 · 97.5 кг' },
            { d: '14 апр · Тест', sets: '1×1 · 120 кг · PR', accent: true },
            { d: '11 апр · Push A', sets: '4×8 · 95 кг' },
            { d: '7 апр · Push A', sets: '4×8 · 92.5 кг' },
          ].map((h, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: h.pr ? t.chipBg : 'transparent', border: `1px solid ${h.pr ? t.accent : t.line}`, borderRadius: 12, marginBottom: 5 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{h.d}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: h.accent ? t.accent : t.textSub, marginTop: 2, letterSpacing: 0.3 }}>{h.sets}</div>
              </div>
              {h.pr ? <div style={{ padding: '3px 8px', borderRadius: 6, background: t.accent, color: '#0A0A0A', fontSize: 9, fontFamily: t.fontM, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>сегодня</div>
                    : h.accent ? <Icons.trophy size={14}/> : <Icons.chev size={14}/>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════ Workout summary ═══════════
window.A_Summary = function A_Summary() {
  const t = A_T5;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ overflow: 'auto', height: '100%', paddingBottom: 30 }}>
        {/* Celebration hero */}
        <div style={{ position: 'relative', padding: '36px 20px 28px', textAlign: 'center', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${t.accent}33, transparent 60%)` }}/>
          {/* confetti dots */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.7 }}>
            {Array.from({ length: 24 }).map((_, i) => {
              const x = (i * 37) % 360;
              const y = 10 + ((i * 23) % 200);
              const s = 2 + (i % 3);
              const c = [t.accent, '#9AC28C', '#E07A6B', t.textSub][i % 4];
              return <circle key={i} cx={x} cy={y} r={s} fill={c} opacity={0.5 + ((i % 5) / 10)}/>;
            })}
          </svg>

          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 2, color: t.accent, textTransform: 'uppercase' }}>● Тренировка завершена</div>
            <div style={{ fontFamily: t.fontH, fontSize: 48, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1, margin: '12px 0 6px' }}>Отлично,<br/>Артём.</div>
            <div style={{ fontSize: 14, color: t.textSub, lineHeight: 1.5, marginTop: 8 }}>
              72-я тренировка в этом году.<br/>Ты стал сильнее.
            </div>
          </div>
        </div>

        <div style={{ padding: '0 20px' }}>
          {/* Big stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {[
              { l: 'Длительность', v: '58', u: 'минут', c: t.text },
              { l: 'Тоннаж', v: '8.4', u: 'тонны', c: t.accent, big: true },
              { l: 'Сетов', v: '24', u: 'из 24', c: t.text },
              { l: 'Калории', v: '412', u: 'ккал', c: t.text },
            ].map((s, i) => (
              <div key={i} style={{ background: s.big ? `linear-gradient(135deg, #1E1810, #2A1F12)` : t.surface, border: `1px solid ${s.big ? t.accent + '66' : t.line}`, borderRadius: 18, padding: 16 }}>
                <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.2, color: t.textSub, textTransform: 'uppercase' }}>{s.l}</div>
                <div style={{ fontFamily: t.fontH, fontSize: 34, fontWeight: 500, color: s.c, letterSpacing: -0.8, marginTop: 6, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, marginTop: 4 }}>{s.u}</div>
              </div>
            ))}
          </div>

          {/* PR Banner */}
          <div style={{ background: t.accent, color: '#0A0A0A', borderRadius: 20, padding: 18, marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(0,0,0,0.08)' }}/>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icons.trophy size={26}/>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, opacity: 0.7, textTransform: 'uppercase', fontWeight: 700 }}>Новый рекорд</div>
              <div style={{ fontFamily: t.fontH, fontSize: 22, fontWeight: 500, letterSpacing: -0.4, marginTop: 2 }}>Жим штанги · 102.5 кг</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>Предыдущий: 100 кг</div>
            </div>
          </div>

          {/* Muscle map — full anatomical detail */}
          <div style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 500, letterSpacing: -0.3 }}>Проработанные мышцы</div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.accent, letterSpacing: 0.5 }}>RPE 7.8 ср.</div>
            </div>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginBottom: 12 }}>14 групп · фронт/спина</div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              {/* Front view */}
              <div style={{ flex: 1, background: '#0A0A0C', border: `1px solid ${t.line}`, borderRadius: 14, padding: '10px 0', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, left: 10, fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1 }}>ФРОНТ</div>
                <svg width="100%" height="200" viewBox="0 0 120 200" style={{ display: 'block' }}>
                  {/* head */}
                  <ellipse cx="60" cy="20" rx="11" ry="13" fill="#1F1F24" stroke={t.lineStrong} strokeWidth="0.7"/>
                  {/* neck (СГМ) */}
                  <path d="M54 32 L66 32 L65 38 L55 38 Z" fill="#7A6644" opacity="0.55"/>
                  {/* trapezius (front) */}
                  <path d="M40 38 Q60 42 80 38 L78 46 Q60 50 42 46 Z" fill="#9C7A48" opacity="0.7"/>
                  {/* deltoids (shoulders) */}
                  <ellipse cx="34" cy="50" rx="9" ry="11" fill={t.accent} opacity="0.55"/>
                  <ellipse cx="86" cy="50" rx="9" ry="11" fill={t.accent} opacity="0.55"/>
                  {/* PECS — heavy highlight */}
                  <path d="M40 46 Q60 48 80 46 Q82 64 60 70 Q38 64 40 46 Z" fill={t.accent} opacity="0.95"/>
                  <line x1="60" y1="48" x2="60" y2="68" stroke="#0A0A0A" strokeWidth="0.6" opacity="0.5"/>
                  {/* biceps */}
                  <ellipse cx="28" cy="68" rx="7" ry="14" fill={t.accent} opacity="0.4"/>
                  <ellipse cx="92" cy="68" rx="7" ry="14" fill={t.accent} opacity="0.4"/>
                  {/* forearms */}
                  <ellipse cx="24" cy="92" rx="6" ry="12" fill="#3A3633" opacity="0.5"/>
                  <ellipse cx="96" cy="92" rx="6" ry="12" fill="#3A3633" opacity="0.5"/>
                  {/* serratus */}
                  <path d="M44 70 L46 80 L42 84 Z M76 70 L74 80 L78 84 Z" fill="#7A6644" opacity="0.5"/>
                  {/* abs (rectus) — 6 segments */}
                  {[0,1,2].map(r => (
                    <g key={r}>
                      <rect x="52" y={72 + r*7} width="7" height="5" rx="1" fill="#5C5048" opacity="0.7"/>
                      <rect x="61" y={72 + r*7} width="7" height="5" rx="1" fill="#5C5048" opacity="0.7"/>
                    </g>
                  ))}
                  {/* obliques */}
                  <path d="M44 76 L48 96 L52 96 L48 76 Z M76 76 L72 96 L68 96 L72 76 Z" fill="#3A3633" opacity="0.55"/>
                  {/* quads */}
                  <ellipse cx="48" cy="120" rx="10" ry="20" fill="#3A3633" opacity="0.55"/>
                  <ellipse cx="72" cy="120" rx="10" ry="20" fill="#3A3633" opacity="0.55"/>
                  {/* knees */}
                  <circle cx="48" cy="142" r="3.5" fill="#1F1F24"/>
                  <circle cx="72" cy="142" r="3.5" fill="#1F1F24"/>
                  {/* shins */}
                  <ellipse cx="48" cy="166" rx="7" ry="18" fill="#2C2A28" opacity="0.5"/>
                  <ellipse cx="72" cy="166" rx="7" ry="18" fill="#2C2A28" opacity="0.5"/>
                  {/* labels */}
                  <text x="60" y="60" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="#0A0A0A" textAnchor="middle" fontWeight="700" opacity="0.85">PECTORAL</text>
                </svg>
              </div>

              {/* Back view */}
              <div style={{ flex: 1, background: '#0A0A0C', border: `1px solid ${t.line}`, borderRadius: 14, padding: '10px 0', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 8, left: 10, fontFamily: t.fontM, fontSize: 9, color: t.textDim, letterSpacing: 1 }}>СПИНА</div>
                <svg width="100%" height="200" viewBox="0 0 120 200" style={{ display: 'block' }}>
                  <ellipse cx="60" cy="20" rx="11" ry="13" fill="#1F1F24" stroke={t.lineStrong} strokeWidth="0.7"/>
                  {/* trapezius (upper) */}
                  <path d="M44 36 L60 32 L76 36 L78 50 L60 56 L42 50 Z" fill="#7A6644" opacity="0.65"/>
                  {/* rear delts */}
                  <ellipse cx="34" cy="50" rx="9" ry="11" fill="#7A6644" opacity="0.55"/>
                  <ellipse cx="86" cy="50" rx="9" ry="11" fill="#7A6644" opacity="0.55"/>
                  {/* lats — wide V */}
                  <path d="M40 50 L46 88 L60 96 L74 88 L80 50 Q80 78 60 84 Q40 78 40 50 Z" fill="#5C5048" opacity="0.7"/>
                  {/* triceps — highlight */}
                  <ellipse cx="28" cy="68" rx="7" ry="14" fill={t.accent} opacity="0.85"/>
                  <ellipse cx="92" cy="68" rx="7" ry="14" fill={t.accent} opacity="0.85"/>
                  {/* forearms */}
                  <ellipse cx="24" cy="92" rx="6" ry="12" fill="#3A3633" opacity="0.5"/>
                  <ellipse cx="96" cy="92" rx="6" ry="12" fill="#3A3633" opacity="0.5"/>
                  {/* lower back / erectors */}
                  <path d="M52 88 L52 102 L56 102 L56 88 Z M64 88 L64 102 L68 102 L68 88 Z" fill="#5C5048" opacity="0.65"/>
                  {/* glutes */}
                  <ellipse cx="50" cy="112" rx="10" ry="9" fill="#3A3633" opacity="0.55"/>
                  <ellipse cx="70" cy="112" rx="10" ry="9" fill="#3A3633" opacity="0.55"/>
                  {/* hamstrings */}
                  <ellipse cx="48" cy="138" rx="10" ry="20" fill="#3A3633" opacity="0.55"/>
                  <ellipse cx="72" cy="138" rx="10" ry="20" fill="#3A3633" opacity="0.55"/>
                  {/* calves */}
                  <ellipse cx="48" cy="172" rx="7" ry="16" fill="#3A3633" opacity="0.5"/>
                  <ellipse cx="72" cy="172" rx="7" ry="16" fill="#3A3633" opacity="0.5"/>
                  {/* labels */}
                  <text x="28" y="68" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="#0A0A0A" textAnchor="middle" fontWeight="700" opacity="0.85">TRI</text>
                  <text x="92" y="68" fontFamily="JetBrains Mono, monospace" fontSize="4.5" fill="#0A0A0A" textAnchor="middle" fontWeight="700" opacity="0.85">TRI</text>
                </svg>
              </div>
            </div>

            {/* Legend / intensity scale */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${t.line}` }}>
              <div style={{ fontFamily: t.fontM, fontSize: 9, letterSpacing: 1, color: t.textSub, textTransform: 'uppercase' }}>Интенсивность</div>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${t.lineStrong}, ${t.accent}66, ${t.accent})` }}/>
              <div style={{ display: 'flex', gap: 4, fontFamily: t.fontM, fontSize: 9, color: t.textDim }}>
                <span>0%</span><span>50</span><span>100</span>
              </div>
            </div>

            {/* All muscles — detailed list */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, columnGap: 14 }}>
              {[
                { l: 'Грудные (большая)', lat: 'pectoralis major', v: 0.95, role: 'Основная' },
                { l: 'Трицепс', lat: 'triceps brachii', v: 0.85, role: 'Основная' },
                { l: 'Передние дельты', lat: 'deltoid anterior', v: 0.65, role: 'Синергист' },
                { l: 'Грудные (малая)', lat: 'pectoralis minor', v: 0.55, role: 'Синергист' },
                { l: 'Передняя зубчатая', lat: 'serratus anterior', v: 0.45, role: 'Стабилизатор' },
                { l: 'Кор / пресс', lat: 'rectus abdominis', v: 0.35, role: 'Стабилизатор' },
                { l: 'Бицепс', lat: 'biceps brachii', v: 0.20, role: 'Антагонист' },
                { l: 'Широчайшие', lat: 'latissimus dorsi', v: 0.15, role: 'Стабилизатор' },
              ].map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 8, borderBottom: i < 6 ? `1px dashed ${t.line}` : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{m.l}</span>
                    <span style={{ fontFamily: t.fontM, fontSize: 10, color: t.accent, fontWeight: 600 }}>{Math.round(m.v * 100)}%</span>
                  </div>
                  <div style={{ height: 3, background: t.lineStrong, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${m.v * 100}%`, background: m.v >= 0.7 ? t.accent : m.v >= 0.4 ? t.accent + 'AA' : t.accent + '55', borderRadius: 2 }}/>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: t.fontM, fontSize: 9, color: t.textDim, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.lat}</span>
                    <span style={{ fontFamily: t.fontM, fontSize: 9, color: m.role === 'Основная' ? t.accent : t.textSub, fontWeight: m.role === 'Основная' ? 700 : 500, letterSpacing: 0.3, flexShrink: 0 }}>{m.role}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recovery hint */}
            <div style={{ marginTop: 14, padding: '10px 12px', background: t.surfaceHi, borderRadius: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <Icons.spark size={14}/>
              <div style={{ fontSize: 11, color: t.textSub, flex: 1, lineHeight: 1.45 }}>
                Грудь и трицепс на пределе — следующая push-сессия не раньше <span style={{ color: t.text, fontWeight: 600 }}>через 48 ч</span>.
              </div>
            </div>
          </div>

          {/* Exercise breakdown */}
          <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.textSub, textTransform: 'uppercase', marginBottom: 8, marginTop: 16 }}>Упражнения · 7</div>
          {[
            { n: 'Жим штанги лёжа', sets: '4×8', v: '3 280 кг', pr: true },
            { n: 'Жим гантелей наклон', sets: '3×10', v: '1 680 кг' },
            { n: 'Разведения в тренажёре', sets: '3×12', v: '720 кг' },
            { n: 'Отжимания на брусьях', sets: '3×10', v: '—' },
            { n: 'Жим узким хватом', sets: '3×8', v: '1 680 кг' },
            { n: 'Разгибания блока', sets: '3×12', v: '540 кг' },
            { n: 'Планка', sets: '3×60с', v: '—' },
          ].map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: t.surface, border: `1px solid ${e.pr ? t.accent : t.line}`, borderRadius: 12, marginBottom: 5 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {e.n}
                  {e.pr && <div style={{ padding: '1px 5px', borderRadius: 4, background: t.accent, color: '#0A0A0A', fontSize: 8, fontFamily: t.fontM, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>PR</div>}
                </div>
                <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 2 }}>{e.sets}</div>
              </div>
              <div style={{ fontFamily: t.fontM, fontSize: 12, color: t.accent, letterSpacing: 0.3 }}>{e.v}</div>
            </div>
          ))}

          {/* AI recap */}
          <div style={{ background: `linear-gradient(135deg, ${t.surface}, ${t.surfaceHi})`, border: `1px solid ${t.line}`, borderRadius: 18, padding: 16, marginTop: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: t.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icons.spark size={16} sw={2.2}/>
            </div>
            <div style={{ fontSize: 12, color: t.textSub, lineHeight: 1.55 }}>
              <span style={{ color: t.text, fontWeight: 600 }}>Разбор тренера:</span> темп был выше обычного (−3 мин к плану), RPE 7.8 — оптимально для прогрессии. Техника жима — 94% идеальная, но на последнем подходе локти ушли наружу. Завтра восстановление — сон 8ч+, белка 160г.
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button style={{ flex: 1, height: 50, borderRadius: 16, background: t.surface, color: t.text, border: `1px solid ${t.line}`, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icons.send size={14}/> Поделиться
            </button>
            <button style={{ flex: 1, height: 50, borderRadius: 16, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 13, fontWeight: 600 }}>
              На главную
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════ Enhanced News feed ═══════════
window.A_NewsV2 = function A_NewsV2() {
  const t = A_T5;
  return (
    <div style={{ background: t.bg, color: t.text, height: '100%', overflow: 'hidden', fontFamily: t.fontB }}>
      <div style={{ padding: '16px 0 120px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
        {/* Header */}
        <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textDim, letterSpacing: 1.5, textTransform: 'uppercase' }}>Комьюнити</div>
            <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500, letterSpacing: -0.5, marginTop: 2 }}>Лента</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.search size={16}/></div>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: t.surfaceHi, border: `1px solid ${t.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <Icons.bell size={16}/>
              <div style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 99, background: t.accent, border: `2px solid ${t.surfaceHi}` }}/>
            </div>
          </div>
        </div>

        {/* Stories */}
        <div style={{ padding: '0 20px', display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 16 }}>
          {[
            { n: 'Ты', add: true, bg: t.surface },
            { n: 'Саша М.', live: true, bg: '#8B5A3C' },
            { n: 'Илья П.', bg: '#5A6B8B' },
            { n: 'Катя Ф.', bg: '#A06B5A' },
            { n: 'Рома Г.', bg: '#6B8B5A' },
            { n: 'Маша К.', bg: '#8B5A7B' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', padding: 2, background: s.live ? t.danger : s.add ? t.surface : `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, border: s.add ? `1px dashed ${t.line}` : 'none', position: 'relative' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: s.bg, border: `2px solid ${t.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.add ? t.accent : '#fff', fontFamily: t.fontH, fontSize: 18, fontWeight: 500 }}>
                  {s.add ? '+' : s.n[0]}
                </div>
                {s.live && <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', padding: '1px 6px', borderRadius: 4, background: t.danger, color: '#fff', fontFamily: t.fontM, fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>LIVE</div>}
              </div>
              <div style={{ fontFamily: t.fontM, fontSize: 10, marginTop: 6, color: t.textSub, letterSpacing: 0.3 }}>{s.n}</div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ padding: '0 20px', display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
          {[
            { l: 'Для тебя', active: true },
            { l: 'Подписки' },
            { l: 'PR-и' },
            { l: 'Рецепты' },
            { l: 'Техника' },
            { l: 'Зал рядом' },
          ].map((c, i) => (
            <div key={i} style={{ whiteSpace: 'nowrap', padding: '7px 13px', borderRadius: 10, background: c.active ? t.accent : 'transparent', color: c.active ? '#0A0A0A' : t.textSub, border: `1px solid ${c.active ? t.accent : t.line}`, fontSize: 12, fontWeight: 600 }}>{c.l}</div>
          ))}
        </div>

        {/* Post 1 — PR celebration */}
        <div style={{ margin: '0 20px 12px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#8B5A3C', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: t.fontH, fontSize: 17, fontWeight: 500 }}>СМ</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Саша Мороз</div>
                <Icons.check size={12} sw={2.5}/>
                <div style={{ padding: '1px 5px', borderRadius: 4, background: t.chipBg, color: t.accent, fontFamily: t.fontM, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>PRO</div>
              </div>
              <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 1 }}>2ч · Giron Центр</div>
            </div>
            <button style={{ padding: '6px 12px', borderRadius: 99, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 11, fontWeight: 700 }}>Подписаться</button>
          </div>

          {/* Achievement hero */}
          <div style={{ position: 'relative', height: 220, background: `linear-gradient(135deg, #1E1810, #2A1F12)`, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 30% 40%, ${t.accent}33, transparent 60%)` }}/>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', textAlign: 'center' }}>
              <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 2, color: t.accent, textTransform: 'uppercase', marginBottom: 10 }}>● Новый рекорд</div>
              <div style={{ fontFamily: t.fontH, fontSize: 80, fontWeight: 500, letterSpacing: -3, color: '#fff', lineHeight: 1 }}>180<span style={{ fontSize: 30, color: t.textSub, marginLeft: 6 }}>кг</span></div>
              <div style={{ fontFamily: t.fontH, fontSize: 16, fontWeight: 500, color: '#fff', letterSpacing: -0.3, marginTop: 6 }}>Становая тяга · 1ПМ</div>
              <div style={{ fontSize: 11, color: t.textSub, marginTop: 4 }}>+5 кг · 2.2× массы тела</div>
            </div>
          </div>

          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>
              Три месяца готовился к этой цифре. Спасибо программе PPL от Giron — всё встало в технику. Скоро 200.
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.line}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.accent }}>
                <Icons.heart size={18}/>
                <span style={{ fontFamily: t.fontM, fontSize: 12, fontWeight: 600 }}>1 247</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textSub }}>
                <Icons.message size={18}/>
                <span style={{ fontFamily: t.fontM, fontSize: 12, fontWeight: 600 }}>84</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textSub }}>
                <Icons.send size={18}/>
                <span style={{ fontFamily: t.fontM, fontSize: 12, fontWeight: 600 }}>42</span>
              </div>
              <div style={{ flex: 1 }}/>
              <Icons.bookmark size={18}/>
            </div>
          </div>
        </div>

        {/* Post 2 — Workout program share */}
        <div style={{ margin: '0 20px 12px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#5A6B8B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: t.fontH, fontSize: 15, fontWeight: 500 }}>ИП</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Илья Пономарёв</div>
                <Icons.check size={12} sw={2.5}/>
              </div>
              <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 1 }}>5ч · Тренер</div>
            </div>
            <Icons.more size={18}/>
          </div>

          <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5, marginBottom: 12 }}>
            Забирайте мою новую программу на массу — 5 недель, 4 тренировки в неделю. Без сплитов — full body на каждую сессию.
          </div>

          {/* Program card */}
          <div style={{ padding: 14, background: t.surfaceHi, border: `1px solid ${t.line}`, borderRadius: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icons.dumbbell size={22}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Full Body · 5 недель</div>
              <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 2 }}>20 тренировок · 45 мин</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 5, fontFamily: t.fontM, fontSize: 10, color: t.textDim, letterSpacing: 0.3 }}>
                <span>★ 4.9</span>
                <span>·</span>
                <span>3.2K добавили</span>
              </div>
            </div>
            <button style={{ padding: '8px 12px', borderRadius: 10, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 11, fontWeight: 700 }}>В план</button>
          </div>

          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: `1px solid ${t.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textSub }}>
              <Icons.heart size={18}/>
              <span style={{ fontFamily: t.fontM, fontSize: 12, fontWeight: 600 }}>542</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textSub }}>
              <Icons.message size={18}/>
              <span style={{ fontFamily: t.fontM, fontSize: 12, fontWeight: 600 }}>38</span>
            </div>
            <div style={{ flex: 1 }}/>
            <Icons.bookmark size={18}/>
          </div>
        </div>

        {/* Suggested to follow */}
        <div style={{ margin: '0 20px 12px', padding: 16, background: `linear-gradient(135deg, #1E1810, #2A1F12)`, border: `1px solid ${t.line}`, borderRadius: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase', fontWeight: 700 }}>Рекомендуем</div>
            <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub }}>Все →</div>
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {[
              { n: 'Катя Ф.', t: 'Пауэрлифтер', f: '12K', bg: '#A06B5A' },
              { n: 'Максим Р.', t: 'Нутрициолог', f: '28K', bg: '#5A8B7B' },
              { n: 'Ольга Ж.', t: 'Кроссфит', f: '8K', bg: '#8B5A7B' },
            ].map((p, i) => (
              <div key={i} style={{ minWidth: 130, padding: 12, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: `1px solid ${t.line}`, textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: p.bg, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: t.fontH, fontSize: 18 }}>{p.n[0]}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>{p.n}</div>
                <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textSub, marginTop: 1 }}>{p.t} · {p.f}</div>
                <button style={{ width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 8, background: t.accent, color: '#0A0A0A', border: 0, fontSize: 11, fontWeight: 700 }}>Подписаться</button>
              </div>
            ))}
          </div>
        </div>

        {/* Post 3 — Recipe */}
        <div style={{ margin: '0 20px 12px', background: t.surface, border: `1px solid ${t.line}`, borderRadius: 20, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#A06B5A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: t.fontH, fontSize: 15, fontWeight: 500 }}>КФ</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Катя Фомина</div>
              <div style={{ fontFamily: t.fontM, fontSize: 11, color: t.textSub, marginTop: 1 }}>8ч · Рецепт</div>
            </div>
          </div>
          <div style={{ fontFamily: t.fontH, fontSize: 20, fontWeight: 500, letterSpacing: -0.3 }}>Боул с курицей · 520 ккал</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {[
              { l: 'Б', v: '48г' },
              { l: 'Ж', v: '18г' },
              { l: 'У', v: '42г' },
            ].map((m, i) => (
              <div key={i} style={{ padding: '5px 10px', borderRadius: 8, background: t.surfaceHi, border: `1px solid ${t.line}`, fontFamily: t.fontM, fontSize: 11, color: t.textSub }}>
                <span style={{ color: t.accent, fontWeight: 700 }}>{m.l}</span> {m.v}
              </div>
            ))}
          </div>
        </div>

      </div>
      <TabBar theme={t} active={4}/>
    </div>
  );
};
