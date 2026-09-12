import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
  Platform,
} from "react-native";
import { request, type User } from "./api";
import {
  actions,
  initial,
  visibleFields,
  options,
  payload,
  provenanceLines,
  readable,
  roleDescription,
  type Row,
  type Action,
} from "../../shared/care-model";
const call = <T,>(path: string, method = "GET", body?: unknown) =>
  request<T>(path, method, body, 15000, true);
export function CareWorkspace({
  user,
  onExit,
  onSignOut,
  homeRef,
  onNavigate,
}: {
  user: User;
  onExit?: () => void;
  onSignOut: () => void;
  homeRef?: React.MutableRefObject<(() => void) | null>;
  onNavigate?: () => void;
}) {
  const [notices, setNotices] = useState<Row[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [tab, setTab] = useState("Patients"),
    [data, setData] = useState<Row>({}),
    [pid, setPid] = useState(""),
    [records, setRecords] = useState<Row[]>([]),
    [detail, setDetail] = useState<Row>({}),
    [action, setAction] = useState<Action | null>(null),
    [values, setValues] = useState<Row>({}),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [filter, setFilter] = useState("all"),
    [audit, setAudit] = useState<Row | null>(null);
  async function refresh(patient = pid) {
    setData(await call<Row>("/care/workspace"));
    setNotices(await call<Row[]>("/care/notifications"));
    if (patient)
      setRecords(await call<Row[]>(`/care/patients/${patient}/timeline`));
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      call<Row>("/care/workspace"),
      call<Row[]>("/care/notifications"),
    ])
      .then(([d, n]) => {
        if (active) {
          setData(d);
          setNotices(n);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  function begin(a: Action) {
    setAction(a);
    setValues(initial(a, pid));
    setKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setSaved("");
    setError("");
  }
  function discard(next: () => void) {
    if (!action) {
      next();
      return;
    }
    if (Platform.OS === "web") {
      if (globalThis.confirm("Discard this unsaved form?")) next();
    } else
      Alert.alert("Discard unsaved changes?", "This form has not been saved.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: next },
      ]);
  }
  useEffect(() => {
    if (!homeRef) return;
    homeRef.current = () =>
      discard(() => {
        setAction(null);
        setDetail({});
        setTab("Patients");
        onNavigate?.();
        onExit?.();
      });
    return () => {
      homeRef.current = null;
    };
  }, [action, homeRef, onNavigate, onExit]);
  useEffect(() => {
    if (
      detail.record ||
      detail.task ||
      detail.conversation ||
      detail.appointment ||
      action
    )
      onNavigate?.();
  }, [detail, action, onNavigate]);
  const text = (value: unknown, style?: any) => (
    <Text style={[s.text, style]}>{String(value ?? "Unknown")}</Text>
  );
  const button = (label: string, onPress: () => void, selected = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, selected }}
      disabled={busy}
      onPress={onPress}
      style={[s.button, selected && s.selected]}
    >
      {text(label, selected ? s.white : undefined)}
    </Pressable>
  );
  const choose = (a: Action) => button(a.label, () => begin(a));
  async function openTask(t: Row) {
    const d = await call<Row>(`/care/tasks/${t.id}`);
    setDetail({ task: d.task, comments: d.comments, history: d.history });
  }
  async function openConversation(c: Row) {
    const d = await call<Row>(`/care/conversations/${c.id}`);
    setDetail({ conversation: d.conversation, messages: d.messages });
    if (d.messages.length)
      await call(`/care/conversations/${c.id}/read`, "POST", {
        lastMessageId: d.messages.at(-1).id,
      });
  }
  const card = (r: Row, press: () => void, subtitle: string) => (
    <Pressable
      key={r.id || r.kind}
      accessibilityRole="button"
      onPress={press}
      style={s.card}
    >
      {text(readable(r.kind || r.role || r.status), s.label)}
      {text(r.title || r.name || r.patient_name, s.title)}
      {text(subtitle, s.meta)}
      {r.freshness_label && text(r.freshness_label, s.badge)}
      {(r.overdue || r.unacknowledged) &&
        text("Escalated · overdue or unacknowledged", s.error)}
    </Pressable>
  );
  const ctx = { ...detail, userId: user.id };
  const selected =
    detail.record || detail.task || detail.conversation || detail.appointment;
  const tabs = [
    "Patients",
    "Schedule",
    "Tasks",
    "Messages",
    "Services",
    ...(["admin", "coordinator"].includes(user.role) ? ["Access"] : []),
  ];
  return (
    <View style={s.root}>
      <View style={s.hero}>
        {text(
          `${data.clinic || "Your clinic"} · ${data.department || "Department unknown"}`,
          s.label,
        )}
        {text(`${readable(user.role)} workspace`, s.heading)}
        {text(roleDescription[user.role])}
        <View style={s.row}>
          {onExit && button("← Doctor home", () => discard(onExit))}
          {button("Refresh", () => run(() => refresh()))}
          {button("Sign out", () => discard(onSignOut))}
        </View>
      </View>
      <View style={s.row}>
        <View style={s.metric}>
          {text(data.patients?.length || 0, s.heading)}
          {text("Assigned patients")}
        </View>
        <View style={s.metric}>
          {text(
            data.tasks?.filter((t: Row) => t.status !== "completed").length ||
              0,
            s.heading,
          )}
          {text("Open tasks")}
        </View>
      </View>
      {notices.map((n, i) => (
        <Text key={i} style={n.escalated ? s.error : s.meta}>
          {n.preview}
          {n.assignee ? " · " + n.assignee : ""}
        </Text>
      ))}
      <View style={s.row}>
        {tabs.map((t) =>
          button(
            t,
            () =>
              discard(() => {
                setAction(null);
                setTab(t);
                setDetail({});
                setAudit(null);
              }),
            tab === t,
          ),
        )}
      </View>
      {error ? text(error, s.error) : null}
      {saved ? (
        <Text accessibilityLiveRegion="polite" style={s.success}>
          {saved}
        </Text>
      ) : null}
      {busy ? <Text accessibilityLiveRegion="polite">Working…</Text> : null}
      <View style={s.row}>
        {actions(
          user.role,
          tab,
          detail.record ||
            detail.task ||
            detail.conversation ||
            detail.appointment
            ? {}
            : ctx,
        ).map(choose)}
      </View>
      {action ? (
        <View style={s.panel}>
          {text(action.label, s.heading)}
          {text(
            "Use a date, time and UTC offset, for example 2026-09-11T09:30:00-04:00. Leave unavailable observation dates blank.",
            s.meta,
          )}
          {visibleFields(action, values, user.role).map((f) => (
            <View key={f.key} style={s.field}>
              {text(f.label + (f.optional ? " (optional)" : ""), s.label)}
              {f.type === "select" || f.type === "multi" ? (
                <View style={s.row}>
                  {f.optional &&
                    f.type === "select" &&
                    button(
                      "None",
                      () => setValues({ ...values, [f.key]: "" }),
                      !values[f.key],
                    )}
                  {options(
                    f,
                    data,
                    records.length ? records : data.services || [],
                  ).map((o: Row) =>
                    button(
                      o.label,
                      () =>
                        setValues({
                          ...values,
                          [f.key]:
                            f.type === "multi"
                              ? (values[f.key] || []).includes(o.id)
                                ? values[f.key].filter(
                                    (v: string) => v !== o.id,
                                  )
                                : [...(values[f.key] || []), o.id]
                              : o.id,
                        }),
                      f.type === "multi"
                        ? (values[f.key] || []).includes(o.id)
                        : values[f.key] === o.id,
                    ),
                  )}
                </View>
              ) : f.type === "check" ? (
                <Switch
                  accessibilityLabel={f.label}
                  value={!!values[f.key]}
                  onValueChange={(v) => setValues({ ...values, [f.key]: v })}
                />
              ) : (
                <TextInput
                  secureTextEntry={f.type === "password"}
                  accessibilityLabel={f.label}
                  value={String(values[f.key] ?? "")}
                  onChangeText={(v) => setValues({ ...values, [f.key]: v })}
                  multiline={f.type === "long"}
                  keyboardType={f.type === "number" ? "numeric" : "default"}
                  autoCapitalize="none"
                  style={[s.input, f.type === "long" && { minHeight: 120 }]}
                />
              )}
            </View>
          ))}
          {button(busy ? "Saving…" : "Save", () =>
            run(async () => {
              for (const f of action.fields)
                if (
                  !f.optional &&
                  f.type !== "check" &&
                  f.type !== "multi" &&
                  String(values[f.key] ?? "").trim() === ""
                )
                  throw new Error(`Enter ${f.label.toLowerCase()}`);
              const result = await call<Row>(
                action.path,
                action.method || "POST",
                payload(action, values, key),
              );
              setAction(null);
              setDetail({});
              setSaved("Saved on the server.");
              if (action.id === "registration") {
                setPid(result.id);
                await refresh(result.id);
              } else await refresh();
            }),
          )}
          {button("Cancel", () => discard(() => setAction(null)))}
        </View>
      ) : (
        <>
          {!selected && tab === "Patients" && (
            <>
              {(data.patients || []).map((p: Row) =>
                card(
                  p,
                  () =>
                    run(async () => {
                      setPid(p.id);
                      setDetail({});
                      setRecords(
                        await call<Row[]>(`/care/patients/${p.id}/timeline`),
                      );
                    }),
                  `${p.healthId || p.health_id} · Assigned scopes: ${p.assignment.scopes}`,
                ),
              )}
              {!data.patients?.length && (
                <View style={s.panel}>
                  {text("Your patient list starts with an assignment", s.title)}
                  {text(
                    "Ask your coordinator to assign a patient. Clinical scopes also need the patient’s active permission. Reception can match an existing Health ID.",
                  )}
                </View>
              )}
              {pid && (
                <>
                  {text("Patient timeline", s.heading)}
                  <View style={s.row}>
                    {["all", ...new Set(records.map((r) => r.kind))].map((k) =>
                      button(readable(k), () => setFilter(k), filter === k),
                    )}
                  </View>
                  {records
                    .filter((r) => filter === "all" || filter === r.kind)
                    .map((r) =>
                      card(
                        r,
                        () =>
                          run(async () => {
                            if (r.entry_type === "task") await openTask(r);
                            else if (r.entry_type === "conversation")
                              await openConversation(r);
                            else {
                              setDetail({ record: r });
                              setAudit(null);
                            }
                          }),
                        `${r.author_name || "Author unknown"} · ${r.observed_at || "Observation date unknown"}`,
                      ),
                    )}
                  {!records.length &&
                    text("No records available within your permissions.")}
                </>
              )}
            </>
          )}
          {!selected &&
            tab === "Schedule" &&
            (data.appointments || []).map((a: Row) =>
              card(
                a,
                () => setDetail({ appointment: a }),
                `${new Date(a.starts_at).toLocaleString()} · ${a.duration_minutes} minutes · ${readable(a.workflow_stage)} · ${a.doctor_name}`,
              ),
            )}
          {!selected &&
            tab === "Tasks" &&
            (data.tasks || []).map((t: Row) =>
              card(
                t,
                () => run(() => openTask(t)),
                `${readable(t.status)} · ${t.assignee_name} · Due ${t.due_at || "not set"}`,
              ),
            )}
          {!selected && tab === "Messages" && (
            <>
              {text(
                "Use patient-linked discussions for clinical information. A sent message does not accept or complete a task.",
                s.meta,
              )}
              {(data.conversations || []).map((c: Row) =>
                card(
                  c,
                  () => run(() => openConversation(c)),
                  `${c.unread} unread · ${readable(c.kind)}`,
                ),
              )}
            </>
          )}
          {!selected &&
            tab === "Services" &&
            (data.services || []).map((r: Row) =>
              card(
                r,
                () => setDetail({ record: r }),
                `${readable(r.service_status || r.status)} · ${r.reviewed_at ? "Reviewed " + r.reviewed_at : "Review not recorded"}`,
              ),
            )}
          {tab === "Access" && (
            <>
              {text(
                "Assignments do not replace patient consent. Patients approve clinical access in Sharing & permissions.",
                s.meta,
              )}
              {button("View clinic assignments", () =>
                run(async () =>
                  setDetail({
                    assignments: await call<Row[]>("/care/assignments"),
                  }),
                ),
              )}
              {(data.staff || []).map((m: Row) =>
                card(
                  m,
                  () => setDetail({ member: m }),
                  `${m.department || "Unknown department"} · ${m.staff_active ? "Active" : "Suspended"}`,
                ),
              )}
              {text("Freshness display intervals", s.heading)}
              {text(
                "Configurable by record type. These are not clinical decision rules.",
                s.meta,
              )}
              {(data.freshnessRules || []).map((f: Row) =>
                button(`${readable(f.kind)} · ${f.minutes} minutes`, () =>
                  setDetail({ rule: f }),
                ),
              )}
              {detail.assignments &&
                text(JSON.stringify(detail.assignments, null, 2), s.meta)}
            </>
          )}
          {selected && (
            <View style={s.panel}>
              {button("← Close detail", () => {
                setDetail({});
                setAudit(null);
              })}
              {text(selected.title || selected.patient_name, s.heading)}
              {detail.record ? (
                <>
                  {text(selected.details)}
                  {provenanceLines(selected).map((line, i) => (
                    <Text key={i} style={i === 0 ? s.badge : s.meta}>
                      {line}
                    </Text>
                  ))}
                  {selected.original_record_id &&
                    button("Open original record", () => {
                      const original = records.find(
                        (r) => r.id === selected.original_record_id,
                      );
                      if (original) setDetail({ record: original });
                      else
                        setError(
                          "Open this patient’s timeline to find the original record.",
                        );
                    })}
                  {button("View change history", () =>
                    run(async () =>
                      setAudit(
                        await call<Row>(`/care/records/${selected.id}/history`),
                      ),
                    ),
                  )}
                  {audit && (
                    <>
                      {!audit.revisions.length &&
                        text(
                          "No earlier version history was recorded for this legacy item.",
                        )}
                      {audit.revisions.map((v: Row) => (
                        <View key={v.id} style={s.card}>
                          {text(
                            `${readable(v.action)} · ${v.actor_name || "Unknown"} · ${v.occurred_at}`,
                            s.label,
                          )}
                          {text(v.reason || "No correction reason recorded")}
                          {text(
                            "Previous: " +
                              (v.previous_value || "No previous snapshot"),
                            s.meta,
                          )}
                          {text("New: " + v.new_value, s.meta)}
                        </View>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  {text(
                    selected.details ||
                      readable(selected.workflow_stage || selected.kind),
                  )}
                  {text(
                    `${readable(selected.status)} · Entered ${selected.created_at} · Updated ${selected.updated_at || "Unknown"}`,
                    s.meta,
                  )}
                </>
              )}
              {detail.task &&
                text(
                  `Assigned to ${selected.assignee_name} · Task ${readable(selected.status)} · Due ${selected.due_at || "not set"}`,
                )}
              {[...(detail.messages || []), ...(detail.comments || [])].map(
                (m: Row) => (
                  <View style={s.card} key={m.id}>
                    {text(
                      `${m.author_name} · ${m.author_role} · ${m.created_at}`,
                      s.label,
                    )}
                    {text(m.body)}
                    {m.mentions
                      ? text("Mentioned participants: " + m.mentions, s.meta)
                      : null}
                    {m.attachments
                      ? m.attachments.split(",").map((rid: string, i: number) =>
                          button(`Open attached record ${i + 1}`, () =>
                            run(async () => {
                              const rows = await call<Row[]>(
                                `/care/patients/${selected.patient_id}/timeline`,
                              );
                              const record = rows.find(
                                (row) =>
                                  row.id === rid && row.entry_type === "record",
                              );
                              if (!record)
                                throw new Error(
                                  "This attachment is no longer available within your permissions.",
                                );
                              setPid(selected.patient_id);
                              setRecords(rows);
                              setDetail({ record });
                            }),
                          ),
                        )
                      : null}
                    {user.role === "doctor" &&
                      actions(user.role, "", { message: m }).map(choose)}
                  </View>
                ),
              )}
              {detail.history?.map((h: Row) => (
                <View key={h.id} style={s.card}>
                  {text(
                    `${readable(h.action)} · ${h.actor_name} · ${h.occurred_at}`,
                    s.label,
                  )}
                  {button(
                    expandedHistory === h.id
                      ? "Hide change details"
                      : "View change details",
                    () =>
                      setExpandedHistory(
                        expandedHistory === h.id ? null : h.id,
                      ),
                    expandedHistory === h.id,
                  )}
                  {expandedHistory === h.id && text(h.new_value, s.meta)}
                </View>
              ))}
              <View style={s.row}>
                {actions(user.role, "", ctx).map(choose)}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 18, backgroundColor: "#f3f7f4", padding: 12, borderRadius: 18 },
  hero: { backgroundColor: "#e1eee5", padding: 20, borderRadius: 20, gap: 9 },
  text: { color: "#193e36", fontSize: 15, lineHeight: 22 },
  white: { color: "#fff" },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 34,
    color: "#193e36",
  },
  title: { fontSize: 19, fontWeight: "600", color: "#193e36" },
  label: { fontSize: 12, fontWeight: "600", color: "#46685c", lineHeight: 19 },
  meta: { fontSize: 13, color: "#526c62", lineHeight: 20 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    borderWidth: 1,
    borderColor: "#b3ccc0",
    backgroundColor: "#fff",
    padding: 11,
    borderRadius: 11,
    minHeight: 44,
  },
  selected: { backgroundColor: "#21665d" },
  metric: { backgroundColor: "#fff", padding: 16, borderRadius: 16, flex: 1 },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#d0e0d5",
    backgroundColor: "#fff",
    borderRadius: 17,
    gap: 9,
    marginVertical: 5,
  },
  panel: {
    padding: 18,
    borderWidth: 1,
    borderColor: "#cbded2",
    backgroundColor: "#fff",
    borderRadius: 18,
    gap: 12,
  },
  field: { gap: 8, marginVertical: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#b3ccc0",
    borderRadius: 10,
    padding: 12,
    color: "#193e36",
    fontSize: 16,
    minHeight: 46,
    backgroundColor: "#fff",
  },
  error: {
    color: "#823d20",
    backgroundColor: "#ffede3",
    padding: 12,
    borderRadius: 10,
  },
  success: { color: "#185c36", backgroundColor: "#e0f4e6", padding: 12 },
  badge: {
    color: "#664b12",
    backgroundColor: "#f0e8d4",
    padding: 7,
    borderRadius: 8,
    fontSize: 13,
  },
});
