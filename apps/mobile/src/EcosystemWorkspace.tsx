/**
 * Native organization, workforce, clinical-order and insurance UI using shared models.
 * Uses native image picking for insurance cards and polling for workspace updates.
 * Keep web parity without assuming the browser SSE or camera APIs exist on device.
 */
import * as ImagePicker from "expo-image-picker";
import { PhotoActivityContext } from "./ProfilePhotos";
import React, { useState, useEffect, useCallback, useContext } from "react";
import {
  Image,
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  Alert,
  Platform,
  StyleSheet,
} from "react-native";
import { request, type User } from "./api";
import {
  type Row,
  type Action,
  initial,
  options,
  payload,
  readable,
} from "../../shared/care-model";
import * as model from "../../shared/ecosystem-model";
const call: model.Call = (p, m = "GET", b) => request(p, m, b, 15000, true);
export function EcosystemWorkspace({
  user,
  colors,
  onExit,
  homeRef,
  onNavigate,
}: {
  user: User;
  colors: Row;
  onExit: () => void;
  homeRef?: React.MutableRefObject<(() => void) | null>;
  onNavigate?: () => void;
}) {
  const photoActivity = useContext(PhotoActivityContext);
  const [cardUri, setCardUri] = useState("");
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
  async function uploadCard(camera = false) {
    await run(async () => {
      photoActivity(true);
      try {
        const permission = camera
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "Photo access was not granted. You can add a card later.",
          );
        const picked = camera
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 0.9,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.9,
            });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        const body = new FormData();
        if (Platform.OS === "web")
          body.append(
            "file",
            await (await fetch(asset.uri)).blob(),
            asset.fileName || "insurance-card.jpg",
          );
        else
          body.append("file", {
            uri: asset.uri,
            type: asset.mimeType || "image/jpeg",
            name: asset.fileName || "insurance-card.jpg",
          } as unknown as Blob);
        const uploaded = await call<Row>("/insurance/cards", "POST", body);
        setData((d) => ({
          ...d,
          documents: [...(d.documents || []), uploaded],
        }));
        setValues((v) => ({ ...v, cardDocumentId: uploaded.id }));
        setNotice(
          `Card stored securely · ${uploaded.status}. It remains unavailable until the malware scan is clean.`,
        );
      } finally {
        photoActivity(false);
      }
    });
  }
  const load = useCallback(async () => {
    const d = await model.context(call, user.role);
    d.userId = user.id;
    if (user.role === "patient")
      d.documents = await call<Row[]>(`/insurance/cards`);
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
    setBusy(true);
    setError("");
    load()
      .catch((e) => {
        setError(e.message);
        setItems([]);
      })
      .finally(() => setBusy(false));
  }, [load]);
  function discard(next: () => void) {
    if (!action) {
      next();
      return;
    }
    if (Platform.OS === "web") {
      if (globalThis.confirm("Discard this unsaved form?")) next();
    } else
      Alert.alert(
        "Discard unsaved form?",
        "Your changes have not been saved.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: next },
        ],
      );
  }
  useEffect(() => {
    if (!homeRef) return;
    homeRef.current = () => discard(onExit);
    return () => {
      homeRef.current = null;
    };
  }, [action, homeRef, onExit]);
  useEffect(() => {
    onNavigate?.();
  }, [section, selected, action, onNavigate]);
  useEffect(() => {
    if (user.role === "patient") return;
    let cursor = 0;
    const check = () =>
      call<Row>(`/ecosystem/changes?after=${cursor}`)
        .then((v) => {
          if (cursor && v.changed)
            setNotice("Workspace updates are available. Refresh when ready.");
          cursor = v.cursor;
        })
        .catch(() => {});
    void check();
    const timer = setInterval(check, 60000);
    return () => clearInterval(timer);
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
    discard(() => {
      setAction(a);
      setValues(initial(a, selected?.patient_id || ""));
      setKey(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setResponse(null);
      setNotice("");
    });
  }
  function navigate(s: string) {
    setCardUri("");
    discard(() => {
      setAction(null);
      setSelected(null);
      setCardUri("");
      setResponse(null);
      setFilter("all");
      setSearch("");
      setSection(s);
    });
  }
  // Use the shared payload builder so mobile and web submit the same field names and request keys.
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
      setCardUri("");
      setResponse(result.invitationToken || result.notice ? result : null);
      setNotice("Saved. Changes are recorded on the server.");
      await load();
    });
  }
  const text = (v: unknown, style?: object) => (
    <Text style={[styles.text, { color: colors.ink }, style]}>
      {String(v ?? "Unknown")}
    </Text>
  );
  const button = (label: string, fn: () => void, active = false) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled: busy }}
      disabled={busy}
      onPress={fn}
      style={[
        styles.button,
        {
          backgroundColor: active ? colors.button : colors.card,
          borderColor: colors.line,
        },
      ]}
    >
      {text(label, active ? { color: "#fff" } : undefined)}
    </Pressable>
  );
  const panel = (children: React.ReactNode, key?: string) => (
    <View
      key={key}
      style={[
        styles.panel,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      {children}
    </View>
  );
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
                Date.parse(r.due_at) < Date.now() &&
                r.status !== "completed"
              : filter === "upcoming"
                ? Date.parse(r.starts_at || r.due_at) > Date.now()
                : filter === "current_shift"
                  ? Date.parse(r.starts_at) <= Date.now() &&
                    Date.parse(r.ends_at) > Date.now()
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
  return (
    <View style={styles.root}>
      {panel(
        <>
          {text(data.organization?.name || "Health Passport", styles.label)}
          {text(
            user.role === "patient"
              ? "Your care connections"
              : user.role === "insurer"
                ? "Insurer workspace"
                : `${readable(data.employment?.professional_role || user.role)} workspace`,
            styles.heading,
          )}
          {user.role !== "patient" &&
            text(
              `Work ID ${data.employment?.work_id || "loading"} · ${data.organization?.code || ""}`,
              styles.meta,
            )}
          {data.organization?.status === "pending" &&
            text("Verification pending. Clinical privileges are not active.")}
          <View style={styles.row}>
            {button("← Back", () => discard(onExit))}
            {button("Refresh", () => void run(load))}
          </View>
        </>,
      )}
      <View style={styles.row}>
        {model
          .sections(user.role, data.canReviewOrganizations)
          .map((s) => button(s, () => navigate(s), section === s))}
      </View>
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={[styles.text, { color: colors.danger || "#b34c40" }]}
        >
          {error}
        </Text>
      )}
      {!!notice && text(notice, { fontWeight: "600" })}
      {section === "Overview" && (
        <>
          {panel(
            <>
              {text("Your work today", styles.heading)}
              {text(
                `${data.shifts?.filter((s: Row) => s.employee_id === data.employment?.id).length || 0} schedule intervals · ${data.tasks?.filter((t: Row) => t.assignee_id === user.id && t.status !== "completed").length || 0} open tasks`,
              )}
              {text(`${data.patients?.length || 0} assigned patients`)}
              {text(
                "Use Care team for shared charts, messages and consultations.",
              )}
            </>,
          )}
          {data.notices?.slice(0, 5).map((n: Row) =>
            panel(
              <>
                {text(readable(n.severity) + " update", styles.label)}
                {text(n.message)}
                {button(
                  n.is_read ? "Read" : "Mark read",
                  () =>
                    void run(async () => {
                      await call(`/ecosystem/notices/${n.id}/read`, "POST", {});
                      await load();
                    }),
                )}
              </>,
              n.id,
            ),
          )}
        </>
      )}
      {section === "Marketplace" &&
        text(
          "Compare objective details. Synthetic plans cannot be purchased. Clinical information never influences ranking. Sponsored placements are disabled.",
        )}
      {section === "Nursing" &&
        text(
          "Document authorized nursing care. Medication administration requires an active prescription and identity checks.",
        )}
      <View style={styles.row}>
        {available.map((a) => button(a.label, () => begin(a)))}
      </View>
      {action ? (
        panel(
          <>
            {text(action.label, styles.heading)}
            {action.id === "insurance" && (
              <View style={styles.row}>
                {button("Choose insurance card photo", () => void uploadCard())}
                {button(
                  "Photograph insurance card",
                  () => void uploadCard(true),
                )}
              </View>
            )}
            {model.fields(action, values).map((f) => (
              <View key={f.key} style={{ gap: 8 }}>
                {text(f.label + (f.optional ? " (optional)" : ""), {
                  fontWeight: "600",
                })}
                {f.type === "check" ? (
                  <Switch
                    accessibilityLabel={f.label}
                    value={!!values[f.key]}
                    onValueChange={(v) =>
                      setValues((old) => ({ ...old, [f.key]: v }))
                    }
                  />
                ) : ["select", "multi"].includes(f.type || "") ? (
                  <View style={styles.row}>
                    {options(f, data, records).map(
                      (o: { id: string; label: string }) =>
                        button(
                          o.label,
                          () => {
                            const v =
                              f.type === "multi"
                                ? values[f.key]?.includes(o.id)
                                  ? values[f.key].filter(
                                      (x: string) => x !== o.id,
                                    )
                                  : [...(values[f.key] || []), o.id]
                                : o.id;
                            setValues((old) => ({ ...old, [f.key]: v }));
                            if (f.key === "patientId")
                              void run(async () =>
                                setRecords(
                                  await call<Row[]>(
                                    `/care/patients/${o.id}/timeline`,
                                  ),
                                ),
                              );
                          },
                          f.type === "multi"
                            ? values[f.key]?.includes(o.id)
                            : values[f.key] === o.id,
                        ),
                    )}
                    {f.optional &&
                      button("Clear " + f.label, () =>
                        setValues((old) => ({
                          ...old,
                          [f.key]: f.type === "multi" ? [] : "",
                        })),
                      )}
                  </View>
                ) : (
                  <TextInput
                    accessibilityLabel={f.label}
                    value={String(values[f.key] ?? "")}
                    onChangeText={(v) =>
                      setValues((old) => ({ ...old, [f.key]: v }))
                    }
                    secureTextEntry={f.type === "password"}
                    autoCapitalize="none"
                    multiline={f.type === "long"}
                    keyboardType={
                      f.type === "number" ? "decimal-pad" : "default"
                    }
                    style={[
                      styles.input,
                      {
                        color: colors.ink,
                        borderColor: colors.line,
                        minHeight: f.type === "long" ? 110 : 46,
                      },
                    ]}
                  />
                )}
              </View>
            ))}
            <View style={styles.row}>
              {button(busy ? "Saving…" : "Save", () => void save(), true)}
              {button("Cancel", () => discard(() => setAction(null)))}
            </View>
          </>,
        )
      ) : selected ? (
        panel(
          <>
            {button("← Back to " + section.toLowerCase(), () => {
              setSelected(null);
              setCardUri("");
              setResponse(null);
            })}
            {text(model.title(selected), styles.heading)}
            {model.lines(section, selected).map((line, i) => (
              <React.Fragment key={i}>
                {line ? text(line) : null}
              </React.Fragment>
            ))}
            {[
              "details",
              "instructions",
              "coverage",
              "eligibility",
              "review_reason",
            ].map(
              (k) =>
                selected[k] && (
                  <View key={k}>
                    {text(readable(k), styles.label)}
                    {text(selected[k])}
                  </View>
                ),
            )}
            {section === "Insurance" && (
              <>
                {selected.card_document_id &&
                  button(
                    "View authorized card image",
                    () =>
                      void run(async () =>
                        setCardUri(
                          (
                            await call<Row>(
                              `/insurance/profiles/${selected.id}/card-image`,
                            )
                          ).dataUri,
                        ),
                      ),
                  )}
                {!!cardUri && (
                  <Image
                    source={{ uri: cardUri }}
                    accessibilityLabel="Authorized insurance card"
                    style={{
                      width: "100%",
                      height: 210,
                      resizeMode: "contain",
                    }}
                  />
                )}
                {button(
                  "Reveal protected identifiers",
                  () =>
                    void run(async () =>
                      setResponse(
                        await call<Row>(
                          `/insurance/profiles/${selected.id}/identifiers`,
                        ),
                      ),
                    ),
                )}
                {selected.checks?.map((c: Row) =>
                  panel(
                    <>
                      {text(
                        `${c.status}${c.synthetic ? " · SYNTHETIC" : ""}`,
                        styles.label,
                      )}
                      {text(c.summary)}
                      {text(c.checked_at, styles.meta)}
                    </>,
                    c.id,
                  ),
                )}
              </>
            )}
            {section === "Hospitals" && (
              <>
                {text("Your care team", styles.label)}
                {selected.care_team?.map((c: Row, i: number) => (
                  <Text key={i} style={{ color: colors.ink }}>
                    {c.name} · {readable(c.role)} · {c.department}
                  </Text>
                ))}
                {text("Your appointments", styles.label)}
                {selected.appointments?.map((a: Row) => (
                  <Text key={a.id} style={{ color: colors.ink }}>
                    {new Date(a.starts_at).toLocaleString()} · {a.doctor} ·{" "}
                    {a.status}
                  </Text>
                ))}
              </>
            )}
          </>,
        )
      ) : (
        <>
          {text("Search " + section.toLowerCase(), styles.label)}
          <TextInput
            accessibilityLabel={"Search " + section.toLowerCase()}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.input,
              { color: colors.ink, borderColor: colors.line },
            ]}
          />
          <View style={styles.row}>
            {[
              "all",
              "mine",
              "current_shift",
              "upcoming",
              "overdue",
              "completed",
            ].map((v) => button(readable(v), () => setFilter(v), filter === v))}
          </View>
          <View style={styles.row}>
            {(section === "Marketplace"
              ? ["premium", "deductible", "out_of_pocket", "name"]
              : ["time", "name"]
            ).map((v) =>
              button("Sort by " + readable(v), () => setSort(v), sort === v),
            )}
          </View>
          {filtered.map((r) =>
            panel(
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setSelected(r);
                    setResponse(null);
                  }}
                >
                  {text(model.title(r), styles.title)}
                  {model.lines(section, r).map((line, i) => (
                    <React.Fragment key={i}>
                      {line ? text(line, styles.meta) : null}
                    </React.Fragment>
                  ))}
                </Pressable>
                {section === "Marketplace" &&
                  button(
                    compared.includes(r.id)
                      ? "Remove comparison"
                      : "Compare plan",
                    () =>
                      setCompared((v) =>
                        v.includes(r.id)
                          ? v.filter((x) => x !== r.id)
                          : v.length < 4
                            ? [...v, r.id]
                            : v,
                      ),
                    compared.includes(r.id),
                  )}
              </>,
              r.id,
            ),
          )}
          {!filtered.length &&
            !busy &&
            !["Overview", "Nursing", "Organization onboarding"].includes(
              section,
            ) &&
            text(
              "No " +
                section.toLowerCase() +
                " are available within your permissions.",
            )}
        </>
      )}
      {section === "Marketplace" && compared.length > 0 && (
        <>
          {text("Plan comparison", styles.heading)}
          {items
            .filter((r) => compared.includes(r.id))
            .map((r) =>
              panel(
                <>
                  {text(r.name, styles.title)}
                  {text(`${r.currency} ${r.monthly_premium}/month`)}
                  {text(
                    `Deductible ${r.deductible} · Out-of-pocket maximum ${r.out_of_pocket}`,
                  )}
                  {text(`${r.network_type} · ${r.region}`)}
                  {text(`Copay: ${r.copay} · Coinsurance: ${r.coinsurance}`)}
                </>,
                r.id,
              ),
            )}
        </>
      )}
      {section === "Insurance" && user.role === "patient" && (
        <>
          {text("Who can access your insurance", styles.heading)}
          {shares.map((s) =>
            panel(
              <>
                {text(s.organization_name, styles.title)}
                {text(
                  `${s.grantee_name || s.department || "Eligible organization staff"} · ${s.purpose} · ${s.status}`,
                )}
                {text("Expires " + s.expires_at, styles.meta)}
                {s.status === "active" &&
                  button(
                    "Revoke access",
                    () =>
                      void run(async () => {
                        await call(
                          `/insurance/shares/${s.id}/revoke`,
                          "POST",
                          {},
                        );
                        await load();
                      }),
                  )}
              </>,
              s.id,
            ),
          )}
        </>
      )}
      {response &&
        panel(
          <>
            {text(
              response.invitationToken
                ? "Private employee invitation"
                : "Result",
              styles.heading,
            )}
            {Object.entries(response)
              .filter(([k]) => !["id", "organizationId"].includes(k))
              .map(([k, v]) => (
                <View key={k}>
                  {text(readable(k), styles.label)}
                  {Array.isArray(v) ? (
                    v.map((x, i) => (
                      <Text key={i} style={{ color: colors.ink }}>
                        {Object.entries(x)
                          .map(([key, value]) => `${readable(key)}: ${value}`)
                          .join(" · ")}
                      </Text>
                    ))
                  ) : (
                    <Text
                      selectable
                      style={[styles.text, { color: colors.ink }]}
                    >
                      {String(v)}
                    </Text>
                  )}
                </View>
              ))}
          </>,
        )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: 18 },
  panel: { gap: 14, padding: 18, borderWidth: 1, borderRadius: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  text: { fontSize: 15, lineHeight: 23 },
  heading: { fontSize: 25, lineHeight: 32, fontWeight: "700" },
  title: { fontSize: 19, fontWeight: "600", lineHeight: 28 },
  label: { fontSize: 13, fontWeight: "600", lineHeight: 21 },
  meta: { fontSize: 13, lineHeight: 22 },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 46,
    padding: 12,
    fontSize: 16,
  },
});
