import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "700", "800"], // Regular, Bold, Extra Bold
});

export const metadata: Metadata = {
  title: "SmartPress - Fast, Smart Compression",
  // Video left with Sprint 1.1. The description says what the app does now.
  description:
    "Fast, smart image compression that runs entirely in your browser. No uploads, no accounts.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
