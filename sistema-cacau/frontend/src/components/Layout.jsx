import React, { memo, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, Users, FileBarChart2, LayoutDashboard } from 'lucide-react';
import SidebarMetrics from './SidebarMetrics';

const BASE_STYLES = {
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: '#0f172a',
  },
  sidebar: {
    width: '270px',
    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '6px 0 24px rgba(15, 23, 42, 0.10)',
    zIndex: 10,
    borderRight: '1px solid rgba(255,255,255,0.04)',
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: '24px 22px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  logoBox: {
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    padding: '8px',
    borderRadius: '10px',
    boxShadow: '0 8px 20px rgba(59, 130, 246, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '800',
    letterSpacing: '0.4px',
    color: '#f8fafc',
    margin: 0,
    lineHeight: 1.1,
  },
  subtitle: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: 0,
    lineHeight: 1.4,
  },
  nav: {
    flex: 1,
    padding: '18px 12px',
    overflowY: 'auto',
  },
  sectionLabel: {
    display: 'block',
    color: '#64748b',
    fontSize: '11px',
    fontWeight: '800',
    marginBottom: '12px',
    paddingLeft: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  navGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  metricsContainer: {
    padding: '14px 12px 18px 12px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(4px)',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
    position: 'relative',
    minWidth: 0,
  },
  contentWrapper: {
    maxWidth: '1280px',
    margin: '0 auto',
  },
};

const getLinkStyle = (isActive) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '13px 14px',
  borderRadius: '12px',
  marginBottom: '2px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: isActive ? '700' : '500',
  color: isActive ? '#ffffff' : '#cbd5e1',
  background: isActive
    ? 'linear-gradient(90deg, rgba(59,130,246,0.22) 0%, rgba(59,130,246,0.10) 100%)'
    : 'transparent',
  border: isActive ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
  boxShadow: isActive ? 'inset 0 0 0 1px rgba(255,255,255,0.03)' : 'none',
  transition: 'all 0.18s ease',
});

const getIconWrapStyle = (isActive) => ({
  width: '32px',
  height: '32px',
  borderRadius: '9px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: isActive ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.05)',
  color: isActive ? '#ffffff' : '#94a3b8',
  flexShrink: 0,
  transition: 'all 0.18s ease',
});

const isPathActive = (pathname, to) => {
  if (to === '/') {
    return pathname === '/' || pathname === '/cadastros' || pathname.startsWith('/conta-corrente/');
  }

  return pathname === to;
};

const Layout = ({ children }) => {
  const location = useLocation();

  const links = useMemo(
    () => [
      {
        to: '/',
        label: 'Cadastro de Produtores',
        icon: Users,
      },
      {
        to: '/compra-venda',
        label: 'Compra e Venda',
        icon: ShoppingBag,
      },
      {
        to: '/relatorio-geral',
        label: 'Relatório Geral',
        icon: FileBarChart2,
      },
    ],
    []
  );

  return (
    <div style={BASE_STYLES.container}>
      <aside style={BASE_STYLES.sidebar}>
        <div style={BASE_STYLES.sidebarHeader}>
          <div style={BASE_STYLES.logoBox}>
            <LayoutDashboard size={20} />
          </div>

          <div style={BASE_STYLES.titleWrap}>
            <h1 style={BASE_STYLES.title}>CONTROLE CACAU</h1>
            <p style={BASE_STYLES.subtitle}>Gestão de produtores, compras, vendas e financeiro</p>
          </div>
        </div>

        <nav style={BASE_STYLES.nav}>
          <span style={BASE_STYLES.sectionLabel}>Principal</span>

          <div style={BASE_STYLES.navGroup}>
            {links.map((item) => {
              const isActive = isPathActive(location.pathname, item.to);
              const Icon = item.icon;

              return (
                <Link key={item.to} to={item.to} style={getLinkStyle(isActive)}>
                  <span style={getIconWrapStyle(isActive)}>
                    <Icon size={18} />
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div style={BASE_STYLES.metricsContainer}>
          <SidebarMetrics />
        </div>
      </aside>

      <main style={BASE_STYLES.main}>
        <div style={BASE_STYLES.contentWrapper}>{children}</div>
      </main>
    </div>
  );
};

export default memo(Layout);
