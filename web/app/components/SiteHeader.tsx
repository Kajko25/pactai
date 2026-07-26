"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/app", label: "Dashboard" },
  { href: "/activity", label: "Activity" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-mint" />
          PactAI
        </Link>

        <nav className="flex gap-1 text-sm">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 transition-colors ${
                  active ? "bg-panel text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <ConnectButton
            showBalance={false}
            accountStatus="address"
            chainStatus={{ smallScreen: "icon", largeScreen: "full" }}
          />
        </div>
      </div>
    </header>
  );
}
