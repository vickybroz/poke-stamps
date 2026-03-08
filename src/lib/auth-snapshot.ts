"use client";

export type AuthSnapshotRole = "admin" | "mod" | "user";
export type AuthSnapshotStatus = "active" | "pending" | "provisional" | "inactive";

export type AuthSnapshot = {
  userId: string;
  trainerName: string;
  trainerCode: string;
  role: AuthSnapshotRole;
  status: AuthSnapshotStatus;
  active?: boolean;
  savedAt: number;
};

const AUTH_SNAPSHOT_KEY = "poke_stamps_auth_snapshot_v1";
const AUTH_SNAPSHOT_EVENT = "poke-stamps-auth-snapshot";

function encodeSnapshot(snapshot: AuthSnapshot) {
  const json = JSON.stringify(snapshot);
  const encoded = encodeURIComponent(json);
  return window.btoa(encoded.split("").reverse().join(""));
}

function decodeSnapshot(value: string) {
  const decoded = window.atob(value);
  const unreversed = decoded.split("").reverse().join("");
  return JSON.parse(decodeURIComponent(unreversed)) as AuthSnapshot;
}

function emitSnapshotChange() {
  window.dispatchEvent(new CustomEvent(AUTH_SNAPSHOT_EVENT));
}

export function readAuthSnapshot(): AuthSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(AUTH_SNAPSHOT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = decodeSnapshot(raw);

    if (
      !parsed ||
      typeof parsed.userId !== "string" ||
      typeof parsed.trainerName !== "string" ||
      typeof parsed.trainerCode !== "string" ||
      typeof parsed.role !== "string"
    ) {
      return null;
    }

    const normalizedStatus =
      parsed.status === "active" ||
      parsed.status === "pending" ||
      parsed.status === "provisional" ||
      parsed.status === "inactive"
        ? parsed.status
        : parsed.active
          ? "active"
          : "pending";

    return {
      ...parsed,
      status: normalizedStatus,
      active: normalizedStatus === "active",
    };
  } catch {
    return null;
  }
}

export function writeAuthSnapshot(snapshot: AuthSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTH_SNAPSHOT_KEY, encodeSnapshot(snapshot));
  emitSnapshotChange();
}

export function clearAuthSnapshot() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_SNAPSHOT_KEY);
  emitSnapshotChange();
}

export async function clearAuthAndRedirect(
  router?: { replace: (href: string) => void } | { push: (href: string) => void },
) {
  const { supabase } = await import("@/lib/supabase/client");
  await supabase.auth.signOut();
  clearAuthSnapshot();

  if (router && "replace" in router) {
    router.replace("/");
    return;
  }

  if (router && "push" in router) {
    router.push("/");
  }
}

export function subscribeAuthSnapshot(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleChange = () => listener();

  window.addEventListener("storage", handleChange);
  window.addEventListener(AUTH_SNAPSHOT_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(AUTH_SNAPSHOT_EVENT, handleChange);
  };
}
