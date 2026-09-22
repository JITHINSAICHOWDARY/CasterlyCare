import { Link } from 'react-router-dom';
import { siteInfo } from '../config/siteInfo';

// Shown at the bottom of each role's Home page.
export default function LegalFooter() {
  return (
    <footer className="app-footer">
      <nav className="app-footer-links" aria-label="Legal">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms &amp; Conditions</Link>
        <Link to="/contact">Contact</Link>
      </nav>
      <p>&copy; {new Date().getFullYear()} {siteInfo.legalName} · {siteInfo.brand}</p>
    </footer>
  );
}
