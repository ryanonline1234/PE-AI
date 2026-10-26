import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Makes PE.AI installable from the browser
// menu ("Add to Home Screen"), opening full-screen with the brand splash.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PE.AI — AI-Powered Workouts",
    short_name: "PE.AI",
    description: "AI-generated PE workouts configured by teachers, personalized for students.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0f",
    theme_color: "#0a0a0f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
