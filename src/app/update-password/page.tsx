"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setIsReady(Boolean(data.session));
    };

    void checkSession();
  }, []);

  const handleUpdatePassword = async () => {
    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess("Contrasena actualizada. Ya puedes iniciar sesion.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo actualizar la contrasena";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="home-screen">
      <section className="landing-card" aria-label="Update password">
        <h1 className="admin-title">Nueva contrasena</h1>

        {!isReady ? (
          <>
            <p className="auth-note">
              Abre esta pagina desde el enlace que te llega por correo.
            </p>
            <Link className="auth-link" href="/reset-password">
              Solicitar nuevo enlace
            </Link>
          </>
        ) : success ? (
          <>
            <p className="auth-success">{success}</p>
            <Link className="auth-link" href="/">
              Ir a iniciar sesion
            </Link>
          </>
        ) : (
          <div className="auth-form">
            <input
              className="auth-input"
              type="password"
              placeholder="Nueva contrasena"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isLoading}
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Confirmar contrasena"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={isLoading}
            />

            <button
              className="access-button"
              type="button"
              onClick={handleUpdatePassword}
              disabled={isLoading || !password || !confirmPassword}
            >
              {isLoading ? "Guardando..." : "Actualizar contrasena"}
            </button>

            <Link className="auth-link" href="/">
              Volver al inicio
            </Link>
          </div>
        )}

        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </main>
  );
}
