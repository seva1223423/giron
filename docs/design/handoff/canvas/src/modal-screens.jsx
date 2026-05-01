/* global React */
// Iron Gym — фирменные модалки/уведомления (замена системных Alert)
// 6 типов: error, success, info, confirm, destructive, toast

const A_TM = window.IG_TOKENS.A;

// === Иконки внутри стикера ===
function ModalIcon({ kind, t }) {
  const size = 56;
  const ring = (color, fill) => (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: fill || `${color}1A`,
      border: `1.5px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 8px 24px ${color}33, inset 0 1px 0 rgba(255,255,255,0.05)`,
    }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'error' && <><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.6" fill={color}/></>}
        {kind === 'success' && <><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></>}
        {kind === 'info' && <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.7" fill={color}/></>}
        {kind === 'confirm' && <><path d="M12 3l9 4v6c0 4.5-3.5 7.5-9 8-5.5-.5-9-3.5-9-8V7l9-4z"/><path d="M9 12l2 2 4-4"/></>}
        {kind === 'destructive' && <><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/></>}
      </svg>
    </div>
  );
  const map = {
    error: { c: t.danger },
    success: { c: t.good },
    info: { c: t.accent },
    confirm: { c: t.accent },
    destructive: { c: t.danger },
  };
  return ring(map[kind].c);
}

