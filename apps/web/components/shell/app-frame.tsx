'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Icon, IconButton, cx } from '@/components/ui/core';
import { EnvBadge, ToastProvider } from '@/components/ui/feedback';
import { useApi } from '@/lib/api';

interface NavEntry {
  label: string;
  href: string;
  icon: string;
  count?: number;
}

interface NavGroup {
  label: string;
  icon: string;
  children: NavEntry[];
}

const GROUP_STORAGE = 'mao-nav-config';

function NavItem({ item, collapsed, active }: { item: NavEntry; collapsed: boolean; active: boolean }) {
  return (
    <Link className="fk-nav__item" href={item.href} aria-current={active ? 'page' : undefined} title={collapsed ? item.label : undefined}>
      <Icon name={item.icon} size={20} />
      <span className="fk-nav__label">{item.label}</span>
      {item.count !== undefined && item.count > 0 && <span className="fk-nav__count">{item.count}</span>}
    </Link>
  );
}

/**
 * Ítem padre desplegable del Sidebar del design system (máximo dos niveles): se abre solo si la página activa es
 * un hijo y recuerda si lo dejaste abierto. Cerrado, muestra la suma de contadores de los hijos para no ocultar
 * pendientes. Con el menú colapsado (solo íconos) los hijos no se ven: el clic expande el menú y abre el grupo.
 */
function NavGroupItem({ group, collapsed, activeHref, onExpandSidebar }: { group: NavGroup; collapsed: boolean; activeHref: string | undefined; onExpandSidebar: () => void }) {
  const id = useId();
  const childActive = group.children.some((c) => c.href === activeHref);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(GROUP_STORAGE) === 'open') setOpen(true);
    } catch {
      /* sin almacenamiento: cerrado por defecto */
    }
  }, []);
  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);
  const persist = (v: boolean) => {
    try {
      localStorage.setItem(GROUP_STORAGE, v ? 'open' : 'closed');
    } catch {
      /* preferencia no persistida */
    }
  };
  const toggle = () => {
    if (collapsed) {
      onExpandSidebar();
      setOpen(true);
      persist(true);
      return;
    }
    persist(!open);
    setOpen(!open);
  };
  const total = group.children.reduce((n, c) => n + (c.count ?? 0), 0);
  const expanded = open && !collapsed;
  return (
    <>
      <button
        type="button"
        className="fk-nav__item"
        aria-expanded={expanded}
        aria-controls={id}
        data-child-active={childActive || undefined}
        title={collapsed ? group.label : undefined}
        onClick={toggle}
      >
        <Icon name={group.icon} size={20} />
        <span className="fk-nav__label">{group.label}</span>
        {!expanded && total > 0 && <span className="fk-nav__count">{total}</span>}
        <Icon name="chevron-right" size={16} className="fk-nav__chev" />
      </button>
      {expanded && (
        <div id={id} className="fk-nav__children">
          {group.children.map((c) => (
            <NavItem key={c.href} item={c} collapsed={collapsed} active={c.href === activeHref} />
          ))}
        </div>
      )}
    </>
  );
}

