import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, Open_Sans } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import "./globals.css";

// Archivo (Title/Header/Button) + Open Sans (Body/Links/Secondary Text)
// per the design-system typography scale — exposed as CSS variables so
// tailwind.config.ts's font-display/font-sans can reference them.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "800"],
  variable: "--font-archivo",
  display: "swap",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-open-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Health Sync Dashboard",
  description: "Personal Health Connect data, synced from Android via Supabase.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${openSans.variable}`}>
      <body className="min-h-screen font-sans">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
