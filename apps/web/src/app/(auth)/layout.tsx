"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) router.replace("/home");
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#0f1419] px-4">
      {children}
    </div>
  );
}
