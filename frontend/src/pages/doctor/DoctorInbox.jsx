// Phase 2.11.12 — Doctor Priority Inbox & temporary emergency chat UX
import { doctorService } from '../../api/services/doctor';
import { apiErrorMessage } from '../../api/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DoctorDashboardShell as DashboardShell } from '../../components/RoleDashboardShell';
import { Panel, Button, Badge, EmptyState, LoadingState, Alert, ConfirmModal } from '../../components/ui';
import { useRealtime } from '../../context/RealtimeContext';

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

export default function DoctorInbox() {
  const [threads, setThreads] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [filter, setFilter] = useState('');
  const scrollRef = useRef(null);
  const composeRef = useRef(null);
  const { status: realtimeStatus, isConnected: realtimeConnected, lastConnectedAt, subscribe, joinThread, leaveThread } = useRealtime();

  const loadThreads = useCallback(async ({ background = false } = {}) => {
    try {
      if (background) setRefreshing(true);
      else setInboxError('');
      const res = await doctorService.getInbox();
      setThreads(Array.isArray(res.data?.threads) ? res.data.threads : []);
      if (!background) setInboxError('');
    } catch (err) {
      if (!background) setInboxError(apiErrorMessage(err));
      else setActionMessage(`Inbox refresh failed: ${apiErrorMessage(err)}`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
    const interval = window.setInterval(() => loadThreads({ background: true }), 10000);
    return () => window.clearInterval(interval);
  }, [loadThreads]);

  useEffect(() => {
    if (!activeId) return undefined;
    let mounted = true;
    setLoadingThread(true);
    setThreadError('');

    const loadActiveThread = () => doctorService.getThreadMessages(activeId)
      .then((res) => {
        if (!mounted) return;
        setThread(res.data?.thread || null);
        setMessages(Array.isArray(res.data?.messages) ? res.data.messages : []);
      })
      .catch((err) => {
        if (!mounted) return;
        setThreadError(apiErrorMessage(err));
        setThread(null);
        setMessages([]);
      })
      .finally(() => {
        if (mounted) setLoadingThread(false);
      });

    loadActiveThread();
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
  }, [activeId, joinThread, leaveThread, subscribe]);

  useEffect(() => {
    if (!activeId || !realtimeConnected || !lastConnectedAt) return;
    let mounted = true;
    doctorService.getThreadMessages(activeId).then((res) => {
      if (!mounted) return;
      setThread(res.data?.thread || null);
      setMessages((current) => {
        const next = Array.isArray(res.data?.messages) ? res.data.messages : [];
        const merged = new Map(next.map((item) => [item.id, item]));
        current.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [activeId, realtimeConnected, lastConnectedAt]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const filteredThreads = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return threads || [];
    return (threads || []).filter((item) => `${item.chatCode || ''} ${item.patientName || ''}`.toLowerCase().includes(query));
  }, [threads, filter]);

  async function send(e) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeId || sending || closing) return;
    setSending(true);
    setThreadError('');
    setActionMessage(realtimeStatus !== 'connected' ? 'Live chat is reconnecting. Your message will still be sent through the secure chat service; live updates may arrive after reconnection.' : '');
    try {
      const res = await doctorService.sendThreadMessage(activeId, content);
      const next = res.data?.message;
      if (next) setMessages((current) => (current.some((item) => item.id === next.id) ? current : [...current, next]));
      setDraft('');
      composeRef.current?.focus();
    } catch (err) {
      setThreadError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function closeChat() {
    if (!activeId || closing) return;
    setClosing(true);
    setActionMessage('');
    try {
      await doctorService.closeThread(activeId);
      const closedId = activeId;
      setCloseConfirm(false);
      setActiveId(null);
      setThread(null);
      setMessages([]);
      setDraft('');
      setActionMessage(`Chat ${thread?.chatCode || closedId} was closed and archived.`);
      await loadThreads({ background: true });
    } catch (err) {
      setThreadError(apiErrorMessage(err));
    } finally {
      setClosing(false);
    }
  }

  function selectThread(id) {
    if (id === activeId) return;
    setActionMessage('');
    setThreadError('');
    setMessages([]);
    setThread(null);
    setDraft('');
    setActiveId(id);
  }

  if (inboxError && !threads) {
    return (
      <DashboardShell>
        <Panel>
          <Alert variant="danger" title="Priority Inbox unavailable">{inboxError}</Alert>
          <div className="mt-4 flex gap-2 flex-wrap">
            <Button variant="primary" onClick={() => loadThreads()}>Retry Inbox</Button>
          </div>
        </Panel>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="doctor-inbox-page">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="eyebrow text-[var(--color-gold)] mb-1">Temporary patient queries</p>
            <h1 className="font-display text-3xl lg:text-4xl text-[var(--color-ink)]">Priority Inbox</h1>
            <p className="text-sm text-[var(--color-text-soft)] mt-1.5 max-w-3xl">
              Emergency Chat creates a temporary Chat ID for each open query. Reply while the query is active; closing it archives the conversation to the patient record.
            </p>
          </div>
          <Button variant="outline" onClick={() => loadThreads({ background: true })} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh Inbox'}
          </Button>
        </div>

        {actionMessage ? <div className="mb-5" role="status" aria-live="polite"><Alert variant="success">{actionMessage}</Alert></div> : null}
        {realtimeStatus !== 'connected' ? <div className="mb-5" role="status" aria-live="polite"><Alert variant="warning" title="Live connection unavailable">Live chat updates may be delayed while the connection is {realtimeStatus === 'connecting' ? 'reconnecting' : 'offline'}. Refreshing the thread after reconnection will restore missed messages.</Alert></div> : null}
        {inboxError && threads ? <div className="mb-5" role="status" aria-live="polite"><Alert variant="warning" title="Inbox refresh failed">{inboxError}</Alert></div> : null}

        <div className="doctor-inbox-layout">
          <Panel title="Open Priority Chats" subtitle={`${filteredThreads.length} of ${(threads || []).length} active queries`} className="doctor-inbox-list !p-0 overflow-hidden">
            <div className="p-4 border-b border-[var(--color-line)]">
              <label className="sr-only" htmlFor="priority-inbox-search">Search open chats</label>
              <input
                id="priority-inbox-search"
                className="field-input"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search patient or Chat ID…"
                autoComplete="off"
              />
            </div>
            {!threads ? (
              <LoadingState label="Loading priority inbox…" />
            ) : threads.length === 0 ? (
              <EmptyState title="Inbox is empty" subtitle="No open Emergency Chat queries require your response right now." />
            ) : filteredThreads.length === 0 ? (
              <EmptyState title="No chats match your search" subtitle="Try another patient name or Chat ID." />
            ) : (
              <div className="divide-y divide-[var(--color-line)]" role="listbox" aria-label="Open priority chats">
                {filteredThreads.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={activeId === item.id}
                    onClick={() => selectThread(item.id)}
                    className={`doctor-inbox-thread-item w-full text-left p-4 hover:bg-[var(--color-parchment-deep)] ${activeId === item.id ? 'is-active bg-[var(--color-parchment-deep)]' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Badge variant="gold">{item.chatCode || 'Chat ID unavailable'}</Badge>
                      <span className="text-[0.68rem] text-[var(--color-text-soft)]">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <p className="font-semibold text-sm text-[var(--color-ink)] break-words">{item.patientName || 'Patient'}</p>
                    <p className="text-xs text-[var(--color-text-soft)] mt-1">Temporary emergency query</p>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="doctor-inbox-conversation !p-0 overflow-hidden">
            {!activeId ? (
              <div className="flex min-h-[28rem] items-center justify-center p-8">
                <EmptyState title="Select an open chat" subtitle="Choose a temporary Chat ID from the Priority Inbox to review the patient’s message and reply." />
              </div>
            ) : loadingThread ? (
              <LoadingState label="Loading conversation…" />
            ) : threadError && !thread ? (
              <div className="p-5">
                <Alert variant="danger" title="Conversation unavailable">{threadError}</Alert>
                <div className="mt-4"><Button variant="outline" onClick={() => selectThread(activeId)}>Retry conversation</Button></div>
              </div>
            ) : (
              <div className="doctor-inbox-conversation-inner">
                <header className="doctor-inbox-conversation-header">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="gold">{thread?.chatCode || 'Chat ID unavailable'}</Badge>
                      <Badge variant="forest">Open</Badge>
                    </div>
                    <h2 className="font-display text-xl text-[var(--color-ink)] mt-2 truncate">Emergency Chat</h2>
                    <p className="text-xs text-[var(--color-text-soft)] mt-1">Temporary query · reply remains available until closed</p>
                  </div>
                  <Button variant="outline" onClick={() => setCloseConfirm(true)} disabled={closing || sending}>
                    {closing ? 'Closing…' : 'Close & Archive'}
                  </Button>
                </header>

                <div className="doctor-inbox-status-row" role="status" aria-live="polite">
                  <span>{realtimeStatus === 'connected' ? 'Live connection active' : realtimeStatus === 'offline' ? 'Live connection unavailable · refresh to check for new messages' : 'Connecting to live updates…'}</span>
                  <span>{messages.length} message{messages.length === 1 ? '' : 's'}</span>
                </div>

                {threadError ? <div className="px-4 pt-4" role="alert"><Alert variant="danger">{threadError}</Alert></div> : null}

                <div className="doctor-inbox-messages" aria-label="Conversation messages" aria-live="polite">
                  {messages.length === 0 ? (
                    <EmptyState title="No messages yet" subtitle="The conversation is open. Await the patient’s message or send a reply when appropriate." />
                  ) : messages.map((message) => (
                    <div key={message.id} className={`doctor-inbox-message-row ${message.senderRole === 'doctor' ? 'is-doctor' : 'is-patient'}`}>
                      <div className={`doctor-inbox-message ${message.senderRole === 'doctor' ? 'is-doctor' : 'is-patient'}`}>
                        <span className="doctor-inbox-message-sender">{message.senderRole === 'doctor' ? 'You' : 'Patient'}</span>
                        <span>{message.content}</span>
                        <span className="doctor-inbox-message-time">{formatDateTime(message.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                  <div ref={scrollRef} />
                </div>

                <form onSubmit={send} className="doctor-inbox-compose">
                  <label className="sr-only" htmlFor="priority-inbox-reply">Reply to patient</label>
                  <textarea
                    id="priority-inbox-reply"
                    ref={composeRef}
                    className="field-input resize-none"
                    rows={2}
                    maxLength={2000}
                    placeholder="Reply to patient…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={sending || closing}
                  />
                  <div className="flex items-center justify-between gap-3 mt-2">
                    <span className="text-[0.68rem] text-[var(--color-text-soft)]">{draft.length}/2000</span>
                    <Button type="submit" variant="primary" loading={sending} disabled={!draft.trim() || closing}>
                      {sending ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <ConfirmModal
        open={closeConfirm}
        title="Close this temporary chat?"
        eyebrow="Archive completed query"
        body="Closing this Emergency Chat ends the active query and archives the conversation to the patient record. A future emergency question will receive a new Chat ID."
        confirmLabel={closing ? 'Closing…' : 'Close & Archive'}
        onConfirm={closeChat}
        onCancel={() => { if (!closing) setCloseConfirm(false); }}
        confirmDisabled={closing}
      />
    </DashboardShell>
  );
}
