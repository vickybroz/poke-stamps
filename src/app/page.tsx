"use client";

import { useEffect, useRef, useState } from "react";
import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const pressStart2P = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
});

type AuthMode = "signin" | "signup";
type BarcodeDetectorResult = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetectorResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

export default function Home() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [trainerCode, setTrainerCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const scannerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopScanner = () => {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }

    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop());
      scannerStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  useEffect(() => {
    if (!isScannerOpen) {
      stopScanner();
      return;
    }

    const BarcodeDetectorApi = (
      window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    if (!BarcodeDetectorApi) {
      setScannerError("Tu navegador no soporta escaneo QR.");
      setIsScannerOpen(false);
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        scannerStreamRef.current = stream;

        if (!videoRef.current) {
          return;
        }

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detector = new BarcodeDetectorApi({ formats: ["qr_code"] });

        scannerIntervalRef.current = setInterval(async () => {
          if (!videoRef.current) {
            return;
          }

          try {
            const results = await detector.detect(videoRef.current);
            const rawValue = results[0]?.rawValue;

            if (!rawValue) {
              return;
            }

            const digitsOnly = rawValue.replace(/\D/g, "");
            const normalizedCode = digitsOnly.slice(-12);

            if (normalizedCode.length !== 12) {
              setScannerError("El QR no contiene un codigo de entrenador valido.");
              return;
            }

            setTrainerCode(normalizedCode);
            setScannerError(null);
            setIsScannerOpen(false);
          } catch {
            setScannerError("No se pudo leer el QR.");
          }
        }, 500);
      } catch {
        setScannerError("No se pudo abrir la camara.");
        setIsScannerOpen(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [isScannerOpen]);

  const handleSignIn = async () => {
    try {
      setError(null);
      setSuccess(null);
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

  const handleSignUp = async () => {
    try {
      setError(null);
      setSuccess(null);
      setIsLoading(true);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      const userId = authData.user?.id;

      if (!userId) {
        setError("No se pudo crear la cuenta.");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        trainer_name: trainerName,
        trainer_code: trainerCode,
        role: "user",
        active: false,
      });

      if (profileError) {
        setError(profileError.message);
        return;
      }

      setSuccess("Solicitud enviada. Un admin debe autorizar tu acceso.");
      setMode("signin");
      setEmail("");
      setPassword("");
      setTrainerName("");
      setTrainerCode("");
      setIsScannerOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo solicitar acceso";
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
          {mode === "signup" ? (
            <>
              <input
                className="auth-input"
                type="text"
                placeholder="Nombre de entrenador"
                value={trainerName}
                onChange={(event) => setTrainerName(event.target.value)}
                disabled={isLoading}
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Codigo de entrenador"
                value={trainerCode}
                onChange={(event) => setTrainerCode(event.target.value)}
                disabled={isLoading}
              />
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setScannerError(null);
                  setIsScannerOpen((current) => !current);
                }}
                disabled={isLoading}
              >
                {isScannerOpen ? "Cerrar scanner" : "Escanear codigo"}
              </button>
              {isScannerOpen ? (
                <div className="auth-scanner-panel">
                  <video ref={videoRef} className="auth-scanner-video" muted playsInline />
                  {scannerError ? <p className="auth-error">{scannerError}</p> : null}
                </div>
              ) : null}
            </>
          ) : null}
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
            onClick={mode === "signin" ? handleSignIn : handleSignUp}
            disabled={
              isLoading ||
              !email ||
              !password ||
              (mode === "signup" && (!trainerName || !trainerCode))
            }
          >
            {isLoading
              ? "Procesando..."
              : mode === "signin"
                ? "Entrar"
                : "Solicitar acceso"}
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setIsScannerOpen(false);
              setMode((current) => (current === "signin" ? "signup" : "signin"));
            }}
            disabled={isLoading}
          >
            {mode === "signin" ? "Registrarme" : "Ya tengo cuenta"}
          </button>

          <Link className="auth-link" href="/reset-password">
            Olvide mi contrasena
          </Link>
        </div>

        <p className="auth-note">
          {mode === "signin"
            ? "Si no tienes acceso, contacta a un moderador."
            : "Tu solicitud quedara pendiente hasta que un admin la autorice."}
        </p>
        {error ? <p className="auth-error">{error}</p> : null}
        {success ? <p className="auth-success">{success}</p> : null}
      </section>
    </main>
  );
}