// === Сама модалка (preview-обёртка) ===
function IGModal({ kind = 'error', title, message, primary = 'OK', secondary, t = A_TM, primaryStyle = 'gold', children }) {
  const isDestructive = kind === 'destructive' || primaryStyle === 'danger';
  const primaryBg = isDestructive
    ? `linear-gradient(180deg, ${t.danger}, #B8584A)`
    : `linear-gradient(180deg, ${t.accent}, ${t.accent2})`;
  const primaryText = isDestructive ? '#fff' : '#1A1208';

  return (
    <div style={{
      width: 320, borderRadius: 24, overflow: 'hidden',
      background: t.surfaceHi,
      border: `1px solid ${t.lineStrong}`,
      boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.04) inset',
      fontFamily: t.fontB,
    }}>
      {/* шапка-стикер */}
      <div style={{
        padding: '28px 24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        background: `radial-gradient(120% 80% at 50% 0%, ${t.accent}11 0%, transparent 60%)`,
      }}>
        <ModalIcon kind={kind} t={t}/>
        {title && <div style={{ fontFamily: t.fontH, fontSize: 19, fontWeight: 700, color: t.text, letterSpacing: -0.3, textAlign: 'center' }}>{title}</div>}
      </div>

      {/* сообщение */}
      {message && (
        <div style={{ padding: '0 24px 18px', textAlign: 'center', color: t.textSub, fontSize: 14, lineHeight: 1.45 }}>
          {message}
        </div>
      )}

      {children}

      {/* кнопки */}
      <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${t.line}` }}>
        <button style={{
          height: 46, borderRadius: 14, border: 'none',
          background: primaryBg, color: primaryText,
          fontFamily: t.fontH, fontWeight: 700, fontSize: 14, letterSpacing: 0.2,
          cursor: 'pointer',
          boxShadow: `0 6px 16px ${isDestructive ? t.danger : t.accent}40`,
        }}>{primary}</button>
        {secondary && (
          <button style={{
            height: 46, borderRadius: 14,
            background: 'transparent', color: t.textSub,
            border: `1px solid ${t.line}`,
            fontFamily: t.fontH, fontWeight: 600, fontSize: 14,
            cursor: 'pointer',
          }}>{secondary}</button>
        )}
      </div>
    </div>
  );
}

// === Toast (мини-уведомление сверху экрана) ===
function IGToast({ kind = 'success', text, t = A_TM }) {
  const color = kind === 'error' ? t.danger : kind === 'warn' ? t.warn : t.good;
  return (
    <div style={{
      width: 320, height: 56, borderRadius: 18,
      background: t.surfaceHi,
      border: `1px solid ${t.lineStrong}`,
      boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
      fontFamily: t.fontB,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: `${color}1F`, border: `1px solid ${color}55`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          {kind === 'success' && <path d="M5 12.5l4 4 10-10"/>}
          {kind === 'error' && <><path d="M6 6l12 12"/><path d="M18 6L6 18"/></>}
          {kind === 'warn' && <><path d="M12 4l10 17H2L12 4z"/><path d="M12 11v4"/></>}
        </svg>
      </div>
      <div style={{ flex: 1, color: t.text, fontSize: 13.5, fontWeight: 500 }}>{text}</div>
      <div style={{ width: 4, height: 28, borderRadius: 4, background: color, boxShadow: `0 0 12px ${color}` }}/>
    </div>
  );
}

// === Превью-сцена ===
function ModalScene({ children, t = A_TM, label }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: t.bg, overflow: 'hidden' }}>
      {/* псевдо-фон приложения */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
        <div style={{ height: 60, borderBottom: `1px solid ${t.line}`, padding: '20px 18px', color: t.textSub, fontFamily: t.fontM, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} style={{ height: 80, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14 }}/>
          ))}
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ height: 68, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, marginBottom: 10 }}/>
          <div style={{ height: 68, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, marginBottom: 10 }}/>
        </div>
      </div>
      {/* затемнение */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}/>
      {/* контент */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        {children}
      </div>
    </div>
  );
}

function ToastScene({ children, t = A_TM, label }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: t.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
        <div style={{ height: 60, borderBottom: `1px solid ${t.line}`, padding: '20px 18px', color: t.textSub, fontFamily: t.fontM, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ padding: 18 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 64, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, marginBottom: 10 }}/>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', top: 60, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

// === ЭКРАНЫ для канваса ===

window.A_ModalError = function A_ModalError() {
  const t = A_TM;
  return (
    <ModalScene t={t} label="Профиль · Сохранение">
      <IGModal
        kind="error"
        title="Не удалось сохранить"
        message="Проверь подключение к серверу и попробуй ещё раз. Изменения сохранены локально."
        primary="Повторить"
        secondary="Отмена"
        t={t}
      />
    </ModalScene>
  );
};

window.A_ModalSession = function A_ModalSession() {
  const t = A_TM;
  return (
    <ModalScene t={t} label="Главная · Авторизация">
      <IGModal
        kind="info"
        title="Сессия истекла"
        message="Войди в приложение заново, чтобы продолжить тренировку."
        primary="Войти"
        t={t}
      />
    </ModalScene>
  );
};

window.A_ModalSuccess = function A_ModalSuccess() {
  const t = A_TM;
  return (
    <ModalScene t={t} label="Тренировка · Завершение">
      <IGModal
        kind="success"
        title="Тренировка сохранена"
        message="Отличная работа! +3 PR обновлено, объём 12 480 кг."
        primary="Готово"
        t={t}
      />
    </ModalScene>
  );
};

window.A_ModalConfirm = function A_ModalConfirm() {
  const t = A_TM;
  return (
    <ModalScene t={t} label="Профиль · Выход">
      <IGModal
        kind="confirm"
        title="Выйти из аккаунта?"
        message="Локальные данные останутся, но синхронизация остановится."
        primary="Выйти"
        secondary="Остаться"
        primaryStyle="danger"
        t={t}
      />
    </ModalScene>
  );
};

window.A_ModalDestructive = function A_ModalDestructive() {
  const t = A_TM;
  return (
    <ModalScene t={t} label="Питание · Удалить запись">
      <IGModal
        kind="destructive"
        title="Удалить запись?"
        message="«Куриное филе с рисом · 540 ккал» исчезнет из дневника. Это действие нельзя отменить."
        primary="Удалить"
        secondary="Отмена"
        primaryStyle="danger"
        t={t}
      />
    </ModalScene>
  );
};

window.A_ToastSuccess = function A_ToastSuccess() {
  const t = A_TM;
  return (
    <ToastScene t={t} label="Сканер · Добавление">
      <IGToast kind="success" text="Продукт добавлен в дневник" t={t}/>
    </ToastScene>
  );
};

window.A_ToastError = function A_ToastError() {
  const t = A_TM;
  return (
    <ToastScene t={t} label="Сеть · Ошибка">
      <IGToast kind="error" text="Нет соединения. Сохранено локально." t={t}/>
    </ToastScene>
  );
};

window.A_ToastWarn = function A_ToastWarn() {
  const t = A_TM;
  return (
    <ToastScene t={t} label="Камера · Доступ">
      <IGToast kind="warn" text="Разрешите доступ к камере в настройках" t={t}/>
    </ToastScene>
  );
};

// Сводный экран — все типы рядом
window.A_ModalSystem = function A_ModalSystem() {
  const t = A_TM;
  const Card = ({ children, label }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: t.fontM, fontSize: 10, color: t.textDim, letterSpacing: 1.4, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  );
  return (
    <div style={{ background: t.bg, minHeight: '100%', padding: '40px 28px 60px', fontFamily: t.fontB }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.5, color: t.accent, textTransform: 'uppercase', marginBottom: 8 }}>Design system · System</div>
          <div style={{ fontFamily: t.fontH, fontSize: 36, fontWeight: 700, color: t.text, letterSpacing: -0.6 }}>Системные уведомления</div>
          <div style={{ fontSize: 14, color: t.textSub, marginTop: 6, maxWidth: 560 }}>
            Замена дефолтных Alert.alert на фирменные модалки. 5 типов модалок + 3 toast'а. Подключаются через единый AppModalProvider — существующие вызовы работают без переписывания.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, marginBottom: 40 }}>
          <Card label="Error · ошибка"><IGModal kind="error" title="Не удалось сохранить" message="Проверь подключение к серверу и попробуй ещё раз." primary="Повторить" secondary="Отмена" t={t}/></Card>
          <Card label="Info · сессия"><IGModal kind="info" title="Сессия истекла" message="Войди в приложение заново." primary="Войти" t={t}/></Card>
          <Card label="Success · готово"><IGModal kind="success" title="Тренировка сохранена" message="Отличная работа! +3 PR · 12 480 кг" primary="Готово" t={t}/></Card>
          <Card label="Confirm · подтверждение"><IGModal kind="confirm" title="Выйти из аккаунта?" message="Синхронизация остановится." primary="Выйти" secondary="Остаться" primaryStyle="danger" t={t}/></Card>
          <Card label="Destructive · удаление"><IGModal kind="destructive" title="Удалить запись?" message="Это действие нельзя отменить." primary="Удалить" secondary="Отмена" t={t}/></Card>
        </div>

        <div style={{ marginBottom: 14, fontFamily: t.fontM, fontSize: 11, letterSpacing: 1.4, color: t.textDim, textTransform: 'uppercase' }}>Toasts · мини-уведомления</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <IGToast kind="success" text="Продукт добавлен в дневник" t={t}/>
          <IGToast kind="error" text="Нет соединения. Сохранено локально." t={t}/>
          <IGToast kind="warn" text="Разрешите доступ к камере" t={t}/>
        </div>
      </div>
    </div>
  );
};
