// Line icons for the phone menu. All drawn on a 24x24 grid with currentColor strokes.
const P = {
  gauge: <><path d="M4.5 17a8.5 8.5 0 1 1 15 0" /><path d="M12 13.5l4-4" /><circle cx="12" cy="14" r="1.3" /><path d="M7 11.5l-1-.6M12 7.5V6.3M17 11.5l1-.6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" /></>,
  check: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 12.3l2.7 2.7L16.5 9" /></>,
  crew: <><circle cx="12" cy="8" r="3" /><path d="M6.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M1.8 18a3.8 3.8 0 0 1 4-3.6M22.2 18a3.8 3.8 0 0 0-4-3.6" /></>,
  yacht: <><path d="M2.5 16.5h19l-2.2 3H5z" /><path d="M5.5 16.5l2-3.5h9.5l2.5 3.5" /><path d="M9 13l1.5-2.5h5l1.5 2.5" /><path d="M12.5 10.5V8" /></>,
  star: <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6z" /><path d="M8.8 12l2.2 2.2 4.3-4.4" /></>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.2 5.2L4 17l3 3 5.5-5.5a4 4 0 0 0 5.2-5.2l-2.4 2.4-2.6-.4-.4-2.6z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  logout: <><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
};

export default function Icon({ name, className = '' }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name] || P.chevron}
    </svg>
  );
}
