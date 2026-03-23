import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
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
      <body className="flex h-screen overflow-hidden bg-[#0f1419] font-sans text-gray-100 antialiased">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ErrorBoundary>
            <Suspense>{children}</Suspense>
          </ErrorBoundary>
        </div>
      </body>
    </html>
  );
}