/** Shell de la app: header de marca, navegación lateral colapsable, contenido y pie. */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const { data: dash } = useApi<{ counts: Record<string, number> }>('/dashboard', { refreshMs: 10_000 });
  const c = dash?.counts ?? {};

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light');
    try {
      setCollapsed(localStorage.getItem('mao-sidebar') === 'collapsed');
    } catch {
      /* sin almacenamiento: valores por defecto */
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('mao-theme', next);
    } catch {
      /* preferencia no persistida */
    }
  };
  const expandSidebar = () => {
    setCollapsed(false);
    try {
      localStorage.setItem('mao-sidebar', 'expanded');
    } catch {
      /* preferencia no persistida */
    }
  };
  const toggleSidebar = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem('mao-sidebar', v ? 'expanded' : 'collapsed');
      } catch {
        /* preferencia no persistida */
      }
      return !v;
    });
  };

  // Arriba, solo la operación diaria de un usuario; todo lo de configuración y gobierno va al grupo del pie.
  const sections: { label?: string; items: NavEntry[] }[] = [
    { items: [{ label: 'Inicio', href: '/', icon: 'home' }] },
    {
      label: 'Operación',
      items: [
        { label: 'Backlog de Jira', href: '/backlog', icon: 'kanban' },
        { label: 'Nueva ejecución', href: '/executions/new', icon: 'plus' },
        { label: 'Ejecuciones', href: '/executions', icon: 'zap', count: c.active },
        { label: 'Aprobaciones', href: '/approvals', icon: 'shield', count: c.pendingApprovals },
      ],
    },
  ];
  const config: NavGroup = {
    label: 'Configuración',
    icon: 'settings',
    children: [
      { label: 'Proyectos', href: '/projects', icon: 'folder' },
      { label: 'Agentes', href: '/agents', icon: 'users' },
      { label: 'Orquestadores', href: '/orchestrators', icon: 'git-branch' },
      { label: 'Skills', href: '/skills', icon: 'layers' },
      { label: 'Archivos', href: '/files', icon: 'file' },
      { label: 'Propuestas', href: '/proposals', icon: 'sparkles', count: c.proposals },
      { label: 'Auditoría', href: '/audit', icon: 'list' },
      { label: 'Consumo de IA', href: '/usage', icon: 'bar-chart' },
      { label: 'Ajustes generales', href: '/settings', icon: 'sliders' },
    ],
  };
  // Un solo ítem activo: el de ruta más específica (así /executions/new no marca también Ejecuciones).
  const activeHref = [...sections.flatMap((s) => s.items), ...config.children]
    .map((i) => i.href)
    .filter((h) => (h === '/' ? pathname === '/' : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <ToastProvider>
      <div className="fk-shell fk-shell--fixed mao-shell">
        <div className="fk-shell__top">
          <header className="fk-topbar">
            <IconButton icon="menu" label={collapsed ? 'Expandir menú' : 'Colapsar menú'} variant="inverse" onClick={toggleSidebar} />
            <Link className="fk-topbar__brand" href="/" aria-label="Inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="fk-topbar__logo" src="/flock-logo.png" alt="Flock" />
              <span className="fk-topbar__product">Orchestration Studio</span>
            </Link>
            <EnvBadge env="dev" />
            <div className="fk-topbar__center" />
            <div className="fk-topbar__actions">
              <Link href="/approvals" className="fk-iconbtn fk-iconbtn--inverse" aria-label={`Aprobaciones pendientes: ${c.pendingApprovals ?? 0}`} title="Aprobaciones pendientes">
                <Icon name="bell" size={20} />
                {(c.pendingApprovals ?? 0) > 0 && <span className="fk-iconbtn__badge">{c.pendingApprovals}</span>}
              </Link>
              <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} variant="inverse" onClick={toggleTheme} />
            </div>
          </header>
        </div>
        <div className="fk-shell__side">
          <nav className={cx('fk-sidebar', collapsed && 'fk-sidebar--collapsed')} aria-label="Navegación principal">
            {sections.map((s, i) => (
              <div key={i} style={{ display: 'contents' }}>
                {s.label && <div className="fk-sidebar__section">{s.label}</div>}
                {s.items.map((it) => (
                  <NavItem key={it.href} item={it} collapsed={collapsed} active={it.href === activeHref} />
                ))}
              </div>
            ))}
            <div className="fk-sidebar__foot">
              <NavGroupItem group={config} collapsed={collapsed} activeHref={activeHref} onExpandSidebar={expandSidebar} />
            </div>
          </nav>
        </div>
        <main className="fk-shell__main">{children}</main>
        <div className="fk-shell__foot">
          <footer className="fk-appfoot">
            <span>Multi-Agent Orchestration Studio</span>
            <span className="fk-appfoot__sep" />
            <span className="fk-mono" style={{ fontSize: 12 }}>
              v0.1.0
            </span>
            <span className="fk-appfoot__sep" />
            <span>Solo loopback · propietario único</span>
            <span className="fk-appfoot__links">
              <Link href="/settings">Estado de servicios</Link>
            </span>
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
