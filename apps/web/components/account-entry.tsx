"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { ShieldCheck } from "lucide-react";
export function AccountEntry() {
  const [mode, setMode] = useState<"register" | "recover" | null>(null),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  function open(m: "register" | "recover") {
    setMode(m);
    setError("");
    setSuccess("");
    setPassword("");
    setCode("");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        const data = await api<{ healthId: string }>("/auth/register", {
          method: "POST",
          body: { username, displayName: name, password },
        });
        setSuccess(
          `Your synthetic account is ready. Health ID: ${data.healthId}. Sign in with the username and password you chose.`,
        );
      } else {
        await api("/auth/recover", {
          method: "POST",
          body: { username, recoveryCode: code, newPassword: password },
        });
        setSuccess(
          "Your password has been reset and previous sessions revoked. Sign in and enroll new authentication methods.",
        );
      }
      setPassword("");
      setCode("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete the request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="account-entry-links">
        <button onClick={() => open("register")}>
          Create a synthetic account
        </button>
        <button onClick={() => open("recover")}>Recover account</button>
      </div>
      <Dialog open={!!mode} onOpenChange={(v) => !v && setMode(null)}>
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>
              {mode === "register"
                ? "Create a patient account"
                : "Recover your account"}
            </DialogTitle>
            <DialogDescription>
              {mode === "register"
                ? "This development environment accepts synthetic information only. A permanent random Health ID will be generated."
                : "Use a saved one-time recovery code. A phone number, date of birth, or Health ID cannot recover an account."}
            </DialogDescription>
          </DialogHeader>
          {success ? (
            <>
              <div role="status" className="notice">
                <ShieldCheck size={22} />
                <p>{success}</p>
              </div>
              <Button className="primary-button" onClick={() => setMode(null)}>
                Return to sign in
              </Button>
            </>
          ) : (
            <form className="dialog-form" onSubmit={submit}>
              <label>
                Username
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={80}
                  pattern="[a-z][a-z0-9._-]{2,79}"
                  autoComplete="username"
                />
              </label>
              {mode === "register" ? (
                <label>
                  Display name (synthetic)
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
              ) : (
                <label>
                  Recovery code
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </label>
              )}
              <label>
                {mode === "recover" ? "New password" : "Password"}
                <Input
                  aria-label={mode === "recover" ? "New password" : "Password"}
                  aria-describedby="password-guidance"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={72}
                  autoComplete="new-password"
                />
                <span id="password-guidance" className="field-help">
                  At least 12 characters. Use a unique password.
                </span>
              </label>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <Button className="primary-button" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "register"
                    ? "Create account"
                    : "Recover account"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
