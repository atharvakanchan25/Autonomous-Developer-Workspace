"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { duration, ease, buttonTap, fadeUp } from "@/lib/motion";

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

function IconUser() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
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
        {rightSlot && (
          <span className="absolute inset-y-0 right-3 flex items-center">{rightSlot}</span>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            className="text-xs text-red-400"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }} transition={{ duration: duration.fast }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string; email?: string; password?: string; confirm?: string; form?: string;
  }>({});
  const [success, setSuccess] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!name.trim()) e.name = "Name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email address";
    if (!password) e.password = "Password is required";
    else if (password.length < 8) e.password = "Password must be at least 8 characters";
    if (!confirm) e.confirm = "Please confirm your password";
    else if (confirm !== password) e.confirm = "Passwords do not match";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setLoading(true);
    try {
      // TODO: wire up real auth
      await new Promise((r) => setTimeout(r, 1500));
      setSuccess(true);
    } catch {
      setErrors({ form: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  function clear(field: keyof typeof errors) {
    setErrors((p) => ({ ...p, [field]: undefined, form: undefined }));
  }

  if (success) {
    return (
      <motion.div
        className="w-full max-w-sm"
        variants={fadeUp} initial="hidden" animate="visible"
      >
        <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-900/40">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 text-green-400">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="mb-1 text-base font-semibold text-gray-100">Account created!</h2>
          <p className="mb-6 text-xs text-gray-500">Check your email to verify your account.</p>
          <Link
            href="/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Go to sign in
          </Link>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="w-full max-w-sm"
      variants={fadeUp} initial="hidden" animate="visible"
    >
      <div className="rounded-xl border border-gray-700 bg-[#1a1f2e] p-8 shadow-2xl">

        {/* Logo + heading */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-900/40">
            <svg viewBox="0 0 16 16" fill="white" className="h-5 w-5">
              <path d="M8 1L1 5v6l7 4 7-4V5L8 1zm0 1.5L14 6v4.5L8 14 2 10.5V6L8 2.5z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-gray-100">Create an account</h1>
            <p className="mt-0.5 text-xs text-gray-500">Start building with ADW today</p>
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

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <InputField
            id="name" label="Full name" type="text"
            value={name} onChange={(v) => { setName(v); clear("name"); }}
            placeholder="Jane Smith" icon={<IconUser />}
            error={errors.name} autoComplete="name"
          />
          <InputField
            id="email" label="Email" type="email"
            value={email} onChange={(v) => { setEmail(v); clear("email"); }}
            placeholder="you@example.com" icon={<IconMail />}
            error={errors.email} autoComplete="email"
          />
          <InputField
            id="password" label="Password" type={showPassword ? "text" : "password"}
            value={password} onChange={(v) => { setPassword(v); clear("password"); }}
            placeholder="Min. 8 characters" icon={<IconLock />}
            error={errors.password} autoComplete="new-password"
            rightSlot={
              <button type="button" onClick={() => setShowPassword((s) => !s)}
                className="text-gray-500 transition-colors hover:text-gray-300" tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}>
                <IconEye off={showPassword} />
              </button>
            }
          />
          <InputField
            id="confirm" label="Confirm password" type={showConfirm ? "text" : "password"}
            value={confirm} onChange={(v) => { setConfirm(v); clear("confirm"); }}
            placeholder="Re-enter password" icon={<IconLock />}
            error={errors.confirm} autoComplete="new-password"
            rightSlot={
              <button type="button" onClick={() => setShowConfirm((s) => !s)}
                className="text-gray-500 transition-colors hover:text-gray-300" tabIndex={-1}
                aria-label={showConfirm ? "Hide password" : "Show password"}>
                <IconEye off={showConfirm} />
              </button>
            }
          />

          <motion.button
            type="submit" disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            whileTap={!loading ? buttonTap : {}}
            transition={{ duration: duration.fast }}
          >
            {loading ? <><Spinner />Creating account…</> : "Create account"}
          </motion.button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-indigo-400 transition-colors hover:text-indigo-300">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
