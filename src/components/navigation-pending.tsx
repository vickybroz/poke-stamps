"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type NavigationPendingContextValue = {
  isNavigating: boolean;
  startNavigation: (targetHref: string) => void;
  stopNavigation: () => void;
  pendingHref: string | null;
};

const NavigationPendingContext = createContext<NavigationPendingContextValue>({
  isNavigating: false,
  startNavigation: () => undefined,
  stopNavigation: () => undefined,
  pendingHref: null,
});

export function useNavigationPending() {
  return useContext(NavigationPendingContext);
}

export function NavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const startNavigation = useCallback((targetHref: string) => {
    setPendingHref(targetHref);
  }, []);

  const stopNavigation = useCallback(() => {
    setPendingHref(null);
  }, []);

  const value = useMemo(
    () => ({
      isNavigating: pendingHref !== null,
      startNavigation,
      stopNavigation,
      pendingHref,
    }),
    [pendingHref, startNavigation, stopNavigation],
  );

  return (
    <NavigationPendingContext.Provider value={value}>{children}</NavigationPendingContext.Provider>
  );
}
