"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { AppNavbar } from "@/components/app-navbar";

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
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.push("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("trainer_name, trainer_code")
        .eq("id", userData.user.id)
        .single();

      if (profileError || !profile) {
        setState({
          loading: false,
          error: "No se encontro tu perfil. Contacta a un administrador.",
          success: null,
          userId: null,
        });
        return;
      }

      setForm({
        trainer_name: profile.trainer_name ?? "",
        trainer_code: profile.trainer_code ?? "",
      });
      setState({
        loading: false,
        error: null,
        success: null,
        userId: userData.user.id,
      });
    };

    void loadProfile();
  }, [router]);

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
    setState((current) => ({
      ...current,
      error: null,
      success: "Perfil actualizado.",
    }));
  };

  if (state.loading) {
    return (
      <main className="user-screen">
        <p className="admin-muted">Cargando...</p>
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
      <AppNavbar />
      <section className="user-shell user-profile-shell">
        <h1 className="admin-title">Perfil</h1>
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
      </section>
    </main>
  );
}
