/* global React */
// Responsive Contexts Showcase — three artboards that visualize the
// edge cases the new responsive system handles, beyond just width:
//   1. Keyboard up + SafeModal
//   2. Larger Text (Dynamic Type +50%)
//   3. Tablet master-detail layout
//
// These are static visual mocks of what the components in
// work/responsive/ produce — meant to read alongside the README.

const RC_T = window.IG_TOKENS.A;

function RC_PhoneFrame({ width = 393, height = 852, children, label, sub }) {
  const t = RC_T;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 14, fontWeight: 500 }}>{label}</div>
        <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>{sub}</div>
      </div>
      <div style={{
        width,
        height,
        borderRadius: 44,
        border: `2px solid ${t.line}`,
        background: '#000',
        padding: 6,
        boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
        position: 'relative',
        flexShrink: 0,
      }}>
        <div style={{
          width: '100%', height: '100%',
          borderRadius: 36,
          overflow: 'hidden',
          position: 'relative',
          background: t.bg,
        }}>
          {/* notch */}
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 110, height: 30, background: '#000', borderRadius: 18, zIndex: 10 }}/>
          {children}
        </div>
      </div>
    </div>
  );
}

// ----------------------------- 1. KEYBOARD --------------------------------

function RC_KeyboardScene() {
  const t = RC_T;
  const Icons = window.Icons;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', fontFamily: t.fontB }}>
      {/* Background — dimmed home behind modal */}
      <div style={{ position: 'absolute', inset: 0, background: t.bg, opacity: 0.35 }}>
        <div style={{ padding: '60px 20px 0', color: t.text }}>
          <div style={{ fontFamily: t.fontH, fontSize: 28, fontWeight: 500 }}>Главная</div>
          <div style={{ height: 80, marginTop: 16, background: t.surfaceHi, borderRadius: 16 }}/>
          <div style={{ height: 80, marginTop: 12, background: t.surfaceHi, borderRadius: 16 }}/>
        </div>
      </div>
      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }}/>

      {/* SafeModal sheet — pushed up by keyboard */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 256, // sits above keyboard
        background: '#161616',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: '14px 20px 24px',
        borderTop: `1px solid ${t.line}`,
      }}>
        {/* drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3A3A3A', margin: '0 auto 16px' }}/>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 17, fontWeight: 500 }}>Введите вес</div>
          <div style={{ color: t.textSub, fontSize: 22, lineHeight: 1 }}>×</div>
        </div>

        {/* FormField */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>Вес</div>
          <div style={{
            height: 48,
            border: `1px solid ${t.accent}`,
            background: '#1C1C1E',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 14,
            paddingRight: 14,
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: t.text, fontFamily: t.fontH, fontSize: 18 }}>72.4</span>
              <span style={{ width: 1, height: 18, background: t.accent, marginLeft: 2, animation: 'rcblink 1s infinite' }}/>
            </div>
            <span style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 13 }}>кг</span>
          </div>
          <div style={{ color: t.textSub, fontSize: 11, marginTop: 6 }}>Сегодня, 8:42</div>
        </div>

        {/* Button */}
        <div style={{
          height: 48,
          background: t.accent,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0A0A0A',
          fontFamily: t.fontH,
          fontSize: 15,
          fontWeight: 600,
        }}>Сохранить</div>
      </div>

      {/* Keyboard */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: 256,
        background: '#222',
        borderTop: `1px solid ${t.line}`,
        padding: '8px 4px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {[['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']].map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: 6, flex: 1 }}>
            {row.map((k) => (
              <div key={k} style={{
                flex: 1,
                background: '#3A3A3A',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: t.text,
                fontFamily: t.fontH,
                fontSize: 22,
                fontWeight: 400,
                boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
              }}>{k}</div>
            ))}
          </div>
        ))}
        {/* home indicator */}
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 120, height: 4, borderRadius: 2, background: '#fff' }}/>
      </div>

      {/* Annotation */}
      <RC_Pin top={310} left={20} text="SafeModal лифтит content над клавиатурой через KeyboardAvoidingView"/>
      <RC_Pin top={420} left={20} text="≥48pt высота input — не зажимается на iPhone SE"/>
    </div>
  );
}

// ----------------------------- 2. DYNAMIC TYPE ----------------------------

