"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { duration, ease } from "@/lib/motion";

const NAV = [
  {
    href: "/",
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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[200px] shrink-0 flex-col border-r border-gray-700 bg-[#1a1f2e]">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-gray-700 px-5">
        <Link href="/" className="flex items-center gap-2.5">
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
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link href={href} className="relative block">
                  {/* Sliding active background */}
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
                    whileHover={
                      active
                        ? {}
                        : { x: 2, color: "#e2e8f0" }
                    }
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

      {/* Footer */}
      <div className="border-t border-gray-700 px-5 py-4">
        <p className="text-[11px] text-gray-500">Autonomous Developer</p>
        <p className="text-[11px] text-gray-600">Workspace v1.0</p>
      </div>
    </aside>
  );
}
