"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getPostLoginRoute } from "@/lib/useAuth";
import { Aurora } from "@/components/ui/Aurora";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        void (async () => {
          router.replace(await getPostLoginRoute(user));
        })();
      }
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="app-auth-shell relative flex min-h-screen w-full items-center justify-center px-4 py-10 overflow-hidden">
      <Aurora
        colorStops={["#222222", "#111111", "#050505"]}
        amplitude={0.8}
        blend={0.4}
        speed={0.2}
      />
      <div className="relative z-10 w-full flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}
