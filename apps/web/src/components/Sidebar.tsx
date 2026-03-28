"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { duration, ease } from "@/lib/motion";
import { auth, signOut } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";

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
];

// ── Avatar initials ────────────────────────────────────────────────────────────

function Avatar({ user }: { user: User }) {
  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt={user.displayName ?? "avatar"}
        className="h-8 w-8 rounded-full object-cover ring-2 ring-gray-700"
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
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white ring-2 ring-gray-700">
      {initials}
    </div>
  );
}

// ── Provider badge ─────────────────────────────────────────────────────────────

function providerLabel(user: User): string {
  const id = user.providerData[0]?.providerId ?? "password";
  if (id === "google.com") return "Google";
  if (id === "github.com") return "GitHub";
  return "Email";
}

// ── Account popover ────────────────────────────────────────────────────────────

function AccountPopover({ user, onClose, onLogout }: {
  user: User;
  onClose: () => void;
  onLogout: () => void;
}) {
  const joined = user.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const lastSignIn = user.metadata.lastSignInTime
    ? new Date(user.metadata.lastSignInTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <motion.div
        className="absolute bottom-full left-0 z-50 mb-2 w-[220px] overflow-hidden rounded-xl border border-gray-700 bg-[#1a1f2e] shadow-2xl"
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: duration.fast, ease: ease.enter }}
      >
        {/* User header */}
        <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-3.5">
          <Avatar user={user} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-100">
              {user.displayName ?? "User"}
            </p>
            <p className="truncate text-[11px] text-gray-500">{user.email}</p>
          </div>
        </div>

        {/* Account details */}
        <div className="space-y-2.5 px-4 py-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Signed in with</span>
            <span className="rounded-full bg-indigo-900/50 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
              {providerLabel(user)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Joined</span>
            <span className="text-[11px] text-gray-300">{joined}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Last sign in</span>
            <span className="text-[11px] text-gray-300">{lastSignIn}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">User ID</span>
            <span className="truncate max-w-[100px] text-[10px] font-mono text-gray-500" title={user.uid}>
              {user.uid.slice(0, 10)}…
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">Email verified</span>
            <span className={`text-[11px] font-medium ${user.emailVerified ? "text-green-400" : "text-amber-400"}`}>
              {user.emailVerified ? "Yes" : "No"}
            </span>
          </div>
        </div>

        {/* Logout */}
        <div className="px-2 py-2">
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-900/20 hover:text-red-300"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            Sign out
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  async function handleLogout() {
    setOpen(false);
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <aside className="flex h-screen w-[200px] shrink-0 flex-col border-r border-gray-700 bg-[#1a1f2e]">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-700 px-5">
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
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== "/home" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link href={href} className="relative block">
                  <AnimatePresence>
                    {active && (
                      <motion.span
                        className="absolute inset-0 rounded-md bg-indigo-900/40"
                        layoutId="sidebar-active-bg"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: duration.standard, ease: ease.primary }}
                      />
                    )}
                  </AnimatePresence>
                  <motion.span
                    className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      active ? "font-medium text-indigo-300" : "text-gray-400"
                    }`}
                    whileHover={active ? {} : { x: 2, color: "#e2e8f0" }}
                    transition={{ duration: duration.fast, ease: ease.enter }}
                  >
                    <motion.span
                      className={active ? "text-indigo-400" : "text-gray-500"}
                      animate={{ color: active ? "#818cf8" : "#6b7280" }}
                      transition={{ duration: duration.standard, ease: ease.primary }}
                    >
                      {icon}
                    </motion.span>
                    {label}
                  </motion.span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Account footer */}
      <div ref={footerRef} className="relative border-t border-gray-700 px-3 py-3">
        <AnimatePresence>
          {open && user && (
            <AccountPopover user={user} onClose={() => setOpen(false)} onLogout={handleLogout} />
          )}
        </AnimatePresence>

        {user ? (
          <motion.button
            onClick={() => setOpen((s) => !s)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-gray-800/60"
            whileTap={{ scale: 0.98 }}
            transition={{ duration: duration.fast }}
          >
            <Avatar user={user} />
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xs font-medium text-gray-200">
                {user.displayName ?? "Account"}
              </p>
              <p className="truncate text-[10px] text-gray-500">{user.email}</p>
            </div>
            <svg
              viewBox="0 0 20 20" fill="currentColor"
              className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </motion.button>
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
