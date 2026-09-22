import lionMark from '../assets/lion-mark.png';
import HamsterLoader from './HamsterLoader';

// Full-screen loader for the moments before a page can render (session
// restore). Replaces the blank flash / plain text.
export default function PageLoader({ label = 'Loading CasterlyCare' }) {
  return (
    <div className="page-loader">
      <img src={lionMark} alt="" className="page-loader-logo" aria-hidden="true" />
      <HamsterLoader size="md" label={label} />
    </div>
  );
}
