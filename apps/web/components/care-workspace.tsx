"use client";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, type User } from "@/lib/api";
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
import "./care-workspace.css";

export function CareWorkspace({
  user,
  onDirtyChange,
}: {
  user: User;
  onDirtyChange?: (dirty: boolean) => void;
}) {
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
    [filter, setFilter] = useState("all");
  const [audit, setAudit] = useState<Row | null>(null),
    [notices, setNotices] = useState<Row[]>([]);
  useEffect(() => {
    onDirtyChange?.(action !== null);
    return () => onDirtyChange?.(false);
  }, [action, onDirtyChange]);
  useEffect(() => {
    if (!action) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [action]);
  async function refresh(patient = pid) {
    const d = await api<Row>("/care/workspace");
    setData(d);
    setNotices(await api<Row[]>("/care/notifications"));
    if (patient)
      setRecords(await api<Row[]>(`/care/patients/${patient}/timeline`));
  }
  useEffect(() => {
    let alive = true;
    api<Row>("/care/workspace")
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [user.id]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!action)
        api<Row[]>("/care/notifications")
          .then(setNotices)
          .catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [action]);
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
    if (action && !window.confirm("Discard this unsaved form?")) return;
    setAction(a);
    setValues(initial(a, pid));
    setKey(crypto.randomUUID());
    setError("");
    setSaved("");
  }
  function move(t: string) {
    if (action && !window.confirm("Discard this unsaved form?")) return;
    setAction(null);
    setTab(t);
    setDetail({});
    setAudit(null);
    setError("");
  }
  async function openRecord(r: Row) {
    setDetail({ record: r });
    setAudit(null);
  }
  async function openTask(t: Row) {
    const d = await api<Row>(`/care/tasks/${t.id}`);
    setDetail({ task: d.task, comments: d.comments, history: d.history });
  }
  async function openConversation(c: Row) {
    const d = await api<Row>(`/care/conversations/${c.id}`);
    setDetail({
      conversation: d.conversation,
      messages: d.messages,
      members: d.members,
    });
    if (d.messages.length)
      await api(`/care/conversations/${c.id}/read`, {
        method: "POST",
        body: { lastMessageId: d.messages.at(-1).id },
      });
  }
  const ctx = { ...detail, userId: user.id };
  const available = actions(
    user.role,
    tab,
    detail.record || detail.task || detail.conversation || detail.appointment
      ? {}
      : ctx,
  );
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
  function choice(a: Action) {
    return (
      <button key={a.id} type="button" disabled={busy} onClick={() => begin(a)}>
        {a.label}
      </button>
    );
  }
  function card(r: Row, onClick: () => void, subtitle: string) {
    return (
      <button className="care-card" key={r.id} onClick={onClick}>
        <span className="care-label">
          {readable(r.kind || r.role || r.status)}
        </span>
        <strong>{r.title || r.name || r.patient_name}</strong>
        <span>{subtitle}</span>
        {r.freshness_label && (
          <span className="care-tag">{r.freshness_label}</span>
        )}
        {(r.overdue || r.unacknowledged) && (
          <span className="care-alert">
            Escalated · {r.overdue ? "overdue" : "awaiting acknowledgment"}
          </span>
        )}
      </button>
    );
  }
  return (
    <section className="care-space" aria-label="Care team workspace">
      <div className="care-hero">
        <div>
          <span className="care-label">
            {data.clinic || "Your clinic"} ·{" "}
            {data.department || "Department unknown"}
          </span>
          <h1>{readable(user.role)} workspace</h1>
          <p>{roleDescription[user.role]}</p>
        </div>
        <button disabled={busy} onClick={() => run(() => refresh())}>
          Refresh workspace
        </button>
      </div>
      <div className="care-metrics">
        <div>
          <strong>{data.patients?.length || 0}</strong>
          <span>Assigned patients</span>
        </div>
        <div>
          <strong>
            {data.tasks?.filter((t: Row) => t.status !== "completed").length ||
              0}
          </strong>
          <span>Open tasks</span>
        </div>
        <div>
          <strong>
            {data.services?.filter(
              (r: Row) =>
                ["lab_result", "imaging_report"].includes(r.kind) &&
                !r.reviewed_at,
            ).length || 0}
          </strong>
          <span>Results awaiting review</span>
        </div>
        <div>
          <strong>{notices.filter((n) => n.escalated).length}</strong>
          <span>Needs attention</span>
        </div>
      </div>
      {notices.length > 0 && (
        <details>
          <summary>{notices.length} work notifications</summary>
          {notices.map((n, i) => (
            <p key={i}>
              {n.preview}
              {n.assignee ? ` · ${n.assignee}` : ""}
            </p>
          ))}
        </details>
      )}
      <nav className="care-tabs" aria-label="Care workspace sections">
        {tabs.map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => move(t)}
          >
            {t}
            {t === "Messages" &&
            data.conversations?.some((c: Row) => c.unread > 0)
              ? " •"
              : ""}
          </button>
        ))}
      </nav>
      {error && (
        <p className="care-alert" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="care-success">
          {saved}
        </p>
      )}
      {busy && <p role="status">Working…</p>}
      <div className="care-actions">{available.map(choice)}</div>
      {action ? (
        <form
          className="care-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const result = await api<Row>(action.path, {
                method: action.method || "POST",
                body: payload(action, values, key),
              });
              setSaved(
                "Saved successfully. Your changes are recorded on the server.",
              );
              setAction(null);
              setDetail({});
              if (action.id === "registration") {
                setPid(result.id);
                await refresh(result.id);
              } else await refresh();
            });
          }}
        >
          <h2>{action.label}</h2>
          <p>
            Dates need a timezone offset, for example 2026-09-11T09:30:00-04:00.
            Leave unavailable observation dates blank; they will show as
            unknown.
          </p>
          <div className="care-fields">
            {visibleFields(action, values, user.role).map((f) => (
              <label
                key={f.key}
                className={
                  f.type === "long" || f.type === "multi" ? "care-wide" : ""
                }
              >
                <span>
                  {f.label}
                  {f.optional ? " (optional)" : ""}
                </span>
                {f.type === "select" ? (
                  <select
                    aria-label={f.label + (f.optional ? " (optional)" : "")}
                    required={!f.optional}
                    value={values[f.key] || ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                  >
                    <option value="">Choose…</option>
                    {options(
                      f,
                      data,
                      records.length ? records : data.services || [],
                    ).map((o: Row) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "multi" ? (
                  <div className="care-checks">
                    {options(
                      f,
                      data,
                      records.length ? records : data.services || [],
                    ).map((o: Row) => (
                      <label key={o.id}>
                        <input
                          type="checkbox"
                          checked={(values[f.key] || []).includes(o.id)}
                          onChange={(e) =>
                            setValues({
                              ...values,
                              [f.key]: e.target.checked
                                ? [...(values[f.key] || []), o.id]
                                : (values[f.key] || []).filter(
                                    (v: string) => v !== o.id,
                                  ),
                            })
                          }
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                ) : f.type === "check" ? (
                  <input
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.checked })
                    }
                  />
                ) : f.type === "long" ? (
                  <Textarea
                    aria-label={f.label + (f.optional ? " (optional)" : "")}
                    required={!f.optional}
                    value={values[f.key] || ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                    rows={5}
                  />
                ) : (
                  <Input
                    aria-label={f.label + (f.optional ? " (optional)" : "")}
                    type={
                      f.type === "number"
                        ? "number"
                        : f.type === "password"
                          ? "password"
                          : "text"
                    }
                    required={!f.optional}
                    value={values[f.key] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f.key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <div className="care-actions">
            <button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Discard this unsaved form?"))
                  setAction(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {!selected && tab === "Patients" && (
            <>
              <div className="care-grid">
                {(data.patients || []).map((p: Row) =>
                  card(
                    p,
                    () =>
                      run(async () => {
                        setPid(p.id);
                        setDetail({});
                        setRecords(
                          await api<Row[]>(`/care/patients/${p.id}/timeline`),
                        );
                      }),
                    `${p.healthId || p.health_id} · ${p.assignment.scopes.split(",").length} work scopes`,
                  ),
                )}
              </div>
              {!data.patients?.length && (
                <div className="care-empty">
                  <h2>Your patient list starts with an assignment</h2>
                  <p>
                    Ask your clinic coordinator to assign a patient. Clinical
                    access also needs that patient&apos;s active permission.
                    Reception can match an existing account by Health ID.
                  </p>
                </div>
              )}
              {pid && (
                <>
                  <h2>Patient timeline</h2>
                  <label>
                    Filter timeline{" "}
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {["all", ...new Set(records.map((r) => r.kind))].map(
                        (k) => (
                          <option key={k}>{k}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <div className="care-grid">
                    {records
                      .filter((r) => filter === "all" || r.kind === filter)
                      .map((r) =>
                        card(
                          r,
                          () =>
                            run(async () => {
                              if (r.entry_type === "task") await openTask(r);
                              else if (r.entry_type === "conversation")
                                await openConversation(r);
                              else await openRecord(r);
                            }),
                          `${r.author_name || r.creator_name || "Author unknown"} · ${r.observed_at || "Observation date unknown"}`,
                        ),
                      )}
                  </div>
                  {!records.length && (
                    <p>
                      No clinical entries are available within your permissions.
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {!selected && tab === "Schedule" && (
            <div className="care-agenda">
              {(data.appointments || []).map((a: Row) => (
                <button
                  key={a.id}
                  className="care-slot"
                  onClick={() => setDetail({ appointment: a })}
                >
                  <time>
                    {new Date(a.starts_at).toLocaleString()}
                    <small>{a.duration_minutes} minutes</small>
                  </time>
                  <span>
                    <strong>{a.patient_name}</strong>
                    <small>
                      {a.doctor_name} · {readable(a.workflow_stage)} ·{" "}
                      {readable(a.status)}
                    </small>
                  </span>
                </button>
              ))}
              {!data.appointments?.length && (
                <p>No appointments in your assigned queue.</p>
              )}
            </div>
          )}
          {!selected && tab === "Tasks" && (
            <div className="care-grid">
              {(data.tasks || []).map((t: Row) =>
                card(
                  t,
                  () => run(() => openTask(t)),
                  `${readable(t.status)} · ${t.assignee_name} · Due ${t.due_at || "not set"}`,
                ),
              )}
            </div>
          )}
          {!selected && tab === "Messages" && (
            <>
              <p>
                Choose a patient-linked conversation for clinical discussion.
                General channels must not contain patient information. Sending a
                message does not accept or complete a task.
              </p>
              <div className="care-grid">
                {(data.conversations || []).map((c: Row) =>
                  card(
                    c,
                    () => run(() => openConversation(c)),
                    `${c.unread} unread · ${readable(c.kind)}`,
                  ),
                )}
              </div>
            </>
          )}
          {!selected && tab === "Services" && (
            <div className="care-grid">
              {(data.services || []).map((r: Row) =>
                card(
                  r,
                  () => openRecord(r),
                  `${readable(r.service_status || r.status)} · ${r.reviewed_at ? "Reviewed " + r.reviewed_at : "Review not recorded"}`,
                ),
              )}
            </div>
          )}
          {tab === "Access" && (
            <>
              <p>
                Assignments limit clinic work; they do not grant patient
                consent. Patients approve clinical scopes in Sharing &
                permissions. Account IDs are available from the patient or
                existing clinic registration.
              </p>
              <button
                onClick={() =>
                  run(async () =>
                    setDetail({
                      assignments: await api<Row[]>("/care/assignments"),
                    }),
                  )
                }
              >
                View clinic assignments
              </button>
              <div className="care-grid">
                {(data.staff || []).map((m: Row) =>
                  card(
                    m,
                    () => setDetail({ member: m }),
                    `${m.department || "Unknown department"} · ${m.staff_active ? "Active" : "Suspended"}`,
                  ),
                )}
              </div>
              <h2>Freshness intervals</h2>
              <p>
                Operational display intervals, configurable by record type;
                these are not clinical decision rules.
              </p>
              <div className="care-grid">
                {(data.freshnessRules || []).map((f: Row) => (
                  <button
                    className="care-card"
                    key={f.kind}
                    onClick={() => setDetail({ rule: f })}
                  >
                    <strong>{readable(f.kind)}</strong>
                    <span>
                      {f.minutes} minutes · version {f.version}
                    </span>
                  </button>
                ))}
              </div>
              {detail.assignments && (
                <pre>{JSON.stringify(detail.assignments, null, 2)}</pre>
              )}
            </>
          )}
          {selected && (
            <article className="care-detail">
              <button
                aria-label="Close detail"
                onClick={() => {
                  setDetail({});
                  setAudit(null);
                }}
              >
                ← Back
              </button>
              <h2>{selected.title || selected.patient_name}</h2>
              {detail.record ? (
                <>
                  <p className="care-note">{selected.details}</p>
                  {provenanceLines(selected).map((line, i) => (
                    <p className={i === 0 ? "care-tag" : "care-meta"} key={i}>
                      {line}
                    </p>
                  ))}
                  {selected.original_record_id && (
                    <button
                      onClick={() =>
                        run(async () => {
                          const found = records.find(
                            (r) => r.id === selected.original_record_id,
                          );
                          if (found) await openRecord(found);
                          else
                            throw new Error(
                              "Open the original patient timeline to locate this record.",
                            );
                        })
                      }
                    >
                      Open original record
                    </button>
                  )}
                  <button
                    onClick={() =>
                      run(async () =>
                        setAudit(
                          await api<Row>(
                            `/care/records/${selected.id}/history`,
                          ),
                        ),
                      )
                    }
                  >
                    View change history
                  </button>
                  {audit && (
                    <div className="care-history">
                      {audit.revisions.length === 0 && (
                        <p>
                          No earlier version history was recorded for this
                          legacy item.
                        </p>
                      )}
                      {audit.revisions.map((v: Row) => (
                        <details key={v.id}>
                          <summary>
                            {readable(v.action)} ·{" "}
                            {v.actor_name || "Unknown author"} · {v.occurred_at}
                          </summary>
                          <p>{v.reason || "No correction reason recorded"}</p>
                          <h3>Previous value</h3>
                          <pre>
                            {v.previous_value || "No previous snapshot"}
                          </pre>
                          <h3>New value</h3>
                          <pre>{v.new_value}</pre>
                        </details>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {selected.details ||
                      readable(selected.workflow_stage || selected.kind)}
                  </p>
                  <p>
                    {readable(selected.status)} · Entered {selected.created_at}{" "}
                    · Updated {selected.updated_at || "Unknown"}
                  </p>
                </>
              )}
              {detail.task && (
                <p>
                  Assigned to {selected.assignee_name}. Task status:{" "}
                  <strong>{readable(selected.status)}</strong>. Due{" "}
                  {selected.due_at || "not set"}.
                </p>
              )}
              {[...(detail.messages || []), ...(detail.comments || [])].map(
                (m: Row) => (
                  <article className="care-message" key={m.id}>
                    <strong>
                      {m.author_name} · {m.author_role}
                    </strong>
                    <time>{m.created_at}</time>
                    <p>{m.body}</p>
                    {m.mentions && (
                      <small>Mentioned participants: {m.mentions}</small>
                    )}
                    {m.attachments && (
                      <div className="care-actions">
                        {m.attachments
                          .split(",")
                          .map((rid: string, i: number) => (
                            <button
                              key={rid}
                              onClick={() =>
                                run(async () => {
                                  const rows = await api<Row[]>(
                                    `/care/patients/${selected.patient_id}/timeline`,
                                  );
                                  const record = rows.find(
                                    (row) =>
                                      row.id === rid &&
                                      row.entry_type === "record",
                                  );
                                  if (!record)
                                    throw new Error(
                                      "This attachment is no longer available within your permissions.",
                                    );
                                  setPid(selected.patient_id);
                                  setRecords(rows);
                                  setDetail({ record });
                                })
                              }
                            >
                              Open attached record {i + 1}
                            </button>
                          ))}
                      </div>
                    )}
                    {user.role === "doctor" &&
                      actions(user.role, "", { message: m }).map(choice)}
                  </article>
                ),
              )}
              {detail.history?.map((h: Row) => (
                <details key={h.id}>
                  <summary>
                    {readable(h.action)} · {h.actor_name} · {h.occurred_at}
                  </summary>
                  <pre>{h.new_value}</pre>
                </details>
              ))}
              <div className="care-actions">
                {actions(user.role, "", ctx).map(choice)}
              </div>
            </article>
          )}
        </>
      )}
    </section>
  );
}
