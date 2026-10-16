// CJM Marine wordmark: yacht silhouette over a gold swoosh, "CJM" + gold "MARINE", tagline.
export function YachtMark({ className = '' }) {
  return (
    <svg className={`yacht-mark ${className}`} viewBox="0 0 220 72" aria-hidden="true">
      <defs>
        <linearGradient id="cjmGold" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8a6424" />
          <stop offset="0.45" stopColor="#e2bd6c" />
          <stop offset="1" stopColor="#a87a2f" />
        </linearGradient>
      </defs>
      {/* gold swoosh */}
      <path d="M6 64 C70 60 140 50 214 30 C150 56 80 68 6 68 Z" fill="url(#cjmGold)" />
      {/* hull */}
      <path className="ym-hull" d="M22 54 L206 33 C196 44 176 50 150 52 L40 59 C32 59 26 57 22 54 Z" />
      {/* main deck */}
      <path className="ym-hull" d="M56 46 L170 35 L150 25 C120 23 92 25 74 30 Z" />
      {/* flybridge */}
      <path className="ym-hull" d="M84 30 L146 25 L128 15 C114 14 100 16 92 20 Z" />
      {/* radar arch and mast */}
      <path className="ym-hull" d="M106 16 L112 6 L116 6 L113 15 Z" />
      <rect className="ym-hull" x="108" y="3" width="14" height="2.4" rx="1.2" />
      {/* window strips */}
      <path className="ym-glass" d="M70 41 L156 34" />
      <path className="ym-glass" d="M96 26 L136 23" />
      <path className="ym-glass thin" d="M40 53 L190 37" />
    </svg>
  );
}

export default function Logo({ variant = 'dark', size = 'md', tagline = true }) {
  return (
    <div className={`logo logo-${variant} logo-${size}`}>
      <YachtMark />
      <div className="logo-word"><span className="lw-cjm">CJM</span><span className="lw-marine">Marine</span></div>
      {tagline && <div className="logo-tag">Yacht maintenance &amp; crew</div>}
    </div>
  );
}
