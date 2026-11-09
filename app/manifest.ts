import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/overview",
    name: "PondoPath by SoloForge",
    short_name: "PondoPath",
    description: "Plan around customer collections and upcoming business obligations.",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f8f4",
    theme_color: "#1e4b3c",
    categories: ["business", "finance", "productivity"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Cash forecast", url: "/forecast", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Add records", url: "/add", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
