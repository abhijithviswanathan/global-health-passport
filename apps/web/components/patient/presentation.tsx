"use client";
/** Stateless patient presentation. Session, selection and requests stay in the application shell. */
import type { ReactNode } from "react";
import Link from "next/link";
import {
  HeartPulse,
  FileText,
  FlaskConical,
  AlertCircle,
  Pill,
  Stethoscope,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { kinds, date, type ClinicalRecord } from "@/lib/api";

export function Brand({ onHome }: { onHome?: () => void }) {
  return (
    <Link
      className="brand"
      href="/"
      aria-label="Health Passport home"
      onClick={
        onHome
          ? (e) => {
              e.preventDefault();
              onHome();
            }
          : undefined
      }
    >
      <span className="brand-mark">
        <HeartPulse size={25} />
      </span>
      <span>
        Health Passport<small>GLOBAL HEALTH RECORDS</small>
      </span>
    </Link>
  );
}

export function Empty({
  icon: Icon = FileText,
  title,
  children,
}: {
  icon?: typeof FileText;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Pick({
  value,
  onChange,
  options,
  label,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  id?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="select-field" aria-label={label} id={id}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RecordIcon({ kind }: { kind: string }) {
  const Icon = kind.includes("lab")
    ? FlaskConical
    : kind === "allergy"
      ? AlertCircle
      : kind === "condition"
        ? HeartPulse
        : ["medication", "prescription", "dispense"].includes(kind)
          ? Pill
          : kind === "encounter"
            ? Stethoscope
            : FileText;
  return (
    <span className={`record-icon ${kind}`}>
      <Icon size={19} />
    </span>
  );
}

export function RecordRow({
  record,
  onOpen,
}: {
  record: ClinicalRecord;
  onOpen: (r: ClinicalRecord) => void;
}) {
  return (
    <button className="record-row" onClick={() => onOpen(record)}>
      <RecordIcon kind={record.kind} />
      <span className="record-main">
        <strong>{record.title}</strong>
        <span>
          {kinds[record.kind] || record.kind} <span aria-hidden>·</span>{" "}
          {record.source}
        </span>
      </span>
      <span className="record-date">
        {String(record.freshness_label || "Observation date unknown")}
        <br />
        Entered {date(record.created_at)}
      </span>
      <ChevronRight size={16} />
    </button>
  );
}
