import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import { Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: "Autonomous Developer Workspace",
  description: "AI-powered developer workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${sora.variable}`}>
      <body className="text-gray-100 antialiased">
        <ErrorBoundary>
          <Suspense>{children}</Suspense>
        </ErrorBoundary>
      </body>
    </html>
  );
}
