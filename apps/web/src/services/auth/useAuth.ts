"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";

import { webConfig } from "@/lib/config";
import { auth } from "@/lib/firebase";

export type UserRole = "user" | "admin";

export interface AuthUserWithRole extends User {
  role: UserRole;
}

export async function fetchRole(firebaseUser: User, retries = 3): Promise<UserRole> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`${webConfig.apiUrl}/api/admin/users/me`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        return data.role === "admin" ? "admin" : "user";
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    } catch {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  return "user";
}

export async function getPostLoginRoute(firebaseUser: User): Promise<"/home" | "/admin"> {
  const role = await fetchRole(firebaseUser);
  return role === "admin" ? "/admin" : "/home";
}

export function useAuth() {
  const [user, setUser] = useState<AuthUserWithRole | null>(null);
  const [loading, setLoading] = useState(true);

  const resolveUser = useCallback(async (firebaseUser: User) => {
    const role = await fetchRole(firebaseUser);
    setUser({ ...firebaseUser, role } as AuthUserWithRole);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        void resolveUser(firebaseUser);
      } else {
        setUser(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [resolveUser]);

  const refetchRole = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    const role = await fetchRole(firebaseUser);
    setUser((prev) => (prev ? { ...prev, role } : null));
  }, []);

  const hasRole = (minimum: UserRole): boolean => {
    if (!user) return false;
    const roles: UserRole[] = ["user", "admin"];
    return roles.indexOf(user.role) >= roles.indexOf(minimum);
  };

  const isAdmin = (): boolean => user?.role === "admin";

  return { user, loading, hasRole, isAdmin, refetchRole };
}
