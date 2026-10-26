import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS has no manifest support for install; these meta tags do the same job.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "PE.AI" },
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
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
