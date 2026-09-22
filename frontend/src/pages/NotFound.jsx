import { Link } from 'react-router-dom';
import gotGif from '../assets/gotgif.gif';
import CloudSky from './auth/CloudSky';

// .login-shell centers its single child both ways; .signup-shell opts it out
// of the login page's right-pinned layout (there's no skeleton here to clear).
export default function NotFound() {
  return (
    <main className="login-shell signup-shell">
      <CloudSky style={{ position: 'absolute', inset: 0 }} />
      <div className="login-content">
        <div className="login-card login-card-enter text-center">
          <img
            src={gotGif}
            alt="Animated clip of a man seated in a great hall, looking on"
            width={196}
            height={188}
            className="mx-auto block h-auto w-60 max-w-full rounded-xl shadow-lg"
          />
          {/* Inline on purpose: the global unlayered h1 rule (font-size, margin 0) beats Tailwind's size and margin utilities. */}
          <h1 style={{ marginTop: '1.5rem', fontSize: '1.6rem' }}>We will be right back</h1>
          <p className="mt-2 text-sm text-[var(--color-text-soft)]">404 · This page could not be found.</p>
          <Link to="/" className="btn btn-outline btn-sm mt-6">Take me home</Link>
        </div>
      </div>
    </main>
  );
}
