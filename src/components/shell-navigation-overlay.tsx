"use client";

import { useNavigationPending } from "@/components/navigation-pending";

export function ShellNavigationOverlay() {
  const { isNavigating } = useNavigationPending();

  if (!isNavigating) {
    return null;
  }

  return (
    <div className="shell-loading-overlay" aria-live="polite" aria-busy="true">
      <div className="shell-loading-panel">
        <span className="shell-loading-spinner" aria-hidden="true" />
        <span>Cargando...</span>
      </div>
    </div>
  );
}
