"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/albums", label: "Albumes" },
  { href: "/admin/events", label: "Eventos" },
  { href: "/admin/collections", label: "Colecciones" },
  { href: "/admin/stamps", label: "Stamps" },
  { href: "/admin/gallery", label: "Galeria" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/logs", label: "Logs" },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="admin-tabs">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link key={tab.href} href={tab.href} className={`admin-tab ${active ? "active" : ""}`}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
