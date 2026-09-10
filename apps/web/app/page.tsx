"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  HeartPulse,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Globe2,
  LockKeyhole,
  LayoutDashboard,
  Clock3,
  Pill,
  FileText,
  Users,
  Activity,
  Settings2,
  Search,
  Plus,
  LogOut,
  Sun,
  Moon,
  ChevronRight,
  FlaskConical,
  Download,
  Check,
  ClipboardList,
  Stethoscope,
  AlertCircle,
  RefreshCw,
  BadgeCheck,
  KeyRound,
  Printer,
  Filter,
  Shield,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { OrganizationPanel } from "@/components/organization-panel";
import { LearningPanel, SourceSummary } from "@/components/learning-panel";
import { PassportCredential } from "@/components/passport-credential";
import { AccountEntry } from "@/components/account-entry";
import { DocumentsPanel } from "@/components/documents-panel";
import { SecurityPanel } from "@/components/security-panel";
import { signInWithPasskey } from "@/lib/passkeys";
import {
  api,
  ApiError,
  kinds,
  date,
  type User,
  type ClinicalRecord,
  type Consent,
  type AccessRequest,
  type Audit,
} from "@/lib/api";

type View =
  | "overview"
  | "timeline"
  | "medications"
  | "documents"
  | "sharing"
  | "activity"
  | "security"
  | "labs"
  | "learning"
  | "organization";
