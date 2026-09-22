import glassMap from '../assets/glass-map.png?inline';

// The edge-bending lens the liquid-glass headers reference through
// `backdrop-filter: url(#lens-glass)` (see the doctor page headers in index.css).
export default function GlassLensFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <filter id="lens-glass" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={glassMap} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="30" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
