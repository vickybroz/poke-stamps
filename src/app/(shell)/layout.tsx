import { AppNavbar } from "@/components/app-navbar";
import { NavigationPendingProvider } from "@/components/navigation-pending";
import { ShellNavigationOverlay } from "@/components/shell-navigation-overlay";
import { ShellAccessGuard } from "@/components/shell-access-guard";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-layout">
      <NavigationPendingProvider>
        <ShellAccessGuard>
          <AppNavbar />
          {children}
          <ShellNavigationOverlay />
        </ShellAccessGuard>
      </NavigationPendingProvider>
    </div>
  );
}
