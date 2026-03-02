"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth-snapshot";

export function ShellAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const applyGuard = () => {
      const snapshot = readAuthSnapshot();

      if (!snapshot || !snapshot.active) {
        setIsAllowed(false);
        router.replace("/");
        return;
      }

      const normalizedPathname =
        pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

      if (normalizedPathname.startsWith("/admin")) {
        if (snapshot.role === "admin" || snapshot.role === "mod") {
          setIsAllowed(true);
          return;
        }

        setIsAllowed(false);
        router.replace("/user");
        return;
      }

      if (
        normalizedPathname.startsWith("/user") ||
        normalizedPathname.startsWith("/profile")
      ) {
        setIsAllowed(true);
        return;
      }

      setIsAllowed(false);
      router.replace("/");
    };

    applyGuard();
    const unsubscribe = subscribeAuthSnapshot(applyGuard);

    return unsubscribe;
  }, [pathname, router]);

  if (!isAllowed) {
    return null;
  }

  return <>{children}</>;
}
