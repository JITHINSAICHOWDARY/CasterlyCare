import { useEffect, useId, useRef, useState } from 'react';
import { patientService } from '../api/services/patient';
import { useRealtime } from '../context/RealtimeContext';

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('aria-hidden'));
}

function useDialogAccessibility(open, containerRef, initialFocusRef, restoreRef, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    if (!restoreRef.current) restoreRef.current = previous;
    const timer = window.setTimeout(() => {
      (initialFocusRef?.current || getFocusable(containerRef.current)[0])?.focus();
    }, 0);

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(containerRef.current);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, containerRef, initialFocusRef, restoreRef, onClose]);

  useEffect(() => {
    if (!open && restoreRef.current && typeof restoreRef.current.focus === 'function') {
      const target = restoreRef.current;
      restoreRef.current = null;
      window.setTimeout(() => target.focus(), 0);
    }
  }, [open, restoreRef]);
}

export default function PatientChatWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const fabRef = useRef(null);
  const menuRef = useRef(null);
  const menuCloseRef = useRef(null);
  const restoreRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open || mode) return undefined;
    const timer = window.setTimeout(() => menuCloseRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, mode]);

  useEffect(() => {
    if (!open || mode) return undefined;
    function onMenuKeyDown(event) {
      const items = getFocusable(menuRef.current).filter((element) => element.getAttribute('role') === 'menuitem');
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        fabRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(currentIndex + 1 + items.length) % items.length].focus();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length].focus();
      } else if (event.key === 'Home') {
        event.preventDefault();
        items[0].focus();
      } else if (event.key === 'End') {
        event.preventDefault();
        items[items.length - 1].focus();
      }
    }
    menuRef.current?.addEventListener('keydown', onMenuKeyDown);
    return () => menuRef.current?.removeEventListener('keydown', onMenuKeyDown);
  }, [open, mode]);

  function openMode(nextMode) {
    restoreRef.current = fabRef.current;
    setMode(nextMode);
    setOpen(false);
  }

  function closeChat() {
    setMode(null);
    setOpen(false);
  }

  function toggleMenu() {
    if (open && !mode) {
      setOpen(false);
      fabRef.current?.focus();
      return;
    }
    setMode(null);
    setOpen(true);
  }

  return (
    <>
      <div className="patient-chat-launcher fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {open && !mode ? (
          <div id={menuId} ref={menuRef} className="patient-chat-menu seal-panel" role="menu" aria-label="Patient chat options">
            <div className="patient-chat-menu-header">
              <div>
                <p className="eyebrow">Care support</p>
                <p className="patient-chat-menu-title">Choose how you need help</p>
              </div>
              <button ref={menuCloseRef} type="button" className="patient-chat-menu-close" onClick={() => setOpen(false)} aria-label="Close chat options">×</button>
            </div>
            <button type="button" role="menuitem" onClick={() => openMode('kingslayer')} className="patient-chat-option">
              <span className="support-tool-hint" aria-hidden="true">🗡️</span>
              <span className="min-w-0 text-left">
                <span className="patient-chat-option-title">Kingslayer</span>
                <span className="patient-chat-option-copy">Ask about recovery, medicines, diet, or using CasterlyCare.</span>
              </span>
            </button>
            <button type="button" role="menuitem" onClick={() => openMode('emergency')} className="patient-chat-option patient-chat-option-emergency">
              <span className="patient-chat-option-icon patient-chat-option-icon-emergency" aria-hidden="true">🚨</span>
              <span className="min-w-0 text-left">
                <span className="patient-chat-option-title">Emergency Chat</span>
                <span className="patient-chat-option-copy">Send an urgent message directly to your doctor.</span>
              </span>
            </button>
            <p className="patient-chat-disclaimer">For immediate life-threatening danger, call local emergency services. Emergency Chat is not a replacement for emergency response.</p>
          </div>
        ) : null}

        <button
          ref={fabRef}
          type="button"
          onClick={toggleMenu}
          className="patient-chat-fab"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={open ? 'Close patient chat options' : 'Open patient chat options'}
        >
          <span aria-hidden="true">{open ? '×' : '✉'}</span>
        </button>
      </div>

      {mode === 'kingslayer' ? <KingslayerModal onClose={closeChat} restoreRef={restoreRef} /> : null}
      {mode === 'emergency' ? <EmergencyChatModal onClose={closeChat} restoreRef={restoreRef} /> : null}
    </>
  );
}

