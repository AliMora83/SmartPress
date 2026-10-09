import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist for the interface, Geist Mono for every number and section label.
// next/font self-hosts both at build time: nothing is fetched at runtime.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartPress - Fast, Smart Compression",
  // Video left with Sprint 1.1. The description says what the app does now.
  description:
    "Fast, private image and PDF compression that runs entirely on your machine. Files never leave your device, no accounts.",
  icons: {
    icon: "/favicon.ico",
  },
  // The desktop shell is not an installable PWA: no manifest there.
  ...(process.env.NEXT_PUBLIC_TARGET !== "desktop" && { manifest: "/manifest.webmanifest" }),
};

// bg-ground from docs/design-system/tokens.json; matches the manifest.
export const viewport: Viewport = {
  themeColor: "#0C0E12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
