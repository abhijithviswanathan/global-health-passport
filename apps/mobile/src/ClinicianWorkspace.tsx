/**
 * Native doctor workspace: day schedule, patient chart, booking and encounter draft.
 * Uses clinician-model.ts for calendar conversion and apps/shared/agenda.ts for layout.
 * Retain draft/version handling and permission refreshes alongside the web equivalent.
 */
import { provenanceLines } from "../../shared/care-model";
import { ProfilePanel, ProfileAvatar, ClinicalPhotos } from "./ProfilePhotos";
import { buildAgenda } from "../../shared/agenda";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { ApiError, request, type Entry, type User } from "./api";
import {
  type Appointment,
  type Patient,
  type Draft,
  emptyDraft,
  closed,
  localDay,
  localInstant,
  dayRange,
  shiftDay,
  bookingPayload,
} from "./clinician-model";

type Route =
  | { page: "Today" | "Patients" | "Appointments" | "Settings" | "Profile" }
  | { page: "Chart"; patient: Patient }
  | { page: "Booking"; patient: Patient; appointment?: Appointment }
  | { page: "Visit"; appointment: Appointment };
type Colors = {
  bg: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  button: string;
};
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const stamp = (value: number | string) => new Date(value).toLocaleString();
const timeOf = (value: number) =>
  new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
