import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileBarChart2, Menu, ShoppingBag, Users, X } from "lucide-react";
import SidebarMetrics from "./SidebarMetrics";
import styles from "./Layout.module.css";

const MOBILE_QUERY = "(max-width: 920px)";

const navItems = [
  {
    to: "/",
    label: "Produtores",
    desktopLabel: "Cadastro de Produtores",
    icon: Users,
    match: (pathname) =>
      pathname === "/" ||
      pathname === "/cadastros" ||
      pathname.startsWith("/conta-corrente/"),
  },
  {
    to: "/compra-venda",
    label: "Operações",
    desktopLabel: "Compra e Venda",
    icon: ShoppingBag,
    match: (pathname) => pathname === "/compra-venda",
  },
  {
    to: "/relatorio-geral",
    label: "Relatórios",
    desktopLabel: "Relatório Geral",
    icon: FileBarChart2,
    match: (pathname) => pathname === "/relatorio-geral",
  },
];

function isMobileViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(MOBILE_QUERY).matches;
}

function Layout({ children }) {
  const { pathname } = useLocation();
  const activePath = useMemo(() => pathname, [pathname]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(isMobileViewport);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((current) => !current), []);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia(MOBILE_QUERY);
    const syncViewport = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMenuOpen(false);
    };

    syncViewport();
    media.addEventListener?.("change", syncViewport);
    return () => media.removeEventListener?.("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, closeMenu]);

  const renderLinks = (variant) =>
    navItems.map(({ to, label, desktopLabel, icon: Icon, match }) => {
      const active = match(activePath);
      const text = variant === "bottom" ? label : desktopLabel;

      return (
        <Link
          key={`${variant}-${to}`}
          to={to}
          onClick={variant === "sidebar" ? closeMenu : undefined}
          className={
            variant === "bottom"
              ? `${styles.bottomNavLink} ${active ? styles.bottomNavActive : ""}`
              : `${styles.navLink} ${active ? styles.active : ""}`
          }
          aria-current={active ? "page" : undefined}
        >
          <span
            className={variant === "bottom" ? styles.bottomNavIcon : styles.navIcon}
            aria-hidden="true"
          >
            <Icon size={variant === "bottom" ? 20 : 18} strokeWidth={1.9} />
          </span>
          <span>{text}</span>
        </Link>
      );
    });

  return (
    <div className={styles.shell}>
      <header className={styles.mobileHeader}>
        <Link to="/" className={styles.mobileBrand} aria-label="RCM Controle Cacau - início">
          <img src="/rcm-logo.jpeg" alt="RCM Cerealista Cearense" />
        </Link>

        <button
          type="button"
          className={styles.menuButton}
          onClick={toggleMenu}
          aria-controls="rcm-main-menu"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
        >
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className={styles.mobileBackdrop}
          onClick={closeMenu}
          aria-label="Fechar menu"
          tabIndex={-1}
        />
      ) : null}

      <aside
        id="rcm-main-menu"
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}
        aria-label="Menu principal"
      >
        <div className={styles.brand}>
          <img className={styles.logo} src="/rcm-logo.jpeg" alt="RCM Cerealista Cearense" />
          <button
            type="button"
            className={styles.closeSidebarButton}
            onClick={closeMenu}
            aria-label="Fechar menu"
          >
            <X size={21} />
          </button>
        </div>

        <div className={styles.companyLine}>
          <strong>CONTROLE CACAU</strong>
          <span>Gestão de produtores, compras, vendas e financeiro</span>
        </div>

        <nav className={styles.navigation} aria-label="Navegação principal">
          <span className={styles.sectionTitle}>Principal</span>
          <div className={styles.links}>{renderLinks("sidebar")}</div>
        </nav>

        <div className={styles.metricsArea}>
          <span className={styles.sectionTitle}>Resumo da operação</span>
          {(!isMobile || menuOpen) ? <SidebarMetrics /> : null}
        </div>

        <div className={styles.sidebarFooter}>
          <span className={styles.footerMark}>RCM</span>
          <span>Cerealista Cearense</span>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>

      <nav className={styles.bottomNav} aria-label="Atalhos principais">
        {renderLinks("bottom")}
      </nav>
    </div>
  );
}

export default memo(Layout);
