import { doctorService } from '../../api/services/doctor';
import { apiErrorMessage } from '../../api/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, Button, EmptyState, LoadingState, Alert, ConfirmModal, PageHeader } from '../../components/ui';
import NavIcon from '../../components/NavIcon';
import GlassLensFilter from '../../components/GlassLensFilter';
import { INBOX_CHANGED } from '../../components/useInboxBadge';
import { useRealtime } from '../../context/RealtimeContext';
import { clockTime, dayLabel, listTime } from '../../utils/time';

const QUICK_REPLIES = [
  { label: 'Come to the hospital', text: 'Please come to the hospital as soon as you can.' },
  { label: 'Take your medicine', text: 'Please take your medicine as prescribed.' },
  { label: 'I will call you', text: 'I will call you shortly.' },
  { label: 'Rest and avoid strain', text: 'Please rest and avoid any strain for now.' },
  { label: 'Call emergency if worse', text: 'If it gets worse, call the emergency number right away.' },
];

function announceInboxChange() {
  window.dispatchEvent(new Event(INBOX_CHANGED));
}

export default function DoctorInbox() {
  const [tab, setTab] = useState('open');
  const [openThreads, setOpenThreads] = useState(null);
  const [closedThreads, setClosedThreads] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [threadError, setThreadError] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const scrollRef = useRef(null);
  const composeRef = useRef(null);
  const { isConnected: realtimeConnected, lastConnectedAt, subscribe, joinThread, leaveThread } = useRealtime();

  const loadOpen = useCallback(async ({ background = false } = {}) => {
    try {
      if (!background) setInboxError('');
      const res = await doctorService.getInbox();
      setOpenThreads(Array.isArray(res.data?.threads) ? res.data.threads : []);
    } catch (err) {
      if (!background) setInboxError(apiErrorMessage(err));
    }
  }, []);

  const loadClosed = useCallback(async () => {
    try {
      const res = await doctorService.getInbox('closed');
      setClosedThreads(Array.isArray(res.data?.threads) ? res.data.threads : []);
    } catch (err) {
      setInboxError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    loadOpen();
    const interval = window.setInterval(() => loadOpen({ background: true }), 10000);
    return () => window.clearInterval(interval);
  }, [loadOpen]);

  useEffect(() => {
    if (tab === 'closed') loadClosed();
  }, [tab, loadClosed]);

  // A new chat or a new patient message refreshes the list right away.
  useEffect(() => {
    const refresh = () => loadOpen({ background: true });
    const cleanups = ['inbox_updated', 'new_message'].map((eventName) => subscribe(eventName, refresh));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, loadOpen]);

  const list = tab === 'open' ? openThreads : closedThreads;
  const activeItem = (list || []).find((item) => item.id === activeId) || null;
  const isClosedView = activeItem?.status === 'closed';

  // Load the conversation, and stay in its live room while it is open.
  useEffect(() => {
    if (!activeId) return undefined;
    let mounted = true;
    setLoadingThread(true);
    setThreadError('');

    doctorService.getThreadMessages(activeId)
      .then((res) => { if (mounted) setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []); })
      .catch((err) => { if (mounted) { setThreadError(apiErrorMessage(err)); setMessages([]); } })
      .finally(() => { if (mounted) setLoadingThread(false); });

    if (tab !== 'open') return () => { mounted = false; };

    joinThread(activeId);
    const unsubscribe = subscribe('new_message', (msg) => {
      if (msg.threadId !== activeId) return;
      setMessages((current) => (current.some((item) => item.id === msg.id) ? current : [...current, msg]));
      window.setTimeout(() => composeRef.current?.focus(), 0);
    });

    return () => {
      mounted = false;
      leaveThread(activeId);
      unsubscribe();
    };
  }, [activeId, tab, joinThread, leaveThread, subscribe]);

  // After a reconnect, fetch anything missed while offline.
  useEffect(() => {
    if (!activeId || tab !== 'open' || !realtimeConnected || !lastConnectedAt) return undefined;
    let mounted = true;
    doctorService.getThreadMessages(activeId).then((res) => {
      if (!mounted) return;
      setMessages((current) => {
        const next = Array.isArray(res.data?.messages) ? res.data.messages : [];
        const merged = new Map(next.map((item) => [item.id, item]));
        current.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [activeId, tab, realtimeConnected, lastConnectedAt]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    // Chats waiting on you come first, then the most recent activity.
    const sorted = [...(list || [])].sort((a, b) => Number(b.awaitingReply) - Number(a.awaitingReply) || new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
    if (!query) return sorted;
    return sorted.filter((item) => `${item.chatCode || ''} ${item.patientName || ''} ${item.surgeryName || ''}`.toLowerCase().includes(query));
  }, [list, filter]);

  const awaiting = (openThreads || []).filter((item) => item.awaitingReply).length;

  // Messages with a divider before the first one of each day.
  const timeline = useMemo(() => {
    const rows = [];
    let lastDay = '';
    messages.forEach((message) => {
      const label = dayLabel(message.createdAt);
      if (label !== lastDay) { rows.push({ divider: label, key: `d-${message.id}` }); lastDay = label; }
      rows.push({ message, key: message.id });
    });
    return rows;
  }, [messages]);

  function selectTab(next) {
    if (next === tab) return;
    setTab(next);
    setActiveId(null);
    setMessages([]);
    setDraft('');
    setFilter('');
    setNotice('');
  }

  function selectThread(id) {
    if (id === activeId) return;
    setNotice('');
    setThreadError('');
    setMessages([]);
    setDraft('');
    setActiveId(id);
  }

  async function send(e) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || sending || closing || isClosedView) return;
    setSending(true);
    setThreadError('');
    setNotice('');
    try {
      const res = await doctorService.sendThreadMessage(activeId, content);
      const next = res.data?.message;
      if (next) setMessages((current) => (current.some((item) => item.id === next.id) ? current : [...current, next]));
      setDraft('');
      composeRef.current?.focus();
      loadOpen({ background: true });
      announceInboxChange();
    } catch (err) {
      setThreadError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function onComposeKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  function insertQuickReply(text) {
    setDraft((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    composeRef.current?.focus();
  }

  async function closeChat() {
    if (!activeId || closing) return;
    setClosing(true);
    setNotice('');
    try {
      await doctorService.closeThread(activeId);
      const name = activeItem?.patientName || 'the patient';
      setCloseConfirm(false);
      setActiveId(null);
      setMessages([]);
      setDraft('');
      setNotice(`Chat with ${name} was closed and archived.`);
      await loadOpen({ background: true });
      setClosedThreads(null);
      announceInboxChange();
    } catch (err) {
      setThreadError(apiErrorMessage(err));
    } finally {
      setClosing(false);
    }
  }

  if (inboxError && !openThreads) {
    return (
      <DashboardShell>
        <Panel>
          <Alert variant="danger" title="Priority Inbox unavailable">{inboxError}</Alert>
          <div className="mt-4"><Button variant="primary" onClick={() => loadOpen()}>Retry Inbox</Button></div>
        </Panel>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="doctor-inbox-page">
        <GlassLensFilter />
        <PageHeader
          title="Priority Inbox"
          subtitle={openThreads ? (awaiting ? `${awaiting} awaiting your reply · ${openThreads.length} open` : `${openThreads.length} open`) : 'Patient emergency chats'}
        />

        {notice ? <div className="mb-4" role="status" aria-live="polite"><Alert variant="success">{notice}</Alert></div> : null}
        {inboxError && openThreads ? <div className="mb-4" role="status"><Alert variant="warning" title="Inbox refresh failed">{inboxError}</Alert></div> : null}

        <div className={`inbox-layout ${activeId ? 'has-active' : ''}`}>
          <Panel className="inbox-list">
            <div className="admin-chips mb-3" role="tablist" aria-label="Chat status">
              <button type="button" role="tab" aria-selected={tab === 'open'} className={`admin-chip ${tab === 'open' ? 'is-active' : ''}`} onClick={() => selectTab('open')}>
                Open{openThreads ? ` (${openThreads.length})` : ''}
              </button>
              <button type="button" role="tab" aria-selected={tab === 'closed'} className={`admin-chip ${tab === 'closed' ? 'is-active' : ''}`} onClick={() => selectTab('closed')}>Closed</button>
            </div>
            <label className="sr-only" htmlFor="priority-inbox-search">Search chats</label>
            <input id="priority-inbox-search" className="field-input mb-3" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search patient or Chat ID" autoComplete="off" />

            {!list ? (
              <LoadingState label="Loading chats…" />
            ) : list.length === 0 ? (
              <EmptyState title={tab === 'open' ? 'Inbox is empty' : 'No closed chats yet'} subtitle={tab === 'open' ? 'No open chats need your reply right now.' : 'Chats you close are archived here.'} />
            ) : filtered.length === 0 ? (
              <EmptyState title="No chats match your search" subtitle="Try another patient name or Chat ID." />
            ) : (
              <ul className="inbox-rows" role="listbox" aria-label={tab === 'open' ? 'Open chats' : 'Closed chats'}>
                {filtered.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeId === item.id}
                      onClick={() => selectThread(item.id)}
                      className={`inbox-row ${activeId === item.id ? 'is-active' : ''} ${item.awaitingReply ? 'is-waiting' : ''}`}
                    >
                      <span className="inbox-avatar" aria-hidden="true">{(item.patientName || 'P').trim()[0]}</span>
                      <span className="inbox-row-main">
                        <span className="inbox-row-top">
                          <strong>{item.patientName || 'Patient'}</strong>
                          <time dateTime={item.lastActivityAt}>{listTime(item.lastActivityAt)}</time>
                        </span>
                        <span className="inbox-row-preview">
                          {item.lastMessage ? `${item.lastMessage.senderRole === 'doctor' ? 'You: ' : ''}${item.lastMessage.content}` : 'No messages yet'}
                        </span>
                        <span className="inbox-row-foot">
                          <span className="inbox-code">{item.chatCode || 'Chat ID unavailable'}</span>
                          {item.awaitingReply ? <span className="inbox-waiting">Awaiting reply</span> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="inbox-convo">
            {!activeItem && !(activeId && loadingThread) ? (
              <div className="inbox-placeholder">
                <EmptyState title="Select a chat" subtitle="Choose a conversation from the list to read it and reply." />
              </div>
            ) : (
              <div className="inbox-convo-inner">
                <header className="inbox-convo-head">
                  <button type="button" className="inbox-back" onClick={() => setActiveId(null)} aria-label="Back to all chats">
                    <NavIcon name="chevronLeft" size={18} />
                  </button>
                  <span className="inbox-avatar is-large" aria-hidden="true">{(activeItem?.patientName || 'P').trim()[0]}</span>
                  <div className="inbox-convo-title">
                    <h2>{activeItem?.patientName || 'Patient'}</h2>
                    <p>{[activeItem?.surgeryName, activeItem?.chatCode].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="inbox-convo-actions">
                    {activeItem?.patientId ? (
                      <Link to={`/doctor/patients/${activeItem.patientId}`} className="btn btn-outline btn-sm">Patient record</Link>
                    ) : null}
                    {!isClosedView ? <Button variant="ghost" size="sm" onClick={() => setCloseConfirm(true)} disabled={closing || sending}>Close &amp; archive</Button> : null}
                  </div>
                </header>

                {threadError ? <div className="inbox-alert" role="alert"><Alert variant="danger">{threadError}</Alert></div> : null}

                <div className="inbox-messages" aria-label="Conversation" aria-live="polite">
                  {loadingThread ? (
                    <LoadingState label="Loading conversation…" rows={3} />
                  ) : messages.length === 0 ? (
                    <EmptyState title="No messages yet" subtitle="Waiting for the patient's message." />
                  ) : timeline.map((row) => (
                    row.divider ? (
                      <div key={row.key} className="inbox-day"><span>{row.divider}</span></div>
                    ) : (
                      <div key={row.key} className={`inbox-msg ${row.message.senderRole === 'doctor' ? 'is-doctor' : 'is-patient'}`}>
                        <div className="inbox-bubble">
                          <p>{row.message.content}</p>
                          <time dateTime={row.message.createdAt}>{clockTime(row.message.createdAt)}</time>
                        </div>
                      </div>
                    )
                  ))}
                  <div ref={scrollRef} />
                </div>

                {isClosedView ? (
                  <p className="inbox-closed-note">
                    Closed {activeItem.closedAt ? `${dayLabel(activeItem.closedAt)}, ${clockTime(activeItem.closedAt)}` : ''} · archived to the patient's record
                  </p>
                ) : (
                  <form onSubmit={send} className="inbox-compose">
                    <div className="inbox-quick" role="group" aria-label="Quick replies">
                      {QUICK_REPLIES.map((item) => (
                        <button key={item.label} type="button" className="inbox-quick-chip" onClick={() => insertQuickReply(item.text)} disabled={sending || closing}>{item.label}</button>
                      ))}
                    </div>
                    <div className="inbox-compose-row">
                      <label className="sr-only" htmlFor="priority-inbox-reply">Reply to patient</label>
                      <textarea
                        id="priority-inbox-reply"
                        ref={composeRef}
                        className="inbox-input"
                        rows={2}
                        maxLength={2000}
                        placeholder="Write a reply… (Enter to send, Shift+Enter for a new line)"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onComposeKeyDown}
                        disabled={sending || closing}
                      />
                      <Button type="submit" variant="primary" loading={sending} disabled={!draft.trim() || closing}>Send</Button>
                    </div>
                    {draft.length > 1600 ? <p className="field-count">{draft.length}/2000</p> : null}
                  </form>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmModal
        open={closeConfirm}
        title="Close this chat?"
        eyebrow="Archive"
        body="The conversation is archived to the patient's record. If they message again, a new chat starts."
        confirmLabel={closing ? 'Closing…' : 'Close & archive'}
        onConfirm={closeChat}
        onCancel={() => { if (!closing) setCloseConfirm(false); }}
        confirmDisabled={closing}
        tone="info"
        variant="primary"
      />
    </DashboardShell>
  );
}
