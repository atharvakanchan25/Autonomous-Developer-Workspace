"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { webConfig } from "./config";

export type UserRole = "user" | "admin";

export interface AuthUserWithRole extends User {
  role: UserRole;
}

async function fetchRole(firebaseUser: User, retries = 3): Promise<UserRole> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Force refresh token to ensure backend gets latest auth state
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch(`${webConfig.apiUrl}/api/admin/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store', // Prevent caching
      });

      if (res.ok) {
        const data = await res.json();
        const role = data.role === "admin" ? "admin" : "user";
        console.log(`[useAuth] Attempt ${attempt}: User ${firebaseUser.email} has role: ${role}`);
        return role;
      }

      console.warn(`[useAuth] Attempt ${attempt}: /users/me returned ${res.status}`);
      
      // If not the last attempt, wait before retrying
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    } catch (err) {
      console.error(`[useAuth] Attempt ${attempt} failed:`, err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
  }

  console.error(`[useAuth] All ${retries} attempts failed, defaulting to 'user' role`);
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

  // Call this after any action that might change the role
  const refetchRole = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    const role = await fetchRole(firebaseUser);
    setUser(prev => prev ? { ...prev, role } : null);
  }, []);

  const hasRole = (minimum: UserRole): boolean => {
    if (!user) return false;
    const roles: UserRole[] = ["user", "admin"];
    return roles.indexOf(user.role) >= roles.indexOf(minimum);
  };

  const isAdmin = (): boolean => user?.role === "admin";

  return { user, loading, hasRole, isAdmin, refetchRole };
}
