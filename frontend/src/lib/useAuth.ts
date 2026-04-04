"use client";

import { useEffect, useState, useCallback } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { webConfig } from "./config";

export type UserRole = "user" | "admin";

export interface AuthUserWithRole extends User {
  role: UserRole;
}

const ROLE_CACHE_KEY = "adw:user-role";
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRole:
  | {
      uid: string;
      role: UserRole;
      expiresAt: number;
    }
  | null = null;
let inFlightRoleRequest: Promise<UserRole> | null = null;

function readCachedRole(uid: string): UserRole | null {
  if (cachedRole && cachedRole.uid === uid && cachedRole.expiresAt > Date.now()) {
    return cachedRole.role;
  }

  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ROLE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { uid: string; role: UserRole; expiresAt: number };
    if (parsed.uid === uid && parsed.expiresAt > Date.now()) {
      cachedRole = parsed;
      return parsed.role;
    }
  } catch {
    return null;
  }

  return null;
}

function writeCachedRole(uid: string, role: UserRole) {
  const value = {
    uid,
    role,
    expiresAt: Date.now() + ROLE_CACHE_TTL_MS,
  };
  cachedRole = value;

  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function clearCachedRole() {
  cachedRole = null;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ROLE_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export async function fetchRole(firebaseUser: User, retries = 2, forceRefresh = false): Promise<UserRole> {
  if (!forceRefresh) {
    const cached = readCachedRole(firebaseUser.uid);
    if (cached) return cached;
    if (inFlightRoleRequest) return inFlightRoleRequest;
  }

  const requestPromise = (async () => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const token = await firebaseUser.getIdToken(forceRefresh && attempt === 1);
      const res = await fetch(`${webConfig.apiUrl}/api/admin/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const role = data.role === "admin" ? "admin" : "user";
        writeCachedRole(firebaseUser.uid, role);
        return role;
      }

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    } catch (err) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }

  return "user";
  })();

  inFlightRoleRequest = requestPromise;
  try {
    return await requestPromise;
  } finally {
    if (inFlightRoleRequest === requestPromise) {
      inFlightRoleRequest = null;
    }
  }
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
        resolveUser(firebaseUser);
      } else {
        clearCachedRole();
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
    clearCachedRole();
    const role = await fetchRole(firebaseUser, 2, true);
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
