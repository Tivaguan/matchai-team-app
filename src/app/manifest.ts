import type { MetadataRoute } from "next";

// What the phone or iPad uses when the app is added to the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Matchai Team",
    short_name: "Matchai",
    description: "Internal team app for Matchai.",
    start_url: "/",
    display: "standalone",
    background_color: "#11110f",
    theme_color: "#11110f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
