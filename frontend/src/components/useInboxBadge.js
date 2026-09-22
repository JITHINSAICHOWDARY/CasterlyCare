import { useCallback, useEffect, useState } from 'react';
import { doctorService } from '../api/services/doctor';
import { useRealtime } from '../context/RealtimeContext';

export const INBOX_CHANGED = 'lc:inbox-changed';

// Number of open Priority Inbox chats waiting for the doctor's reply, kept
// fresh from live events, from the inbox page itself, and a slow poll.
export default function useInboxBadge(enabled) {
  const { subscribe } = useRealtime();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    doctorService
      .getInboxSummary()
      .then((res) => setCount(Number(res.data?.awaitingReply) || 0))
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, 60000);
    const cleanups = ['new_message', 'inbox_updated', 'care_episode_completed'].map((name) => subscribe(name, refresh));
    window.addEventListener(INBOX_CHANGED, refresh);
    return () => {
      clearInterval(timer);
      cleanups.forEach((cleanup) => cleanup());
      window.removeEventListener(INBOX_CHANGED, refresh);
    };
  }, [enabled, refresh, subscribe]);

  return enabled ? count : 0;
}