function RC_DynamicTypeScene() {
  const t = RC_T;

  // Two stacked mini-screens: default (1.0×) and Larger Text (1.5×)
  const Mini = ({ scale, label, broken }) => {
    const fs = (n) => Math.round(n * scale);
    return (
      <div style={{
        flex: 1,
        background: t.bg,
        borderRadius: 16,
        border: `1px solid ${t.line}`,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 8, right: 12, color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>

        <div style={{ color: t.text, fontFamily: t.fontH, fontSize: fs(22), fontWeight: 500, marginTop: 10 }}>Тренировки</div>

        {/* Card with metric */}
        <div style={{
          background: t.surfaceHi,
          border: `1px solid ${t.line}`,
          borderRadius: 14,
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <div style={{
            width: 48, height: 48,
            borderRadius: 12,
            background: t.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0A0A0A',
            fontFamily: t.fontH,
            fontWeight: 600,
            fontSize: fs(14),
            flexShrink: 0,
          }}>+</div>
          <div style={{
            flex: 1,
            // The "broken" example clips, the safe one wraps cleanly thanks
            // to maxFontSizeMultiplier=1.4 in <Text>
            overflow: broken ? 'hidden' : 'visible',
            whiteSpace: broken ? 'nowrap' : 'normal',
          }}>
            <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: fs(11), letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 }}>Сегодня</div>
            <div style={{
              color: t.text,
              fontFamily: t.fontH,
              fontSize: fs(15),
              fontWeight: 500,
              textOverflow: broken ? 'ellipsis' : 'clip',
              overflow: broken ? 'hidden' : 'visible',
            }}>Грудь · Трицепс · Плечи</div>
            <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: fs(12), marginTop: 2 }}>54 мин · 6 упр</div>
          </div>
        </div>

        {/* Button */}
        <div style={{
          height: Math.max(44, fs(48)),
          background: t.accent,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0A0A0A',
          fontFamily: t.fontH,
          fontSize: fs(15),
          fontWeight: 600,
        }}>Начать тренировку</div>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 14, padding: '60px 20px 40px', boxSizing: 'border-box' }}>
      <Mini scale={1.0} label="Default · 1.0×"/>
      <Mini scale={1.4} label="Larger Text · 1.4× (cap)"/>
    </div>
  );
}

// ----------------------------- 3. TABLET ----------------------------------

