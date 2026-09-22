// The site's one loading animation (Uiverse.io "wheel and hamster" loader,
// by Nawsome) — used everywhere something needs a loading indicator instead
// of a plain spinner. `size` scales the whole thing via font-size (see the
// CSS custom property `--dur`/em-based sizing in index.css).
export default function HamsterLoader({ label = 'Loading…', size = 'md' }) {
  return (
    <div className={`wheel-and-hamster wheel-and-hamster--${size}`} role="status" aria-live="polite">
      <div className="wheel" />
      <div className="hamster">
        <div className="hamster__body">
          <div className="hamster__head">
            <div className="hamster__ear" />
            <div className="hamster__eye" />
            <div className="hamster__nose" />
          </div>
          <div className="hamster__limb hamster__limb--fr" />
          <div className="hamster__limb hamster__limb--fl" />
          <div className="hamster__limb hamster__limb--br" />
          <div className="hamster__limb hamster__limb--bl" />
          <div className="hamster__tail" />
        </div>
      </div>
      <div className="spoke" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
