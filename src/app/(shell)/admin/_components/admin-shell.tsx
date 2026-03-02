"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNavigationPending } from "@/components/navigation-pending";
import { supabase } from "@/lib/supabase/client";
import { clearAuthAndRedirect, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth-snapshot";

type AdminAccessState = {
  loading: boolean;
  trainerName: string | null;
  userId: string | null;
};

const AdminAccessContext = createContext<AdminAccessState>({
  loading: true,
  trainerName: null,
  userId: null,
});

export function useAdminAccess() {
  return useContext(AdminAccessContext);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { stopNavigation } = useNavigationPending();
  const [state, setState] = useState<AdminAccessState>({
    loading: true,
    trainerName: null,
    userId: null,
  });

  useEffect(() => {
    const loadAdminProfile = async () => {
      setState((current) => ({ ...current, loading: true }));

      const snapshot = readAuthSnapshot();

      if (!snapshot || !snapshot.active) {
        router.replace("/");
        return;
      }

      if (snapshot.role !== "admin" && snapshot.role !== "mod") {
        router.replace("/user");
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        await clearAuthAndRedirect(router);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("trainer_name, trainer_code, role, active")
        .eq("id", userData.user.id)
        .single();

      if (profileError || !profile) {
        await clearAuthAndRedirect(router);
        return;
      }

      if (!profile.active) {
        await clearAuthAndRedirect(router);
        return;
      }

      writeAuthSnapshot({
        userId: userData.user.id,
        trainerName: profile.trainer_name,
        trainerCode: profile.trainer_code,
        role: profile.role,
        active: profile.active,
        savedAt: Date.now(),
      });

      if (profile.role !== "admin" && profile.role !== "mod") {
        router.replace("/user");
        return;
      }

      setState({
        loading: false,
        trainerName: profile.trainer_name,
        userId: userData.user.id,
      });
      stopNavigation();
    };

    void loadAdminProfile();
  }, [pathname, router, stopNavigation]);

  const value = useMemo(() => state, [state]);

  if (state.loading) {
    return (
      <main className="admin-screen">
        <section className="admin-card">
          <p className="admin-muted">Cargando panel...</p>
        </section>
      </main>
    );
  }

  return (
    <AdminAccessContext.Provider value={value}>
      <main className="admin-screen">
        <section className="admin-card">
          <h1 className="admin-title">Panel de Administracion</h1>
          <div className="admin-grid">{children}</div>
        </section>
      </main>
    </AdminAccessContext.Provider>
  );
}


