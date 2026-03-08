"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNavigationPending } from "@/components/navigation-pending";
import { supabase } from "@/lib/supabase/client";
import { clearAuthAndRedirect, readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth-snapshot";

type ProfileState = {
  loading: boolean;
  error: string | null;
  success: string | null;
  userId: string | null;
};

type ProfileForm = {
  trainer_name: string;
  trainer_code: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const { stopNavigation } = useNavigationPending();
  const [state, setState] = useState<ProfileState>({
    loading: true,
    error: null,
    success: null,
    userId: null,
  });
  const [form, setForm] = useState<ProfileForm>({
    trainer_name: "",
    trainer_code: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const snapshot = readAuthSnapshot();

      if (!snapshot || snapshot.status !== "active") {
        router.replace("/");
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        await clearAuthAndRedirect(router);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, trainer_name, trainer_code, status")
        .eq("auth_user_id", userData.user.id)
        .single();

      if (profileError || !profile) {
        await clearAuthAndRedirect(router);
        return;
      }

      if (profile.status !== "active") {
        await clearAuthAndRedirect(router);
        return;
      }

      if (
        snapshot.trainerName !== profile.trainer_name ||
        snapshot.trainerCode !== profile.trainer_code ||
        snapshot.status !== profile.status
      ) {
        writeAuthSnapshot({
          ...snapshot,
          trainerName: profile.trainer_name ?? profile.trainer_code,
          trainerCode: profile.trainer_code,
          status: profile.status,
          active: profile.status === "active",
          savedAt: Date.now(),
        });
      }

      setForm({
        trainer_name: profile.trainer_name ?? "",
        trainer_code: profile.trainer_code ?? "",
      });
      setState({
        loading: false,
        error: null,
        success: null,
        userId: profile.id,
      });
      stopNavigation();
    };

    void loadProfile();
  }, [router, stopNavigation]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!state.userId) {
      return;
    }

    const trainerName = form.trainer_name.trim();
    const trainerCode = form.trainer_code.replace(/\D/g, "").slice(-12);

    if (!trainerName || trainerCode.length !== 12) {
      setState((current) => ({
        ...current,
        error: "Completa un nombre y un codigo de entrenador valido de 12 digitos.",
        success: null,
      }));
      return;
    }

    setIsSaving(true);
    setState((current) => ({ ...current, error: null, success: null }));

    const { error } = await supabase
      .from("profiles")
      .update({
        trainer_name: trainerName,
        trainer_code: trainerCode,
      })
      .eq("id", state.userId);

    setIsSaving(false);

    if (error) {
      setState((current) => ({
        ...current,
        error:
          error.code === "23505"
            ? "Ese codigo de entrenador ya esta en uso."
            : "No se pudo guardar tu perfil.",
        success: null,
      }));
      return;
    }

    setForm({ trainer_name: trainerName, trainer_code: trainerCode });
    const snapshot = readAuthSnapshot();
    if (snapshot) {
      writeAuthSnapshot({
        ...snapshot,
        trainerName,
        trainerCode,
        savedAt: Date.now(),
      });
    }
    setState((current) => ({
      ...current,
      error: null,
      success: "Perfil actualizado.",
    }));
  };

  if (state.loading) {
    return (
      <main className="user-screen">
        <section className="user-shell">
          <p className="admin-muted">Cargando...</p>
        </section>
      </main>
    );
  }

  if (state.error && !state.userId) {
    return (
      <main className="user-screen">
        <section className="user-shell">
          <p className="admin-error">{state.error}</p>
          <button className="admin-back-button" type="button" onClick={() => router.push("/")}>
            Volver al inicio
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="user-screen">
      <section className="user-shell user-profile-shell">
        <h1 className="page-title">Perfil</h1>
        <div className="profile-card">
          <form className="profile-form" onSubmit={handleSubmit}>
          <label className="profile-field">
            <span className="profile-label">Nombre de entrenador</span>
            <input
              className="auth-input"
              type="text"
              value={form.trainer_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, trainer_name: event.target.value }))
              }
            />
          </label>

          <label className="profile-field">
            <span className="profile-label">Codigo de entrenador</span>
            <input
              className="auth-input"
              type="text"
              inputMode="numeric"
              maxLength={12}
              value={form.trainer_code}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  trainer_code: event.target.value.replace(/\D/g, "").slice(-12),
                }))
              }
            />
          </label>

          {state.error ? <p className="auth-error">{state.error}</p> : null}
          {state.success ? <p className="auth-success">{state.success}</p> : null}

          <button type="submit" className="access-button" disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
          </form>
        </div>
      </section>
    </main>
  );
}






