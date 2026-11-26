import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from './LanguageContext';
import { motionMs } from '../utils/motion';

const FeedbackContext = createContext(null);

function focusable(root) {
  if (!root) return [];
  return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
}

function Dialog({ dialog, leaving, onResolve }) {
  const { t } = useLanguage();
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef(null);
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState('');

  const cancel = useCallback(() => {
    onResolve(dialog.kind === 'prompt' ? null : false);
  }, [dialog.kind, onResolve]);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement;
    const preferred = panel?.querySelector('[data-autofocus]');
    (preferred || focusable(panel)[0])?.focus();

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onResolve(dialog.kind === 'prompt' ? null : false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable(panel);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [dialog, onResolve]);

  function submitPrompt(event) {
    event.preventDefault();
    const next = value.trim();
    const min = dialog.minLength ?? 1;
    if (next.length < min) {
      setFieldError(t(next ? (dialog.tooShortKey || 'error.WEAK_PASSWORD') : 'common.required'));
      return;
    }
    onResolve(next);
  }

  return createPortal(
    <div className={`modal-root${leaving ? ' is-leaving' : ''}`}>
      <div className="modal-backdrop" role="presentation" onMouseDown={cancel} />
      <div
        ref={panelRef}
        className="modal-dialog"
        role={dialog.kind === 'confirm' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={dialog.message ? messageId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog-title">{dialog.title}</h2>
        {dialog.message && <p id={messageId} className="dialog-message">{dialog.message}</p>}

        {dialog.kind === 'prompt' ? (
          <form className="dialog-form" noValidate onSubmit={submitPrompt}>
            <label className="field" htmlFor={`${titleId}-input`}>
              <span>{dialog.label}</span>
              <input
                id={`${titleId}-input`}
                data-autofocus
                type={dialog.inputType || 'text'}
                dir={dialog.inputType === 'password' ? 'ltr' : undefined}
                autoComplete={dialog.inputType === 'password' ? 'new-password' : 'off'}
                value={value}
                onChange={(event) => { setValue(event.target.value); setFieldError(''); }}
              />
            </label>
            {fieldError && <div className="error">{fieldError}</div>}
            <div className="dialog-actions">
              <button type="button" className="b b-ghost" onClick={cancel}>{dialog.cancelLabel}</button>
              <button type="submit" className="b b-primary">{dialog.confirmLabel}</button>
            </div>
          </form>
        ) : (
          <div className="dialog-actions">
            <button
              type="button"
              className="b b-ghost"
              data-autofocus={dialog.danger ? '' : undefined}
              onClick={cancel}
            >
              {dialog.cancelLabel}
            </button>
            <button
              type="button"
              className={`b ${dialog.danger ? 'b-danger' : 'b-primary'}`}
              data-autofocus={dialog.danger ? undefined : ''}
              onClick={() => onResolve(true)}
            >
              {dialog.confirmLabel}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Toasts({ items, onDismiss, onPause, onResume }) {
  const { t } = useLanguage();
  return createPortal(
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast-${item.type}${item.leaving ? ' is-leaving' : ''}`}
          role={item.type === 'error' ? 'alert' : 'status'}
          onMouseEnter={() => onPause(item.id)}
          onMouseLeave={() => onResume(item)}
        >
          <span className="toast-message">{item.message}</span>
          <button type="button" className="toast-close" onClick={() => onDismiss(item.id)} aria-label={t('toast.dismiss')}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function FeedbackProvider({ children }) {
  const { t } = useLanguage();
  const [dialog, setDialog] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const seq = useRef(0);
  const dialogRef = useRef(null);
  const leavingRef = useRef(false);
  const closeTimer = useRef(null);
  const dialogSeq = useRef(0);

  useEffect(() => {
    dialogRef.current = dialog;
    leavingRef.current = leaving;
  }, [dialog, leaving]);

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    window.setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id));
    }, motionMs(180));
  }, []);

  const pause = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const resume = useCallback((item) => {
    if (item.leaving || timers.current.has(item.id)) return;
    timers.current.set(item.id, window.setTimeout(() => dismiss(item.id), 1600));
  }, [dismiss]);

  const toast = useCallback((options) => {
    if (!options?.message) return 0;
    const id = ++seq.current;
    const type = options.type || 'info';
    const duration = options.duration ?? (type === 'error' ? 6400 : 4200);
    setToasts((list) => [...list, { id, type, message: options.message, duration }].slice(-4));
    timers.current.set(id, window.setTimeout(() => dismiss(id), duration));
    return id;
  }, [dismiss]);

  const finish = useCallback((value) => {
    const current = dialogRef.current;
    if (!current || leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    closeTimer.current = window.setTimeout(() => {
      leavingRef.current = false;
      dialogRef.current = null;
      setLeaving(false);
      setDialog(null);
      current.resolve(value);
    }, motionMs(180));
  }, []);

  const openDialog = useCallback((partial) => new Promise((resolve) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const previous = dialogRef.current;
    if (previous) previous.resolve(false);
    leavingRef.current = false;
    setLeaving(false);
    setDialog({ ...partial, id: ++dialogSeq.current, resolve });
  }), []);

  const confirm = useCallback((options) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    return openDialog({
      kind: 'confirm',
      title: opts.title || t('common.confirmTitle'),
      message: opts.message || t('common.confirm'),
      confirmLabel: opts.confirmLabel || t('common.confirmAction'),
      cancelLabel: opts.cancelLabel || t('common.cancel'),
      danger: !!opts.danger,
    });
  }, [openDialog, t]);

  const prompt = useCallback((options = {}) => openDialog({
    kind: 'prompt',
    title: options.title || t('common.confirmTitle'),
    label: options.label || '',
    message: options.message || '',
    inputType: options.inputType || 'text',
    confirmLabel: options.confirmLabel || t('common.save'),
    cancelLabel: options.cancelLabel || t('common.cancel'),
    minLength: options.minLength,
    tooShortKey: options.tooShortKey,
  }), [openDialog, t]);

  useEffect(() => () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const value = useMemo(() => ({ toast, confirm, prompt }), [toast, confirm, prompt]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {dialog && <Dialog key={dialog.id} dialog={dialog} leaving={leaving} onResolve={finish} />}
      <Toasts items={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}