const titles: Record<View, string> = {
  overview: "Your health, in perspective",
  timeline: "Medical timeline",
  medications: "Medication Passport",
  documents: "Clinical documents",
  sharing: "Sharing & permissions",
  activity: "Access history",
  security: "Account security",
  labs: "Laboratory & imaging",
  learning: "Clinical learning",
  organization: "Organization administration",
};
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "timeline", label: "Medical timeline", icon: Clock3 },
  { id: "medications", label: "Medication Passport", icon: Pill },
  { id: "labs", label: "Labs & imaging", icon: FlaskConical },
  { id: "documents", label: "Clinical documents", icon: FileText },
  { id: "sharing", label: "Sharing & permissions", icon: Users },
  { id: "activity", label: "Access history", icon: Activity },
  { id: "security", label: "Account security", icon: Settings2 },
  { id: "learning", label: "Clinical learning", icon: Search },
  { id: "organization", label: "Organization", icon: Users },
] as const;
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <HeartPulse size={25} />
      </span>
      <span>
        Health Passport<small>GLOBAL HEALTH RECORDS</small>
      </span>
    </div>
  );
}
function Empty({
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
function Pick({
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
function RecordIcon({ kind }: { kind: string }) {
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
function RecordRow({
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
      <span className="record-date">{date(record.created_at)}</span>
      <ChevronRight size={16} />
    </button>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [dark, setDark] = useState(false);
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("overview"),
    [patients, setPatients] = useState<User[]>([]),
    [patientId, setPatientId] = useState(""),
    [recipients, setRecipients] = useState<User[]>([]);
  const [records, setRecords] = useState<ClinicalRecord[]>([]),
    [consents, setConsents] = useState<Consent[]>([]),
    [requests, setRequests] = useState<AccessRequest[]>([]),
    [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("all"),
    [from, setFrom] = useState("");
  const [detail, setDetail] = useState<ClinicalRecord | null>(null),
    [dialog, setDialog] = useState<"record" | "grant" | "request" | null>(null),
    [revoke, setRevoke] = useState<Consent | null>(null);
  const [recordKind, setRecordKind] = useState("note"),
    [recordTitle, setRecordTitle] = useState(""),
    [recordText, setRecordText] = useState(""),
    [related, setRelated] = useState(""),
    [amending, setAmending] = useState(""),
    [recipient, setRecipient] = useState(""),
    [grantScopes, setGrantScopes] = useState<string[]>([
      "allergy",
      "condition",
      "medication",
      "encounter",
      "lab_order",
      "lab_result",
      "prescription",
      "note",
    ]),
    [days, setDays] = useState("30"),
    [healthId, setHealthId] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [clinicalStatus, setClinicalStatus] = useState("unknown");
  const [quantity, setQuantity] = useState("30"),
    [refills, setRefills] = useState("0"),
    [dosage, setDosage] = useState(""),
    [route, setRoute] = useState("oral"),
    [frequency, setFrequency] = useState(""),
    [duration, setDuration] = useState(""),
    [formError, setFormError] = useState("");
  const requestGeneration = useRef(0);
  const invalidateRequests = useCallback(() => {
    requestGeneration.current++;
  }, []);
  const changeSession = useCallback((next: User | null) => {
    requestGeneration.current++;
    setUser(next);
    setPatientId("");
    setPatients([]);
    setRecords([]);
    setConsents([]);
    setRequests([]);
    setAudits([]);
    setRecipients([]);
    setDetail(null);
    setDialog(null);
    setLoading(!!next);
  }, []);
  function changePatient(next: string) {
    requestGeneration.current++;
    setRecords([]);
    setDetail(null);
    setDialog(null);
    setPatientId(next);
    setLoading(true);
  }
  const patient = user?.role === "patient";
  const admin = user?.role === "admin" || user?.role === "security";
  const selected = patients.find((p) => p.id === patientId);
  const active = records.filter((r) => r.status === "active");
  const medications = active.filter((r) =>
    ["medication", "prescription"].includes(r.kind),
  );
  const allergies = active.filter((r) => r.kind === "allergy");
  const visible = records.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      (!from || new Date(r.created_at) >= new Date(from)) &&
      `${r.title} ${r.details} ${r.source} ${r.author_name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const writeKinds =
    user?.role === "doctor"
      ? [
          "encounter",
          "condition",
          "allergy",
          "medication",
          "prescription",
          "lab_order",
          "note",
        ]
      : user?.role === "lab"
        ? ["lab_result", "imaging_report"]
        : user?.role === "pharmacy"
          ? ["dispense"]
          : ["note", "allergy", "condition", "medication"];
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ghp-theme", next ? "dark" : "light");
  };
  useEffect(() => {
    const controller = new AbortController();
    const saved = localStorage.getItem("ghp-theme");
    const value = saved
      ? saved === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    // Browser-only preferences are synchronized after hydration to preserve server/client markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(value);
    document.documentElement.classList.toggle("dark", value);
    api<User>("/me", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) changeSession(value);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [changeSession]);
  const fetchWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      if (!user) return null;
      const options = { signal };
      const [ps, cs, rs, as, us] = await Promise.all([
        api<User[]>("/patients", options),
        api<Consent[]>("/consents", options),
        api<AccessRequest[]>("/access-requests", options),
        api<Audit[]>("/audit", options),
        api<User[]>("/users", options),
      ]);
      const next = ps.some((p) => p.id === patientId)
        ? patientId
        : ps[0]?.id || "";
      const nextRecords = next
        ? await api<ClinicalRecord[]>(`/patients/${next}/timeline`, options)
        : [];
      return { ps, cs, rs, as, us, next, nextRecords };
    },
    [user, patientId],
  );
  const applyWorkspace = useCallback(
    (data: Awaited<ReturnType<typeof fetchWorkspace>>) => {
      if (!data) return;
      const { ps, cs, rs, as, us, next, nextRecords } = data;
      setPatients(ps);
      setConsents(cs);
      setRequests(rs);
      setAudits(as);
      setRecipients(us);
      setPatientId(next);
      setRecords(nextRecords);
      setError("");
    },
    [],
  );
  const refreshError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) changeSession(null);
      else
        setError(
          e instanceof Error ? e.message : "Unable to refresh your records.",
        );
    },
    [changeSession],
  );
  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const data = await fetchWorkspace();
      if (generation === requestGeneration.current) applyWorkspace(data);
    } catch (e) {
      if (generation === requestGeneration.current) refreshError(e);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [fetchWorkspace, applyWorkspace, refreshError]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    void fetchWorkspace(controller.signal)
      .then((data) => {
        if (
          !controller.signal.aborted &&
          generation === requestGeneration.current
        )
          applyWorkspace(data);
      })
      .catch((e) => {
        if (
          !controller.signal.aborted &&
          generation === requestGeneration.current
        )
          refreshError(e);
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          generation === requestGeneration.current
        )
          setLoading(false);
      });
    return () => {
      invalidateRequests();
      controller.abort();
    };
  }, [fetchWorkspace, applyWorkspace, refreshError, invalidateRequests]);
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => void refresh(), 60000);
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [user, refresh]);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const u = await api<User>("/auth/login", {
        method: "POST",
        body: { username, password, otp, totp: otp, code: otp },
      });
      changeSession(u);
      setPassword("");
      setOtp("");
      setView(
        u.role === "admin" || u.role === "security" ? "activity" : "overview",
      );
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    requestGeneration.current++;
    setRecords([]);
    try {
      await api("/auth/logout", { method: "POST" });
      changeSession(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign out failed.");
    }
  }
  function openRecord(k = "note", amend?: ClinicalRecord) {
    setRequestKey(crypto.randomUUID());
    setClinicalStatus(String(amend?.clinical_status || "unknown"));
    setRecordKind(k);
    setRecordTitle(amend?.title || "");
    setRecordText(amend?.details || "");
    setAmending(amend?.id || "");
    setRelated(amend?.related_id || "");
    setRecipient("");
    setQuantity("30");
    setRefills("0");
    setDosage("");
    setFrequency("");
    setDuration("");
    setFormError("");
    setDetail(null);
    setDialog("record");
  }
  function openGrant(id?: string) {
    const u = recipients.find((x) => x.id === id) || recipients[0];
    setRecipient(u?.id || "");
    setGrantScopes(
      u?.role === "lab"
        ? ["lab_order", "lab_result", "imaging_report"]
        : u?.role === "pharmacy"
          ? ["prescription", "dispense"]
          : [
              "allergy",
              "condition",
              "medication",
              "encounter",
              "lab_order",
              "lab_result",
              "prescription",
              "note",
            ],
    );
    setFormError("");
    setDialog("grant");
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (dialog === "grant")
        await api("/consents", {
          method: "POST",
          body: {
            patientId: user?.id,
            granteeId: recipient,
            purpose: "treatment",
            scopes: grantScopes,
            expiresAt: new Date(
              Date.now() + Number(days) * 86400000,
            ).toISOString(),
          },
        });
      else if (dialog === "request")
        await api("/access-requests", {
          method: "POST",
          body: { healthId: healthId.trim(), purpose: "treatment" },
        });
      else
        await api("/records", {
          method: "POST",
          body: {
            patientId,
            kind: recordKind,
            title: recordTitle,
            details: recordText,
            ...(clinicalStatus !== "unknown" &&
            ["allergy", "condition"].includes(recordKind)
              ? { clinicalStatus }
              : {}),
            ...(related ? { relatedId: related } : {}),
            ...(amending ? { replacesId: amending } : {}),
            ...(recipient ? { recipientId: recipient } : {}),
            ...(["prescription", "dispense"].includes(recordKind)
              ? {
                  quantity: Number(quantity),
                  refills: Number(refills),
                  dosage,
                  route,
                  frequency,
                  duration,
                  idempotencyKey: requestKey,
                }
              : {}),
          },
        });
      toast.success(
        dialog === "grant"
          ? "Access granted"
          : dialog === "request"
            ? "Request submitted. A valid identifier will notify the patient."
            : amending
              ? "Amendment saved with its history"
              : "Record saved",
      );
      setDialog(null);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  async function exportData(format: "export" | "fhir") {
    try {
      const data = await api(`/patients/${patientId}/${format}`);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `health-passport-${format}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    }
  }
  function navigate(v: View) {
    setView(v);
    setSearch("");
    setKind("all");
    setFrom("");
  }
  useEffect(() => {
    type MC = {
      registerTool: (
        tool: unknown,
        options: { signal: AbortSignal },
      ) => unknown;
    };
    const context = (document as unknown as { modelContext?: MC }).modelContext;
    if (!context) return;
    const life = new AbortController();
    try {
      void context.registerTool(
        {
          name: "navigate_health_passport",
          description:
            "Navigate to a Health Passport section. Does not disclose records or grant access.",
          inputSchema: {
            type: "object",
            properties: {
              section: { type: "string", enum: Object.keys(titles) },
            },
            required: ["section"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input: unknown) {
            const v = (input as { section?: string })?.section;
            if (!v || !Object.keys(titles).includes(v))
              throw new Error("Unknown section");
            navigate(v as View);
            return { section: v };
          },
        },
        { signal: life.signal },
      );
    } catch {}
    return () => life.abort();
  }, []);
  if (!ready)
    return (
      <main className="startup" aria-label="Loading Health Passport">
        <Brand />
        <p role="status">Opening your secure workspace…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login-page">
        <section className="login-story">
          <Brand />
          <div className="login-story-body">
            <span className="eyebrow">CONTINUITY OF CARE</span>
            <h1>
              Your health.
              <br />A lifelong story.
            </h1>
            <p>
              Keep your records connected, understand your history, and choose
              who can access it.
            </p>
            <div className="story-features">
              <div>
                <ShieldCheck />
                Sharing you control
              </div>
              <div>
                <HeartPulse />
                Care with context
              </div>
              <div>
                <Globe2 />A record that follows you
              </div>
            </div>
          </div>
          <p className="story-footer">
            Every record has a source. Every access leaves a trace.
          </p>
        </section>
        <section className="login-form-panel">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={dark ? "Use light theme" : "Use dark theme"}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          <div className="login-form-wrap">
            <div className="environment-label">
              SYNTHETIC DEVELOPMENT ENVIRONMENT
            </div>
            <div className="login-icon">
              <LockKeyhole />
            </div>
            <h2>Welcome back</h2>
            <p className="muted">Sign in to your Health Passport.</p>
            <form className="form-stack" onSubmit={login}>
              <label htmlFor="username">
                Username
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="Enter your username"
                />
              </label>
              <label htmlFor="password">
                Password
                <Input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label htmlFor="otp">
                Authenticator code{" "}
                <span className="field-help">If enabled for your account</span>
                <Input
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                />
              </label>
              {loginError && (
                <p role="alert" className="error-message">
                  {loginError}
                </p>
              )}
              <Button disabled={busy} className="primary-button">
                {busy ? "Signing in…" : "Sign in securely"}
                <ArrowRight size={18} />
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              className="passkey-login"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setLoginError("");
                try {
                  if (!username) throw new Error("Enter your username first.");
                  const u = await signInWithPasskey(username);
                  changeSession(u);
                  setPassword("");
                  setView(
                    u.role === "admin" || u.role === "security"
                      ? "activity"
                      : "overview",
                  );
                } catch (e) {
                  setLoginError(
                    e instanceof Error ? e.message : "Passkey sign-in failed.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <KeyRound size={17} />
              Sign in with a passkey
            </Button>
            <AccountEntry />
            <div className="login-note">
              <ShieldCheck size={18} />
              <p>
                Use a locally generated development account. Only synthetic
                information belongs in this environment.
              </p>
            </div>
          </div>
          <p className="login-footer">
            Global Health Passport · Development build
          </p>
        </section>
        <Toaster />
      </main>
    );
  return (
    <SidebarProvider>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar className="passport-sidebar">
        <SidebarHeader>
          <Brand />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              {patient
                ? "MY HEALTH"
                : admin
                  ? "ADMINISTRATION"
                  : "CLINICAL WORKSPACE"}
            </SidebarGroupLabel>
            <SidebarMenu>
              {nav
                .filter(
                  (n) =>
                    (!admin ||
                      ["activity", "security", "organization"].includes(
                        n.id,
                      )) &&
                    (n.id !== "organization" || user.role === "admin") &&
                    (n.id !== "learning" || user.role === "doctor") &&
                    (user.role !== "pharmacy" ||
                      [
                        "overview",
                        "medications",
                        "sharing",
                        "activity",
                        "security",
                      ].includes(n.id)) &&
                    (user.role !== "lab" ||
                      [
                        "overview",
                        "labs",
                        "sharing",
                        "activity",
                        "security",
                      ].includes(n.id)),
                )
                .map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={view === id}
                      onClick={() => navigate(id)}
                      className="nav-button"
                    >
                      <Icon />
                      <span>
                        {id === "overview" && !patient
                          ? "Patient overview"
                          : label}
                      </span>
                      {id === "sharing" &&
                        requests.some((r) => r.status === "pending") && (
                          <span className="nav-dot" />
                        )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <strong>Private by design</strong>
            <p>Access is limited by your role and sharing permissions.</p>
          </div>
          <div className="account-row">
            <span className="avatar">{user.name?.charAt(0) || "H"}</span>
            <span>
              <strong>{user.name.replace(" (Synthetic)", "")}</strong>
              <small>{user.role} account</small>
            </span>
            <button aria-label="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="topbar-left">
            <SidebarTrigger />
            <span>
              {patient
                ? "Patient portal"
                : `${user.role.charAt(0).toUpperCase() + user.role.slice(1)} portal`}
            </span>
            <ChevronRight size={14} />
            <span className="muted">
              {nav.find((n) => n.id === view)?.label}
            </span>
          </div>
          <div className="topbar-right">
            <span className="synthetic-badge">Synthetic data</span>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={dark ? "Use light theme" : "Use dark theme"}
            >
              {dark ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>
        <main id="main-content" className="workspace" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {patient ? "YOUR PERSONAL HEALTH RECORD" : user.organization}
              </span>
              <h1>
                {view === "overview" && !patient
                  ? "Patient workspace"
                  : titles[view]}
              </h1>
              <p>
                {view === "overview"
                  ? "A connected view of your records, care, and next steps."
                  : view === "sharing"
                    ? "Choose who can access your information, and for how long."
                    : view === "timeline"
                      ? "Every record, with its source and history preserved."
                      : view === "medications"
                        ? "Medication details and dispensing history, together."
                        : view === "activity"
                          ? "A record of access, changes, and sharing decisions."
                          : view === "security"
                            ? "Manage how you sign in and protect your account."
                            : view === "labs"
                              ? "Orders and reports from your care team."
                              : "Notes and reports, with clear provenance."}
              </p>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                className="icon-button"
                aria-label="Refresh records"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw size={17} />
              </Button>
              {!patient && !admin && (
                <Button
                  className="primary-button"
                  onClick={() => {
                    setFormError("");
                    setHealthId("");
                    setDialog("request");
                  }}
                >
                  <Users size={17} />
                  Request access
                </Button>
              )}
              {patient && view === "sharing" && (
                <Button className="primary-button" onClick={() => openGrant()}>
                  <Plus size={17} />
                  Grant access
                </Button>
              )}
              {patient && view === "overview" && (
                <Button
                  variant="outline"
                  className="action-button"
                  onClick={() => exportData("export")}
                >
                  <Download size={17} />
                  Export records
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-message">
              {error} <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          {!patient && !admin && (
            <div className="patient-picker">
              <label>
                Patient
                <Pick
                  label="Select authorized patient"
                  value={patientId}
                  onChange={changePatient}
                  options={patients.map((p) => ({
                    value: p.id,
                    label: p.name,
                  }))}
                />
              </label>
              <span>
                <ShieldCheck size={16} /> Only patients with active permission
                appear here.
              </span>
            </div>
          )}
          {loading && records.length === 0 && (
            <div
              className="loading-grid"
              aria-label="Loading records"
              role="status"
            >
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          )}
          {view === "overview" && (
            <>
              {!patientId && !loading ? (
                <div className="panel">
                  <Empty
                    icon={Users}
                    title="Your authorized patients will appear here"
                  >
                    Request access with a patient’s Health ID. Their approval
                    determines which records you can see.
                  </Empty>
                </div>
              ) : (
                <>
                  <section className="identity-strip">
                    <div className="identity-name">
                      <span className="large-avatar">
                        {selected?.name?.charAt(0) || "A"}
                      </span>
                      <div>
                        <h2>{selected?.name?.replace(" (Synthetic)", "")}</h2>
                        <p>
                          <BadgeCheck size={15} />
                          Synthetic patient record
                        </p>
                      </div>
                    </div>
                    <div className="identity-id">
                      <span>PERMANENT HEALTH ID</span>
                      <code>{selected?.healthId}</code>
                    </div>
                    <span className="record-status">
                      <span />
                      {patient ? "Your personal record" : "Authorized view"}
                    </span>
                  </section>
                  <div className="stat-grid">
                    <button
                      onClick={() => {
                        navigate("timeline");
                        setKind("condition");
                      }}
                      className="stat-card"
                    >
                      <span>
                        <HeartPulse size={18} />
                        Recorded conditions
                      </span>
                      <strong>
                        {active.filter((r) => r.kind === "condition").length}
                        <small>recorded</small>
                      </strong>
                      <p>
                        View condition history
                        <ArrowUpRight size={14} />
                      </p>
                    </button>
                    <button
                      className="stat-card"
                      onClick={() => navigate("medications")}
                    >
                      <span>
                        <Pill size={18} />
                        Medications
                      </span>
                      <strong>
                        {medications.length}
                        <small>active records</small>
                      </strong>
                      <p>
                        Open Medication Passport
                        <ArrowUpRight size={14} />
                      </p>
                    </button>
                    <button
                      className="stat-card allergy-stat"
                      onClick={() => {
                        navigate("timeline");
                        setKind("allergy");
                      }}
                    >
                      <span>
                        <AlertCircle size={18} />
                        Allergies
                      </span>
                      <strong>
                        {allergies.length}
                        <small>recorded</small>
                      </strong>
                      <p>
                        {allergies[0]?.title ||
                          "No allergy records in this view"}
                        <ArrowUpRight size={14} />
                      </p>
                    </button>
                    <button
                      className="stat-card"
                      onClick={() => navigate("labs")}
                    >
                      <span>
                        <FlaskConical size={18} />
                        Lab & imaging
                      </span>
                      <strong>
                        {
                          active.filter((r) =>
                            ["lab_result", "imaging_report"].includes(r.kind),
                          ).length
                        }
                        <small>reports</small>
                      </strong>
                      <p>
                        View results
                        <ArrowUpRight size={14} />
                      </p>
                    </button>
                  </div>
                  <div className="overview-grid">
                    <section className="panel timeline-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Recent health activity</h2>
                          <p>Your latest records, in one place</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => navigate("timeline")}
                        >
                          View timeline
                          <ArrowRight size={15} />
                        </button>
                      </div>
                      {records.length ? (
                        records
                          .slice(0, 5)
                          .map((r) => (
                            <RecordRow
                              key={r.id}
                              record={r}
                              onOpen={setDetail}
                            />
                          ))
                      ) : (
                        <Empty title="Your timeline starts here">
                          Add a historical note or ask your care team to
                          contribute an authorized record.
                        </Empty>
                      )}
                      <div className="panel-footer">
                        <ShieldCheck size={15} />
                        <span>
                          {patient
                            ? "Patient-entered information is labeled separately."
                            : "This view may not include your patient’s complete history."}
                        </span>
                      </div>
                    </section>
                    <div className="overview-aside">
                      <section className="passport-card">
                        <div className="passport-card-label">
                          <Pill size={19} />
                          <span>MEDICATION PASSPORT</span>
                        </div>
                        <h2>
                          Your medications.
                          <br />
                          Ready when you need them.
                        </h2>
                        <p>
                          Keep the source and details of your medication records
                          close at hand.
                        </p>
                        <Button onClick={() => navigate("medications")}>
                          Open passport
                          <ArrowRight size={17} />
                        </Button>
                      </section>
                      <section className="panel sharing-summary">
                        <span className="soft-icon">
                          <Users size={20} />
                        </span>
                        <h3>You’re in control</h3>
                        <p>
                          {
                            consents.filter(
                              (c) =>
                                c.status === "active" &&
                                new Date(c.expires_at) > new Date(),
                            ).length
                          }{" "}
                          active sharing permission
                          {consents.filter((c) => c.status === "active")
                            .length === 1
                            ? ""
                            : "s"}
                          . Review who can see your records.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => navigate("sharing")}
                        >
                          Manage sharing
                          <ArrowRight size={15} />
                        </button>
                      </section>
                    </div>
                  </div>
                  {(patient || user.role === "doctor") && (
                    <SourceSummary
                      key={patientId}
                      patientId={patientId}
                      onOpen={(id) =>
                        setDetail(records.find((r) => r.id === id) || null)
                      }
                    />
                  )}
                  <section className="quick-actions">
                    <span className="eyebrow">CONTINUE YOUR CARE</span>
                    <button onClick={() => openRecord(writeKinds[0])}>
                      <span>
                        <Plus size={18} />
                      </span>
                      <div>
                        <strong>
                          {patient
                            ? "Add a health note"
                            : "Create a clinical record"}
                        </strong>
                        <small>
                          {patient
                            ? "Keep your care team informed"
                            : "Record care with its source and author"}
                        </small>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                    <button onClick={() => navigate("activity")}>
                      <span>
                        <Shield size={18} />
                      </span>
                      <div>
                        <strong>Review access history</strong>
                        <small>See access and changes to your record</small>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  </section>
                </>
              )}
            </>
          )}
          {view === "timeline" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Longitudinal record</h2>
                  <p>
                    {records.length} record{records.length === 1 ? "" : "s"} in
                    this authorized view
                  </p>
                </div>
                {patientId && (
                  <Button
                    className="primary-button"
                    onClick={() => openRecord(writeKinds[0])}
                  >
                    <Plus size={16} />
                    Add record
                  </Button>
                )}
              </div>
              <div className="record-filters">
                <div className="search-field">
                  <Search size={17} />
                  <Input
                    aria-label="Search records"
                    placeholder="Search records, clinician, or organization…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Pick
                  label="Record category"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "all", label: "All categories" },
                    ...Object.entries(kinds).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ]}
                />
                <label className="date-filter">
                  <span>From date</span>
                  <Input
                    type="date"
                    aria-label="From date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
              </div>
              {visible.length ? (
                visible.map((r) => (
                  <RecordRow key={r.id} record={r} onOpen={setDetail} />
                ))
              ) : (
                <Empty icon={Filter} title="No matching records">
                  Try another category or search, or add a record when you have
                  permission.
                </Empty>
              )}
            </section>
          )}
          {view === "medications" && (
            <>
              <div className="section-banner">
                <div>
                  <span className="eyebrow">MEDICATION PASSPORT</span>
                  <h2>
                    {selected?.name?.replace(" (Synthetic)", "") ||
                      "Select an authorized patient"}
                  </h2>
                  <p>
                    Medication and prescription records with original source
                    details.
                  </p>
                </div>
                <div className="heading-actions">
                  {patient && <PassportCredential patientId={patientId} />}{" "}
                  {patient && (
                    <Button
                      variant="outline"
                      onClick={() => exportData("fhir")}
                    >
                      <Download size={16} />
                      FHIR export
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => window.print()}>
                    <Printer size={16} />
                    Print summary
                  </Button>
                  {patientId && ["doctor", "pharmacy"].includes(user.role) && (
                    <Button
                      className="primary-button"
                      onClick={() =>
                        openRecord(
                          user.role === "doctor" ? "prescription" : "dispense",
                        )
                      }
                    >
                      <Plus size={16} />
                      {user.role === "doctor"
                        ? "New prescription"
                        : "Record dispensing"}
                    </Button>
                  )}
                </div>
              </div>
              <p className="inline-notice">
                <AlertCircle size={17} />
                This summary does not guarantee pharmacy or international
                customs acceptance. Verify active treatment with a clinician.
              </p>
              <div className="medication-grid">
                {medications.map((r) => (
                  <button
                    className="panel medication-card"
                    key={r.id}
                    onClick={() => setDetail(r)}
                  >
                    <div>
                      <RecordIcon kind={r.kind} />
                      <span className="status-pill">Active record</span>
                    </div>
                    <h2>{r.title}</h2>
                    <p>{r.details}</p>
                    <div className="medication-meta">
                      <span>
                        <Stethoscope size={15} />
                        {r.author_name || "Author recorded"}
                      </span>
                      <span>
                        <CalendarDays size={15} />
                        {date(r.created_at)}
                      </span>
                    </div>
                    <footer>
                      <span>{kinds[r.kind]}</span>
                      <ArrowUpRight size={17} />
                    </footer>
                  </button>
                ))}
              </div>
              {!medications.length && (
                <section className="panel">
                  <Empty icon={Pill} title="No active medication records">
                    Only medication records permitted by your access are shown.
                  </Empty>
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <h2>Dispensing history</h2>
                </div>
                {active.filter((r) => r.kind === "dispense").length ? (
                  active
                    .filter((r) => r.kind === "dispense")
                    .map((r) => (
                      <RecordRow key={r.id} record={r} onOpen={setDetail} />
                    ))
                ) : (
                  <Empty icon={ClipboardList} title="No dispensing recorded">
                    Authorized pharmacies can record dispensing against an
                    active prescription.
                  </Empty>
                )}
              </section>
            </>
          )}
          {view === "documents" && (
            <DocumentsPanel key={patientId} patientId={patientId} />
          )}
          {["documents", "labs"].includes(view) && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {view === "labs"
                      ? "Orders & reports"
                      : "Notes & clinical reports"}
                  </h2>
                  <p>
                    {view === "labs"
                      ? "Results remain linked to the original order."
                      : "Original text, author, and amendment history are retained."}
                  </p>
                </div>
                {patientId && (
                  <Button
                    className="primary-button"
                    onClick={() =>
                      openRecord(
                        view === "labs"
                          ? user.role === "doctor"
                            ? "lab_order"
                            : user.role === "lab"
                              ? "lab_result"
                              : "note"
                          : "note",
                      )
                    }
                  >
                    <Plus size={16} />
                    {view === "labs" && user.role === "doctor"
                      ? "Order a test"
                      : "Add a record"}
                  </Button>
                )}
              </div>
              {records
                .filter((r) =>
                  (view === "labs"
                    ? ["lab_order", "lab_result", "imaging_report"]
                    : ["note", "encounter", "imaging_report"]
                  ).includes(r.kind),
                )
                .map((r) => (
                  <RecordRow key={r.id} record={r} onOpen={setDetail} />
                ))}
              {!records.some((r) =>
                (view === "labs"
                  ? ["lab_order", "lab_result", "imaging_report"]
                  : ["note", "encounter", "imaging_report"]
                ).includes(r.kind),
              ) && (
                <Empty title="No records here yet">
                  Your permitted records will appear as they are added.
                </Empty>
              )}
            </section>
          )}
          {view === "sharing" && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Access requests</h2>
                    <p>
                      {patient
                        ? "Review a provider’s request before sharing."
                        : "Requests remain pending until the patient decides."}
                    </p>
                  </div>
                  <span className="count-badge">
                    {requests.filter((r) => r.status === "pending").length}{" "}
                    pending
                  </span>
                </div>
                {requests.length ? (
                  requests.map((r) => (
                    <div className="consent-row" key={r.id}>
                      <span className="soft-icon">
                        <Users size={19} />
                      </span>
                      <div className="grow">
                        <h3>{r.requester_name}</h3>
                        <p>
                          {r.purpose} · {date(r.created_at)}
                        </p>
                      </div>
                      <span
                        className={`status-pill ${r.status !== "pending" ? "neutral" : ""}`}
                      >
                        {r.status}
                      </span>
                      {patient && r.status === "pending" && (
                        <div className="heading-actions">
                          <Button
                            variant="outline"
                            onClick={() => openGrant(r.requester_id)}
                          >
                            Review request
                            <ArrowRight size={15} />
                          </Button>
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                await api(`/access-requests/${r.id}/deny`, {
                                  method: "POST",
                                });
                                toast.success("Request denied");
                                await refresh();
                              } catch (e) {
                                toast.error(
                                  e instanceof Error
                                    ? e.message
                                    : "Unable to deny request",
                                );
                              }
                            }}
                          >
                            Deny
                          </Button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty icon={Users} title="No access requests">
                    Requests from participating providers will appear here.
                  </Empty>
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Sharing permissions</h2>
                    <p>
                      Permissions are scoped, time limited, and checked by the
                      service.
                    </p>
                  </div>
                  {patient && (
                    <Button
                      className="primary-button"
                      onClick={() => openGrant()}
                    >
                      <Plus size={16} />
                      Grant access
                    </Button>
                  )}
                </div>
                {consents.length ? (
                  consents.map((c) => {
                    const valid =
                      c.status === "active" &&
                      new Date(c.expires_at) > new Date();
                    return (
                      <div className="consent-row" key={c.id}>
                        <span className="soft-icon">
                          <ShieldCheck size={19} />
                        </span>
                        <div className="grow">
                          <h3>{c.grantee_name}</h3>
                          <p>
                            {c.scopes
                              .split(",")
                              .map((s) => kinds[s] || s)
                              .join(" · ")}
                          </p>
                          <small>
                            Purpose: {c.purpose} · Expires{" "}
                            {date(c.expires_at, true)}
                          </small>
                        </div>
                        <span
                          className={`status-pill ${!valid ? "neutral" : ""}`}
                        >
                          {c.status === "active" && !valid
                            ? "expired"
                            : c.status}
                        </span>
                        {patient && valid && (
                          <Button
                            variant="outline"
                            onClick={() => setRevoke(c)}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Empty icon={ShieldCheck} title="No sharing permissions">
                    You can grant a provider access to selected record
                    categories.
                  </Empty>
                )}
              </section>
              <p className="inline-notice">
                <ShieldCheck size={18} />
                Revoking sharing stops future access under that permission. It
                does not erase copies a provider must retain.
              </p>
            </>
          )}
          {view === "activity" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    {user.role === "security"
                      ? "Security audit events"
                      : "Your access history"}
                  </h2>
                  <p>
                    Most recent events · Clinical content is not copied into
                    this history
                  </p>
                </div>
                <ShieldCheck className="muted" size={22} />
              </div>
              {audits.length ? (
                audits.map((a) => (
                  <div className="audit-row" key={a.id}>
                    <span
                      className={`audit-icon ${a.action.includes("DENIED") || a.action.includes("FAILED") ? "warning" : ""}`}
                    >
                      {a.action.includes("DENIED") ||
                      a.action.includes("FAILED") ? (
                        <AlertCircle size={17} />
                      ) : (
                        <Check size={17} />
                      )}
                    </span>
                    <div className="grow">
                      <strong>
                        {a.action.toLowerCase().replaceAll("_", " ")}
                      </strong>
                      <p>
                        {a.actor_id === user.id
                          ? "You"
                          : "Authorized service or provider"}{" "}
                        · Event {a.id.slice(0, 8)}
                      </p>
                    </div>
                    <time>{date(a.occurred_at, true)}</time>
                  </div>
                ))
              ) : (
                <Empty icon={Activity} title="No events to display">
                  Authorized activity will appear here as it occurs.
                </Empty>
              )}
            </section>
          )}
          {view === "organization" && user.role === "admin" && (
            <OrganizationPanel />
          )}
          {view === "learning" && user.role === "doctor" && <LearningPanel />}
          {view === "security" && (
            <SecurityPanel user={user} onLogout={logout} />
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={14} />
              Synthetic development environment · No real patient information
            </span>
            <span>Global Health Passport</span>
          </footer>
        </main>
      </SidebarInset>
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>
              {detail && kinds[detail.kind]} ·{" "}
              {detail && date(detail.created_at, true)}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <>
              <div className="detail-status">
                <span className="status-pill neutral">{detail.status}</span>
                {detail.source?.includes("unverified") && (
                  <span className="status-pill warning">
                    Patient entered · unverified
                  </span>
                )}
              </div>
              <p className="clinical-text">{detail.details}</p>
              <dl className="detail-grid">
                <div>
                  <dt>Author</dt>
                  <dd>{detail.author_name || "Recorded author"}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{detail.source}</dd>
                </div>
                {detail.related_id && (
                  <div>
                    <dt>Linked order / prescription</dt>
                    <dd>{detail.related_id}</dd>
                  </div>
                )}
                {detail.replaces_id && (
                  <div>
                    <dt>Amends record</dt>
                    <dd>{detail.replaces_id}</dd>
                  </div>
                )}
                {[
                  "quantity",
                  "refills",
                  "dosage",
                  "route",
                  "frequency",
                  "duration",
                ]
                  .filter((k) => detail[k] != null && detail[k] !== "")
                  .map((k) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(detail[k])}</dd>
                    </div>
                  ))}
              </dl>
              {detail.author_id === user.id && detail.status === "active" && (
                <Button
                  variant="outline"
                  onClick={() => openRecord(detail.kind, detail)}
                >
                  Amend this record
                </Button>
              )}
              <p className="field-help">
                Amendments preserve the original record and its history.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="record-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog === "grant"
                ? "Grant access"
                : dialog === "request"
                  ? "Request patient access"
                  : amending
                    ? "Amend clinical record"
                    : "Add a health record"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "grant"
                ? "Choose a recipient, permitted categories, and an expiry."
                : dialog === "request"
                  ? "A Health ID identifies a patient. Their approval is still required."
                  : patient
                    ? "Your entry will be labeled as patient-entered and unverified."
                    : "Records retain the author, source, and creation time."}
            </DialogDescription>
          </DialogHeader>
          <form className="dialog-form" onSubmit={submit}>
            {dialog === "request" ? (
              <>
                <label>
                  Patient Health ID
                  <Input
                    value={healthId}
                    onChange={(e) => setHealthId(e.target.value)}
                    required
                    maxLength={64}
                    placeholder="HP-…"
                  />
                </label>
                <p className="field-help">
                  Purpose of use: treatment. To protect patient privacy, this
                  action does not confirm whether an identifier exists.
                </p>
              </>
            ) : dialog === "grant" ? (
              <>
                <label>
                  Provider
                  <Pick
                    label="Provider"
                    value={recipient}
                    onChange={(v) => {
                      setRecipient(v);
                      const role = recipients.find((r) => r.id === v)?.role;
                      setGrantScopes(
                        role === "lab"
                          ? ["lab_order", "lab_result", "imaging_report"]
                          : role === "pharmacy"
                            ? ["prescription", "dispense"]
                            : [
                                "allergy",
                                "condition",
                                "medication",
                                "encounter",
                                "lab_order",
                                "lab_result",
                                "prescription",
                                "note",
                              ],
                      );
                    }}
                    options={recipients.map((r) => ({
                      value: r.id,
                      label: r.name,
                    }))}
                  />
                </label>
                <fieldset>
                  <legend>Permitted record categories</legend>
                  <div className="scope-grid">
                    {Object.entries(kinds).map(([k, label]) => (
                      <label className="checkbox-label" key={k}>
                        <Checkbox
                          checked={grantScopes.includes(k)}
                          onCheckedChange={(v) =>
                            setGrantScopes((s) =>
                              v ? [...s, k] : s.filter((x) => x !== k),
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label>
                  Access duration
                  <Pick
                    label="Access duration"
                    value={days}
                    onChange={setDays}
                    options={[
                      { value: "1", label: "24 hours" },
                      { value: "7", label: "7 days" },
                      { value: "30", label: "30 days" },
                      { value: "90", label: "90 days" },
                      { value: "365", label: "1 year" },
                    ]}
                  />
                </label>
                <p className="field-help">
                  Purpose: treatment. Provider role restrictions still apply.
                  You can revoke this permission later.
                </p>
              </>
            ) : (
              <>
                <label>
                  Record category
                  <Pick
                    label="Record category"
                    value={recordKind}
                    onChange={(v) => {
                      setRecordKind(v);
                      setRelated("");
                    }}
                    options={writeKinds.map((k) => ({
                      value: k,
                      label: kinds[k],
                    }))}
                  />
                </label>
                {["allergy", "condition"].includes(recordKind) && (
                  <label>
                    Clinical status
                    <Pick
                      label="Clinical status"
                      value={clinicalStatus}
                      onChange={setClinicalStatus}
                      options={[
                        { value: "unknown", label: "Not known / not recorded" },
                        { value: "active", label: "Active" },
                        { value: "inactive", label: "Inactive" },
                        { value: "resolved", label: "Resolved" },
                      ]}
                    />
                    <span className="field-help">
                      Only select a status supported by the source information.
                    </span>
                  </label>
                )}
                <label>
                  Title
                  <Input
                    value={recordTitle}
                    onChange={(e) => setRecordTitle(e.target.value)}
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  Clinical details
                  <Textarea
                    value={recordText}
                    onChange={(e) => setRecordText(e.target.value)}
                    required
                    maxLength={10000}
                    rows={4}
                  />
                </label>
                {["lab_result", "dispense"].includes(recordKind) && (
                  <label>
                    Related{" "}
                    {recordKind === "dispense" ? "prescription" : "lab order"}
                    <Pick
                      label="Related order"
                      value={related}
                      onChange={setRelated}
                      options={active
                        .filter(
                          (r) =>
                            r.kind ===
                            (recordKind === "dispense"
                              ? "prescription"
                              : "lab_order"),
                        )
                        .map((r) => ({ value: r.id, label: r.title }))}
                    />
                  </label>
                )}
                {["lab_order", "prescription"].includes(recordKind) && (
                  <label>
                    Assigned{" "}
                    {recordKind === "prescription" ? "pharmacy" : "laboratory"}
                    <Pick
                      label="Assigned recipient"
                      value={recipient}
                      onChange={setRecipient}
                      options={recipients
                        .filter(
                          (r) =>
                            r.role ===
                            (recordKind === "prescription"
                              ? "pharmacy"
                              : "lab"),
                        )
                        .map((r) => ({ value: r.id, label: r.name }))}
                    />
                  </label>
                )}
                {["prescription", "dispense"].includes(recordKind) && (
                  <div className="form-columns">
                    <label>
                      Quantity
                      <Input
                        value={quantity}
                        type="number"
                        min={1}
                        max={10000}
                        required
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </label>
                    {recordKind === "prescription" && (
                      <>
                        <label>
                          Refills
                          <Input
                            value={refills}
                            type="number"
                            min={0}
                            max={12}
                            required
                            onChange={(e) => setRefills(e.target.value)}
                          />
                        </label>
                        <label>
                          Dosage
                          <Input
                            value={dosage}
                            required
                            onChange={(e) => setDosage(e.target.value)}
                            placeholder="e.g. 5 mg"
                          />
                        </label>
                        <label>
                          Route
                          <Input
                            value={route}
                            required
                            onChange={(e) => setRoute(e.target.value)}
                          />
                        </label>
                        <label>
                          Frequency
                          <Input
                            value={frequency}
                            required
                            onChange={(e) => setFrequency(e.target.value)}
                          />
                        </label>
                        <label>
                          Duration
                          <Input
                            value={duration}
                            required
                            onChange={(e) => setDuration(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
            {formError && (
              <p role="alert" className="error-message">
                {formError}
              </p>
            )}
            <div className="dialog-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialog(null)}
              >
                Cancel
              </Button>
              <Button
                className="primary-button"
                disabled={
                  busy ||
                  (dialog === "grant" && (!recipient || !grantScopes.length))
                }
              >
                {busy
                  ? "Saving…"
                  : dialog === "grant"
                    ? "Grant access"
                    : dialog === "request"
                      ? "Submit request"
                      : "Save record"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!revoke} onOpenChange={(v) => !v && setRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this sharing permission?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoke?.grantee_name} will lose future access under this
              permission. Other active permissions and legally retained copies
              are unaffected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep permission</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!revoke) return;
                try {
                  await api(`/consents/${revoke.id}/revoke`, {
                    method: "POST",
                  });
                  toast.success("Permission revoked");
                  setRevoke(null);
                  await refresh();
                } catch (e) {
                  toast.error(
                    e instanceof Error ? e.message : "Unable to revoke",
                  );
                }
              }}
            >
              Revoke permission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster />
    </SidebarProvider>
  );
}
