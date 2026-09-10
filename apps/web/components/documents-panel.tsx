"use client";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import { FileText, Upload, Download, ShieldCheck } from "lucide-react";
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
type DocumentMeta = {
  id: string;
  patientId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  status: string;
  source: string;
  createdAt: string;
  authorId: string;
};
export function DocumentsPanel({ patientId }: { patientId: string }) {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!patientId || signal?.aborted) return;
      try {
        const next = await api<DocumentMeta[]>(
          `/patients/${patientId}/documents`,
          { signal },
        );
        if (signal?.aborted) return;
        setDocuments(next);
        setError("");
      } catch (e) {
        if (!signal?.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load documents.",
          );
      }
    },
    [patientId],
  );
  useEffect(() => {
    if (!patientId) return;
    const controller = new AbortController();
    api<DocumentMeta[]>(`/patients/${patientId}/documents`, {
      signal: controller.signal,
    })
      .then((next) => {
        if (!controller.signal.aborted) {
          setDocuments(next);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Unable to load documents.",
          );
      });
    return () => controller.abort();
  }, [patientId]);
  const visibleDocuments = documents.filter((d) => d.patientId === patientId);
  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose a file smaller than 10 MB.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      await api(`/patients/${patientId}/documents`, { method: "POST", body });
      setOpen(false);
      setFile(null);
      toast.success("Document received. Its scan status is shown below.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function download(d: DocumentMeta) {
    try {
      const r = await fetch(`/api/documents/${d.id}/download`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!r.ok)
        throw new Error(
          "This document is not available for download. It may be quarantined or your access may have changed.",
        );
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = d.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Uploaded documents</h2>
            <p>Encrypted uploads, with original source and scan status.</p>
          </div>
          {patientId && (
            <Button
              className="primary-button"
              onClick={() => {
                setError("");
                setOpen(true);
              }}
            >
              <Upload size={16} />
              Upload document
            </Button>
          )}
        </div>
        {error && !open && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {visibleDocuments.length ? (
          visibleDocuments.map((d) => (
            <div className="consent-row" key={d.id}>
              <span className="soft-icon">
                <FileText size={20} />
              </span>
              <div className="grow">
                <h3>{d.filename}</h3>
                <p>
                  {d.source} · {date(d.createdAt)}
                </p>
                <small>
                  {Math.ceil(d.sizeBytes / 1024)} KB · {d.mediaType}
                </small>
              </div>
              <span
                className={`status-pill ${d.status === "clean" ? "" : "warning"}`}
              >
                {d.status}
              </span>
              <Button
                variant="outline"
                disabled={d.status !== "clean"}
                onClick={() => download(d)}
              >
                <Download size={16} />
                Download
              </Button>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <span>
              <FileText size={25} />
            </span>
            <h3>No uploaded documents</h3>
            <p>
              Upload a historical report as PDF, JPEG, or PNG. Files stay
              quarantined until a configured malware scanner clears them.
            </p>
          </div>
        )}
      </section>
      <p className="inline-notice">
        <ShieldCheck size={17} />A clean malware scan does not verify clinical
        accuracy. Patient uploads remain unverified.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload a historical document</DialogTitle>
            <DialogDescription>
              PDF, JPEG, or PNG · Maximum 10 MB. Use synthetic information only.
              Uploads without an available scanner remain quarantined.
            </DialogDescription>
          </DialogHeader>
          <form className="dialog-form" onSubmit={upload}>
            <label>
              Document file
              <Input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <Button className="primary-button" disabled={busy || !file}>
              {busy ? "Uploading…" : "Upload securely"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
