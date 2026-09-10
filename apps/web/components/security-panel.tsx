"use client";
import Image from "next/image";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  LockKeyhole,
  KeyRound,
  Smartphone,
  ShieldCheck,
  Plus,
  Copy,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, date, type User } from "@/lib/api";
import { registerPasskey } from "@/lib/passkeys";
import { toast } from "sonner";
import QRCode from "qrcode";
type Status = {
  totpEnabled: boolean;
  passkeysAvailable: boolean;
  recoveryCodesRemaining: number;
};
type Session = {
  id: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  device_label: string;
};
type Passkey = { id: string; created_at?: string; createdAt?: string };
export function SecurityPanel({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null),
    [sessions, setSessions] = useState<Session[]>([]),
    [keys, setKeys] = useState<Passkey[]>([]),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<"totp" | "passkey" | null>(null),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [secret, setSecret] = useState(""),
    [qr, setQr] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [s, ss, ks] = await Promise.all([
        api<Status>("/security/status", { signal }),
        api<Session[]>("/security/sessions", { signal }),
        api<Passkey[]>("/passkeys", { signal }).catch(() => []),
      ]);
      if (signal?.aborted) return;
      setStatus(s);
      setSessions(ss);
      setKeys(ks);
      setError("");
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error ? e.message : "Unable to load security settings.",
        );
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      api<Status>("/security/status", options),
      api<Session[]>("/security/sessions", options),
      api<Passkey[]>("/passkeys", options).catch(() => []),
    ])
      .then(([s, ss, ks]) => {
        if (!controller.signal.aborted) {
          setStatus(s);
          setSessions(ss);
          setKeys(ks);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load security settings.",
          );
      });
    return () => controller.abort();
  }, []);
  function open(which: "totp" | "passkey") {
    setDialog(which);
    setPassword("");
    setOtp("");
    setSecret("");
    setQr("");
    setCodes([]);
    setFormError("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (dialog === "passkey") {
        await registerPasskey(password, otp);
        setDialog(null);
        toast.success("Passkey enrolled");
      } else if (!secret) {
        const data = await api<{ secret: string; otpauthUri: string }>(
          "/security/totp/setup",
          { method: "POST", body: { password } },
        );
        setPassword("");
        setSecret(data.secret);
        setQr(
          await QRCode.toDataURL(data.otpauthUri, { width: 200, margin: 1 }),
        );
      } else {
        const data = await api<{ recoveryCodes: string[] }>(
          "/security/totp/confirm",
          { method: "POST", body: { otp } },
        );
        setCodes(data.recoveryCodes);
        setSecret("");
        setQr("");
        setOtp("");
        toast.success("Authenticator enabled");
      }
      await refresh();
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Account identity</h2>
            <p>Your login and clinical identity are distinct.</p>
          </div>
          <LockKeyhole size={22} />
        </div>
        <dl className="security-grid">
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{user.role}</dd>
          </div>
          <div>
            <dt>Organization</dt>
            <dd>{user.organization}</dd>
          </div>
        </dl>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Sign-in protection</h2>
          <Button
            variant="ghost"
            aria-label="Refresh security settings"
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
        <div className="security-row">
          <span className="soft-icon">
            <KeyRound size={22} />
          </span>
          <div>
            <h3>Passkeys</h3>
            <p>
              Use a device or hardware security key to sign in. {keys.length}{" "}
              enrolled.
            </p>
          </div>
          <Button variant="outline" onClick={() => open("passkey")}>
            <Plus size={16} />
            Add passkey
          </Button>
        </div>
        <div className="security-row">
          <span className="soft-icon">
            <Smartphone size={22} />
          </span>
          <div>
            <h3>Authenticator app</h3>
            <p>
              {status?.totpEnabled
                ? "A code is required when signing in with your password."
                : "Add a second factor using an authenticator app."}
            </p>
          </div>
          {status?.totpEnabled ? (
            <span className="status-pill">Enabled</span>
          ) : (
            <Button variant="outline" onClick={() => open("totp")}>
              Set up
            </Button>
          )}
        </div>
        <div className="security-row">
          <span className="soft-icon">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h3>Recovery codes</h3>
            <p>
              {status?.recoveryCodesRemaining || 0} unused codes. Store them
              securely away from this device. A code can reset your password and
              authentication methods.
            </p>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Devices & sessions</h2>
            <p>
              Sessions expire automatically. Revocation takes effect on the next
              request.
            </p>
          </div>
          <Button variant="outline" onClick={onLogout}>
            Sign out here
          </Button>
        </div>
        {sessions.map((s) => (
          <div className="security-row" key={s.id}>
            <span className="soft-icon">
              <Smartphone size={20} />
            </span>
            <div>
              <h3>{s.device_label || "Web or mobile session"}</h3>
              <p>
                Started {date(s.created_at, true)} · Expires{" "}
                {date(s.expires_at, true)}
              </p>
            </div>
            {s.revoked ? (
              <span className="status-pill neutral">Revoked</span>
            ) : (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await api(`/security/sessions/${s.id}/revoke`, {
                      method: "POST",
                    });
                    toast.success("Session revoked");
                    await refresh();
                  } catch (e) {
                    toast.error(
                      e instanceof Error
                        ? e.message
                        : "Unable to revoke session",
                    );
                  }
                }}
              >
                Revoke session
              </Button>
            )}
          </div>
        ))}
      </section>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v) {
            setDialog(null);
            setPassword("");
            setSecret("");
            setQr("");
            setCodes([]);
          }
        }}
      >
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>
              {codes.length
                ? "Save your recovery codes"
                : dialog === "passkey"
                  ? "Add a passkey"
                  : "Set up an authenticator"}
            </DialogTitle>
            <DialogDescription>
              {codes.length
                ? "These codes appear only once. Each can be used once to recover your account."
                : dialog === "passkey"
                  ? "Confirm your password, then follow your device’s instructions. Use localhost for this development build."
                  : "Confirm your password, then scan the QR code with your authenticator app."}
            </DialogDescription>
          </DialogHeader>
          {codes.length ? (
            <>
              <div className="recovery-codes">
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(codes.join("\n"));
                    toast.success("Recovery codes copied");
                  } catch {
                    toast.error(
                      "Unable to copy. Select and save the codes manually.",
                    );
                  }
                }}
              >
                <Copy size={16} />
                Copy recovery codes
              </Button>
              <Button
                className="primary-button"
                onClick={() => {
                  setDialog(null);
                  setCodes([]);
                }}
              >
                I saved my codes
              </Button>
            </>
          ) : (
            <form className="dialog-form" onSubmit={submit}>
              {secret ? (
                <>
                  <div className="totp-qr">
                    {qr && (
                      <Image
                        unoptimized
                        src={qr}
                        alt="QR code for authenticator enrollment"
                        width={200}
                        height={200}
                      />
                    )}
                  </div>
                  <label>
                    Manual setup key<code className="secret-key">{secret}</code>
                  </label>
                  <label>
                    Authenticator code
                    <Input
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      pattern="[0-9]{6}"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Current password
                    <Input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  {dialog === "passkey" && status?.totpEnabled && (
                    <label>
                      Authenticator code
                      <Input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        required
                        pattern="[0-9]{6}"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                      />
                    </label>
                  )}
                </>
              )}
              {formError && (
                <p role="alert" className="error-message">
                  {formError}
                </p>
              )}
              <Button className="primary-button" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : dialog === "passkey"
                    ? "Create passkey"
                    : secret
                      ? "Verify and enable"
                      : "Continue"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
