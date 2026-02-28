"use client";

import { useState } from "react";
import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const pressStart2P = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
});

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setError(null);
      setIsLoading(true);

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      } else {
        const userId = authData.user?.id;

        if (!userId) {
          setError("No se pudo recuperar tu perfil.");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, active")
          .eq("id", userId)
          .single();

        if (profileError || !profile) {
          setError("No se pudo recuperar tu perfil.");
          return;
        }

        if (!profile.active) {
          setError("Tu cuenta esta desactivada.");
          return;
        }

        if (profile.role === "admin" || profile.role === "mod") {
          router.push("/admin");
          return;
        }

        router.push("/user");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo iniciar sesion";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="home-screen">
      <section className="landing-card" aria-label="Poke Olivos landing">
        <h1 className={`${pressStart2P.className} logo-title`}>PokeOlivos</h1>
        <p className="album-subtitle">Stamp album</p>

        <div className="auth-form">
          <input
            className="auth-input"
            type="email"
            placeholder="Correo"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isLoading}
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Contrasena"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
          />

          <button
            className="access-button"
            type="button"
            onClick={handleSignIn}
            disabled={isLoading || !email || !password}
          >
            {isLoading ? "Procesando..." : "Entrar"}
          </button>

          <Link className="auth-link" href="/reset-password">
            Olvide mi contrasena
          </Link>
        </div>

        <p className="auth-note">Si no tienes acceso, contacta a un moderador.</p>
        {error ? <p className="auth-error">{error}</p> : null}
      </section>
    </main>
  );
}
