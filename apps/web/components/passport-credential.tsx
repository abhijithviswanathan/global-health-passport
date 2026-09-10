"use client";
import Image from "next/image";
import { useState } from "react";
import { QrCode, ShieldCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, date } from "@/lib/api";
import QRCode from "qrcode";
type Passport = {
  id: string;
  credential: string;
  reference: string;
  qrPayload: string;
  expiresAt: string;
  notice: string;
};
export function PassportCredential({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Passport | null>(null),
    [qr, setQr] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function issue() {
    setOpen(true);
    setBusy(true);
    setError("");
    setData(null);
    try {
      const d = await api<Passport>("/medication-passports", {
        method: "POST",
        body: { patientId },
      });
      setData(d);
      setQr(await QRCode.toDataURL(d.qrPayload, { width: 220, margin: 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to generate passport.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={issue} disabled={busy || !patientId}>
        <QrCode size={16} />
        Generate QR
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setData(null);
            setQr("");
          }
        }}
      >
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>Medication Passport credential</DialogTitle>
            <DialogDescription>
              The QR contains an expiring reference. The recipient must sign in
              and have permission to view the records.
            </DialogDescription>
          </DialogHeader>
          {busy && <p role="status">Creating your signed snapshot…</p>}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          {data && (
            <>
              <div className="totp-qr">
                <Image
                  unoptimized
                  src={qr}
                  alt="Expiring medication passport reference"
                  width={220}
                  height={220}
                />
              </div>
              <p className="inline-notice">
                <ShieldCheck size={18} />
                Expires {date(data.expiresAt, true)}. A signature verifies
                integrity, not clinical truth or international acceptance.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([data.credential], { type: "application/jose" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "medication-passport.jws";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={16} />
                Download signed snapshot
              </Button>
              <p className="field-help">
                The downloaded credential contains the included health
                information. Share it only with your intended recipient.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
