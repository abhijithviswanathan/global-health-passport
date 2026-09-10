"use client";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { Users, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, date } from "@/lib/api";
import { toast } from "sonner";
type Member = {
  id: string;
  name: string;
  username: string;
  role: string;
  organization: string;
  verificationStatus: string;
  evidenceReference: string;
  verifiedAt: string;
};
export function OrganizationPanel() {
  const [members, setMembers] = useState<Member[]>([]),
    [member, setMember] = useState<Member | null>(null),
    [status, setStatus] = useState("verified"),
    [evidence, setEvidence] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await api<Member[]>("/organization/members", { signal });
      if (signal?.aborted) return;
      setMembers(next);
      setError("");
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error ? e.message : "Unable to load organization.",
        );
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<Member[]>("/organization/members", { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          setMembers(next);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load organization.",
          );
      });
    return () => controller.abort();
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!member) return;
    setBusy(true);
    try {
      await api(`/organization/members/${member.id}/verification`, {
        method: "POST",
        body: { status, evidenceReference: evidence },
      });
      toast.success("Verification status updated");
      setMember(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Organization practitioners</h2>
            <p>
              Professional verification and suspension. This does not grant
              access to medical records.
            </p>
          </div>
          <Users size={22} />
        </div>
        {error && !member && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {members.map((m) => (
          <div className="consent-row" key={m.id}>
            <span className="soft-icon">
              <ShieldCheck size={20} />
            </span>
            <div className="grow">
              <h3>{m.name}</h3>
              <p>
                {m.role} · {m.organization}
              </p>
              <small>
                {m.evidenceReference || "No evidence reference recorded"} ·{" "}
                {date(m.verifiedAt)}
              </small>
            </div>
            <span className="status-pill neutral">
              {m.verificationStatus.replaceAll("_", " ")}
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setMember(m);
                setStatus(
                  m.verificationStatus === "suspended"
                    ? "verified"
                    : "suspended",
                );
                setEvidence("");
                setError("");
              }}
            >
              {m.verificationStatus === "suspended"
                ? "Review verification"
                : "Suspend access"}
            </Button>
          </div>
        ))}
      </section>
      <Dialog open={!!member} onOpenChange={(v) => !v && setMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {status === "suspended"
                ? "Suspend practitioner access"
                : "Record professional verification"}
            </DialogTitle>
            <DialogDescription>
              {status === "suspended"
                ? "Suspension revokes current sessions and sharing permissions. Record the review reference."
                : "Record the reference to your completed professional verification. This action is an organizational attestation, not license verification by the platform."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="dialog-form">
            <label>
              Review / evidence reference
              <Input
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                required
                maxLength={300}
              />
            </label>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <Button className="primary-button" disabled={busy}>
              {busy
                ? "Saving…"
                : status === "suspended"
                  ? "Suspend practitioner"
                  : "Record verification"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
