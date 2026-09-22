import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const VOLUME = 0.25;
const LOGGED_OUT_TRACK = '/audio/gotn.mp3';
const LOGGED_IN_TRACK = '/audio/got.mp3';

export default function MusicPlayer() {
  const { user } = useAuth();
  const track = user ? LOGGED_IN_TRACK : LOGGED_OUT_TRACK;
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(true);

  // Forces muted before the very first play() call below (declared first,
  // so it runs first): the browser blocks an unmuted autoplay attempt, and
  // this only needs to hold for that initial mount — later toggles are the
  // muted-effect's job, and the muted property persists across src changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = true;
  }, []);

  // Re-runs on every login/logout (track change) as well as on mount, since
  // changing an <audio> element's src resets playback and needs a fresh
  // play() call — muted/volume properties themselves persist across that.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = VOLUME;
    audio.play().catch(() => {});
  }, [track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    // Autoplay can be blocked on load; unmuting is a click, so start it here.
    if (!muted) audio.play().catch(() => {});
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleVisibility = () => {
      if (document.hidden) audio.pause();
      else audio.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <div className="music-player fixed bottom-6 left-6 z-50">
      <audio ref={audioRef} src={track} loop />
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? 'Unmute music' : 'Mute music'}
        className="music-toggle"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5z" />
          {muted ? (
            <path d="m22 9-6 6M16 9l6 6" />
          ) : (
            <>
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 5a9 9 0 0 1 0 14" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
