"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { duration } from "@/lib/motion";
import type { User } from "firebase/auth";
import { useAuth } from "@/lib/useAuth";
import { api } from "@/lib/api";

const NAV = [
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/home",
    label: "Home",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    href: "/projects",
    label: "Projects",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/graph",
    label: "Graph",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
      </svg>
    ),
  },
  {
    href: "/editor",
    label: "Editor",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    ),
  },
  {
    href: "/dev",
    label: "AI Dev",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/deploy",
    label: "Deploy",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/observe",
    label: "Observe",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    href: "/admin",
    label: "Admin",
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  },
];

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ user, isAdmin, size = "md" }: { user: User; isAdmin: boolean; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";
  const ring = isAdmin ? "ring-2 ring-red-500/70" : "ring-2 ring-gray-700";

  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={user.displayName ?? "avatar"}
        className={`${dim} rounded-full object-cover ${ring}`}
      />
    );
  }
  const initials = (user.displayName ?? user.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className={`flex ${dim} items-center justify-center rounded-full font-semibold text-white ${ring} ${isAdmin ? "bg-red-700" : "bg-indigo-600"}`}>
      {initials}
    </div>
  );
}

// ── Provider label ─────────────────────────────────────────────────────────────

function providerLabel(user: User): string {
  const id = user.providerData[0]?.providerId ?? "password";
  if (id === "google.com") return "Google";
  if (id === "github.com") return "GitHub";
  return "Email";
}



// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { hasRole, user, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!user) return;
    api.profile.myAlerts().then((a) => setUnreadCount(a.length)).catch(() => {});
  }, [user]);

  return (
    <aside className="flex h-screen w-[200px] shrink-0 flex-col border-r border-gray-700 bg-[#1a1f2e]">
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-gray-700 px-5">
        <Link href="/home" className="flex items-center gap-2.5">
          <motion.div
            className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: duration.fast }}
          >
            <svg viewBox="0 0 16 16" fill="white" className="h-3.5 w-3.5">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.5L14 6v4.5L8 14 2 10.5V6L8 2.5z" />
            </svg>
          </motion.div>
          <span className="text-sm font-semibold tracking-tight text-gray-100">ADW</span>
        </Link>
        <Link href="/profile" className="relative">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500 hover:text-gray-300">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 01-2-2h4a2 2 0 01-2 2z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon, ...item }) => {
            const isAdminOnly = (item as any).adminOnly;
            // Show admin link only when auth is loaded and user is admin
            if (isAdminOnly && !isAdmin) return null;

            const active = pathname === href || (href !== "/home" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link href={href} className="relative block">
                  {active && <span className="absolute inset-0 rounded-md bg-indigo-900/40" />}
                  <span
                    className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                      active ? "font-medium text-indigo-300" : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span className={active ? "text-indigo-400" : "text-gray-500"}>{icon}</span>
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Account footer */}
      <div className="border-t border-gray-700 px-3 py-3">
        {user ? (
          <Link
            href="/profile"
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors ${
              pathname === "/profile" ? "bg-indigo-900/40" : isAdmin ? "hover:bg-red-900/20" : "hover:bg-gray-800/60"
            }`}
          >
            <Avatar user={user} isAdmin={isAdmin} />
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-medium text-gray-200">
                  {user.displayName ?? "Account"}
                </p>
                {isAdmin && !authLoading && (
                  <span className="shrink-0 rounded-sm bg-red-900/70 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-red-300">
                    Admin
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] text-gray-500">{user.email}</p>
            </div>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-gray-500">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
        ) : (
          <div className="px-2 py-1">
            <p className="text-[11px] text-gray-500">Autonomous Developer</p>
            <p className="text-[11px] text-gray-600">Workspace v1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
