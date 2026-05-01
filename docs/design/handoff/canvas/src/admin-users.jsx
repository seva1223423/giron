// Desktop Admin Users list — 1440×900
(() => {
  const T = window.ADM_T;
  const D = window.ADM_DATA;

  const PLAN_COLOR = { free: T.planFree, pro: T.planPro, trainer: T.planTrainer, club: T.planClub };
  const ROLE_LABEL = { client: 'Клиент', trainer: 'Тренер', support: 'Поддержка', admin: 'Админ' };

  const Chip = ({ label, count, active, color }) => (
    <div style={{
      padding: '6px 12px',
      borderRadius: 7,
      background: active ? T.surfaceHi : 'transparent',
      border: `1px solid ${active ? T.lineActive : T.line}`,
      fontSize: 12,
      color: active ? T.text : T.textSub,
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
      fontWeight: active ? 500 : 400,
    }}>
      {color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }}/>}
      {label}
      {count != null && <span style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim }}>{count}</span>}
    </div>
  );

  window.AdminUsers = function AdminUsers() {
    const [sortKey, setSortKey] = React.useState('eng');
    const [sortDir, setSortDir] = React.useState('desc');
    const [planFilter, setPlanFilter] = React.useState('');
    const [selected, setSelected] = React.useState(new Set(['1','3']));

    const toggle = (id) => {
      const n = new Set(selected);
      n.has(id) ? n.delete(id) : n.add(id);
      setSelected(n);
    };

    const sortBy = (k) => {
      if (sortKey === k) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
      else { setSortKey(k); setSortDir('desc'); }
    };

    let users = [...D.users];
    if (planFilter) users = users.filter(u => u.plan === planFilter);
    users.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'string') return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb);
      return sortDir === 'desc' ? vb - va : va - vb;
    });

    const SortHead = ({ k, label, align }) => (
      <div onClick={() => sortBy(k)} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        cursor: 'pointer',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        color: sortKey === k ? T.accent : T.textSub,
      }}>
        {label}
        <span style={{ fontFamily: T.fontM, fontSize: 9, opacity: sortKey === k ? 1 : 0.4 }}>
          {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </div>
    );

    return (
      <div style={{ background: T.bg, color: T.text, height: '100%', display: 'flex', fontFamily: T.fontB, overflow: 'hidden' }}>
        <window.AdminSidebar active="users"/>

        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* topbar */}
          <div style={{
            padding: '16px 28px',
            borderBottom: `1px solid ${T.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            position: 'sticky', top: 0, background: T.bg, zIndex: 5,
          }}>
            <div>
              <div style={{ fontFamily: T.fontM, fontSize: 9, letterSpacing: 2, color: T.textDim, marginBottom: 4 }}>УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ</div>
              <div style={{ fontFamily: T.fontH, fontSize: 22, fontWeight: 400, letterSpacing: -0.5 }}>
                Все <span style={{ fontStyle: 'italic', color: T.accent }}>пользователи</span>
                <span style={{ fontFamily: T.fontM, fontSize: 12, color: T.textSub, marginLeft: 12, fontStyle: 'normal' }}>12 847 всего</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ padding: '7px 14px', borderRadius: 8, background: T.surface, border: `1px solid ${T.line}`, color: T.text, fontSize: 12, cursor: 'pointer' }}>↗ CSV</button>
              <button style={{ padding: '7px 14px', borderRadius: 8, background: T.accent, border: 'none', color: '#0A0A0A', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ Создать</button>
            </div>
          </div>

          {/* filter row */}
          <div style={{ padding: '14px 28px', borderBottom: `1px solid ${T.line}`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', background: T.surface, border: `1px solid ${T.line}`,
              borderRadius: 8, minWidth: 280,
            }}>
              <span style={{ color: T.textDim }}>⌕</span>
              <span style={{ color: T.textDim, fontSize: 12, flex: 1 }}>Имя, email или ID...</span>
            </div>
            <div style={{ width: 1, height: 22, background: T.line }}/>
            <Chip label="Все планы" active={planFilter === ''} count={D.users.length}/>
            <Chip label="Free" color={T.planFree} active={planFilter === 'free'} count={1}/>
            <Chip label="PRO" color={T.planPro} active={planFilter === 'pro'} count={4}/>
            <Chip label="Trainer" color={T.planTrainer} active={planFilter === 'trainer'} count={2}/>
            <Chip label="Club" color={T.planClub} active={planFilter === 'club'} count={4}/>
            <div style={{ flex: 1 }}/>
            <Chip label="🚨 Churn risk" count={1}/>
            <Chip label="⏰ Истекают"/>
            <Chip label="✕ Заблокированные" count={1}/>
          </div>

          {/* selection bar */}
          {selected.size > 0 && (
            <div style={{
              padding: '10px 28px',
              background: T.accentSoft, borderBottom: `1px solid ${T.line}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 12, color: T.text }}>
                Выбрано <strong style={{ color: T.accent }}>{selected.size}</strong>
              </span>
              <div style={{ width: 1, height: 16, background: T.line }}/>
              {['↗ Сообщение', '$ Выдать план', '⏰ Продлить', '✕ Заблокировать'].map(b => (
                <button key={b} style={{ padding: '5px 10px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: 6, color: T.text, fontSize: 11, cursor: 'pointer' }}>{b}</button>
              ))}
              <div style={{ flex: 1 }}/>
              <span onClick={() => setSelected(new Set())} style={{ fontSize: 11, color: T.textSub, cursor: 'pointer' }}>отменить</span>
            </div>
          )}

          {/* table */}
          <div style={{ padding: '0 28px 28px' }}>
            {/* header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 1.6fr 0.8fr 0.9fr 0.6fr 0.7fr 0.6fr 0.5fr 60px',
              gap: 12,
              padding: '14px 12px',
              fontFamily: T.fontM, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
              borderBottom: `1px solid ${T.line}`,
              position: 'sticky', top: 73, background: T.bg, zIndex: 4,
            }}>
              <div>
                <input type="checkbox" style={{ accentColor: T.accent }}/>
              </div>
              <SortHead k="firstName" label="Пользователь"/>
              <SortHead k="role" label="Роль"/>
              <SortHead k="plan" label="План"/>
              <SortHead k="workouts" label="Трен." align="right"/>
              <SortHead k="lastWorkout" label="Активность" align="right"/>
              <SortHead k="eng" label="Engagement" align="right"/>
              <SortHead k="joined" label="Регистр." align="right"/>
              <div></div>
            </div>

            {users.map(u => {
              const isSelected = selected.has(u.id);
              const planColor = PLAN_COLOR[u.plan];
              const engColor = u.eng >= 70 ? T.good : u.eng >= 35 ? T.warn : T.danger;
              return (
                <div key={u.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1.6fr 0.8fr 0.9fr 0.6fr 0.7fr 0.6fr 0.5fr 60px',
                  gap: 12,
                  padding: '12px',
                  borderBottom: `1px solid ${T.line}`,
                  alignItems: 'center',
                  background: isSelected ? T.accentSoft : (u.isBanned ? `${T.danger}08` : 'transparent'),
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.surface; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = u.isBanned ? `${T.danger}08` : 'transparent'; }}
                >
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(u.id)} style={{ accentColor: T.accent }}/>
                  {/* user */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: u.isBanned ? `${T.danger}20` : `${planColor}20`,
                      border: `1px solid ${u.isBanned ? T.danger : planColor}40`,
                      color: u.isBanned ? T.danger : planColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: T.fontH, fontSize: 13, fontWeight: 500,
                    }}>{u.firstName[0]}{u.lastName[0]}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: u.isBanned ? T.textSub : T.text, textDecoration: u.isBanned ? 'line-through' : 'none' }}>
                          {u.firstName} {u.lastName}
                        </span>
                        {u.isNew && <span style={{ fontFamily: T.fontM, fontSize: 8, color: T.good, padding: '1px 5px', background: `${T.good}20`, borderRadius: 3, letterSpacing: 1 }}>NEW</span>}
                        {u.churnRisk && <span style={{ fontFamily: T.fontM, fontSize: 8, color: T.warn, padding: '1px 5px', background: `${T.warn}20`, borderRadius: 3, letterSpacing: 1 }}>CHURN</span>}
                        {u.isBanned && <span style={{ fontFamily: T.fontM, fontSize: 8, color: T.danger, padding: '1px 5px', background: `${T.danger}20`, borderRadius: 3, letterSpacing: 1 }}>БАН</span>}
                      </div>
                      <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email} · {u.city}</div>
                    </div>
                  </div>
                  {/* role */}
                  <div style={{ fontSize: 12, color: T.textSub }}>{ROLE_LABEL[u.role] || u.role}</div>
                  {/* plan */}
                  <div>
                    <span style={{
                      fontFamily: T.fontM, fontSize: 10, fontWeight: 600, letterSpacing: 1,
                      padding: '3px 8px', borderRadius: 4,
                      color: planColor, background: `${planColor}18`, border: `1px solid ${planColor}40`,
                    }}>{u.plan.toUpperCase()}</span>
                    {u.planEnd && (
                      <div style={{ fontFamily: T.fontM, fontSize: 9, color: T.textDim, marginTop: 3 }}>
                        до {new Date(u.planEnd).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </div>
                    )}
                  </div>
                  {/* workouts */}
                  <div style={{ fontFamily: T.fontM, fontSize: 12, color: T.text, textAlign: 'right' }}>{u.workouts}</div>
                  {/* lastWorkout */}
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      fontFamily: T.fontM, fontSize: 11,
                      color: u.lastWorkout === 0 ? T.good : u.lastWorkout > 14 ? T.danger : T.textSub,
                    }}>
                      {u.lastWorkout === 0 ? 'сегодня' : `${u.lastWorkout}д назад`}
                    </span>
                  </div>
                  {/* eng */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <div style={{ width: 36, height: 4, background: T.surfaceHi, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${u.eng}%`, height: '100%', background: engColor }}/>
                    </div>
                    <span style={{ fontFamily: T.fontM, fontSize: 11, color: engColor, fontWeight: 600, width: 22, textAlign: 'right' }}>{u.eng}</span>
                  </div>
                  {/* joined */}
                  <div style={{ fontFamily: T.fontM, fontSize: 10, color: T.textDim, textAlign: 'right' }}>
                    {new Date(u.joined).toLocaleDateString('ru', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </div>
                  {/* actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 14, color: T.textDim, cursor: 'pointer', padding: 4 }}>⋯</span>
                  </div>
                </div>
              );
            })}

            {/* pagination */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 12px' }}>
              <span style={{ fontSize: 11, color: T.textSub }}>Показано 1–15 из 12 847</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {['‹', '1', '2', '3', '...', '857', '›'].map((p, i) => (
                  <div key={i} style={{
                    minWidth: 28, height: 28, padding: '0 8px',
                    borderRadius: 6,
                    background: p === '1' ? T.accent : T.surface,
                    color: p === '1' ? '#0A0A0A' : T.textSub,
                    border: `1px solid ${p === '1' ? T.accent : T.line}`,
                    fontSize: 11, fontFamily: T.fontM, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}>{p}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
})();
