"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { duration } from "@/lib/motion";
import { auth, signOut } from "@/lib/firebase";
import type { User } from "firebase/auth";
import { useAuth } from "@/lib/useAuth";

const NAV = [
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
  const ring = isAdmin ? "ring-2 ring-red-400/70" : "ring-2 ring-[rgba(45,212,191,0.35)]";

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
    <div className={`flex ${dim} items-center justify-center rounded-full font-semibold text-white ${ring} ${isAdmin ? "bg-red-600" : "bg-[var(--accent-strong)]"}`}>
      {initials}
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { hasRole, user, loading: authLoading } = useAuth();

  const isAdmin = user?.role === "admin";

  return (
    <aside className="app-panel-strong relative m-3 flex h-[calc(100vh-1.5rem)] w-[228px] shrink-0 flex-col overflow-hidden rounded-[28px]">
      {/* Logo */}
      <div className="flex h-20 items-center border-b border-white/10 px-6">
        <Link href="/home" className="flex items-center gap-2.5">
          <motion.div
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),#0f766e)] text-[var(--accent-contrast)] shadow-[0_14px_28px_rgba(20,184,166,0.28)]"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: duration.fast }}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-4.5 w-4.5">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.5L14 6v4.5L8 14 2 10.5V6L8 2.5z" />
            </svg>
          </motion.div>
          <div>
            <span className="font-display block text-sm font-semibold tracking-tight text-white">ADW</span>
            <span className="block text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">Workspace</span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5">
        <ul className="space-y-1.5">
          {NAV.map(({ href, label, icon, ...item }) => {
            const isAdminOnly = (item as any).adminOnly;
            // Show admin link only when auth is loaded and user is admin
            if (isAdminOnly && !isAdmin) return null;

            const active = pathname === href || (href !== "/home" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link href={href} className="relative block">
                  {active && <span className="absolute inset-0 rounded-2xl border border-[rgba(45,212,191,0.16)] bg-[linear-gradient(90deg,rgba(45,212,191,0.16),rgba(45,212,191,0.04))]" />}
                  <span
                    className={`relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm transition-colors ${
                      active ? "font-medium text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${active ? "border-[rgba(45,212,191,0.2)] bg-[rgba(45,212,191,0.12)] text-[var(--accent)]" : "border-white/10 bg-white/5 text-[var(--text-muted)]"}`}>{icon}</span>
                  {label}
                </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Account footer — links to /profile */}
      <div className="border-t border-white/10 px-4 py-4">
        {user ? (
          <Link
            href="/profile"
            className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-3 transition-colors ${
              pathname === "/profile"
                ? isAdmin ? "bg-red-500/10" : "bg-white/5"
                : isAdmin ? "hover:bg-red-500/10" : "hover:bg-white/5"
            }`}
          >
            <Avatar user={user} isAdmin={isAdmin} />
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-medium text-gray-100">
                  {user.displayName ?? "Account"}
                </p>
                {isAdmin && !authLoading && (
                  <span className="shrink-0 rounded-sm bg-red-900/70 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-red-300">
                    Admin
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] text-[var(--text-muted)]">{user.email}</p>
            </div>
            <svg viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 shrink-0 ${isAdmin ? "text-red-400/70" : "text-[var(--text-muted)]"}`}>
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </Link>
        ) : (
          <div className="px-2 py-1">
            <p className="text-[11px] text-[var(--text-secondary)]">Autonomous Developer</p>
            <p className="text-[11px] text-[var(--text-muted)]">Workspace v1.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
