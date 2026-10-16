// Sunset-at-sea banner with a yacht silhouette, used on the phone menu and login.
export default function Hero({ line1 = 'From the bridge', line2 = 'to the engine room…', foot = 'It all connects.' }) {
  return (
    <div className="hero" role="img" aria-label={`${line1} ${line2} ${foot}`}>
      <svg className="hero-scene" viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="heroSky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3f6b8f" />
            <stop offset="0.45" stopColor="#c99a6a" />
            <stop offset="0.62" stopColor="#f2c27a" />
            <stop offset="0.63" stopColor="#24435f" />
            <stop offset="1" stopColor="#0f2a42" />
          </linearGradient>
          <radialGradient id="heroSun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fff4d6" />
            <stop offset="0.35" stopColor="#ffd88a" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffb85c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="360" height="170" fill="url(#heroSky)" />
        <circle cx="70" cy="104" r="46" fill="url(#heroSun)" />
        <path d="M0 106 Q40 98 90 104 T190 102 T270 105 L270 107 L0 107 Z" fill="#33506a" opacity="0.8" />
        {/* sun glitter on the water */}
        <g stroke="#ffd88a" strokeLinecap="round" opacity="0.75">
          <path d="M56 114h28" strokeWidth="2" /><path d="M50 122h38" strokeWidth="1.6" />
          <path d="M60 131h20" strokeWidth="1.4" /><path d="M46 140h44" strokeWidth="1.2" opacity="0.6" />
          <path d="M58 151h24" strokeWidth="1" opacity="0.5" />
        </g>
        {/* yacht at anchor */}
        <g fill="#0d2238">
          <path d="M196 108 L338 96 C332 106 318 112 300 113 L210 116 C204 116 199 113 196 108 Z" />
          <path d="M222 101 L318 94 L302 84 C280 82 254 84 238 89 Z" />
          <path d="M244 89 L298 85 L284 75 C272 74 260 76 252 79 Z" />
          <path d="M265 76 L270 65 L274 65 L271 75 Z" />
        </g>
        <g stroke="#f6d59a" strokeWidth="1.4" opacity="0.85">
          <path d="M232 98 L306 93" /><path d="M252 86 L290 83" />
        </g>
        <path d="M200 120 Q260 116 330 112" stroke="#f2c27a" strokeWidth="1" opacity="0.4" fill="none" />
      </svg>
      <div className="hero-text">
        <span className="hero-script">{line1}<br />{line2}</span>
        <span className="hero-foot">{foot}</span>
      </div>
    </div>
  );
}
