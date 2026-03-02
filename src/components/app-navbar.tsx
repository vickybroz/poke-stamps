"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useNavigationPending } from "@/components/navigation-pending";
import { supabase } from "@/lib/supabase/client";
import { clearAuthSnapshot, readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth-snapshot";

type ViewerRole = "admin" | "mod" | "user" | null;

type SidebarProfile = {
  trainer_name: string;
  trainer_code: string;
  role: ViewerRole;
};

type NavItem = {
  href: string;
  label: string;
  icon: "album" | "admin" | "profile" | "events" | "collections" | "stamps" | "gallery" | "users" | "logs";
};

const adminItems: NavItem[] = [
  { href: "/admin/albums", label: "Albumes", icon: "album" },
  { href: "/admin/events", label: "Eventos", icon: "events" },
  { href: "/admin/collections", label: "Colecciones", icon: "collections" },
  { href: "/admin/stamps", label: "Stamps", icon: "stamps" },
  { href: "/admin/gallery", label: "Galeria", icon: "gallery" },
  { href: "/admin/users", label: "Usuarios", icon: "users" },
  { href: "/admin/logs", label: "Logs", icon: "logs" },
];

const baseItems: NavItem[] = [
  { href: "/user", label: "Mi album", icon: "album" },
  { href: "/profile", label: "Perfil", icon: "profile" },
];

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (icon) {
    case "album":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <rect x="4" y="5" width="16" height="14" rx="3" {...common} />
          <path d="M8 9h8M8 13h5" {...common} />
        </svg>
      );
    case "profile":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" {...common} />
          <path d="M5 20a7 7 0 0 1 14 0" {...common} />
        </svg>
      );
    case "events":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <rect x="4" y="6" width="16" height="14" rx="2" {...common} />
          <path d="M8 3v6M16 3v6M4 10h16" {...common} />
        </svg>
      );
    case "collections":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <rect x="3" y="6" width="8" height="6" rx="1.5" {...common} />
          <rect x="13" y="6" width="8" height="6" rx="1.5" {...common} />
          <rect x="8" y="14" width="8" height="6" rx="1.5" {...common} />
        </svg>
      );
    case "stamps":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <path d="M7 4h10v5h3v6h-3v5H7v-5H4V9h3V4Z" {...common} />
        </svg>
      );
    case "gallery":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <rect x="4" y="5" width="16" height="14" rx="2" {...common} />
          <circle cx="9" cy="10" r="1.5" {...common} />
          <path d="m20 16-5-5-6 6-2-2-3 3" {...common} />
        </svg>
      );
    case "users":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 20a6 6 0 0 1 12 0M14 19a4.5 4.5 0 0 1 7 0" {...common} />
        </svg>
      );
    case "logs":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" {...common} />
        </svg>
      );
    case "admin":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <path d="M12 3 4 7v5c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10V7l-8-4Z" {...common} />
          <path d="m9 12 2 2 4-4" {...common} />
        </svg>
      );
    default:
      return null;
  }
}

export function AppNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { pendingHref, startNavigation, stopNavigation } = useNavigationPending();
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [isPinnedExpanded, setIsPinnedExpanded] = useState(false);

  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  useEffect(() => {
    if (!pendingHref) {
      return;
    }

    const normalizedPendingHref =
      pendingHref.length > 1 && pendingHref.endsWith("/") ? pendingHref.slice(0, -1) : pendingHref;

    if (
      normalizedPathname === normalizedPendingHref ||
      normalizedPathname.startsWith(`${normalizedPendingHref}/`)
    ) {
      stopNavigation();
    }
  }, [normalizedPathname, pendingHref, stopNavigation]);

  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth <= 640;

      if (mobile) {
        setIsPinnedExpanded(false);
      }
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    const syncProfile = () => {
      const snapshot = readAuthSnapshot();

      if (!snapshot || !snapshot.active) {
        setProfile(null);
        return;
      }

      setProfile({
        trainer_name: snapshot.trainerName,
        trainer_code: snapshot.trainerCode,
        role: snapshot.role,
      });
    };

    syncProfile();
    const unsubscribe = subscribeAuthSnapshot(syncProfile);

    return unsubscribe;
  }, []);

  const navItems = useMemo(() => {
    if (!profile?.role) {
      return { base: [], admin: [] };
    }

    return {
      base: [...baseItems],
      admin: profile.role === "admin" || profile.role === "mod" ? [...adminItems] : [],
    };
  }, [profile]);

  const initials = useMemo(() => {
    if (!profile?.trainer_name) return "T";
    return profile.trainer_name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [profile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuthSnapshot();
    setProfile(null);
    router.push("/");
  };

  const isExpanded = isPinnedExpanded;

  if (!profile) {
    return null;
  }

  return (
    <aside
      className={`app-sidebar ${isExpanded ? "expanded" : "collapsed"}`}
      aria-label="Principal"
    >
      <button
        type="button"
        className="app-sidebar-toggle"
        aria-label={isPinnedExpanded ? "Contraer sidebar" : "Expandir sidebar"}
        onClick={() => setIsPinnedExpanded((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
          <path
            d={isExpanded ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div className="app-sidebar-profile">
        <div className="app-sidebar-profile-row">
          <div className="app-sidebar-avatar" aria-hidden="true">
            <span>{initials}</span>
          </div>
          <div className="app-sidebar-profile-copy">
            <p className="app-sidebar-name">{profile.trainer_name}</p>
            <p className="app-sidebar-id">{profile.trainer_code}</p>
          </div>
        </div>
        <Link
          className="app-sidebar-edit"
          href="/profile"
          aria-label="Editar perfil"
          onClick={() => startNavigation("/profile")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
            <path
              d="m3 17.25 9.06-9.06 3.75 3.75L6.75 21H3v-3.75Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"
              fill="currentColor"
            />
          </svg>
        </Link>
      </div>

      <nav className="app-sidebar-nav">
        {navItems.base.map((item) => {
          const active =
            normalizedPathname === item.href || normalizedPathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-sidebar-link ${active ? "active" : ""}`}
              onClick={() => startNavigation(item.href)}
            >
              <NavIcon icon={item.icon} />
              <span className="app-sidebar-link-label">{item.label}</span>
            </Link>
          );
        })}

        {navItems.admin.length ? (
          <div className="app-sidebar-group app-sidebar-group-admin">
            <span className="app-sidebar-admin-divider" aria-hidden="true" />
            <p className="app-sidebar-group-title">Admin</p>
            {navItems.admin.map((item) => {
              const active =
                normalizedPathname === item.href || normalizedPathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`app-sidebar-link ${active ? "active" : ""}`}
                  onClick={() => startNavigation(item.href)}
                >
                  <NavIcon icon={item.icon} />
                  <span className="app-sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}
      </nav>

      <div className="app-sidebar-footer">
        <button type="button" className="app-sidebar-logout" onClick={handleLogout}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="app-sidebar-icon">
            <path
              d="M10 17v-3h4v-4h-4V7l-5 5 5 5Zm1 4v-2h8V5h-8V3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8Z"
              fill="currentColor"
            />
          </svg>
          <span className="app-sidebar-link-label">Logout</span>
        </button>
      </div>
    </aside>
  );
}








