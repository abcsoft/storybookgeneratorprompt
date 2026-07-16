import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fredoka (rounded, friendly) for display; Nunito (humanist) for body.
// Bundled locally so builds need no network and the PDF can embed the same files.
const fredoka = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../assets/fonts/fredoka-500.woff2", weight: "500", style: "normal" },
    { path: "../assets/fonts/fredoka-600.woff2", weight: "600", style: "normal" },
    { path: "../assets/fonts/fredoka-700.woff2", weight: "700", style: "normal" },
  ],
});

const nunito = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    { path: "../assets/fonts/nunito-400.woff2", weight: "400", style: "normal" },
    { path: "../assets/fonts/nunito-700.woff2", weight: "700", style: "normal" },
    { path: "../assets/fonts/nunito-800.woff2", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Storybook Studio — Personalized Picture Books",
  description:
    "Turn a few photos of your child into a personalized, print-ready picture book — three adventures to choose from.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
