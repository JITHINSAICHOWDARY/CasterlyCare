import { useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'lc_cookie_notice';

function alreadyAcknowledged() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

// CasterlyCare only stores what is needed to keep you signed in and remember
// small preferences, so this is a notice, not a consent form. If analytics or
// ads are ever added, this needs Accept / Reject and must gate those scripts.
export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !alreadyAcknowledged());

  if (!visible) return null;

  function acknowledge() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // The banner still closes for this visit if storage is unavailable.
    }
    setVisible(false);
  }

  return (
    <div className="cookie-banner" role="region" aria-label="Cookie notice">
      <p className="cookie-banner-text">
        We use only essential storage to keep you signed in and remember your preferences. No advertising or analytics.{' '}
        <Link to="/privacy">Privacy Policy</Link>
      </p>
      <button type="button" className="btn btn-primary btn-sm" onClick={acknowledge}>Got it</button>
    </div>
  );
}
