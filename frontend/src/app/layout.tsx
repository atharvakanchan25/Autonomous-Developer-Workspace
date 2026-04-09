import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autonomous Developer Workspace",
  description: "AI-powered autonomous developer workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`}>
      <body className="antialiased">
        <ErrorBoundary>
          <Suspense>{children}</Suspense>
        </ErrorBoundary>
      </body>
    </html>
  );
}
