"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ViewerRole = "admin" | "mod" | "user" | null;

export function AppNavbar() {
  const pathname = usePathname();
  const [role, setRole] = useState<ViewerRole>(null);
  const normalizedPathname =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  useEffect(() => {
    const loadRole = async () => {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        setRole(null);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", userData.user.id)
        .single();

      if (!profile || !profile.active) {
        setRole(null);
        return;
      }

      setRole(profile.role as ViewerRole);
    };

    void loadRole();
  }, []);

  const canSeeAdmin = role === "admin" || role === "mod";
  const showAdminLink = canSeeAdmin && normalizedPathname !== "/admin";
  const showUserLink = canSeeAdmin && normalizedPathname !== "/user";

  if (!showAdminLink && !showUserLink) {
    return null;
  }

  return (
    <nav className="app-navbar" aria-label="Principal">
      {showUserLink ? (
        <Link className="app-navbar-link" href="/user">
          Mi album
        </Link>
      ) : null}
      {showAdminLink ? (
        <Link className="app-navbar-link" href="/admin">
          Admin
        </Link>
      ) : null}
    </nav>
  );
}
