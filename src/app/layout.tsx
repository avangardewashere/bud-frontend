import type { Metadata } from "next";
import { Nunito, Nunito_Sans, JetBrains_Mono } from "next/font/google";
import { connection } from "next/server";
import { WakingNotice } from "@/components/shell/WakingNotice";
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

/** The favicon comes from src/app/icon.svg via Next's file convention. */
export const metadata: Metadata = {
  title: "Bud",
  description: "A learning platform where every course keeps its own personality.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /**
   * Every page renders per request. Next can only stamp the CSP nonce onto its
   * scripts while rendering against a live request — a page built ahead of time has
   * no request, so no nonce, and its scripts would be refused by the policy the proxy
   * sends. Opting in here, at the root, covers every route rather than relying on
   * each page happening to read cookies.
   *
   * The cost is that nothing is prerendered, /brand included. Every page here is
   * already per-user bar that one, so it is a small price for scripts that cannot be
   * injected.
   */
  await connection();

  return (
    <html
      lang="en"
      className={`${nunito.variable} ${nunitoSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <WakingNotice />
      </body>
    </html>
  );
}
