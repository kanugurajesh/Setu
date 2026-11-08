const P: Record<string, string> = {
  sunrise: "M3 18h18M7 18a5 5 0 0 1 10 0M12 6v3M5.6 10.6l1.8 1.8M18.4 10.6l-1.8 1.8",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  stop: "M7 7h10v10H7z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
  check: "M5 12.5l4.5 4.5L19 7",
  alert: "M12 3l10 18H2zM12 10v4M12 17.5v.5",
  water: "M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z",
  walk: "M13 2.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM10 21l2-6 3 3v3M12 15l-1-5 4 2 2 3M11 10l-3 2-1 3",
  food: "M3 12h18a9 9 0 0 1-18 0zM8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5",
  sleep: "M18 15.5A7 7 0 1 1 8.5 6a5.5 5.5 0 0 0 9.5 9.5zM15 3h4l-4 4h4",
  breath: "M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7",
  medicine: "M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7zM7 10l7 7",
  hygiene: "M7 14a3 3 0 0 0 6 0c0-2-3-5-3-5s-3 3-3 5zM15 9a2 2 0 0 0 4 0c0-1.4-2-3.5-2-3.5S15 7.6 15 9z",
  rest: "M3 18v-9M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 9.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  family: "M8 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM16 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 20v-2a5 5 0 0 1 10 0v2M11 20v-2a5 5 0 0 1 10 0v2",
  salt: "M8 9h8l-1 12H9zM9 9V6a3 3 0 0 1 6 0v3M11 5.5h.01M13 5.5h.01",
  no_smoking: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8M7 12.5h6",
  speaker: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  copy: "M9 9h11v11H9zM5 15V5a2 2 0 0 1 2-2h8",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  refresh: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5",
  x: "M6 6l12 12M18 6L6 18",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  quote: "M7 7h4v4c0 3-2 5-4 6M14 7h4v4c0 3-2 5-4 6",
  stethoscope: "M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-2M20 10.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z",
  clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12h8M8 16h5",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  heart: "M12 20s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.5-8 11-8 11z",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, className, label }: { name: IconName | string; size?: number; className?: string; label?: string }) {
  const d = P[name] ?? P.heart;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} />
    </svg>
  );
}

/** The Setu mark: a bridge arc from Care blue to Thrive orange. */
export function SetuMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="setu-g" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#1d5f99" />
          <stop offset="1" stopColor="#f0913f" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#0e2c4a" />
      <path d="M7 27c4-11 22-11 26 0" fill="none" stroke="url(#setu-g)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M7 27h26M13 27v-5.2M20 27v-7.4M27 27v-5.2" stroke="#ffffff" strokeOpacity=".85" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
