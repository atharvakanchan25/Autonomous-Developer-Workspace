"use client";

import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { webConfig } from "./config";

export type UserRole = "user" | "admin";

export interface AuthUserWithRole extends User {
  role: UserRole;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUserWithRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken(true);
          const res = await fetch(`${webConfig.apiUrl}/api/admin/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            const role: UserRole = data.role === "admin" ? "admin" : "user";
            setUser({ ...firebaseUser, role } as AuthUserWithRole);
          } else {
            setUser({ ...firebaseUser, role: "user" } as AuthUserWithRole);
          }
        } catch {
          setUser({ ...firebaseUser, role: "user" } as AuthUserWithRole);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const hasRole = (minimum: UserRole): boolean => {
    if (!user) return false;
    const roles: UserRole[] = ["user", "admin"];
    return roles.indexOf(user.role) >= roles.indexOf(minimum);
  };

  const isAdmin = (): boolean => user?.role === "admin";

  return { user, loading, hasRole, isAdmin };
}
