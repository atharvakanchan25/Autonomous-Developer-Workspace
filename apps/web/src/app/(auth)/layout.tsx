"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { getPostLoginRoute } from "@/lib/useAuth";

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
    <div className="app-auth-shell flex min-h-screen w-full items-center justify-center px-4 py-10">
      {children}
    </div>
  );
}
