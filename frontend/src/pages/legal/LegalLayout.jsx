import { Link } from 'react-router-dom';
import lionMark from '../../assets/lion-mark.png';
import { siteInfo } from '../../config/siteInfo';

// Shared frame for the public Privacy, Terms and Contact pages.
export default function LegalLayout({ title, updated = true, updatedLabel = 'Last updated', children }) {
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <Link to="/" className="legal-brand" aria-label={`${siteInfo.brand} home`}>
          <img src={lionMark} alt="" aria-hidden="true" />
          <span className="font-display">Casterly<em>Care</em></span>
        </Link>
        <nav className="legal-nav" aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/contact">Contact</Link>
        </nav>
      </header>

      <main className="legal-card">
        <h1 className="font-display">{title}</h1>
        {updated ? <p className="legal-updated">{updatedLabel} {siteInfo.updated}</p> : null}
        {children}
      </main>

      <footer className="legal-footer">
        <span>&copy; {new Date().getFullYear()} {siteInfo.legalName}</span>
      </footer>
    </div>
  );
}
