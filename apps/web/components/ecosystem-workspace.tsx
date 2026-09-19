/**
 * Web organization/workforce, order, nursing, handoff and insurance workspace.
 * Shared sections/actions/payloads live in apps/shared, while this file renders them.
 * SSE announces available updates; it does not silently replace a draft in progress.
 * Pair changes with mobile/src/EcosystemWorkspace.tsx.
 */
"use client";
import { useEffect, useState, useCallback } from "react";
import { api, type User } from "@/lib/api";
import {
  type Row,
  type Action,
  initial,
  options,
  payload,
  readable,
} from "../../shared/care-model";
import * as model from "../../shared/ecosystem-model";
import "./ecosystem-workspace.css";
const call: model.Call = (path, method = "GET", body) =>
  api(path, { method, ...(body === undefined ? {} : { body }) });
export function EcosystemWorkspace({
  user,
  onDirtyChange,
}: {
  user: User;
  onDirtyChange?: (v: boolean) => void;
}) {
  const [asOf, setAsOf] = useState(() => Date.now());
  const [data, setData] = useState<Row>({}),
    [section, setSection] = useState(
      user.role === "patient"
        ? "Insurance"
        : user.role === "insurer"
          ? "Organization"
          : "Overview",
    ),
    [items, setItems] = useState<Row[]>([]),
    [selected, setSelected] = useState<Row | null>(null),
    [action, setAction] = useState<Action | null>(null),
    [values, setValues] = useState<Row>({}),
    [records, setRecords] = useState<Row[]>([]),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [response, setResponse] = useState<Row | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("time"),
    [shares, setShares] = useState<Row[]>([]),
    [compared, setCompared] = useState<string[]>([]);
  const load = useCallback(async () => {
    const d = await model.context(call, user.role);
    d.userId = user.id;
    if (user.role === "patient")
      d.documents = await api<Row[]>(`/insurance/cards`);
    setAsOf(Date.now());
    setData(d);
    setItems(await model.rows(call, section, d));
    if (user.role === "patient" && section === "Insurance")
      setShares(await call<Row[]>("/insurance/shares"));
    if (
      section === "Overview" &&
      ["admin", "coordinator", "reception", "security", "billing"].includes(
        user.role,
      )
    )
      setResponse(await call<Row>("/ecosystem/operations"));
  }, [section, user.id, user.role]);
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(load)
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setItems([]);
        }
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  useEffect(() => {
    onDirtyChange?.(!!action);
    return () => onDirtyChange?.(false);
  }, [action, onDirtyChange]);
  useEffect(() => {
    if (!action) return;
    const protect = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [action]);
  useEffect(() => {
    if (user.role === "patient") return;
    // Announce updates without overwriting a form the user is currently editing.
    const stream = new EventSource("/api/ecosystem/events", {
      withCredentials: true,
    });
    const change = () =>
      setNotice(
        "New workspace updates are available. Refresh when you are ready.",
      );
    stream.addEventListener("change", change);
    return () => stream.close();
  }, [user.role]);
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
    if (action && !confirm("Discard this unsaved form?")) return;
    setAction(a);
    setValues(initial(a, selected?.patient_id || ""));
    setKey(crypto.randomUUID());
    setResponse(null);
    setNotice("");
  }
  async function changeValue(k: string, v: unknown) {
    setValues((old) => ({ ...old, [k]: v }));
    if (k === "patientId" && typeof v === "string" && v)
      await run(async () =>
        setRecords(await call<Row[]>(`/care/patients/${v}/timeline`)),
      );
  }
  function navigate(s: string) {
    if (action && !confirm("Discard this unsaved form?")) return;
    setAction(null);
    setSelected(null);
    setResponse(null);
    setError("");
    setNotice("");
    setFilter("all");
    setSearch("");
    setSection(s);
  }
  // Convert shared form values to the API contract; slot lookup is a read, other forms may mutate.
  async function save() {
    if (!action) return;
    await run(async () => {
      const b = payload(action, values, key);
      b.requestKey ??= key;
      if (action.id === "slots") {
        const slots = await call<Row[]>(
          `${action.path}?organizationId=${encodeURIComponent(String(b.organizationId))}&date=${encodeURIComponent(String(b.date))}`,
        );
        setItems(
          slots.map((s, i) => ({
            ...s,
            id: `slot-${i}`,
            name: `${s.doctor} · ${new Date(s.startsAt).toLocaleString()}`,
            details: `${s.specialty} · ${s.duration} minutes`,
          })),
        );
        setAction(null);
        setSelected(null);
        setNotice(
          slots.length
            ? "Choose an appointment time."
            : "No public slots are available on this date.",
        );
        return;
      }
      const result = await call<Row>(action.path, action.method, b);
      setAction(null);
      setSelected(null);
      setResponse(result.invitationToken || result.notice ? result : null);
      setNotice("Saved. Changes are recorded on the server.");
      await load();
    });
  }
  const available = model.actions(user.role, section, selected, data),
    filtered = items
      .filter((r) =>
        `${model.title(r)} ${model.lines(section, r).join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .filter(
        (r) =>
          filter === "all" ||
          (filter === "mine"
            ? r.assignee_id === user.id
            : filter === "overdue"
              ? r.due_at &&
                Date.parse(r.due_at) < asOf &&
                r.status !== "completed"
              : filter === "upcoming"
                ? Date.parse(r.starts_at || r.due_at) > asOf
                : filter === "current_shift"
                  ? Date.parse(r.starts_at) <= asOf &&
                    Date.parse(r.ends_at) > asOf
                  : r.status === filter),
      )
      .sort((a, b) =>
        sort === "name"
          ? model.title(a).localeCompare(model.title(b))
          : sort === "premium"
            ? Number(a.monthly_premium) - Number(b.monthly_premium)
            : sort === "deductible"
              ? Number(a.deductible) - Number(b.deductible)
              : sort === "out_of_pocket"
                ? Number(a.out_of_pocket) - Number(b.out_of_pocket)
                : String(a.starts_at || a.due_at || a.created_at).localeCompare(
                    String(b.starts_at || b.due_at || b.created_at),
                  ),
      );
  const title =
    user.role === "patient"
      ? "Your care connections"
      : user.role === "insurer"
        ? "Insurer workspace"
        : `${readable(data.employment?.professional_role || user.role)} workspace`;
  return (
    <section
      className="eco-space"
      aria-label="Organization ecosystem workspace"
    >
      <header className="eco-hero">
        <div>
          <span className="eco-eyebrow">
            {data.organization?.name || "HEALTH PASSPORT"}
          </span>
          <h1>{title}</h1>
          <p>
            {user.role === "patient"
              ? "Insurance and organizations, with sharing under your control."
              : `${data.organization?.code || ""} · Work ID ${data.employment?.work_id || "loading"}`}
          </p>
          {data.organization?.status === "pending" && (
            <p role="status">
              Verification pending. Clinical privileges are not active.
            </p>
          )}
        </div>
        <button onClick={() => void run(load)} disabled={busy}>
          Refresh
        </button>
      </header>
      <nav className="eco-tabs" aria-label="Hospital workspace sections">
        {model.sections(user.role, data.canReviewOrganizations).map((s) => (
          <button
            key={s}
            aria-pressed={section === s}
            onClick={() => navigate(s)}
          >
            {s}
          </button>
        ))}
      </nav>
      {error && (
        <p className="eco-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="eco-notice" role="status">
          {notice}
        </p>
      )}
      {section === "Overview" && (
        <>
          <div className="eco-metrics">
            <article>
              <strong>
                {data.shifts?.filter(
                  (s: Row) => s.employee_id === data.employment?.id,
                ).length || 0}
              </strong>
              <span>Your schedule intervals</span>
            </article>
            <article>
              <strong>
                {data.tasks?.filter(
                  (t: Row) =>
                    t.assignee_id === user.id && t.status !== "completed",
                ).length || 0}
              </strong>
              <span>Your open tasks</span>
            </article>
            <article>
              <strong>{data.patients?.length || 0}</strong>
              <span>Assigned patients</span>
            </article>
            <article>
              <strong>
                {data.notices?.filter((n: Row) => !n.is_read).length || 0}
              </strong>
              <span>Workspace updates</span>
            </article>
          </div>
          <h2>What needs your attention</h2>
          <p>
            Your role controls the records and tools available here. Use Care
            team for shared patient charts, direct messages and consultations.
          </p>
          {data.notices?.slice(0, 6).map((n: Row) => (
            <article className="eco-card" key={n.id}>
              <strong>{readable(n.severity)} update</strong>
              <p>{n.message}</p>
              <button
                disabled={busy || n.is_read}
                onClick={() =>
                  void run(async () => {
                    await call(`/ecosystem/notices/${n.id}/read`, "POST", {});
                    await load();
                  })
                }
              >
                {n.is_read ? "Read" : "Mark read"}
              </button>
            </article>
          ))}
        </>
      )}
      {section === "Marketplace" && (
        <p className="eco-notice">
          Compare objective plan details. Synthetic plans cannot be purchased.
          Clinical information never influences these results. Sponsored
          placements are disabled.
        </p>
      )}
      {section === "Nursing" && (
        <p>
          Record an observation, assessment, intake/output, wound status or
          authorized medication administration. This does not create a
          prescription.
        </p>
      )}
      {section === "Organization onboarding" && (
        <p>
          Your personal healthcare account stays separate. A new work
          administrator account can configure an organization; independent
          verification is required before clinical access.
        </p>
      )}
      <div className="eco-actions">
        {available.map((a) => (
          <button key={a.id} disabled={busy} onClick={() => begin(a)}>
            {a.label}
          </button>
        ))}
      </div>
      {action ? (
        <form
          className="eco-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2>{action.label}</h2>
          {action.id === "insurance" && (
            <label>
              Upload insurance card (image or PDF)
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      const body = new FormData();
                      body.append("file", file);
                      const uploaded = await api<Row>("/insurance/cards", {
                        method: "POST",
                        body,
                      });
                      setData((d) => ({
                        ...d,
                        documents: [...(d.documents || []), uploaded],
                      }));
                      setValues((v) => ({ ...v, cardDocumentId: uploaded.id }));
                      setNotice(
                        `Card stored securely · ${uploaded.status}. Files remain unavailable until the malware scan is clean.`,
                      );
                    });
                }}
              />
            </label>
          )}

          {model.fields(action, values).map((f) => (
            <label key={f.key}>
              {f.label}
              {f.optional ? " (optional)" : ""}
              {f.type === "check" ? (
                <input
                  type="checkbox"
                  checked={!!values[f.key]}
                  onChange={(e) => void changeValue(f.key, e.target.checked)}
                />
              ) : ["select", "multi"].includes(f.type || "") ? (
                <select
                  aria-label={f.label}
                  multiple={f.type === "multi"}
                  value={values[f.key] || (f.type === "multi" ? [] : "")}
                  required={!f.optional}
                  onChange={(e) =>
                    void changeValue(
                      f.key,
                      f.type === "multi"
                        ? Array.from(e.target.selectedOptions).map(
                            (o) => o.value,
                          )
                        : e.target.value,
                    )
                  }
                >
                  {f.type !== "multi" && <option value="">Choose…</option>}
                  {options(f, data, records).map(
                    (o: { id: string; label: string }) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ),
                  )}
                </select>
              ) : f.type === "long" ? (
                <textarea
                  aria-label={f.label}
                  value={values[f.key] || ""}
                  required={!f.optional}
                  onChange={(e) => void changeValue(f.key, e.target.value)}
                  rows={4}
                />
              ) : (
                <input
                  aria-label={f.label}
                  type={
                    f.type === "password"
                      ? "password"
                      : f.type === "number"
                        ? "number"
                        : "text"
                  }
                  step={f.type === "number" ? "any" : undefined}
                  value={values[f.key] ?? ""}
                  required={!f.optional}
                  autoComplete="off"
                  onChange={(e) => void changeValue(f.key, e.target.value)}
                />
              )}
            </label>
          ))}
          <div className="eco-actions">
            <button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm("Discard this unsaved form?")) setAction(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : selected ? (
        <article className="eco-detail">
          <button
            onClick={() => {
              setSelected(null);
              setResponse(null);
            }}
          >
            ← Back to {section.toLowerCase()}
          </button>
          <h2>{model.title(selected)}</h2>
          {model
            .lines(section, selected)
            .map((line, i) => line && <p key={i}>{line}</p>)}
          {[
            "details",
            "instructions",
            "coverage",
            "eligibility",
            "review_reason",
          ].map(
            (k) =>
              selected[k] && (
                <div key={k}>
                  <h3>{readable(k)}</h3>
                  <p className="eco-preserve">{selected[k]}</p>
                </div>
              ),
          )}
          {section === "Insurance" && (
            <>
              {selected.card_document_id && (
                <a
                  href={`/api/insurance/profiles/${selected.id}/card`}
                  download
                >
                  Download authorized insurance card
                </a>
              )}
              <button
                onClick={() =>
                  void run(async () =>
                    setResponse(
                      await call<Row>(
                        `/insurance/profiles/${selected.id}/identifiers`,
                      ),
                    ),
                  )
                }
              >
                Reveal protected identifiers
              </button>
              {selected.checks?.map((c: Row) => (
                <article className="eco-card" key={c.id}>
                  <strong>
                    {c.status}
                    {c.synthetic ? " · SYNTHETIC" : ""}
                  </strong>
                  <p>{c.summary}</p>
                  <small>{c.checked_at}</small>
                </article>
              ))}
            </>
          )}
          {section === "Hospitals" && (
            <>
              <h3>Your care team</h3>
              {selected.care_team?.map((c: Row, i: number) => (
                <p key={i}>
                  {c.name} · {readable(c.role)} · {c.department}
                </p>
              ))}
              <h3>Your appointments</h3>
              {selected.appointments?.map((a: Row) => (
                <p key={a.id}>
                  {new Date(a.starts_at).toLocaleString()} · {a.doctor} ·{" "}
                  {readable(a.status)}
                </p>
              ))}
            </>
          )}
        </article>
      ) : (
        <>
          <div className="eco-filter">
            <label>
              Search {section.toLowerCase()}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              View
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "all",
                  "mine",
                  "current_shift",
                  "upcoming",
                  "overdue",
                  "completed",
                ].map((v) => (
                  <option key={v} value={v}>
                    {readable(v)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {(section === "Marketplace"
                  ? ["premium", "deductible", "out_of_pocket", "name"]
                  : ["time", "name"]
                ).map((v) => (
                  <option key={v} value={v}>
                    {readable(v)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="eco-grid">
            {filtered.map((r) => (
              <article className="eco-card" key={r.id}>
                <button
                  className="eco-card-open"
                  onClick={() => {
                    setSelected(r);
                    setResponse(null);
                  }}
                >
                  <span className="eco-eyebrow">
                    {readable(r.kind || r.professional_role || section)}
                  </span>
                  <h2>{model.title(r)}</h2>
                  {model
                    .lines(section, r)
                    .map((line, i) => line && <p key={i}>{line}</p>)}
                </button>
                {section === "Marketplace" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={compared.includes(r.id)}
                      disabled={
                        !compared.includes(r.id) && compared.length >= 4
                      }
                      onChange={() =>
                        setCompared((v) =>
                          v.includes(r.id)
                            ? v.filter((x) => x !== r.id)
                            : [...v, r.id],
                        )
                      }
                    />
                    Compare this plan
                  </label>
                )}
              </article>
            ))}
          </div>
          {!filtered.length &&
            !busy &&
            !["Overview", "Nursing", "Organization onboarding"].includes(
              section,
            ) && (
              <p className="eco-empty">
                No {section.toLowerCase()} are available within your
                permissions.
              </p>
            )}
        </>
      )}
      {section === "Marketplace" && compared.length > 0 && (
        <div className="eco-comparison">
          <h2>Plan comparison</h2>
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Premium / month</th>
                <th>Deductible</th>
                <th>Out-of-pocket maximum</th>
                <th>Network</th>
              </tr>
            </thead>
            <tbody>
              {items
                .filter((r) => compared.includes(r.id))
                .map((r) => (
                  <tr key={r.id}>
                    <th>{r.name}</th>
                    <td>
                      {r.currency} {r.monthly_premium}
                    </td>
                    <td>{r.deductible}</td>
                    <td>{r.out_of_pocket}</td>
                    <td>{r.network_type}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {section === "Insurance" && user.role === "patient" && (
        <>
          <h2>Who can access your insurance</h2>
          {shares.map((s) => (
            <article className="eco-card" key={s.id}>
              <strong>{s.organization_name}</strong>
              <p>
                {s.grantee_name ||
                  s.department ||
                  "Eligible staff in this organization"}{" "}
                · {s.purpose} · {s.status}
              </p>
              <small>Expires {s.expires_at}</small>
              {s.status === "active" && (
                <button
                  onClick={() =>
                    void run(async () => {
                      await call(
                        `/insurance/shares/${s.id}/revoke`,
                        "POST",
                        {},
                      );
                      await load();
                    })
                  }
                >
                  Revoke access
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {response && (
        <article className="eco-result" role="status">
          <h2>
            {response.invitationToken
              ? "Private employee invitation"
              : "Result"}
          </h2>
          {Object.entries(response)
            .filter(([k]) => !["id", "organizationId"].includes(k))
            .map(([k, v]) => (
              <div key={k}>
                <strong>{readable(k)}</strong>
                {Array.isArray(v) ? (
                  v.map((x, i) => (
                    <p key={i}>
                      {Object.entries(x)
                        .map(([key, value]) => `${readable(key)}: ${value}`)
                        .join(" · ")}
                    </p>
                  ))
                ) : (
                  <p className="eco-preserve">{String(v)}</p>
                )}
              </div>
            ))}
        </article>
      )}
    </section>
  );
}
