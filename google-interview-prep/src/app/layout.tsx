import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Google Interview Prep AI",
  description:
    "AI-powered mock interview preparation for Google new-grad roles. Real-time voice conversations, live code execution, and comprehensive feedback.",
  keywords: [
    "Google interview",
    "coding interview",
    "interview prep",
    "AI interviewer",
    "mock interview",
    "DSA practice",
  ],
  openGraph: {
    title: "Google Interview Prep AI",
    description:
      "Practice Google interviews with a multimodal AI interviewer that speaks, listens, and evaluates your code in real-time.",
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
      <head>
        {/* Prevents flash of wrong theme on initial load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
