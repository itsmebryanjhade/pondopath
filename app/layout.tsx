import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaInstall } from "@/components/pwa-install";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PondoPath by SoloForge | Cash-Flow Action Planner",
  description: "Plan around customer collections and upcoming business obligations.",
  applicationName: "PondoPath",
  icons: {
    icon: { url: "/brand/pondopath-icon.png", type: "image/png" },
    apple: { url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: { capable: true, title: "PondoPath", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1e4b3c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaInstall />
      </body>
    </html>
  );
}