function RC_TabletScene() {
  const t = RC_T;
  const Icons = window.Icons;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: t.bg,
      fontFamily: t.fontB,
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',
    }}>
      {/* Sidebar — master list */}
      <div style={{
        width: 320,
        borderRight: `1px solid ${t.line}`,
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' }}>Сегодня</div>
        <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 26, fontWeight: 500, marginBottom: 8 }}>Программы</div>
        {[
          { l: 'Грудь · Трицепс', s: '6 упр · 54 мин', active: true },
          { l: 'Спина · Бицепс', s: '7 упр · 60 мин' },
          { l: 'Ноги', s: '5 упр · 70 мин' },
          { l: 'HIIT 20 мин', s: 'кардио' },
          { l: 'Восстановление', s: 'мобилити · 30 мин' },
        ].map((p, i) => (
          <div key={i} style={{
            background: p.active ? t.surfaceHi : 'transparent',
            border: `1px solid ${p.active ? t.line : 'transparent'}`,
            borderRadius: 14,
            padding: '14px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: p.active ? t.accent : t.surfaceHi,
              border: p.active ? 'none' : `1px solid ${t.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: p.active ? '#0A0A0A' : t.textSub,
            }}>
              <Icons.dumbbell size={16}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 14, fontWeight: 500 }}>{p.l}</div>
              <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 11 }}>{p.s}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail */}
      <div style={{ flex: 1, padding: '32px 40px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 6 }}>Программа · 6 упражнений · 54 мин</div>
          <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 36, fontWeight: 500, letterSpacing: -0.5 }}>Грудь · Трицепс · Плечи</div>
        </div>

        {/* AdaptiveGrid 2 cols on tablet */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            { l: 'Жим штанги лёжа', s: '4×8 · 80кг', tag: 'PR' },
            { l: 'Жим гантелей наклон', s: '3×10 · 28кг' },
            { l: 'Разводка', s: '3×12 · 14кг' },
            { l: 'Отжимания на брусьях', s: '3×10 · своё' },
            { l: 'Французский жим', s: '3×12 · 25кг' },
            { l: 'Разгибание на блоке', s: '3×15 · 20кг' },
          ].map((ex, i) => (
            <div key={i} style={{
              background: t.surfaceHi,
              border: `1px solid ${t.line}`,
              borderRadius: 16,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minHeight: 110,
              position: 'relative',
            }}>
              {ex.tag && (
                <div style={{ position: 'absolute', top: 12, right: 12, background: t.accent, color: '#0A0A0A', fontFamily: t.fontM, fontSize: 9, fontWeight: 600, letterSpacing: 1, padding: '3px 6px', borderRadius: 4 }}>{ex.tag}</div>
              )}
              <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' }}>0{i+1}</div>
              <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 16, fontWeight: 500, lineHeight: 1.2 }}>{ex.l}</div>
              <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 13 }}>{ex.s}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 'auto',
          height: 56,
          background: t.accent,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0A0A0A',
          fontFamily: t.fontH,
          fontSize: 16,
          fontWeight: 600,
        }}>Начать тренировку</div>
      </div>
    </div>
  );
}

function RC_Pin({ top, left, text }) {
  const t = RC_T;
  return (
    <div style={{
      position: 'absolute', top, left,
      maxWidth: 220,
      background: 'rgba(255,210,122,0.92)',
      color: '#0A0A0A',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
      lineHeight: 1.35,
      padding: '6px 10px',
      borderRadius: 6,
      boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
      zIndex: 50,
    }}>{text}</div>
  );
}

// ------------------------------- ROOT -------------------------------------

function A_ResponsiveContexts() {
  const t = RC_T;
  return (
    <div style={{
      width: '100%',
      minHeight: '100%',
      background: t.bg,
      padding: '28px 32px 48px',
      boxSizing: 'border-box',
      fontFamily: t.fontB,
    }}>
      <style>{`@keyframes rcblink { 50% { opacity: 0; } }`}</style>

      <div style={{ marginBottom: 28, maxWidth: 980 }}>
        <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 6 }}>Адаптивность · крайние контексты</div>
        <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 30, fontWeight: 500, letterSpacing: -0.5, marginBottom: 8 }}>Не только ширина</div>
        <div style={{ color: t.textSub, fontFamily: t.fontB, fontSize: 14, lineHeight: 1.5, maxWidth: 720 }}>
          Три сценария, которые покрывает новый responsive-пакет помимо чистой ширины экрана: клавиатура поверх формы, Larger Text +40 %, и tablet master-detail. Каждый — это конкретный компонент или хук из <code style={{ background: t.surfaceHi, padding: '1px 6px', borderRadius: 3 }}>work/responsive/src/</code>.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 1. Keyboard */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <RC_PhoneFrame width={340} height={736} label="SafeModal + клавиатура" sub="iPhone 14 · 390×844">
            <RC_KeyboardScene/>
          </RC_PhoneFrame>
          <div style={{ maxWidth: 340, color: t.textSub, fontFamily: t.fontB, fontSize: 12, lineHeight: 1.4 }}>
            <strong style={{ color: t.text }}>SafeModal</strong> + <strong style={{ color: t.text }}>FormField</strong>: KeyboardAvoidingView встроен, drag-handle, ≥48pt высота input. Замена ручных <code>{'<Modal>'}</code>.
          </div>
        </div>

        {/* 2. Dynamic Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <RC_PhoneFrame width={340} height={736} label="Dynamic Type · сравнение" sub="default vs Larger Text">
            <RC_DynamicTypeScene/>
          </RC_PhoneFrame>
          <div style={{ maxWidth: 340, color: t.textSub, fontFamily: t.fontB, fontSize: 12, lineHeight: 1.4 }}>
            <strong style={{ color: t.text }}>{'<Text>'}</strong> с <code>maxFontSizeMultiplier=1.4</code>: layout не ломается даже при iOS Larger Text +200 %. Кнопка остаётся ≥44pt.
          </div>
        </div>

        {/* 3. Tablet */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <div style={{ color: t.text, fontFamily: t.fontH, fontSize: 14, fontWeight: 500 }}>Tablet master-detail</div>
            <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}>iPad mini · 744×1133</div>
          </div>
          <div style={{
            width: 540,
            height: 720,
            borderRadius: 18,
            border: `2px solid ${t.line}`,
            background: '#000',
            padding: 8,
            boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden', background: t.bg }}>
              <RC_TabletScene/>
            </div>
          </div>
          <div style={{ maxWidth: 540, color: t.textSub, fontFamily: t.fontB, fontSize: 12, lineHeight: 1.4 }}>
            <strong style={{ color: t.text }}>r.isTablet</strong> + <strong style={{ color: t.text }}>AdaptiveGrid</strong>: на phone — стек, на tablet — sidebar 320pt + 2-колоночный grid карточек, max-width 720pt.
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 36, padding: '18px 22px', border: `1px solid ${t.line}`, borderRadius: 14, background: t.surfaceHi, maxWidth: 720 }}>
        <div style={{ color: t.textSub, fontFamily: t.fontM, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 10 }}>Какие компоненты в работе</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: t.text }}>
          <div>SafeModal · KAV + sheet → card</div>
          <div>FormField · label + error</div>
          <div>Text · maxFontSizeMultiplier 1.4</div>
          <div>ResponsiveButton · ≥44pt</div>
          <div>useResponsive() · bp + scale + cols</div>
          <div>useKeyboard() · кастомные лифты</div>
          <div>useReducedMotion() · skeleton/toast</div>
          <div>useDensityStore · compact/normal/spacious</div>
        </div>
      </div>
    </div>
  );
}

window.A_ResponsiveContexts = A_ResponsiveContexts;
