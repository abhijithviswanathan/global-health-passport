"use client";
import { provenanceLines } from "../../shared/care-model";
import { ProfileAvatar } from "@/components/profile-photos";
import { buildAgenda } from "../../shared/agenda";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  Search,
  Stethoscope,
  Users,
  ArrowUpRight,
  ShieldCheck,
  Check,
  Video,
  MapPin,
  RefreshCw,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { api, ApiError, date, type User, type ClinicalRecord } from "@/lib/api";
import { toast } from "sonner";

export type ClinicianView = "today" | "patients" | "appointments";
type Appointment = {
  id: string;
  patient_id: string | null;
  patient_name: string;
  health_id: string | null;
  starts_at: number;
  duration_minutes: number;
  reason: string;
  visit_mode: string;
  status: string;
  version: number;
  access: boolean;
  can_document: boolean;
  completed_record_id: string | null;
};
type Draft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  version: number;
  updated_at: string;
};
const closed = (a: Appointment) =>
  ["completed", "cancelled", "no_show"].includes(a.status);
const statusLabel: Record<string, string> = {
  scheduled: "Scheduled",
  checked_in: "Checked in",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};
function localDay(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function localTime(value: number) {
  const d = new Date(value);
  return `${localDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function time(value: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
function message(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Unable to complete the request. Please try again.";
}
function Choice({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
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

export function ClinicianWorkspace({
  view,
  user,
  patients,
  onNavigate,
  onOpenChart,
  onRequestAccess,
  onDirtyChange,
}: {
  view: ClinicianView;
  user: User;
  patients: User[];
  onNavigate: (v: ClinicianView) => void;
  onOpenChart: (
    patientId: string,
    section?: "overview" | "timeline" | "documents",
  ) => void;
  onRequestAccess: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [day, setDay] = useState(() => {
      const saved =
        typeof window === "undefined"
          ? null
          : sessionStorage.getItem("ghp-schedule-day");
      return saved &&
        /^\d{4}-\d{2}-\d{2}$/.test(saved) &&
        !Number.isNaN(new Date(`${saved}T12:00:00`).valueOf())
        ? saved
        : localDay();
    }),
    [query, setQuery] = useState(""),
    [appointments, setAppointments] = useState<Appointment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [booking, setBooking] = useState<{
      patient?: User;
      appointment?: Appointment;
    } | null>(null),
    [visit, setVisit] = useState<Appointment | null>(null),
    [actionBusy, setActionBusy] = useState(false);
  useEffect(() => {
    sessionStorage.setItem("ghp-schedule-day", day);
  }, [day]);
  const generation = useRef(0);
  const [clock, setClock] = useState(() => Date.now());
  const effectiveDay =
    view === "today"
      ? localDay(new Date(clock))
      : view === "patients"
        ? localDay(new Date(clock))
        : day;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setClock(Date.now());
    const start = new Date(`${effectiveDay}T00:00:00`),
      end = new Date(start);
    end.setDate(end.getDate() + 31);
    start.setTime(start.getTime() - 180 * 60000);
    try {
      const values = await api<Appointment[]>(
        `/clinician/appointments?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`,
      );
      if (request === generation.current) {
        setAppointments(values);
        setError("");
      }
    } catch (e) {
      if (request === generation.current) {
        setAppointments([]);
        setError(message(e));
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [effectiveDay]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 60000);
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  const visibleStart = new Date(`${effectiveDay}T00:00:00`);
  const visibleEnd = new Date(visibleStart);
  visibleEnd.setDate(visibleEnd.getDate() + 1);
  const dayAppointments = appointments.filter(
    (a) =>
      a.starts_at < +visibleEnd &&
      a.starts_at + a.duration_minutes * 60000 > +visibleStart,
  );
  const live = dayAppointments.filter(
    (a) => !["cancelled", "no_show"].includes(a.status),
  );
  const next =
    live.find(
      (a) => !closed(a) && a.starts_at + a.duration_minutes * 60000 >= clock,
    ) || live.find((a) => !closed(a));
  const patientMatches = patients.filter((p) =>
    `${p.name} ${p.healthId}`
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .includes(query.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  const shiftDay = (delta: number) => {
    const d = new Date(`${day}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDay(localDay(d));
  };
  async function update(a: Appointment, status: string) {
    if (
      status === "cancelled" &&
      !window.confirm(
        "Cancel this appointment? The time will become available again.",
      )
    )
      return;
    setActionBusy(true);
    try {
      await api(`/clinician/appointments/${a.id}`, {
        method: "PATCH",
        body: { version: a.version, status },
      });
      toast.success(statusLabel[status]);
      await refresh();
    } catch (e) {
      toast.error(message(e));
      await refresh();
    } finally {
      setActionBusy(false);
    }
  }
  const visualAgenda = (
    <section className="visual-agenda" aria-label="Visual day schedule">
      <div className="visual-agenda-heading">
        <div>
          <span className="agenda-eyebrow">YOUR TIME, CLEARLY</span>
          <h2>Your day at a glance</h2>
        </div>
        <span className="agenda-legend">
          <i /> Booked time
        </span>
      </div>
      <p className="agenda-caption">
        {date(`${effectiveDay}T12:00:00`, false)} · Local time · Select a visit
        to prepare
      </p>
      <div className="visual-agenda-track">
        {buildAgenda(
          effectiveDay,
          dayAppointments.map((a) => ({
            id: a.id,
            start: a.starts_at,
            minutes: a.duration_minutes,
            status: a.status,
          })),
        ).map((segment, i) => {
          const a = dayAppointments.find((a) => a.id === segment.eventId);
          return (
            <div className="agenda-segment" key={segment.eventId || `gap-${i}`}>
              <div className="agenda-time-rail">
                <strong>{time(segment.start)}</strong>
                <i />
                <span>{time(segment.end)}</span>
              </div>
              {a ? (
                <button
                  className={`agenda-visit ${a.status}`}
                  disabled={!a.access || actionBusy}
                  aria-label={`View appointment for ${a.patient_name} at ${time(a.starts_at)}`}
                  onClick={() => {
                    if (a.can_document && !closed(a)) setVisit(a);
                    else if (a.patient_id) onOpenChart(a.patient_id);
                  }}
                >
                  <div className="agenda-visit-meta">
                    <span>{statusLabel[a.status]}</span>
                    <span>
                      {a.duration_minutes} min ·{" "}
                      {a.visit_mode === "video" ? "Video" : "In person"}
                    </span>
                  </div>
                  <strong>{a.patient_name.replace(" (Synthetic)", "")}</strong>
                  <p>{a.reason || "Patient details unavailable"}</p>
                  <ArrowUpRight size={18} />
                </button>
              ) : (
                <div className="agenda-gap">
                  <span>No bookings</span>
                  <small>
                    {Math.round((segment.end - segment.start) / 60000)} minutes
                    in this window
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="agenda-caption">
        Gaps show unbooked time, not confirmed clinic availability. Cancelled
        and no-show visits remain in the list below.
      </p>
    </section>
  );
  const schedule = (
    <section
      className="panel clinician-schedule"
      aria-label="Appointment schedule"
    >
      <div className="clinician-section-heading">
        <div>
          <h2>{view === "today" ? "Today’s appointments" : "Day schedule"}</h2>
          <p>
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(new Date(`${effectiveDay}T12:00:00`))}{" "}
            · {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh schedule"
        >
          <RefreshCw size={16} />
        </Button>
      </div>
      {loading && appointments.length === 0 ? (
        <p className="clinician-empty" role="status">
          Loading your schedule…
        </p>
      ) : dayAppointments.length === 0 ? (
        <div className="clinician-empty">
          <CalendarDays size={30} />
          <h3>A little room in your day</h3>
          <p>
            No appointments on this date. Choose an authorized patient to book a
            visit.
          </p>
          <Button
            onClick={() => setBooking({})}
            disabled={!patients.length || !!error}
            className="primary-button"
          >
            <Plus size={16} />
            Book appointment
          </Button>
        </div>
      ) : (
        <div className="schedule-list">
          {dayAppointments.map((a) => (
            <article
              key={a.id}
              className={`schedule-row ${closed(a) ? "is-closed" : ""}`}
            >
              <div className="schedule-time">
                <strong>{time(a.starts_at)}</strong>
                <span>{a.duration_minutes} min</span>
              </div>
              <div className="schedule-patient">
                <strong>{a.patient_name.replace(" (Synthetic)", "")}</strong>
                <p>
                  {a.reason ||
                    "Patient details are unavailable because permission ended."}
                </p>
                <span>
                  {a.visit_mode === "video" ? (
                    <Video size={14} />
                  ) : (
                    <MapPin size={14} />
                  )}{" "}
                  {a.visit_mode === "video"
                    ? "Video visit · link arranged separately"
                    : "In person"}
                  {a.health_id && ` · ${a.health_id}`}
                </span>
              </div>
              <div className="schedule-state">
                <span className={`appointment-status ${a.status}`}>
                  {statusLabel[a.status]}
                </span>
              </div>
              <div className="schedule-actions">
                {a.access && (
                  <Button
                    variant={closed(a) ? "outline" : "default"}
                    className={!closed(a) ? "primary-button" : ""}
                    onClick={() => setVisit(a)}
                  >
                    {a.status === "completed"
                      ? "View visit"
                      : a.status === "in_progress"
                        ? "Continue visit"
                        : "Prepare visit"}
                    <ArrowUpRight size={14} />
                  </Button>
                )}
                {!closed(a) && a.access && a.status === "scheduled" && (
                  <Button
                    variant="outline"
                    onClick={() => void update(a, "checked_in")}
                    disabled={actionBusy}
                  >
                    Check in
                  </Button>
                )}
                {!closed(a) && (
                  <details className="appointment-more">
                    <summary>More</summary>
                    <div>
                      {a.status === "scheduled" && a.access && (
                        <Button
                          variant="ghost"
                          onClick={() => setBooking({ appointment: a })}
                        >
                          Reschedule
                        </Button>
                      )}
                      {a.status === "scheduled" && a.access && (
                        <Button
                          variant="ghost"
                          onClick={() => void update(a, "no_show")}
                          disabled={actionBusy}
                        >
                          Mark no-show
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => void update(a, "cancelled")}
                        disabled={actionBusy}
                      >
                        Cancel appointment
                      </Button>
                    </div>
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
  return (
    <div className="clinician-workspace">
      <div className="clinician-welcome">
        <div>
          <span className="eyebrow">{user.organization}</span>
          <h1>
            {view === "today"
              ? "Your day, with room for care."
              : view === "patients"
                ? "Your patients"
                : "Appointments"}
          </h1>
          <p>
            {view === "today"
              ? `Welcome, ${user.name.replace(" (Synthetic)", "")}. Your visits and preparation, together.`
              : view === "patients"
                ? "Find a patient, open their shared chart, or book the next visit."
                : "Keep visit times, check-ins and documentation in one place."}
          </p>
        </div>
        <Button
          className="primary-button"
          onClick={() => setBooking({})}
          disabled={!patients.length || !!error}
        >
          <Plus size={17} />
          Book appointment
        </Button>
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
          <Button variant="outline" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {view === "today" && (
        <>
          <div className="clinician-stats">
            <div>
              <CalendarDays />
              <strong>{loading ? "—" : live.length}</strong>
              <span>Visits today</span>
            </div>
            <div>
              <Clock3 />
              <strong>
                {loading
                  ? "—"
                  : live.filter((a) => a.status === "checked_in").length}
              </strong>
              <span>Checked in</span>
            </div>
            <div>
              <Check />
              <strong>
                {loading
                  ? "—"
                  : live.filter((a) => a.status === "completed").length}
              </strong>
              <span>Completed</span>
            </div>
            <button onClick={() => onNavigate("patients")}>
              <Users />
              <strong>{patients.length}</strong>
              <span>
                Authorized patients <ChevronRight size={14} />
              </span>
            </button>
          </div>
          {next && (
            <section className="clinician-next">
              <span className="eyebrow">
                {next.status === "in_progress"
                  ? "VISIT IN PROGRESS"
                  : "NEXT TO PREPARE"}
              </span>
              <div>
                <div>
                  <h2>{next.patient_name.replace(" (Synthetic)", "")}</h2>
                  <p>
                    {time(next.starts_at)} · {next.reason}
                  </p>
                </div>
                <Button
                  className="primary-button"
                  onClick={() => setVisit(next)}
                  disabled={!next.access}
                >
                  Open visit workspace <ArrowUpRight size={17} />
                </Button>
              </div>
            </section>
          )}
          {visualAgenda}
          {schedule}
          <div className="clinician-shortcuts">
            <button onClick={() => onNavigate("patients")}>
              <Users />
              <span>
                <strong>Patient directory</strong>
                <small>Search shared charts and book a visit</small>
              </span>
              <ChevronRight />
            </button>
            <button onClick={onRequestAccess}>
              <ShieldCheck />
              <span>
                <strong>Request patient access</strong>
                <small>
                  Use their Health ID; the patient chooses what to share
                </small>
              </span>
              <ChevronRight />
            </button>
          </div>
        </>
      )}
      {view === "appointments" && (
        <>
          <div className="schedule-toolbar">
            <div>
              <Button
                variant="outline"
                aria-label="Previous day"
                onClick={() => shiftDay(-1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <label>
                Schedule date
                <Input
                  type="date"
                  value={day}
                  onChange={(e) => {
                    if (e.target.value) setDay(e.target.value);
                  }}
                />
              </label>
              <Button
                variant="outline"
                aria-label="Next day"
                onClick={() => shiftDay(1)}
              >
                <ChevronRight size={16} />
              </Button>
              <Button variant="outline" onClick={() => setDay(localDay())}>
                Today
              </Button>
            </div>
            <span>
              Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </span>
          </div>
          {visualAgenda}
          {schedule}
        </>
      )}
      {view === "patients" && (
        <section className="panel clinician-directory">
          <div className="clinician-section-heading">
            <div>
              <h2>
                Patient directory{" "}
                <span className="muted">{patients.length}</span>
              </h2>
              <p>Only patients with active treatment permission appear here.</p>
            </div>
            <Button variant="outline" onClick={onRequestAccess}>
              <Plus size={16} />
              Request access
            </Button>
          </div>
          <label className="clinician-search">
            <Search size={18} />
            <Input
              aria-label="Search patients"
              placeholder="Search by name or Health ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {patientMatches.length === 0 ? (
            <div className="clinician-empty">
              <Users size={30} />
              <h3>
                {patients.length
                  ? "No matching patients"
                  : "Your patient list starts with permission"}
              </h3>
              <p>
                {patients.length
                  ? "Try another name or Health ID."
                  : "Request access with a Health ID. Once the patient approves, their shared chart will appear here."}
              </p>
              {!patients.length && (
                <Button className="primary-button" onClick={onRequestAccess}>
                  Request patient access
                </Button>
              )}
            </div>
          ) : (
            <div className="patient-directory-list">
              {patientMatches.map((p) => {
                const upcoming = appointments.find(
                  (a) =>
                    a.patient_id === p.id && !closed(a) && a.starts_at >= clock,
                );
                return (
                  <article key={p.id}>
                    <ProfileAvatar owner={p.id} name={p.name} size={48} />
                    <div className="directory-identity">
                      <h3>{p.name.replace(" (Synthetic)", "")}</h3>
                      <p>
                        ID {p.healthId}{" "}
                        <span className="patient-shared-badge">
                          Shared chart
                        </span>
                      </p>
                    </div>
                    <div className="directory-next">
                      <span>Next visit</span>
                      <strong>
                        {upcoming
                          ? date(
                              new Date(upcoming.starts_at).toISOString(),
                              true,
                            )
                          : "None in the next 31 days"}
                      </strong>
                      {upcoming && (
                        <>
                          <p>{upcoming.reason}</p>
                          <span className="patient-visit-meta">
                            {upcoming.duration_minutes} min ·{" "}
                            {upcoming.visit_mode === "video"
                              ? "Video"
                              : "In person"}{" "}
                            · {statusLabel[upcoming.status]}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="directory-actions">
                      <Button
                        variant="outline"
                        onClick={() => setBooking({ patient: p })}
                      >
                        Book visit
                      </Button>
                      <Button
                        className="primary-button"
                        onClick={() => onOpenChart(p.id)}
                      >
                        Open chart <ArrowUpRight size={15} />
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {booking && (
        <BookingDialog
          key={booking.appointment?.id || booking.patient?.id || "new"}
          value={booking}
          patients={patients}
          day={effectiveDay}
          onClose={() => setBooking(null)}
          onSaved={async () => {
            setBooking(null);
            await refresh();
          }}
        />
      )}
      {visit && (
        <VisitDialog
          key={visit.id}
          appointment={visit}
          onClose={() => setVisit(null)}
          onUpdated={(a) => {
            setVisit(a);
            void refresh();
          }}
          onOpenChart={onOpenChart}
          onDirtyChange={onDirtyChange}
        />
      )}
    </div>
  );
}

function BookingDialog({
  value,
  patients,
  day,
  onClose,
  onSaved,
}: {
  value: { patient?: User; appointment?: Appointment };
  patients: User[];
  day: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const a = value.appointment;
  const [patient, setPatient] = useState(
      a?.patient_id || value.patient?.id || "",
    ),
    [at, setAt] = useState(() =>
      a
        ? localTime(a.starts_at)
        : day === localDay()
          ? localTime(Math.ceil((Date.now() + 300000) / 900000) * 900000)
          : `${day}T09:00`,
    ),
    [duration, setDuration] = useState(String(a?.duration_minutes || 30)),
    [reason, setReason] = useState(a?.reason || ""),
    [mode, setMode] = useState(a?.visit_mode || "in_person"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const startsAt = new Date(at).toISOString();
      if (a)
        await api(`/clinician/appointments/${a.id}`, {
          method: "PATCH",
          body: {
            version: a.version,
            status: "scheduled",
            startsAt,
            duration: Number(duration),
          },
        });
      else
        await api("/clinician/appointments", {
          method: "POST",
          body: {
            patientId: patient,
            startsAt,
            duration: Number(duration),
            reason,
            mode,
            requestKey,
          },
        });
      toast.success(a ? "Appointment rescheduled" : "Appointment booked");
      await onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="record-dialog">
        <DialogHeader>
          <DialogTitle>
            {a ? "Reschedule appointment" : "Book an appointment"}
          </DialogTitle>
          <DialogDescription>
            Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            Overlapping appointments are prevented. This schedules the visit; it
            does not send an invitation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="dialog-form">
          <label>
            Patient
            {a ? (
              <strong className="field-help">
                {a.patient_name} · {a.health_id}
              </strong>
            ) : (
              <Choice
                label="Appointment patient"
                value={patient}
                onChange={setPatient}
                options={patients.map((p) => ({
                  value: p.id,
                  label: `${p.name.replace(" (Synthetic)", "")} · ${p.healthId}`,
                }))}
              />
            )}
          </label>
          <label>
            Appointment time
            <Input
              aria-label="Appointment time"
              type="datetime-local"
              required
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </label>
          <label>
            Duration
            <Choice
              label="Appointment duration"
              value={duration}
              onChange={setDuration}
              options={[15, 20, 30, 45, 60, 90].map((n) => ({
                value: String(n),
                label: `${n} minutes`,
              }))}
            />
          </label>
          {!a && (
            <>
              <label>
                Visit reason
                <Input
                  required
                  maxLength={200}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="For example, follow-up visit"
                />
              </label>
              <label>
                Visit type
                <Choice
                  label="Visit type"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "in_person", label: "In person" },
                    {
                      value: "video",
                      label: "Video · arrange link separately",
                    },
                  ]}
                />
              </label>
            </>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={busy}
            >
              Back
            </Button>
            <Button className="primary-button" disabled={busy || !patient}>
              {busy ? "Saving…" : a ? "Save new time" : "Confirm booking"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VisitDialog({
  appointment: a,
  onClose,
  onUpdated,
  onOpenChart,
  onDirtyChange,
}: {
  appointment: Appointment;
  onClose: () => void;
  onUpdated: (a: Appointment) => void;
  onOpenChart: (
    id: string,
    section?: "overview" | "timeline" | "documents",
  ) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [records, setRecords] = useState<ClinicalRecord[]>([]),
    [draft, setDraft] = useState<Draft>({
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      version: 0,
      updated_at: "",
    }),
    [dirty, setDirty] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [template, setTemplate] = useState("soap");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      api<ClinicalRecord[]>(`/patients/${a.patient_id}/timeline`, {
        signal: controller.signal,
      }),
      a.can_document
        ? api<Draft>(`/clinician/appointments/${a.id}/draft`, {
            signal: controller.signal,
          })
        : Promise.resolve(null),
    ])
      .then(([rows, note]) => {
        if (!controller.signal.aborted) {
          setRecords(rows.filter((r) => r.status === "active"));
          if (note) setDraft(note);
          setDirty(false);
          setReviewed(false);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setRecords([]);
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            setDraft({
              subjective: "",
              objective: "",
              assessment: "",
              plan: "",
              version: 0,
              updated_at: "",
            });
            setDirty(false);
          }
          setError(message(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [a.id, a.patient_id, a.can_document, reload]);
  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const rows = await api<ClinicalRecord[]>(
          `/patients/${a.patient_id}/timeline`,
          { signal: controller.signal },
        );
        if (a.can_document)
          await api(`/clinician/appointments/${a.id}/draft`, {
            signal: controller.signal,
          });
        if (!controller.signal.aborted)
          setRecords(rows.filter((r) => r.status === "active"));
      } catch (e) {
        if (!controller.signal.aborted) {
          setRecords([]);
          if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
            setDraft({
              subjective: "",
              objective: "",
              assessment: "",
              plan: "",
              version: 0,
              updated_at: "",
            });
            setDirty(false);
          }
          setError(message(e));
        }
      }
    };
    const focus = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = setInterval(() => void check(), 60000);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [a.id, a.patient_id, a.can_document]);
  useEffect(() => {
    onDirtyChange(dirty);
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      onDirtyChange(false);
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty, onDirtyChange]);
  function close() {
    if (
      !busy &&
      (!dirty ||
        window.confirm(
          "Leave this visit without saving your latest draft changes?",
        ))
    )
      onClose();
  }
  function edit(
    key: keyof Pick<Draft, "subjective" | "objective" | "assessment" | "plan">,
    text: string,
  ) {
    setDraft((d) => ({ ...d, [key]: text }));
    setDirty(true);
    setReviewed(false);
  }
  async function save() {
    const value = await api<Draft>(`/clinician/appointments/${a.id}/draft`, {
      method: "PUT",
      body: draft,
    });
    setDraft(value);
    setDirty(false);
    return value;
  }
  async function action(kind: "save" | "start" | "complete") {
    setBusy(true);
    try {
      if (kind === "save") {
        await save();
        toast.success("Draft saved to this visit");
      }
      if (kind === "start") {
        const updated = await api<Appointment>(
          `/clinician/appointments/${a.id}`,
          {
            method: "PATCH",
            body: { version: a.version, status: "in_progress" },
          },
        );
        onUpdated(updated);
        toast.success("Visit started");
      }
      if (kind === "complete") {
        const latest = dirty ? await save() : draft;
        const updated = await api<Appointment>(
          `/clinician/appointments/${a.id}/complete`,
          {
            method: "POST",
            body: {
              version: a.version,
              draftVersion: latest.version,
              reviewed,
            },
          },
        );
        onUpdated(updated);
        toast.success(
          "Visit completed. One encounter note added to the patient’s timeline.",
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const readOnly = closed(a) || !a.can_document;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="visit-dialog">
        <DialogHeader>
          <div className="visit-title-row">
            <Button variant="outline" onClick={close} disabled={busy}>
              <ChevronLeft size={16} />
              Back to schedule
            </Button>
            <span className={`appointment-status ${a.status}`}>
              {statusLabel[a.status]}
            </span>
          </div>
          <DialogTitle>
            {a.patient_name.replace(" (Synthetic)", "")}
          </DialogTitle>
          <DialogDescription>
            {a.health_id} · {date(new Date(a.starts_at).toISOString(), true)} ·{" "}
            {a.duration_minutes} min · {a.reason}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p role="status">Preparing shared records and your saved draft…</p>
        ) : (
          <>
            {error && (
              <div className="error-message" role="alert">
                {error}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "Discard unsaved edits and reload the saved draft?",
                      )
                    ) {
                      setLoading(true);
                      void api<Appointment>(`/clinician/appointments/${a.id}`)
                        .then((updated) => {
                          onUpdated(updated);
                          setReload((n) => n + 1);
                        })
                        .catch((e) => {
                          setError(message(e));
                          setLoading(false);
                        });
                    }
                  }}
                  disabled={busy}
                >
                  Reload visit
                </Button>
              </div>
            )}
            <div className="visit-columns">
              <section className="visit-context">
                <div className="clinician-section-heading">
                  <h2>
                    <FileText size={18} />
                    Shared chart
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (a.patient_id) onOpenChart(a.patient_id, "timeline");
                    }}
                  >
                    Full timeline <ArrowUpRight size={14} />
                  </Button>
                </div>
                <p className="visit-limitation">
                  Shared records only. Missing entries do not mean “none”;
                  recorded medicines may not reflect current use. Review the
                  original source.
                </p>
                {(
                  [
                    { key: "allergy", title: "Recorded allergies" },
                    { key: "condition", title: "Conditions" },
                    { key: "medication", title: "Medicines & prescriptions" },
                    { key: "lab_result", title: "Recent shared results" },
                  ] as const
                ).map((group) => {
                  const entries = records.filter((r) =>
                    group.key === "medication"
                      ? ["medication", "prescription"].includes(r.kind)
                      : r.kind === group.key,
                  );
                  return (
                    <div className="visit-record-group" key={group.key}>
                      <h3>{group.title}</h3>
                      {!entries.length ? (
                        <p className="muted">No shared entries available.</p>
                      ) : (
                        entries.slice(0, 5).map((r) => (
                          <details key={r.id}>
                            <summary>{r.title}</summary>
                            <p className="record-plain-text">{r.details}</p>
                            <small>
                              {provenanceLines(r).map((line, i) => (
                                <span style={{ display: "block" }} key={i}>
                                  {line}
                                </span>
                              ))}
                              <br />
                              Recorded {date(r.created_at, true)} ·{" "}
                              {r.id.slice(0, 8)}
                            </small>
                          </details>
                        ))
                      )}
                      {entries.length > 5 && (
                        <p className="muted">
                          More entries in the full timeline.
                        </p>
                      )}
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  onClick={() => {
                    if (a.patient_id) onOpenChart(a.patient_id, "documents");
                  }}
                >
                  Open shared documents
                </Button>
              </section>
              <section className="visit-note">
                <div className="clinician-section-heading">
                  <div>
                    <h2>Visit note</h2>
                    <p>
                      {a.status === "completed"
                        ? "Filed once to the patient’s timeline."
                        : draft.updated_at
                          ? `Saved ${date(draft.updated_at, true)}`
                          : "Draft stays private to your account until filed."}
                    </p>
                  </div>
                  {dirty && (
                    <span className="appointment-status checked_in">
                      Unsaved changes
                    </span>
                  )}
                </div>
                {!a.can_document ? (
                  <p className="notice">
                    Encounter permission is needed to write a visit note. The
                    patient controls which categories are shared.
                  </p>
                ) : (
                  <>
                    <div className="note-template">
                      <label>
                        Writing guide
                        <Choice
                          label="Note writing guide"
                          value={template}
                          onChange={setTemplate}
                          options={[
                            { value: "soap", label: "Standard SOAP" },
                            { value: "followup", label: "Follow-up visit" },
                          ]}
                        />
                      </label>
                      <Button
                        variant="outline"
                        disabled={readOnly || busy || !!error}
                        onClick={() => {
                          if (!draft.subjective.trim())
                            edit("subjective", `Reason for visit: ${a.reason}`);
                          else
                            toast.info(
                              "Your history already has text; it has been kept.",
                            );
                        }}
                      >
                        Use visit reason
                      </Button>
                    </div>
                    {(
                      [
                        {
                          key: "subjective",
                          label: "History / subjective",
                          hint:
                            template === "followup"
                              ? "Changes since last visit; patient concerns; reported medicine use."
                              : "Patient concerns and relevant history.",
                        },
                        {
                          key: "objective",
                          label: "Findings / objective",
                          hint: "Observed findings and measurements. Leave unknown facts unasserted.",
                        },
                        {
                          key: "assessment",
                          label: "Assessment",
                          hint: "Your clinical assessment and any remaining uncertainty.",
                        },
                        {
                          key: "plan",
                          label: "Plan & follow-up",
                          hint: "Agreed next steps, responsibility and follow-up timing.",
                        },
                      ] as const
                    ).map((field) => (
                      <label className="note-field" key={field.key}>
                        {field.label}
                        <Textarea
                          aria-label={field.label}
                          value={draft[field.key]}
                          onChange={(e) => edit(field.key, e.target.value)}
                          placeholder={field.hint}
                          maxLength={2000}
                          rows={3}
                          disabled={readOnly || busy || !!error}
                        />
                      </label>
                    ))}
                    {!readOnly && (
                      <>
                        <div className="visit-review">
                          <Checkbox
                            id="visit-reviewed"
                            checked={reviewed}
                            onCheckedChange={(v) => setReviewed(v === true)}
                            disabled={busy || !!error}
                          />
                          <label htmlFor="visit-reviewed">
                            I confirmed this patient and reviewed the note.
                            Filing adds this encounter to their record.
                          </label>
                        </div>
                        <div className="visit-note-actions">
                          <Button
                            variant="outline"
                            onClick={() => void action("save")}
                            disabled={busy || !dirty || !!error}
                          >
                            Save draft
                          </Button>
                          {a.status !== "in_progress" ? (
                            <Button
                              className="primary-button"
                              onClick={() => void action("start")}
                              disabled={busy || !!error}
                            >
                              <Stethoscope size={16} />
                              Start visit
                            </Button>
                          ) : (
                            <Button
                              className="primary-button"
                              onClick={() => void action("complete")}
                              disabled={
                                busy ||
                                !reviewed ||
                                !draft.assessment.trim() ||
                                !draft.plan.trim() ||
                                !!error
                              }
                            >
                              <Check size={16} />
                              {busy ? "Saving…" : "File note & complete visit"}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
