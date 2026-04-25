import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "FAANG Interview Prep AI",
  description:
    "AI-powered mock interview preparation for Google new-grad roles. Real-time voice conversations, live code execution, and comprehensive feedback.",
  keywords: [
    "FAANG interview",
    "coding interview",
    "interview prep",
    "AI interviewer",
    "mock interview",
    "DSA practice",
  ],
  openGraph: {
    title: "FAANG Interview Prep AI",
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