function ChatShell({ title, subtitle, onClose, children, tone = 'default', restoreRef, initialFocusRef }) {
  const shellRef = useRef(null);
  const { subscribe, joinThread, leaveThread } = useRealtime();
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();

  useDialogAccessibility(true, shellRef, initialFocusRef, restoreRef, onClose);

  return (
    <div className="patient-chat-backdrop fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div ref={shellRef} className={`patient-chat-shell patient-chat-shell-${tone}`} role="dialog" aria-modal="true" aria-labelledby={generatedTitleId} aria-describedby={generatedDescriptionId}>
        <div className="patient-chat-header">
          <div className="min-w-0">
            <p id={generatedTitleId} className="font-display text-lg text-[var(--color-ink)]">{title}</p>
            <p id={generatedDescriptionId} className="text-xs text-[var(--color-text-soft)] mt-0.5">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="patient-chat-close" aria-label={`Close ${title}`}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function KingslayerModal({ onClose, restoreRef }) {
  const [messages, setMessages] = useState([
    { role: 'bot', content: "Hello, I'm Kingslayer — your multilingual recovery assistant. Ask me about your recovery, medicines, diet, or using the app." },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  async function send(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;

    setMessages((items) => [...items, { role: 'user', content }]);
    setDraft('');
    setBusy(true);

    try {
      const response = await patientService.askKingslayer(content);
      setMessages((items) => [...items, { role: 'bot', content: response.data.reply }]);
    } catch {
      setMessages((items) => [...items, { role: 'bot', content: 'I am having trouble responding right now. Please try again. For urgent medical concerns, use Emergency Chat.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChatShell title="Kingslayer" subtitle="AI recovery assistant · multilingual" onClose={onClose} tone="assistant" restoreRef={restoreRef} initialFocusRef={inputRef}>
      <div className="patient-chat-messages" aria-live="polite" aria-label="Kingslayer conversation">
        <div className="patient-chat-context-note" role="note">Kingslayer provides general recovery support and does not diagnose emergencies.</div>
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`patient-chat-message-row ${message.role === 'user' ? 'is-user' : 'is-bot'}`}>
            <div className={`patient-chat-message ${message.role === 'user' ? 'patient-chat-message-user' : 'patient-chat-message-bot'}`}>
              {message.content}
            </div>
          </div>
        ))}
        {busy ? <p className="patient-chat-typing" role="status">Kingslayer is preparing a response…</p> : null}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={send} className="patient-chat-compose">
        <label className="sr-only" htmlFor="kingslayer-message">Ask Kingslayer</label>
        <input ref={inputRef} id="kingslayer-message" className="field-input flex-1" placeholder="Ask Kingslayer…" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={busy} autoComplete="off" />
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>Send</button>
      </form>
    </ChatShell>
  );
}

function EmergencyChatModal({ onClose, restoreRef }) {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const shellRef = useRef(null);
  const { status: realtimeStatus, isConnected: realtimeConnected, lastConnectedAt, subscribe, joinThread, leaveThread } = useRealtime();

  useDialogAccessibility(true, shellRef, inputRef, restoreRef, onClose);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const active = await patientService.getEmergencyChatActive();
        if (cancelled) return;

        if (active.data.thread) {
          setThread(active.data.thread);
          setMessages(active.data.messages || []);
        } else {
          const started = await patientService.startEmergencyChat();
          if (cancelled) return;
          setThread(started.data.thread);
          setMessages([]);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not connect to Emergency Chat.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    connect();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!thread) return undefined;
    joinThread(thread.id);
    const unsubscribe = subscribe('new_message', (message) => {
      if (message.threadId === thread.id) {
        setMessages((items) => (items.some((item) => item.id === message.id) ? items : [...items, message]));
      }
    });
    return () => {
      leaveThread(thread.id);
      unsubscribe();
    };
  }, [thread, joinThread, leaveThread, subscribe]);

  useEffect(() => {
    if (!thread || !realtimeConnected || !lastConnectedAt) return;
    let cancelled = false;
    patientService.getEmergencyChatActive().then((response) => {
      if (cancelled || !response.data?.thread || response.data.thread.id !== thread.id) return;
      const incoming = Array.isArray(response.data.messages) ? response.data.messages : [];
      setMessages((current) => {
        const merged = new Map(incoming.map((item) => [item.id, item]));
        current.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [thread, realtimeConnected, lastConnectedAt]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  async function send(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !thread || busy) return;

    setBusy(true);
    setError('');
    try {
      const response = await patientService.sendEmergencyMessage(thread.id, content);
      const next = response.data.message;
      if (next) setMessages((items) => (items.some((item) => item.id === next.id) ? items : [...items, next]));
      setDraft('');
    } catch (err) {
      setError(err?.message || 'Your message could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="patient-chat-backdrop fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div ref={shellRef} className="patient-chat-shell patient-chat-shell-emergency" role="dialog" aria-modal="true" aria-labelledby="emergency-chat-title" aria-describedby="emergency-chat-subtitle">
        <div className="patient-chat-header">
          <div className="min-w-0">
            <p id="emergency-chat-title" className="font-display text-lg text-[var(--color-ink)]">Emergency Chat</p>
            <p id="emergency-chat-subtitle" className="text-xs text-[var(--color-text-soft)] mt-0.5">{thread ? `Temporary Chat ID: ${thread.chatCode}` : 'Connecting to your care team…'}</p>
          </div>
          <button type="button" onClick={onClose} className="patient-chat-close" aria-label="Close Emergency Chat">×</button>
        </div>
        <div className="patient-chat-emergency-banner" role="note">
          <strong>Urgent doctor contact</strong>
          <span>Your message is routed to the doctor assigned to your current recovery episode.</span>
          {realtimeStatus !== 'connected' ? <span className="patient-chat-realtime-warning">Live connection is {realtimeStatus === 'connecting' ? 'reconnecting' : 'temporarily unavailable'}; secure message delivery remains available.</span> : null}
        </div>
        <div className="patient-chat-messages" aria-live="polite" aria-label="Emergency Chat conversation">
          {loading ? (
            <div className="patient-chat-empty-state" role="status"><span className="spinner" aria-hidden="true" /> Connecting you to your doctor…</div>
          ) : error && !thread ? (
            <div className="patient-chat-empty-state patient-chat-empty-state-error" role="alert">{error}</div>
          ) : messages.length === 0 ? (
            <div className="patient-chat-empty-state">Describe your urgent concern below. Your doctor will reply here directly.</div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`patient-chat-message-row ${message.senderRole === 'patient' ? 'is-user' : 'is-bot'}`}>
                <div className={`patient-chat-message ${message.senderRole === 'patient' ? 'patient-chat-message-user' : 'patient-chat-message-bot'}`}>
                  <span className="patient-chat-message-sender">{message.senderRole === 'patient' ? 'You' : 'Doctor'}</span>
                  <span>{message.content}</span>
                </div>
              </div>
            ))
          )}
          {error && thread ? <p className="patient-chat-send-error" role="alert">{error}</p> : null}
          <div ref={scrollRef} />
        </div>
        <form onSubmit={send} className="patient-chat-compose">
          <label className="sr-only" htmlFor="emergency-message">Describe your urgent concern</label>
          <input ref={inputRef} id="emergency-message" className="field-input flex-1" placeholder="Describe your urgent concern…" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={loading || !thread || busy} autoComplete="off" />
          <button type="submit" className="btn btn-danger" disabled={loading || !thread || busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </form>
      </div>
    </div>
  );
}
