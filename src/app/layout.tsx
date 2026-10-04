import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SuiteHotel — Gestion hôtelière de luxe",
    template: "%s · SuiteHotel",
  },
  description:
    "SuiteHotel : réservations multi-chambres, devis, reçus et restauration pour les hôtels de prestige.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
