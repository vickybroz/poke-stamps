"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleReset = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/update-password` },
      );

      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess("Te enviamos un correo para restablecer tu contrasena.");
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo solicitar el restablecimiento";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="home-screen">
      <section className="landing-card" aria-label="Reset password">
        <h1 className="admin-title">Recuperar contrasena</h1>
        <p className="auth-note">
          Ingresa tu correo y te enviaremos un enlace para cambiar tu contrasena.
        </p>

        <div className="auth-form">
          <input
            className="auth-input"
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
          />

          <button
            className="access-button"
            type="button"
            onClick={handleReset}
            disabled={isLoading || !email}
          >
            {isLoading ? "Enviando..." : "Enviar enlace"}
          </button>

          <Link className="auth-link" href="/">
            Volver al inicio
          </Link>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}
        {success ? <p className="auth-success">{success}</p> : null}
      </section>
    </main>
  );
}
