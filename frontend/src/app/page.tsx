"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { webConfig } from "@/lib/config";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }
      try {
        const token = await user.getIdToken(true);
        const res = await fetch(`${webConfig.apiUrl}/api/admin/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const role = res.ok ? (await res.json()).role : "user";
        router.replace(role === "admin" ? "/admin" : "/home");
      } catch {
        router.replace("/home");
      }
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#0f1419]">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-indigo-500" />
    </div>
  );
}