export function ClinicianWorkspace({
  user,
  colors,
  homeRef,
  menuRef,
  onSignOut,
  onNavigate,
  onExpired,
  settings,
}: {
  user: User;
  colors: Colors;
  homeRef: React.MutableRefObject<null | (() => void)>;
  menuRef: React.MutableRefObject<
    null | ((page: "Profile" | "Settings" | "Sign out") => void)
  >;
  onSignOut: () => void;
  onNavigate: () => void;
  onExpired: () => void;
  settings: React.ReactNode;
}) {
  const [route, setRoute] = useState<Route>({ page: "Today" });
  useEffect(() => {
    onNavigate();
  }, [route, onNavigate]);
  const [trail, setTrail] = useState<Route[]>([]);
  const [day, setDay] = useState(localDay());
  const [dateEditing, setDateEditing] = useState(false);
  const [dateInput, setDateInput] = useState(day);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [healthId, setHealthId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [visit, setVisit] = useState<Appointment | null>(null);
  const [visitReady, setVisitReady] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const [formDay, setFormDay] = useState(day);
  const [formTime, setFormTime] = useState("09:00");
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState("in_person");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const key = useRef("");
  const alive = useRef(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const loadedVisit = useRef("");
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const expiration = useRef(onExpired);
  expiration.current = onExpired;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  const failure = useCallback((e: unknown) => {
    if (!alive.current) return;
    if (e instanceof ApiError && [401, 403, 404].includes(e.status)) {
      setRecords([]);
      setPatients([]);
      setAppointments([]);
      setVisit(null);
      setRoute({ page: "Patients" });
      setTrail([]);
      setDraft(emptyDraft());
      setDirty(false);
      setReviewed(false);
      setVisitReady(false);
      setChartReady(false);
      loadedVisit.current = "";
      if (e.status === 401) {
        expiration.current();
        return;
      }
    }
    setError(
      e instanceof Error
        ? e.message
        : "Unable to complete this action. Please try again.",
    );
  }, []);
  const act = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      failure(e);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const guard = useCallback((action: () => void) => {
    if (inFlight.current) return;
    if (dirtyRef.current)
      Alert.alert(
        "Leave unsaved visit notes?",
        "Save the draft first to continue it on any device. Leaving now discards your latest unsaved changes.",
        [
          { text: "Keep writing", style: "cancel" },
          {
            text: "Discard changes",
            style: "destructive",
            onPress: () => {
              setDirty(false);
              action();
            },
          },
        ],
      );
    else action();
  }, []);
  const move = (next: Route) =>
    guard(() => {
      setTrail((t) => [...t, route]);
      setRoute(next);
      setAppointments([]);
      setError("");
      setNotice("");
      setRecords([]);
      setChartReady(false);
      if (next.page !== "Visit") {
        loadedVisit.current = "";
        setDraft(emptyDraft());
        setVisit(null);
        setVisitReady(false);
      }
    });
  const back = useCallback(
    () =>
      guard(() => {
        const previous = trail.at(-1) || { page: "Today" as const };
        setTrail((t) => t.slice(0, -1));
        setRoute(previous);
        setError("");
        setNotice("");
        setRecords([]);
        setChartReady(false);
        loadedVisit.current = "";
        setVisitReady(false);
        setDraft(emptyDraft());
      }),
    [guard, trail],
  );
  useEffect(() => {
    menuRef.current = (page) => {
      if (page === "Sign out") guard(onSignOut);
      else move({ page });
    };
    return () => {
      menuRef.current = null;
    };
  });
  useEffect(() => {
    homeRef.current = () =>
      guard(() => {
        setTrail([]);
        setRoute({ page: "Today" });
        setAppointments([]);
        setRecords([]);
        setDraft(emptyDraft());
        loadedVisit.current = "";
        setVisitReady(false);
        setError("");
        setNotice("");
      });
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route.page === "Today" && !trail.length) return false;
      back();
      return true;
    });
    return () => {
      homeRef.current = null;
      listener.remove();
    };
  }, [guard, back, homeRef, route.page, trail.length]);
  const load = useCallback(
    async (resetDraft = false) => {
      const current = ++generation.current;
      if (route.page === "Settings" || route.page === "Profile") return;
      try {
        if (route.page === "Visit") {
          const a = await request<Appointment>(
            `/clinician/appointments/${route.appointment.id}`,
          );
          if (!a.patientId)
            throw new Error("Patient permission is no longer available.");
          const [r, d] = await Promise.all([
            request<Entry[]>(`/patients/${a.patientId}/timeline`),
            request<Draft>(`/clinician/appointments/${a.id}/draft`),
          ]);
          if (!alive.current || current !== generation.current) return;
          setVisit(a);
          setRecords(r);
          setVisitReady(true);
          if (loadedVisit.current !== a.id || resetDraft) {
            setDraft(d);
            setDirty(false);
            setReviewed(false);
            loadedVisit.current = a.id;
          }
        } else if (route.page === "Chart") {
          const r = await request<Entry[]>(
            `/patients/${route.patient.id}/timeline`,
          );
          if (!alive.current || current !== generation.current) return;
          setRecords(r);
          setChartReady(true);
        } else {
          const range = dayRange(
            route.page === "Patients" || route.page === "Today"
              ? localDay()
              : day,
          );
          if (route.page === "Patients")
            range.to = dayRange(shiftDay(localDay(), 30)).to;
          const windowStart = Date.parse(range.from),
            windowEnd = Date.parse(range.to);
          range.from = new Date(windowStart - 180 * 60000).toISOString();
          const [p, a] = await Promise.all([
            request<Patient[]>("/patients"),
            request<Appointment[]>(
              `/clinician/appointments?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
            ),
          ]);
          if (!alive.current || current !== generation.current) return;
          setPatients(p);
          setAppointments(
            a.filter(
              (v) =>
                v.startsAt < windowEnd &&
                v.startsAt + v.durationMinutes * 60000 > windowStart,
            ),
          );
        }
      } catch (e) {
        if (current === generation.current) {
          if (route.page === "Visit") setVisitReady(false);
          if (route.page === "Chart") setChartReady(false);
          failure(e);
        }
      }
    },
    [route, day, failure],
  );
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!inFlight.current) void load();
    }, 30000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [load]);
  const selectDay = (next: string) => {
    dayRange(next);
    setDay(next);
    setAppointments([]);
    setDateInput(next);
  };
  const book = (patient: Patient, a?: Appointment) => {
    const next = a
      ? new Date(a.startsAt)
      : new Date(Math.ceil((Date.now() + 5 * 60000) / 900000) * 900000);
    setFormDay(
      a
        ? localDay(next)
        : route.page === "Appointments" && day > localDay()
          ? day
          : localDay(next),
    );
    setFormTime(
      !a && route.page === "Appointments" && day > localDay()
        ? "09:00"
        : `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`,
    );
    setDuration(String(a?.durationMinutes || 30));
    setReason(a?.reason || "");
    setMode(a?.visitMode || "in_person");
    key.current = `mobile-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    move({ page: "Booking", patient, appointment: a });
  };
  const saveBooking = () =>
    act(async () => {
      if (route.page !== "Booking") return;
      const payload = bookingPayload(
        route.patient.id,
        formDay,
        formTime,
        duration,
        reason,
        mode,
        key.current,
      );
      if (route.appointment)
        await request(
          `/clinician/appointments/${route.appointment.id}`,
          "PATCH",
          {
            ...payload,
            version: route.appointment.version,
            status: "scheduled",
          },
        );
      else await request("/clinician/appointments", "POST", payload);
      if (!alive.current) return;
      selectDay(formDay);
      setTrail([{ page: "Today" }]);
      setRoute({ page: "Appointments" });
      setNotice(
        "Appointment saved. Invitations and video links are arranged separately.",
      );
    });
  const change = (a: Appointment, status: string) =>
    act(async () => {
      await request(`/clinician/appointments/${a.id}`, "PATCH", {
        version: a.version,
        status,
      });
      if (!alive.current) return;
      setNotice(`Appointment ${label(status).toLowerCase()}.`);
      await load();
    });
  const cancel = (a: Appointment) =>
    Alert.alert(
      "Cancel this appointment?",
      "The time will become available for another appointment.",
      [
        { text: "Keep appointment", style: "cancel" },
        {
          text: "Cancel appointment",
          style: "destructive",
          onPress: () => void change(a, "cancelled"),
        },
      ],
    );
  const saveDraft = async () => {
    if (!visit || !visitReady)
      throw new Error("Reload and review the visit before saving.");
    const d = await request<Draft>(
      `/clinician/appointments/${visit.id}/draft`,
      "PUT",
      draft,
    );
    if (alive.current) {
      setDraft(d);
      setDirty(false);
    }
    return d;
  };
  const edit = (
    name: "subjective" | "objective" | "assessment" | "plan",
    value: string,
  ) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setDirty(true);
    setReviewed(false);
  };
  const complete = () =>
    act(async () => {
      if (!visit || !visitReady || !reviewed)
        throw new Error("Confirm the patient and review the note first.");
      const d = dirty ? await saveDraft() : draft;
      const updated = await request<Appointment>(
        `/clinician/appointments/${visit.id}/complete`,
        "POST",
        { version: visit.version, draftVersion: d.version, reviewed: true },
      );
      if (alive.current) {
        setVisit(updated);
        setDirty(false);
        setNotice("Filed once to the patient timeline. Visit complete.");
      }
    });
  const text = (value: string, muted = false) => (
    <Text style={[s.copy, { color: muted ? colors.muted : colors.ink }]}>
      {value}
    </Text>
  );
  const button = (
    name: string,
    action: () => void,
    secondary = true,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled }}
      disabled={busy || disabled}
      onPress={action}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: secondary ? colors.card : colors.button,
          borderColor: colors.line,
          opacity: busy || disabled || pressed ? 0.55 : 1,
        },
      ]}
    >
      <Text style={[s.buttonText, { color: secondary ? colors.ink : "#fff" }]}>
        {name}
      </Text>
    </Pressable>
  );
  const card = (name: string, children: React.ReactNode, id?: string) => (
    <View
      key={id || name}
      testID={id}
      style={[
        s.card,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <Text
        accessibilityRole="header"
        style={[s.heading, { color: colors.ink }]}
      >
        {name}
      </Text>
      {children}
    </View>
  );
  const field = (
    name: string,
    value: string,
    setter: (v: string) => void,
    options: {
      multiline?: boolean;
      keyboardType?: KeyboardTypeOptions;
      maxLength?: number;
      editable?: boolean;
      placeholder?: string;
    } = {},
  ) => (
    <View style={s.field}>
      <Text style={[s.label, { color: colors.ink }]}>{name}</Text>
      <TextInput
        accessibilityLabel={name}
        value={value}
        onChangeText={setter}
        autoCapitalize="none"
        placeholderTextColor={colors.muted}
        {...options}
        style={[
          s.input,
          options.multiline && s.multiline,
          {
            color: colors.ink,
            backgroundColor: colors.card,
            borderColor: colors.line,
          },
        ]}
      />
    </View>
  );
  const patientOf = (a: Appointment): Patient => ({
    id: a.patientId!,
    displayName: a.patientName,
    healthId: a.healthId!,
  });
  const row = (a: Appointment) =>
    card(
      a.patientName.replace(" (Synthetic)", ""),
      <>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <Text
            style={{ color: colors.accent, fontWeight: "700", fontSize: 13 }}
          >
            {timeOf(a.startsAt)} –{" "}
            {timeOf(a.startsAt + a.durationMinutes * 60000)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {label(a.status)} · {label(a.visitMode)}
          </Text>
        </View>
        {text(
          a.access
            ? a.reason
            : "Patient permission has ended. Details are hidden.",
          true,
        )}
        <View style={s.cardActions}>
          {a.access && !closed(a) && a.canDocument && (
            <View style={{ flex: 1 }}>
              {button(
                "Prepare visit",
                () => {
                  loadedVisit.current = "";
                  setVisitReady(false);
                  move({ page: "Visit", appointment: a });
                },
                false,
              )}
            </View>
          )}
          {a.access && a.status === "scheduled" && (
            <View style={{ flex: 1 }}>
              {button("Check in", () => void change(a, "checked_in"))}
            </View>
          )}
          {a.access && closed(a) && (
            <View style={{ flex: 1 }}>
              {button("Open chart", () =>
                move({ page: "Chart", patient: patientOf(a) }),
              )}
            </View>
          )}
        </View>
        {!closed(a) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            accessibilityState={{ expanded: expanded === a.id }}
            onPress={() => setExpanded(expanded === a.id ? null : a.id)}
            style={{
              alignSelf: "flex-start",
              minHeight: 44,
              justifyContent: "center",
            }}
          >
            <Text
              style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}
            >
              ••• More options
            </Text>
          </Pressable>
        )}
        {expanded === a.id && !closed(a) && (
          <View style={{ gap: 8 }}>
            {a.access && (
              <>
                {button("Open chart", () =>
                  move({ page: "Chart", patient: patientOf(a) }),
                )}
                {a.status === "scheduled" && (
                  <>
                    {button("Reschedule", () => book(patientOf(a), a))}
                    {button("Mark no-show", () =>
                      Alert.alert(
                        "Mark as no-show?",
                        "Close this appointment without a clinical note.",
                        [
                          { text: "Keep appointment", style: "cancel" },
                          {
                            text: "Mark no-show",
                            onPress: () => void change(a, "no_show"),
                          },
                        ],
                      ),
                    )}
                  </>
                )}
              </>
            )}
            {button("Cancel appointment", () => cancel(a))}
          </View>
        )}
      </>,
      a.id,
    );
  const sourceRecord = (r: Entry) =>
    card(
      r.title,
      <>
        {text(`${label(r.kind)} · record ${r.status}`, true)}
        {text(r.details)}
        {text(
          `${r.source} · ${r.authorName || "Author not provided"} · recorded ${stamp(r.createdAt)}`,
          true,
        )}
        {provenanceLines(
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
              v,
            ]),
          ),
        ).map((line, i) => (
          <View key={i}>{text(line, true)}</View>
        ))}
        {r.clinicalStatus && text(`Clinical status: ${r.clinicalStatus}`, true)}
      </>,
      r.id,
    );
  return (
    <View style={s.stack}>
      {(trail.length > 0 || route.page !== "Today") && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={back}
          disabled={busy}
          hitSlop={6}
          style={s.back}
        >
          <Text style={[s.backText, { color: colors.ink }]}>
            ‹ <Text style={{ fontSize: 14 }}>Back</Text>
          </Text>
        </Pressable>
      )}
      <Text accessibilityRole="header" style={[s.title, { color: colors.ink }]}>
        {route.page === "Today"
          ? "Your day, with room for care."
          : route.page === "Visit"
            ? "Visit workspace"
            : route.page === "Booking"
              ? route.appointment
                ? "Reschedule visit"
                : "Book a visit"
              : route.page === "Chart"
                ? route.patient.displayName
                : route.page}
      </Text>
      {text(`Doctor workspace · ${user.displayName}`, true)}
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Doctor sections"
        style={s.navigation}
      >
        {(["Today", "Patients", "Appointments"] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="tab"
            accessibilityLabel={p}
            accessibilityState={{ selected: route.page === p }}
            onPress={() => move({ page: p })}
            disabled={busy}
            style={[
              s.navItem,
              {
                backgroundColor: route.page === p ? colors.button : colors.card,
                borderColor: colors.line,
              },
            ]}
          >
            <Text
              style={{
                color: route.page === p ? "#fff" : colors.ink,
                fontWeight: "600",
              }}
            >
              {p === "Appointments" ? "Agenda" : p}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[s.copy, { color: colors.accent }]}
        >
          {notice}
        </Text>
      ) : null}
      {busy && text("Saving…", true)}
      {route.page === "Profile" ? (
        <ProfilePanel user={user} colors={colors} />
      ) : route.page === "Settings" ? (
        settings
      ) : (
        <>
          {route.page !== "Booking" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                route.page === "Visit" ? "Reload visit" : "Refresh"
              }
              onPress={() => guard(() => void load(true))}
              style={s.refresh}
            >
              <Text style={{ color: colors.accent, fontWeight: "600" }}>
                ↻ {route.page === "Visit" ? "Reload visit" : "Refresh"}
              </Text>
            </Pressable>
          )}
          {route.page === "Today" && (
            <>
              <View style={[s.dayHero, { backgroundColor: colors.button }]}>
                <Text style={s.heroEyebrow}>
                  {new Date()
                    .toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })
                    .toUpperCase()}
                </Text>
                <Text style={s.heroTitle}>A clear view of your day.</Text>
                <View style={s.metrics}>
                  {[
                    [appointments.filter((a) => !closed(a)).length, "To see"],
                    [
                      appointments.filter((a) => a.status === "checked_in")
                        .length,
                      "Checked in",
                    ],
                    [
                      appointments.filter((a) => a.status === "completed")
                        .length,
                      "Done",
                    ],
                  ].map(([n, label]) => (
                    <View key={label} style={s.metric}>
                      <Text style={s.metricValue}>{n}</Text>
                      <Text style={s.metricLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Find a patient & book"
                  onPress={() => move({ page: "Patients" })}
                  style={s.heroAction}
                >
                  <Text style={{ color: "#153d39", fontWeight: "700" }}>
                    ＋ Find a patient & book
                  </Text>
                </Pressable>
              </View>
              {appointments.find(
                (a) => !closed(a) && a.startsAt >= Date.now(),
              ) &&
                card(
                  "Next visit",
                  text(
                    `${timeOf(appointments.find((a) => !closed(a) && a.startsAt >= Date.now())!.startsAt)} · ${appointments.find((a) => !closed(a) && a.startsAt >= Date.now())!.patientName}`,
                  ),
                )}
            </>
          )}
          {route.page === "Appointments" && (
            <View
              style={[
                s.card,
                { backgroundColor: colors.card, borderColor: colors.line },
              ]}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous day"
                  onPress={() => selectDay(shiftDay(day, -1))}
                  style={s.dateArrow}
                >
                  <Text style={{ color: colors.ink, fontSize: 27 }}>‹</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Choose schedule date"
                  onPress={() => setDateEditing(!dateEditing)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    ⌄
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next day"
                  onPress={() => selectDay(shiftDay(day, 1))}
                  style={s.dateArrow}
                >
                  <Text style={{ color: colors.ink, fontSize: 27 }}>›</Text>
                </Pressable>
              </View>
              {dateEditing && (
                <>
                  {field(
                    "Schedule date (YYYY-MM-DD)",
                    dateInput,
                    setDateInput,
                    { maxLength: 10 },
                  )}
                  {button("Show date", () => {
                    try {
                      selectDay(dateInput);
                      setDateEditing(false);
                    } catch (e) {
                      failure(e);
                    }
                  })}
                </>
              )}
              <View style={s.cardActions}>
                <View style={{ flex: 1 }}>
                  {button("Today", () => selectDay(localDay()))}
                </View>
                <View style={{ flex: 2 }}>
                  {button(
                    "Book appointment",
                    () => move({ page: "Patients" }),
                    false,
                  )}
                </View>
              </View>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                Times in {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </Text>
            </View>
          )}
          {(route.page === "Today" || route.page === "Appointments") && (
            <View
              style={[
                s.agenda,
                { backgroundColor: colors.card, borderColor: colors.line },
              ]}
            >
              <Text
                accessibilityRole="header"
                style={[s.heading, { color: colors.ink }]}
              >
                Your day at a glance
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Local time · tap a visit to prepare
              </Text>
              {buildAgenda(
                route.page === "Today" ? localDay() : day,
                appointments.map((a) => ({
                  id: a.id,
                  start: a.startsAt,
                  minutes: a.durationMinutes,
                  status: a.status,
                })),
              ).map((segment, i) => {
                const a = appointments.find((a) => a.id === segment.eventId);
                return (
                  <View key={segment.eventId || `gap-${i}`} style={s.agendaRow}>
                    <View style={s.timeRail}>
                      <Text
                        style={{
                          color: colors.ink,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {timeOf(segment.start)}
                      </Text>
                      <View
                        style={[s.rail, { backgroundColor: colors.line }]}
                      />
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        {timeOf(segment.end)}
                      </Text>
                    </View>
                    {a ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View appointment for ${a.patientName} at ${timeOf(a.startsAt)}`}
                        disabled={!a.access || busy}
                        onPress={() => {
                          if (a.canDocument && !closed(a)) {
                            loadedVisit.current = "";
                            setVisitReady(false);
                            move({ page: "Visit", appointment: a });
                          } else if (a.access)
                            move({ page: "Chart", patient: patientOf(a) });
                        }}
                        style={({ pressed }) => [
                          s.agendaVisit,
                          {
                            backgroundColor: colors.bg,
                            borderLeftColor:
                              a.status === "in_progress"
                                ? "#b17b20"
                                : a.status === "completed"
                                  ? "#637778"
                                  : colors.accent,
                            opacity: pressed ? 0.75 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: colors.accent,
                            fontSize: 11,
                            fontWeight: "700",
                            letterSpacing: 0.6,
                          }}
                        >
                          {label(a.status).toUpperCase()} · {a.durationMinutes}{" "}
                          MIN
                        </Text>
                        <Text
                          style={{
                            color: colors.ink,
                            fontSize: 16,
                            fontWeight: "700",
                          }}
                        >
                          {a.patientName.replace(" (Synthetic)", "")}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={{
                            color: colors.muted,
                            fontSize: 13,
                            lineHeight: 19,
                          }}
                        >
                          {a.reason || "Patient details unavailable"}
                        </Text>
                      </Pressable>
                    ) : (
                      <View style={[s.agendaGap, { borderColor: colors.line }]}>
                        <Text style={{ color: colors.muted, fontSize: 13 }}>
                          No bookings
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 11 }}>
                          {Math.round((segment.end - segment.start) / 60000)}{" "}
                          min in this window
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
              <Text
                style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}
              >
                Gaps show unbooked time, not confirmed clinic availability.
                Cancelled and no-show visits remain in the list below.
              </Text>
            </View>
          )}
          {(route.page === "Today" || route.page === "Appointments") &&
            (appointments.length
              ? appointments.map(row)
              : card(
                  "No appointments on this day",
                  text(
                    "Book from the patient list. Your web and mobile schedules use the same saved appointments.",
                  ),
                ))}
          {route.page === "Patients" && (
            <>
              {field("Search patients by name or Health ID", query, setQuery)}
              {patients
                .filter((p) =>
                  `${p.displayName} ${p.healthId}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((p) => {
                  const next = appointments.find(
                    (a) =>
                      a.patientId === p.id &&
                      !closed(a) &&
                      a.startsAt >= Date.now(),
                  );
                  return (
                    <View
                      key={p.id}
                      testID={p.id}
                      style={[
                        s.patientCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.line,
                        },
                      ]}
                    >
                      <View style={s.identityRow}>
                        <ProfileAvatar
                          owner={p.id}
                          name={p.displayName}
                          colors={colors}
                        />
                        <View style={{ flex: 1, gap: 5 }}>
                          <Text
                            accessibilityRole="header"
                            style={[s.heading, { color: colors.ink }]}
                          >
                            {p.displayName.replace(" (Synthetic)", "")}
                          </Text>
                          <Text style={{ color: colors.muted, fontSize: 13 }}>
                            ID {p.healthId} · Shared chart
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[s.patientVisit, { backgroundColor: colors.bg }]}
                      >
                        <Text
                          style={{
                            color: colors.muted,
                            fontSize: 11,
                            fontWeight: "700",
                            letterSpacing: 1,
                          }}
                        >
                          NEXT VISIT
                        </Text>
                        <Text
                          style={{
                            color: colors.ink,
                            fontWeight: "600",
                            fontSize: 16,
                          }}
                        >
                          {next
                            ? stamp(next.startsAt)
                            : "No visit in the next 31 days"}
                        </Text>
                        {next && (
                          <>
                            <Text style={{ color: colors.muted }}>
                              {next.reason}
                            </Text>
                            <Text
                              style={{
                                color: colors.accent,
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              {next.durationMinutes} min ·{" "}
                              {label(next.visitMode)} · {label(next.status)}
                            </Text>
                          </>
                        )}
                      </View>
                      <View style={s.cardActions}>
                        <View style={{ flex: 1 }}>
                          {button(
                            "Open chart",
                            () => move({ page: "Chart", patient: p }),
                            false,
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          {button("Book visit", () => book(p))}
                        </View>
                      </View>
                    </View>
                  );
                })}
              {!patients.filter((p) =>
                `${p.displayName} ${p.healthId}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              ).length &&
                text(
                  "No matching authorized patients. Request access using a Health ID.",
                  true,
                )}
              {card(
                "Request patient access",
                <>
                  {field("Patient Health ID", healthId, setHealthId, {
                    maxLength: 80,
                  })}
                  {text(
                    "The patient chooses the categories and expiry. Their Health ID alone does not grant access.",
                    true,
                  )}
                  {button(
                    "Request treatment access",
                    () =>
                      void act(async () => {
                        await request("/access-requests", "POST", {
                          healthId: healthId.trim(),
                          purpose: "treatment",
                        });
                        if (alive.current) {
                          setHealthId("");
                          setNotice(
                            "Request sent. The patient can approve it in Sharing on web or mobile.",
                          );
                        }
                      }),
                    false,
                    !healthId.trim(),
                  )}
                </>,
              )}
            </>
          )}
          {route.page === "Chart" && (
            <>
              <ProfileAvatar
                owner={route.patient.id}
                name={route.patient.displayName}
                colors={colors}
                size={64}
              />
              {text(route.patient.healthId)}
              <ClinicalPhotos
                key={route.patient.id}
                patientId={route.patient.id}
                colors={colors}
              />
              {button("Book visit", () => book(route.patient), false)}
              {text(
                "Shared source records only. Missing entries do not mean “none”; prescriptions may not reflect current use.",
                true,
              )}
              {chartReady
                ? records.length
                  ? records.map(sourceRecord)
                  : text("No shared records available.")
                : text("Refresh to retrieve authorized records.", true)}
            </>
          )}
          {route.page === "Booking" &&
            card(
              route.patient.displayName,
              <>
                {text(route.patient.healthId)}
                {field("Appointment date (YYYY-MM-DD)", formDay, setFormDay, {
                  maxLength: 10,
                })}
                <View style={s.tabs}>
                  {button("Today", () => setFormDay(localDay()))}
                  {button("Tomorrow", () =>
                    setFormDay(shiftDay(localDay(), 1)),
                  )}
                </View>
                {field(
                  "Appointment time (HH:MM, 24-hour)",
                  formTime,
                  setFormTime,
                  { maxLength: 5 },
                )}
                {text(
                  `Local time: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
                  true,
                )}
                {field("Duration in minutes", duration, setDuration, {
                  keyboardType: "number-pad",
                  maxLength: 3,
                })}
                <View style={s.tabs}>
                  {[15, 30, 45, 60].map((n) => (
                    <Pressable
                      key={n}
                      accessibilityRole="button"
                      accessibilityState={{ selected: duration === String(n) }}
                      onPress={() => setDuration(String(n))}
                      style={[
                        s.tab,
                        {
                          borderColor: colors.line,
                          backgroundColor:
                            duration === String(n)
                              ? colors.button
                              : colors.card,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: duration === String(n) ? "#fff" : colors.ink,
                        }}
                      >
                        {n} min
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {field("Visit reason", reason, setReason, {
                  maxLength: 200,
                  editable: !route.appointment,
                })}
                <View style={s.row}>
                  {text("Video visit")}
                  <Switch
                    accessibilityLabel="Video visit"
                    disabled={!!route.appointment}
                    value={mode === "video"}
                    onValueChange={(v) => setMode(v ? "video" : "in_person")}
                  />
                </View>
                {text(
                  "In-person by default. Arrange invitations and any video link separately. The server checks overlapping appointments.",
                  true,
                )}
                {button(
                  route.appointment ? "Save new time" : "Confirm booking",
                  saveBooking,
                  false,
                )}
              </>,
            )}
          {route.page === "Visit" && (
            <>
              {card(
                visit?.patientName || route.appointment.patientName,
                <>
                  {text(
                    `${visit?.healthId || route.appointment.healthId} · ${stamp((visit || route.appointment).startsAt)}`,
                  )}
                  {text(
                    `${label((visit || route.appointment).status)} · ${(visit || route.appointment).reason}`,
                  )}
                  {text(
                    "Save before leaving the app. Backgrounding clears clinical screen state; saved drafts remain on the server.",
                    true,
                  )}
                </>,
              )}
              {visitReady && visit && (
                <>
                  {card(
                    "Shared chart context",
                    <>
                      {text(
                        "Shared source records only. Missing entries do not mean “none”; recorded medicines may not reflect current use.",
                        true,
                      )}
                      {records
                        .filter(
                          (r) =>
                            r.status === "active" &&
                            [
                              "allergy",
                              "condition",
                              "medication",
                              "prescription",
                              "lab_result",
                            ].includes(r.kind),
                        )
                        .slice(0, 12)
                        .map(sourceRecord)}
                      {!records.length &&
                        text("No shared records available.", true)}
                      {button("Open full chart", () =>
                        move({ page: "Chart", patient: patientOf(visit) }),
                      )}
                    </>,
                  )}
                  {card(
                    "Visit note",
                    <>
                      <Text
                        accessibilityLiveRegion="polite"
                        style={[s.copy, { color: colors.accent }]}
                      >
                        {dirty
                          ? "Unsaved changes"
                          : draft.updatedAt
                            ? `Saved ${stamp(draft.updatedAt)}`
                            : "Draft not yet saved"}
                      </Text>
                      {text(
                        "Write once here, review, then file to the patient timeline. No source records are copied automatically.",
                        true,
                      )}
                      <View style={s.row}>
                        {text("Follow-up writing guide")}
                        <Switch
                          accessibilityLabel="Follow-up writing guide"
                          value={guide}
                          onValueChange={setGuide}
                        />
                      </View>
                      {guide &&
                        text(
                          "Record changes since the last visit, observed findings, your assessment, and the agreed next steps. Verify every clinical statement.",
                          true,
                        )}
                      {!closed(visit) &&
                        button(
                          "Use visit reason",
                          () => {
                            if (!draft.subjective.trim())
                              edit("subjective", visit.reason);
                          },
                          true,
                          !!draft.subjective.trim(),
                        )}
                      {field(
                        "History / subjective",
                        draft.subjective,
                        (v) => edit("subjective", v),
                        {
                          multiline: true,
                          maxLength: 2000,
                          editable: !closed(visit) && !busy,
                        },
                      )}
                      {field(
                        "Findings / objective",
                        draft.objective,
                        (v) => edit("objective", v),
                        {
                          multiline: true,
                          maxLength: 2000,
                          editable: !closed(visit) && !busy,
                        },
                      )}
                      {field(
                        "Assessment",
                        draft.assessment,
                        (v) => edit("assessment", v),
                        {
                          multiline: true,
                          maxLength: 2000,
                          editable: !closed(visit) && !busy,
                        },
                      )}
                      {field(
                        "Plan & follow-up",
                        draft.plan,
                        (v) => edit("plan", v),
                        {
                          multiline: true,
                          maxLength: 2000,
                          editable: !closed(visit) && !busy,
                        },
                      )}
                      {closed(visit) ? (
                        text(
                          visit.status === "completed"
                            ? "Filed once to the patient timeline. Visit complete."
                            : "This appointment is closed. Draft editing is unavailable.",
                        )
                      ) : (
                        <>
                          {button(
                            "Save draft",
                            () =>
                              void act(async () => {
                                await saveDraft();
                                if (alive.current)
                                  setNotice(
                                    "Draft saved. You can continue it on web or mobile.",
                                  );
                              }),
                            false,
                          )}
                          {visit.status !== "in_progress" ? (
                            button(
                              "Start visit",
                              () =>
                                void act(async () => {
                                  const a = await request<Appointment>(
                                    `/clinician/appointments/${visit.id}`,
                                    "PATCH",
                                    {
                                      version: visit.version,
                                      status: "in_progress",
                                    },
                                  );
                                  if (alive.current) setVisit(a);
                                }),
                              false,
                            )
                          ) : (
                            <>
                              <View style={s.row}>
                                <Text
                                  style={[
                                    s.copy,
                                    { color: colors.ink, flex: 1 },
                                  ]}
                                >
                                  I confirmed this patient and reviewed the
                                  note.
                                </Text>
                                <Switch
                                  accessibilityLabel="Confirm patient and reviewed note"
                                  value={reviewed}
                                  onValueChange={setReviewed}
                                />
                              </View>
                              {button(
                                "File note & complete visit",
                                complete,
                                false,
                                !reviewed ||
                                  !draft.assessment.trim() ||
                                  !draft.plan.trim(),
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>,
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  dateArrow: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  back: {
    alignSelf: "flex-start",
    minHeight: 44,
    minWidth: 60,
    justifyContent: "center",
    marginBottom: -10,
  },
  backText: { fontSize: 28, fontWeight: "500" },
  refresh: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 8,
    marginVertical: -8,
  },
  navigation: { flexDirection: "row", gap: 5 },
  navItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
  },
  dayHero: { padding: 22, borderRadius: 22, gap: 17 },
  heroEyebrow: {
    color: "#dbf6ee",
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: "700",
  },
  heroTitle: { color: "#fff", fontSize: 25, fontWeight: "600", lineHeight: 31 },
  metrics: { flexDirection: "row", gap: 12 },
  metric: { flex: 1 },
  metricValue: { color: "#fff", fontSize: 32, fontWeight: "700" },
  metricLabel: { color: "#dbf6ee", fontSize: 12 },
  heroAction: {
    backgroundColor: "#e8f6ee",
    borderRadius: 12,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  patientCard: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 16 },
  identityRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  patientVisit: { borderRadius: 12, padding: 14, gap: 8 },
  cardActions: { flexDirection: "row", gap: 10 },
  agenda: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  agendaRow: { flexDirection: "row", gap: 12 },
  timeRail: { width: 64, flexShrink: 0, alignItems: "center", gap: 5 },
  rail: { width: 2, flex: 1, minHeight: 14 },
  agendaVisit: {
    flex: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 13,
    gap: 7,
    minHeight: 94,
  },
  agendaGap: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    justifyContent: "center",
    minHeight: 62,
  },
  stack: { gap: 16 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  heading: { fontSize: 19, fontWeight: "600" },
  copy: { fontSize: 15, lineHeight: 23 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  field: { gap: 7 },
  label: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 13,
    minHeight: 48,
    fontSize: 16,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: {
    borderWidth: 1,
    borderRadius: 22,
    minHeight: 48,
    justifyContent: "center",
    padding: 13,
  },
  button: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  error: {
    color: "#8c251c",
    backgroundColor: "#fff0e9",
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
  },
});
