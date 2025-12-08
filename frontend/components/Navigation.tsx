"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Table2, Hammer } from "lucide-react";

export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/ledger", label: "Ledger", icon: Table2 },
    { href: "/build", label: "Build", icon: Hammer },
  ];

  return (
    <nav className="flex items-center gap-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isActive
                ? "bg-[#58A6FF] text-[#0D1117]"
                : "text-[#8B949E] hover:text-[#E6EDF3] hover:bg-[#21262D]"
            }`}
          >
            <Icon className="w-4 h-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
