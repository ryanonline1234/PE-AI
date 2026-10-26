import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";

// Self-hosted via next/font: no request to Google at runtime, no layout shift,
// and the fonts load on every route (the <link> approach only covered one page).
const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-display-src",
  display: "swap",
});
const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-body-src",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PE.AI — AI-Powered Workouts",
  description: "AI-generated PE workouts configured by teachers, personalized for students.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
