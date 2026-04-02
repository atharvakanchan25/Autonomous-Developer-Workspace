"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { duration, ease, buttonTap, fadeUp } from "@/lib/motion";
import {
  auth,
  googleProvider,
  githubProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "@/lib/firebase";
import { FirebaseError } from "firebase/app";
import { getPostLoginRoute } from "@/lib/useAuth";

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconMail() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500">
      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconEye({ off }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconGitHub() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function IconGoogle() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}

function InputField({
  id, label, type, value, onChange, placeholder, icon, error, rightSlot, autoComplete,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  icon: React.ReactNode; error?: string;
  rightSlot?: React.ReactNode; autoComplete?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-400">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">{icon}</span>
        <input
          id={id} type={type} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} autoComplete={autoComplete}
          className={`w-full rounded-lg border bg-[#0f1419] py-2.5 pl-9 ${rightSlot ? "pr-10" : "pr-4"} text-sm text-gray-100 placeholder-gray-600 outline-none transition-colors focus:ring-2 ${
            error
              ? "border-red-500/60 focus:border-red-500 focus:ring-red-900/40"
              : "border-gray-700 focus:border-indigo-500 focus:ring-indigo-900/40"
          }`}
        />
        {rightSlot && <span className="absolute inset-y-0 right-3 flex items-center">{rightSlot}</span>}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p className="text-xs text-red-400"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }} transition={{ duration: duration.fast }}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function SocialButton({ icon, label, onClick, loading }: {
  icon: React.ReactNode; label: string; onClick: () => void; loading?: boolean;
}) {
  return (
    <motion.button
      type="button" onClick={onClick} disabled={loading}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-[#1a1f2e] px-4 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-[#252b3b] hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      whileTap={buttonTap} transition={{ duration: duration.fast }}
    >
      {loading ? <Spinner /> : icon}
      <span>{label}</span>
    </motion.button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-gray-700" />
      <span className="text-xs text-gray-600">{label}</span>
      <span className="h-px flex-1 bg-gray-700" />
    </div>
  );
}

// ── Firebase error → human readable message ───────────────────────────────────

function parseFirebaseError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password.";
      case "auth/invalid-email":
        return "Enter a valid email address.";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed. Please try again.";
      case "auth/cancelled-popup-request":
        return "";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with this email using a different sign-in method.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "github" | null>(null);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  function validate() {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email address";
    if (!password) e.password = "Password is required";
    else if (password.length < 6) e.password = "Password must be at least 6 characters";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      router.push(await getPostLoginRoute(user));
    } catch (err) {
      setErrors({ form: parseFirebaseError(err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleSocial(provider: "google" | "github") {
    setSocialLoading(provider);
    setErrors({});
    try {
      const { user } = await signInWithPopup(auth, provider === "google" ? googleProvider : githubProvider);
      router.push(await getPostLoginRoute(user));
    } catch (err) {
      const msg = parseFirebaseError(err);
      if (msg) setErrors({ form: msg });
    } finally {
      setSocialLoading(null);
    }
  }

  return (
    <motion.div className="w-full max-w-sm" variants={fadeUp} initial="hidden" animate="visible">
      <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-8 shadow-2xl">

        {/* Logo + heading */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/40">
            <svg viewBox="0 0 16 16" fill="white" className="h-5 w-5">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.5L14 6v4.5L8 14 2 10.5V6L8 2.5z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-100">Welcome back</h1>
            <p className="mt-0.5 text-xs text-gray-500">Sign in to your ADW account</p>
          </div>
        </div>

        {/* Form-level error */}
        <AnimatePresence>
          {errors.form && (
            <motion.div
              className="mb-5 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/20 px-3.5 py-2.5"
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: duration.standard, ease: ease.enter }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-red-400">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-xs text-red-300">{errors.form}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <InputField
            id="email" label="Email" type="email"
            value={email} onChange={(v) => { setEmail(v); setErrors((p) => ({ ...p, email: undefined, form: undefined })); }}
            placeholder="you@example.com" icon={<IconMail />}
            error={errors.email} autoComplete="email"
          />
          <InputField
            id="password" label="Password" type={showPassword ? "text" : "password"}
            value={password} onChange={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: undefined, form: undefined })); }}
            placeholder="••••••••" icon={<IconLock />}
            error={errors.password} autoComplete="current-password"
            rightSlot={
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                className="text-gray-500 transition-colors hover:text-gray-300" tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}>
                <IconEye off={showPassword} />
              </button>
            }
          />

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-xs text-indigo-400 transition-colors hover:text-indigo-300">
              Forgot password?
            </Link>
          </div>

          <motion.button
            type="submit" disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            whileTap={!loading ? buttonTap : {}} transition={{ duration: duration.fast }}
          >
            {loading ? <><Spinner />Signing in…</> : "Sign in"}
          </motion.button>
        </form>

        <div className="my-6"><Divider label="or continue with" /></div>

        <div className="flex gap-3">
          <SocialButton icon={<IconGoogle />} label="Google"
            onClick={() => handleSocial("google")} loading={socialLoading === "google"} />
          <SocialButton icon={<IconGitHub />} label="GitHub"
            onClick={() => handleSocial("github")} loading={socialLoading === "github"} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-indigo-400 transition-colors hover:text-indigo-300">
            Sign up
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
