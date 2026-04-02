"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { webConfig } from "./config";

export type UserRole = "user" | "admin";

export interface AuthUserWithRole extends User {
  role: UserRole;
}

async function fetchRole(firebaseUser: User): Promise<UserRole> {
  try {
    const token = await firebaseUser.getIdToken(true);
    const res = await fetch(`${webConfig.apiUrl}/api/admin/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      return data.role === "admin" ? "admin" : "user";
    }
  } catch (err) {
    console.error("[useAuth] fetchRole failed:", err);
  }
  return "user";
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
        resolveUser(firebaseUser);
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
    await resolveUser(firebaseUser);
  }, [resolveUser]);

  const hasRole = (minimum: UserRole): boolean => {
    if (!user) return false;
    const roles: UserRole[] = ["user", "admin"];
    return roles.indexOf(user.role) >= roles.indexOf(minimum);
  };

  const isAdmin = (): boolean => user?.role === "admin";

  return { user, loading, hasRole, isAdmin, refetchRole };
}
