import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Autonomous Developer Workspace",
  description: "AI-powered developer workspace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#0f1419] font-sans text-gray-100 antialiased">
        <ErrorBoundary>
          <Suspense>{children}</Suspense>
        </ErrorBoundary>
      </body>
    </html>
  );
}
