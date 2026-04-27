import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "FAANG Prep AI",
  description:
    "AI-powered mock interview preparation for Google, Amazon, Meta, Apple, and Netflix. Real-time voice conversations, live code execution, and comprehensive feedback.",
  keywords: [
    "FAANG interview",
    "Google interview",
    "Amazon interview",
    "Meta interview",
    "coding interview",
    "interview prep",
    "AI interviewer",
    "mock interview",
    "DSA practice",
  ],
  openGraph: {
    title: "FAANG Prep AI",
    description:
      "Practice FAANG interviews with a multimodal AI interviewer that speaks, listens, and evaluates your code in real-time.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Prevents flash of wrong theme on initial load */}
        <Script
          id="theme-initializer"
          src="/theme-init.js"
          strategy="beforeInteractive"
        />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
