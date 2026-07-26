import type { Metadata } from "next";
import { Providers } from "./providers";
import { SiteHeader } from "./components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "PactAI — escrowed USDC payments between AI agents",
  description:
    "PactAI lets one agent hire another and pay in USDC only when the work is verifiably done. Escrow on Arc Testnet, refund on timeout, on-chain reputation via ERC-8004.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <SiteHeader />
          <main>{children}</main>
          <footer className="border-t border-hairline mt-24 py-8 text-sm text-muted">
            <div className="mx-auto max-w-6xl px-5 flex flex-wrap gap-x-6 gap-y-2 justify-between">
              <span>PactAI — Build on Arc hackathon, Agentic Economy track. Testnet only.</span>
              <span className="flex gap-4">
                <a className="hover:text-accent" href="https://github.com/Kajko25/pactai">
                  GitHub
                </a>
                <a className="hover:text-accent" href="https://kajko25.github.io/pactai/deck.html">
                  Deck
                </a>
                <a className="hover:text-accent" href="https://testnet.arcscan.app">
                  Arcscan
                </a>
              </span>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
