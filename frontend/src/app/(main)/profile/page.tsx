"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import {
  auth,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "@/lib/firebase";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  sendEmailVerification,
  updatePassword,
} from "firebase/auth";

// ── helpers ────────────────────────────────────────────────────────────────────

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function providerLabel(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return "Email";
  const id = user.providerData[0]?.providerId ?? "password";
  if (id === "google.com") return "Google";
  if (id === "github.com") return "GitHub";
  return "Email / Password";
}

function isEmailProvider(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return false;
  return (
    user.providerData[0]?.providerId === "password" ||
    user.providerData.length === 0
  );
}

// ── sub-components ─────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: "red";
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        accent === "red"
          ? "border-red-500/25 bg-red-500/5"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <h2
        className={`mb-5 text-sm font-semibold uppercase tracking-widest ${
          accent === "red" ? "text-red-400" : "text-[var(--text-muted)]"
        }`}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-[var(--text-muted)] shrink-0">{label}</span>
      <div className="text-sm text-gray-200 text-right">{children}</div>
    </div>
  );
}

function ComingSoon() {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
      Coming Soon
    </span>
  );
}

// ── Change Password Modal ──────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (next !== confirm) return setErr("Passwords don't match.");
    if (next.length < 6) return setErr("Min 6 characters.");
    const u = auth.currentUser;
    if (!u || !u.email) return;
    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(u.email, current);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, next);
      setOk(true);
    } catch (e: any) {
      setErr(e.message ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="app-panel-strong w-full max-w-sm rounded-2xl p-6">
        <h3 className="mb-4 text-base font-semibold text-gray-100">
          Change Password
        </h3>
        {ok ? (
          <div className="space-y-4">
            <p className="text-sm text-green-400">Password updated!</p>
            <button
              onClick={onClose}
              className="app-button-primary w-full rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {(
              [
                ["Current password", current, setCurrent],
                ["New password", next, setNext],
                ["Confirm new password", confirm, setConfirm],
              ] as [string, string, (v: string) => void][]
            ).map(([label, val, set]) => (
              <div key={label}>
                <label className="mb-1 block text-xs text-[var(--text-muted)]">
                  {label}
                </label>
                <input
                  type="password"
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className="app-input w-full rounded-xl px-3 py-2.5 text-sm"
                  required
                />
              </div>
            ))}
            {err && <p className="text-xs text-red-400">{err}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="app-button-secondary flex-1 rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="app-button-primary flex-1 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Delete Account Modal ───────────────────────────────────────────────────────

function DeleteAccountModal({
  onClose,
  onDeleted,
}: {
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const u = auth.currentUser;
    if (!u || !u.email) return;
    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(u.email, password);
      await reauthenticateWithCredential(u, cred);
      await deleteUser(u);
      onDeleted();
    } catch (e: any) {
      setErr(e.message ?? "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="app-panel-strong w-full max-w-sm rounded-2xl p-6">
        <h3 className="mb-2 text-base font-semibold text-red-400">
          Delete Account
        </h3>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          This is permanent. All your projects and data will be deleted. Enter
          your password to confirm.
        </p>
        <form onSubmit={confirm} className="space-y-3">
          <input
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="app-input w-full rounded-xl px-3 py-2.5 text-sm"
            required
          />
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="app-button-secondary flex-1 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete Forever"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({
  user,
  isAdmin,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  isAdmin: boolean;
}) {
  const ring = isAdmin
    ? "ring-2 ring-red-400/70"
    : "ring-2 ring-[rgba(45,212,191,0.35)]";
  if (user.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt="avatar"
        className={`h-16 w-16 rounded-full object-cover ${ring}`}
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
    <div
      className={`flex h-16 w-16 items-center justify-center rounded-full text-lg font-bold text-white ${ring} ${
        isAdmin ? "bg-red-600" : "bg-[var(--accent-strong)]"
      }`}
    >
      {initials}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAdmin = user?.role === "admin";
  const emailProvider = isEmailProvider(user);

  // edit display name
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState("");
  const [nameBusy, setNameBusy] = useState(false);

  // modals
  const [showChangePw, setShowChangePw] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);

  // verification
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");

  // preferences (local state only — wire to backend when ready)
  const [theme, setTheme] = useState("Dark");
  const [lang, setLang] = useState("English");
  const [notifs, setNotifs] = useState(true);
  const [aiLang, setAiLang] = useState("Python");

  async function saveName() {
    if (!auth.currentUser || !nameVal.trim()) return;
    setNameBusy(true);
    try {
      await updateProfile(auth.currentUser, { displayName: nameVal.trim() });
      setEditingName(false);
    } finally {
      setNameBusy(false);
    }
  }

  async function sendVerification() {
    if (!auth.currentUser) return;
    setVerifyBusy(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyMsg("Verification email sent!");
    } catch (e: any) {
      setVerifyMsg(e.message ?? "Failed.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  return (
    <>
      {showChangePw && (
        <ChangePasswordModal onClose={() => setShowChangePw(false)} />
      )}
      {showDeleteAccount && (
        <DeleteAccountModal
          onClose={() => setShowDeleteAccount(false)}
          onDeleted={() => router.replace("/login")}
        />
      )}

      <div className="scrollbar-thin flex h-full flex-col overflow-y-auto">
        {/* Header */}
        <div className="border-b border-white/10 px-8 py-6">
          <div className="flex items-center gap-4">
            <Avatar user={user} isAdmin={isAdmin} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-gray-100">
                  {user.displayName ?? "Account"}
                </h1>
                {isAdmin ? (
                  <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                    Admin
                  </span>
                ) : (
                  <span className="app-chip rounded-full px-2 py-0.5 text-[10px] font-medium">
                    User
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-muted)]">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl space-y-5 px-8 py-8">
          {/* ── Profile ── */}
          <Section title="Profile">
            <Row label="Display name">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameVal}
                    onChange={(e) => setNameVal(e.target.value)}
                    className="app-input rounded-lg px-2.5 py-1.5 text-sm w-40"
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                  />
                  <button
                    onClick={saveName}
                    disabled={nameBusy}
                    className="app-button-primary rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {nameBusy ? "…" : "Save"}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="text-xs text-[var(--text-muted)] hover:text-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{user.displayName ?? "—"}</span>
                  <button
                    onClick={() => {
                      setNameVal(user.displayName ?? "");
                      setEditingName(true);
                    }}
                    className="text-[11px] text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}
            </Row>
            <Row label="Email">{user.email}</Row>
            <Row label="UID">
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {user.uid}
              </span>
            </Row>
            <Row label="Role">
              {isAdmin ? (
                <span className="rounded-full bg-red-900/50 px-2 py-0.5 text-[11px] font-medium text-red-300">
                  Admin
                </span>
              ) : (
                <span className="app-chip rounded-full px-2 py-0.5 text-[11px] font-medium">
                  User
                </span>
              )}
            </Row>
            <Row label="Provider">{providerLabel(user)}</Row>
            <Row label="Joined">{fmt(user.metadata.creationTime)}</Row>
            <Row label="Last sign-in">{fmt(user.metadata.lastSignInTime)}</Row>
          </Section>

          {/* ── Security ── */}
          <Section title="Security">
            <Row label="Email verified">
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    user.emailVerified ? "bg-green-400" : "bg-amber-400"
                  }`}
                />
                <span
                  className={
                    user.emailVerified ? "text-green-400" : "text-amber-400"
                  }
                >
                  {user.emailVerified ? "Verified" : "Unverified"}
                </span>
                {!user.emailVerified && (
                  <button
                    onClick={sendVerification}
                    disabled={verifyBusy}
                    className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-50"
                  >
                    {verifyBusy ? "Sending…" : "Send verification"}
                  </button>
                )}
              </div>
            </Row>
            {verifyMsg && (
              <p className="mt-1 text-xs text-green-400">{verifyMsg}</p>
            )}
            <Row label="Password">
              {emailProvider ? (
                <button
                  onClick={() => setShowChangePw(true)}
                  className="text-[11px] text-[var(--accent)] hover:underline"
                >
                  Change password
                </button>
              ) : (
                <span className="text-[var(--text-muted)]">
                  Managed by {providerLabel(user)}
                </span>
              )}
            </Row>
            <Row label="Two-factor auth">
              <ComingSoon />
            </Row>
            <Row label="Active sessions">
              <ComingSoon />
            </Row>
          </Section>

          {/* ── Usage & Quota ── */}
          <Section title="Usage & Quota">
            <Row label="Projects">
              <span className="font-mono">—</span>
            </Row>
            <Row label="AI calls">
              <span className="font-mono">—</span>
            </Row>
            <Row label="Tokens used">
              <span className="font-mono">—</span>
            </Row>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
                <span>Token quota</span>
                <span>— / —</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: "0%" }}
                />
              </div>
            </div>
          </Section>

          {/* ── Preferences ── */}
          <Section title="Preferences">
            <Row label="Theme">
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="app-input rounded-lg px-2.5 py-1.5 text-sm"
              >
                {["Dark", "Light", "System"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Row>
            <Row label="Language">
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className="app-input rounded-lg px-2.5 py-1.5 text-sm"
              >
                {["English", "Spanish", "French", "German", "Japanese"].map(
                  (l) => (
                    <option key={l}>{l}</option>
                  )
                )}
              </select>
            </Row>
            <Row label="Notifications">
              <button
                onClick={() => setNotifs((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  notifs ? "bg-[var(--accent)]" : "bg-white/20"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    notifs ? "translate-x-4" : "translate-x-1"
                  }`}
                />
              </button>
            </Row>
            <Row label="Default AI language">
              <select
                value={aiLang}
                onChange={(e) => setAiLang(e.target.value)}
                className="app-input rounded-lg px-2.5 py-1.5 text-sm"
              >
                {["Python", "TypeScript", "JavaScript", "Go", "Rust"].map(
                  (l) => (
                    <option key={l}>{l}</option>
                  )
                )}
              </select>
            </Row>
          </Section>

          {/* ── Connected Apps ── */}
          <Section title="Connected Apps">
            {[
              { name: "GitHub", icon: "🐙" },
              { name: "AWS", icon: "☁️" },
              { name: "Webhooks", icon: "🔗" },
            ].map(({ name, icon }) => (
              <Row key={name} label={`${icon} ${name}`}>
                <ComingSoon />
              </Row>
            ))}
          </Section>

          {/* ── Data & Privacy ── */}
          <Section title="Data & Privacy">
            <Row label="Export data">
              <button className="text-[11px] text-[var(--accent)] hover:underline">
                Export JSON
              </button>
            </Row>
            <Row label="Clear all projects">
              <button className="text-[11px] text-red-400 hover:underline">
                Clear projects
              </button>
            </Row>
          </Section>

          {/* ── Account Actions ── */}
          <Section title="Account Actions">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-red-300 transition-colors hover:bg-red-500/10"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z"
                  clipRule="evenodd"
                />
              </svg>
              Sign out
            </button>
          </Section>

          {/* ── Danger Zone ── */}
          <Section title="Danger Zone" accent="red">
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Permanently delete your account and all associated data. This
              cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteAccount(true)}
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              Delete my account
            </button>
          </Section>
        </div>
      </div>
    </>
  );
}
