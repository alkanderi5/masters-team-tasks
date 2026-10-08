'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import { signOutAction } from '@/lib/actions';

export interface NavItem {
  href: string;
  label: string;
  count?: number;
  match?: string[];
}

export function Sidebar({ items, userLine }: { items: NavItem[]; userLine: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isOn = (it: NavItem) =>
    (it.match ?? [it.href]).some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(m + '/')));

  return (
    <nav className={`side${open ? ' open' : ''}`} aria-label="Main">
      <div className="brand">
        <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Team Tasks</Link>
        <button
          type="button"
          className="btn sm menu-btn"
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      <div className="nav-links" id="nav-links">
        <form action="/search" className="field" style={{ padding: '0 2px 10px' }} role="search">
          <label htmlFor="global-q" className="sr-only">Search tasks and employees</label>
          <input id="global-q" name="q" type="search" className="input" placeholder="Search…" />
        </form>
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={`nav${isOn(it) ? ' on' : ''}`} aria-current={isOn(it) ? 'page' : undefined}>
            {it.label}
            {it.count ? <span className="cnt">{it.count}</span> : null}
          </Link>
        ))}
      </div>

      <div className="side-foot">
        <ThemeToggle />
        <form action={signOutAction}>
          <button type="submit" className="nav">Sign out</button>
        </form>
        <div className="side-user">{userLine}</div>
      </div>
    </nav>
  );
}
