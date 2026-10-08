'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { signOutAction } from '@/lib/actions';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  match?: string[];
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const isOn = (it: NavItem) =>
    (it.match ?? [it.href]).some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(m + '/')));

  return (
    <nav className={`side${open ? ' open' : ''}`} aria-label="Main">
      <div className="brand">
        <Link href="/" className="brand-link">
          <span className="brand-mark"><Icon name="logo" size={20} /></span>
          TEAM TASKS
        </Link>
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
        {items.map((it) => (
          <Link key={it.href} href={it.href} className={`nav${isOn(it) ? ' on' : ''}`} aria-current={isOn(it) ? 'page' : undefined}>
            <span className="nav-icon"><Icon name={it.icon} />{it.label}</span>
            {it.count ? <span className="cnt">{it.count}</span> : null}
          </Link>
        ))}
      </div>

      <div className="side-foot">
        <form action={signOutAction}>
          <button type="submit" className="nav"><span className="nav-icon"><Icon name="logout" />Sign out</span></button>
        </form>
      </div>
    </nav>
  );
}
