'use client';

import { useEffect, useState } from 'react';

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Day / night switch (night is the default). Remembered in a cookie so the server renders the right theme. */
export function ThemeToggle() {
  const [night, setNight] = useState(true);

  useEffect(() => {
    setNight(document.documentElement.classList.contains('night'));
  }, []);

  function toggle() {
    const next = !night;
    setNight(next);
    document.documentElement.classList.toggle('night', next);
    document.cookie = `theme=${next ? 'night' : 'day'}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={toggle}
      aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
      title={night ? 'Day mode' : 'Night mode'}
    >
      {night ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
