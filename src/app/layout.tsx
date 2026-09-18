import type { Metadata } from "next";
import { Nunito, Nunito_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/** Design.md §5 — Nunito for display, Nunito Sans for UI, JetBrains Mono for anything tabular. */
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Bud",
  description: "A learning platform where every course keeps its own personality.",
  icons: { icon: "/brand/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${nunitoSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
