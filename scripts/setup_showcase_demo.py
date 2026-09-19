#!/usr/bin/env python3
# Builds the richer fictional patient stories used for demonstrations. This calls
# the local API and writes evidence describing the generated fixture state.
# Never replace these examples with real patient records for a public demo.

"""Add fictional presentation fixtures through the shared API; never reset existing records."""
from setup_ecosystem_demo import Client, ROOT, ENV
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
import json

PREFIX = "showcase-v1-"
MANIFEST = ROOT / "docs/evidence/showcase-demo.json"
SCOPES = [
    "vital",
    "history",
    "nursing_observation",
    "allergy",
    "condition",
    "medication",
    "encounter",
    "note",
    "lab_order",
    "lab_result",
    "imaging_order",
    "imaging_report",
    "prescription",
    "dispense",
    "document",
    "referral",
    "follow_up",
    "discharge",
]
CASES = [
    {
        "username": "hospitalalice",
        "name": "Alice Morgan",
        "age": 34,
        "occupation": "Museum programme coordinator",
        "story": "Review of a recent cough and fatigue episode",
        "reason": "Review completed CBC and chest report",
        "room": "Clinic A · Room 2",
        "history": "Chief complaint: dry cough and tiredness for three days during a busy exhibition week. Onset gradual; symptoms more noticeable late in the day. No previous similar episode recorded in this fictional story. Past history: seasonal nasal symptoms. Family history: parent with high blood pressure. Personal history: walks to work, does not smoke, lives with a partner. Occupation: museum programme coordinator. Fictional address: 14 Example Lane, Demo District. No real contact information.",
        "allergy": "Patient reports a rash after penicillin as a teenager; timing and original documentation are not available. Demonstrates a patient-reported allergy requiring reconciliation, not verified testing.",
        "condition": "Fictional working assessment: recent respiratory symptoms under review. No real diagnosis is established by this demonstration.",
        "vitals": {
            "temperature_c": 36.8,
            "spo2_percent": 98,
            "pulse_bpm": 76,
            "systolic_mmhg": 118,
            "diastolic_mmhg": 76,
        },
        "plan": "Review the attached fictional reports, reconcile the reported allergy, document the discussion and confirm the next follow-up with Alice. No real treatment instruction.",
    },
    {
        "username": "showcasenoah",
        "name": "Noah Bennett",
        "age": 52,
        "occupation": "Bus route dispatcher",
        "story": "Routine health review with blood work pending",
        "reason": "Annual review and pending laboratory results",
        "room": "Clinic A · Room 3",
        "history": "Chief complaint: routine annual review and a request to discuss occasional tiredness after rotating shifts. Symptoms occur near the end of a long workday. Past history: no surgeries reported in this fictional record. Family history: sibling with raised cholesterol. Personal history: irregular sleep during shift changes; enjoys weekend gardening. Occupation: bus route dispatcher. Fictional address: 22 Sample Crescent, Demo District.",
        "allergy": "No medication allergies reported at this fictional intake. This is a reported history, not an assertion that every exposure is safe.",
        "condition": "Preventive review encounter; laboratory request remains pending. The demonstration does not infer a diagnosis from the request.",
        "vitals": {
            "temperature_c": 36.6,
            "spo2_percent": 99,
            "pulse_bpm": 70,
            "systolic_mmhg": 126,
            "diastolic_mmhg": 80,
        },
        "plan": "Keep the laboratory task visible until the result arrives. Show how the clinician can prepare a draft and return later without copying the patient history.",
    },
    {
        "username": "showcasefatima",
        "name": "Fatima Rahman",
        "age": 28,
        "occupation": "Product illustrator",
        "story": "Follow-up for recurring seasonal nasal symptoms",
        "reason": "Symptom follow-up and medication reconciliation",
        "room": "Clinic B · Room 1",
        "history": "Chief complaint: sneezing and itchy eyes recurring during spring cleaning. Onset intermittent over two weeks; patient notices symptoms around dusty storage boxes. Past history: similar seasonal symptoms in prior years. Family history: sibling reports hay-fever symptoms. Personal history: works from a home studio, no tobacco use reported. Occupation: product illustrator. Fictional address: 8 Illustration Walk, Demo District.",
        "allergy": "No drug allergies reported; patient describes sensitivity to dust. Keep environmental symptoms distinct from a confirmed drug allergy.",
        "condition": "Patient-reported seasonal nasal symptoms, awaiting review. The narrative demonstrates history and follow-up tracking.",
        "vitals": {
            "temperature_c": 36.5,
            "spo2_percent": 99,
            "pulse_bpm": 74,
            "systolic_mmhg": 112,
            "diastolic_mmhg": 72,
        },
        "plan": "Use the follow-up task and message thread to confirm the symptom history and reconcile the demonstration medication list. No real prescribing advice.",
    },
    {
        "username": "showcaseleo",
        "name": "Leo Fernandes",
        "age": 41,
        "occupation": "Primary-school teacher",
        "story": "Ankle discomfort after a weekend walk; imaging pending",
        "reason": "Ankle review and imaging coordination",
        "room": "Clinic B · Room 4",
        "history": "Chief complaint: left ankle discomfort after stepping off a low kerb during a weekend walk. Patient reports swelling later that evening and discomfort on stairs. Past history: a similar minor injury several years ago; no operation reported. Family history: no relevant condition reported in the fictional interview. Personal history: active at school, enjoys hiking. Occupation: primary-school teacher. Fictional address: 31 Storybook Road, Demo District.",
        "allergy": "Patient reports nausea with an unnamed pain medicine; original name and circumstances are unknown. Demonstrates an unreconciled intolerance rather than a confirmed allergy.",
        "condition": "Fictional ankle symptom review. Imaging has been requested; no fracture or other diagnosis is inferred before the report.",
        "vitals": {
            "temperature_c": 36.7,
            "spo2_percent": 98,
            "pulse_bpm": 78,
            "systolic_mmhg": 122,
            "diastolic_mmhg": 78,
        },
        "plan": "Coordinate the imaging appointment, document the reported symptoms and leave the report-review task open until a report is available.",
    },
]


def main():
    if ENV.get("DEMO_MODE", "").lower() != "true":
        raise SystemExit("Synthetic development only.")
    state = (
        json.loads(MANIFEST.read_text())
        if MANIFEST.exists()
        else {
            "synthetic": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "patients": {},
            "records": {},
            "orders": {},
            "tasks": {},
            "conversations": {},
            "handoffs": {},
            "appointments": {},
            "plans": [],
        }
    )
    anchor = datetime.fromisoformat(state["createdAt"])
    observed = (anchor - timedelta(days=1)).isoformat()
    expiry = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    clients = {
        name: Client().login(name)
        for name in [
            "hospitaladmin",
            "hospitaldoctor",
            "hospitalnurse",
            "hospitallab",
            "hospitalimaging",
            "hospitalradiologist",
            "hospitalpharmacy",
            "hospitalbilling",
            "hospitalreception",
            "hospitalinsurer",
            "security",
        ]
    }
    admin = clients["hospitaladmin"]
    doctor = clients["hospitaldoctor"]
    nurse = clients["hospitalnurse"]
    lab = clients["hospitallab"]
    imaging = clients["hospitalimaging"]
    radio = clients["hospitalradiologist"]
    pharmacy = clients["hospitalpharmacy"]

    def checkpoint():
        MANIFEST.parent.mkdir(exist_ok=True, parents=True)
        MANIFEST.write_text(json.dumps(state, indent=2) + "\n")

    def record(c, key, p, kind, title, details, **extra):
        row = c.call(
            "/care/records",
            {
                "patientId": p.user["id"],
                "kind": kind,
                "title": "Showcase · " + title,
                "details": "FICTIONAL PRESENTATION EXAMPLE — " + details,
                "observedAt": observed,
                "sourceType": (
                    "nurse_observation" if c is nurse else "clinician_observation"
                ),
                "source": "Fictional NorthStar presentation fixture",
                "idempotencyKey": PREFIX + key,
                **extra,
            },
        )
        state["records"][key] = row["id"]
        checkpoint()
        return row

    ps = {}
    for case in CASES:
        name = case["username"]
        try:
            p = Client().login(name)
        except RuntimeError as error:
            if not str(error).startswith("401"):
                raise
            from setup_ecosystem_demo import PASSWORD

            Client().call(
                "/auth/register",
                {"username": name, "displayName": case["name"], "password": PASSWORD},
            )
            p = Client().login(name)
        if p.user["name"] != case["name"] + " (Synthetic)":
            raise SystemExit(
                "Existing account does not match the fictional fixture; preserved."
            )
        ps[name] = p
        state["patients"][name] = {**case, **p.user}
        checkpoint()
        admin.call("/care/registration", {"healthId": p.user["healthId"]})
        grants = p.call("/consents")
        assignments = admin.call("/care/assignments")
        for staff, c in clients.items():
            role = c.user["role"]
            if role not in [
                "doctor",
                "nurse",
                "lab",
                "diagnostic",
                "pharmacy",
                "reception",
            ]:
                continue
            scopes = (
                ["registration"]
                if role == "reception"
                else {
                    "doctor": SCOPES,
                    "nurse": [
                        "vital",
                        "history",
                        "nursing_observation",
                        "allergy",
                        "medication",
                        "prescription",
                        "lab_order",
                        "lab_result",
                        "note",
                        "encounter",
                        "follow_up",
                    ],
                    "lab": ["lab_order", "lab_result"],
                    "diagnostic": ["imaging_order", "imaging_report"],
                    "pharmacy": ["prescription", "dispense", "allergy", "medication"],
                }[role]
            )
            existing = next(
                (
                    a
                    for a in assignments
                    if a["patient_id"] == p.user["id"] and a["staff_id"] == c.user["id"]
                ),
                None,
            )
            if not existing:
                admin.call(
                    "/care/assignments",
                    {
                        "healthId": p.user["healthId"],
                        "staffId": c.user["id"],
                        "scopes": scopes,
                        "expiresAt": expiry,
                    },
                )
            if role != "reception" and not any(
                g["grantee_id"] == c.user["id"] and g["status"] == "active"
                for g in grants
            ):
                p.call(
                    "/consents",
                    {
                        "patientId": p.user["id"],
                        "granteeId": c.user["id"],
                        "purpose": "treatment",
                        "scopes": scopes,
                        "expiresAt": expiry,
                    },
                )
        record(
            doctor,
            name + "-history",
            p,
            "history",
            case["name"] + " · case history",
            f"Age: {case['age']} (fictional). " + case["history"],
            sourceType="patient_report",
        )
        record(
            doctor,
            name + "-allergy",
            p,
            "allergy",
            case["name"] + " · allergy reconciliation",
            case["allergy"],
            sourceType="patient_report",
        )
        record(
            doctor,
            name + "-condition",
            p,
            "condition",
            case["name"] + " · assessment context",
            case["condition"],
        )
        record(
            nurse,
            name + "-vital",
            p,
            "vital",
            case["name"] + " · intake observations",
            "Measurements are invented for the demonstration, recorded at "
            + case["room"]
            + ". Patient identity checked against the fictional Health ID. These values are not a clinical reference.",
            measurements=case["vitals"],
        )
        record(
            doctor,
            name + "-followup",
            p,
            "follow_up",
            case["name"] + " · follow-up plan",
            case["plan"],
        )
        record(
            doctor,
            name + "-note",
            p,
            "note",
            case["name"] + " · consultation overview",
            "Presenting concern: "
            + case["story"]
            + ".\nHistory reviewed: "
            + case["history"]
            + "\nAssessment: "
            + case["condition"]
            + "\nPlan: "
            + case["plan"],
        )
    # Today's/tomorrow's explicit public interval supplies four non-conflicting appointments.
    now = datetime.now(timezone.utc)
    local = now.astimezone(ZoneInfo("America/New_York"))
    day = local.replace(hour=8, minute=0, second=0, microsecond=0)
    if local.hour >= 16:
        day += timedelta(days=1)
    if state["appointments"]:
        first = next(iter(state["appointments"].values()))
        day = datetime.fromtimestamp(
            first["starts_at"] / 1000, ZoneInfo("America/New_York")
        ).replace(hour=8, minute=0, second=0, microsecond=0)
    starts = day.astimezone(timezone.utc)
    ends = starts + timedelta(hours=10)
    workspace = admin.call("/ecosystem/workspace")
    for username in [
        "hospitaldoctor",
        "hospitalnurse",
        "hospitallab",
        "hospitalimaging",
        "hospitalradiologist",
        "hospitalpharmacy",
        "hospitalreception",
        "hospitalbilling",
    ]:
        employee = next(
            e
            for e in workspace["staff"]
            if e["user_id"] == clients[username].user["id"]
        )
        if not any(
            s["employee_id"] == employee["id"]
            and s["status"] == "active"
            and datetime.fromisoformat(s["starts_at"].replace("Z", "+00:00")) <= starts
            and datetime.fromisoformat(s["ends_at"].replace("Z", "+00:00")) >= ends
            for s in workspace["shifts"]
        ):
            admin.call(
                "/ecosystem/shifts",
                {
                    "employeeId": employee["id"],
                    "nodeId": employee["node_id"],
                    "kind": "shift",
                    "startsAt": starts.isoformat(),
                    "endsAt": ends.isoformat(),
                    "publicBooking": username == "hospitaldoctor",
                    "specialty": "General care",
                },
            )
    state["scheduleDate"] = day.date().isoformat()
    for case in CASES:
        p = ps[case["username"]]
        key = case["username"]
        if key not in state["appointments"]:
            slots = p.call(
                "/ecosystem/public-slots?organizationId="
                + admin.user["organizationId"]
                + "&date="
                + starts.date().isoformat()
            )
            slots = [s for s in slots if s["doctorId"] == doctor.user["id"]]
            if not slots:
                raise RuntimeError(
                    "No public showcase slots remain; existing appointments preserved."
                )
            slot = slots[0]
            a = doctor.call(
                "/clinician/appointments",
                {
                    "patientId": p.user["id"],
                    "startsAt": slot["startsAt"],
                    "duration": 30,
                    "reason": "Showcase · " + case["reason"],
                    "mode": "in_person",
                    "requestKey": PREFIX + key + "-appointment",
                },
            )
            state["appointments"][key] = a
            checkpoint()
    # Prepare one realistic saved note, preserving user edits on later reruns.
    noah = ps["showcasenoah"]
    aid = state["appointments"]["showcasenoah"]["id"]
    draft = doctor.call("/clinician/appointments/" + aid + "/draft")
    if draft["version"] == 0:
        doctor.call(
            "/clinician/appointments/" + aid + "/draft",
            {
                "version": 0,
                "subjective": "FICTIONAL DEMO DRAFT. Noah, 52, bus dispatcher, describes fatigue after rotating shifts and requests an annual review.",
                "objective": "Invented intake: temperature 36.6 C, pulse 70/min, BP 126/80, SpO2 99%. See dated nurse entry; these are not newly measured values.",
                "assessment": "Preventive review with a pending laboratory request. No result or diagnosis should be inferred.",
                "plan": "Await the fictional panel, reconcile history and return to this server-saved draft after review.",
            },
            "PUT",
        )

    def order(key, p, kind, title, recipient, instructions):
        o = doctor.call(
            "/ecosystem/orders",
            {
                "patientId": p.user["id"],
                "kind": kind,
                "code": "Showcase · " + title,
                "instructions": "FICTIONAL DEMO ONLY. " + instructions,
                "priority": "routine",
                "assigneeId": recipient.user["id"],
                "specimenType": "whole blood" if kind == "laboratory" else "",
                "modality": "DX" if kind == "imaging" else "",
                "requestKey": PREFIX + key,
            },
        )
        state["orders"][key] = o
        checkpoint()
        return o

    def advance(key, o, stages, p, report=None):
        if state.get("staged", {}).get(key):
            return o
        for status, c in stages:
            flow = (
                [
                    "ordered",
                    "accepted",
                    "specimen_collected",
                    "processing",
                    "result_pending",
                    "result_ready",
                    "reviewed",
                    "completed",
                ]
                if o["kind"] == "laboratory"
                else [
                    "ordered",
                    "scheduled",
                    "patient_arrived",
                    "imaging",
                    "study_available",
                    "interpretation",
                    "result_ready",
                    "report_signed",
                    "reviewed",
                    "completed",
                ]
            )
            if flow.index(o["status"]) >= flow.index(status):
                continue
            b = {"version": o["version"], "status": status}
            if status == "specimen_collected":
                b.update(
                    patientHealthId=p.user["healthId"],
                    specimenCode=o["specimen_code"],
                    observedAt=observed,
                )
            if status == "study_available":
                b["studyUid"] = "2.25.136164670743420828525494922877877"
            if status == "result_ready":
                b.update(
                    report="FICTIONAL PRESENTATION REPORT — " + report,
                    observedAt=observed,
                    critical=False,
                )
            if status in ["report_signed", "reviewed"]:
                b.update(
                    review="Fictional review: sample report reconciled with the presentation case; no real clinical decision.",
                    reviewed=True,
                )
            o = c.call("/ecosystem/orders/" + o["id"], b, "PATCH")
            state["orders"][key] = o
            checkpoint()
        state.setdefault("staged", {})[key] = True
        checkpoint()
        return o

    alice = ps["hospitalalice"]
    o = order(
        "alice-cbc",
        alice,
        "laboratory",
        "Alice CBC report",
        lab,
        "Example specimen from the prior fictional visit. Verify patient and specimen identifiers; report results to Dr Smith.",
    )
    advance(
        "alice-cbc",
        o,
        [
            (s, c)
            for s, c in [
                ("accepted", lab),
                ("specimen_collected", nurse),
                ("processing", lab),
                ("result_pending", lab),
                ("result_ready", lab),
                ("reviewed", doctor),
                ("completed", lab),
            ]
        ],
        alice,
        "Accession: DEMO-CBC-ALICE-01. Specimen: EDTA whole blood. WBC 6.8 x10^9/L; haemoglobin 13.2 g/dL; platelets 254 x10^9/L. All values are invented; no laboratory range or clinical interpretation is asserted. Technician Lee recorded the sample result; Dr Smith reviewed it. Observation date precedes upload to demonstrate provenance.",
    )
    o = order(
        "alice-xray",
        alice,
        "imaging",
        "Alice chest report",
        imaging,
        "Example report from the prior fictional visit; no actual image acquisition or radiation exposure.",
    )
    advance(
        "alice-xray",
        o,
        [
            (
                s,
                (
                    radio
                    if s == "report_signed"
                    else doctor if s == "reviewed" else imaging
                ),
            )
            for s in [
                "scheduled",
                "patient_arrived",
                "imaging",
                "study_available",
                "interpretation",
                "result_ready",
                "report_signed",
                "reviewed",
                "completed",
            ]
        ],
        alice,
        "Study: DEMO-CHEST-ALICE-01. Technique: fictional two-view chest examination. Findings in the invented narrative: no focal air-space opacity, pleural fluid or pneumothorax described; cardiomediastinal silhouette not enlarged. Impression: no acute finding described in this fictional sample. Dr Ahmed attested the report, then Dr Smith reviewed. The UID is a demonstration reference; no actual DICOM pixels exist.",
    )
    o = order(
        "noah-panel",
        noah,
        "laboratory",
        "Noah wellness panel",
        lab,
        "Request CBC and chemistry-panel workflow demonstration. Result has not been supplied; keep the order in processing, not completed.",
    )
    advance(
        "noah-panel",
        o,
        [("accepted", lab), ("specimen_collected", nurse), ("processing", lab)],
        noah,
    )
    leo = ps["showcaseleo"]
    o = order(
        "leo-imaging",
        leo,
        "imaging",
        "Leo left ankle request",
        imaging,
        "Fictional indication: ankle discomfort after a misstep. Confirm identity, coordinate imaging and leave report pending. Do not fabricate a completed study.",
    )
    advance("leo-imaging", o, [("scheduled", imaging)], leo)
    fatima = ps["showcasefatima"]
    order(
        "fatima-consult",
        fatima,
        "consultation",
        "Fatima follow-up review",
        doctor,
        "Review reported seasonal symptoms and reconcile the demo medication list. This is an internal fictional request, not an external referral.",
    )
    rx = record(
        doctor,
        "fatima-rx",
        fatima,
        "prescription",
        "Fatima · demonstration prescription",
        "Product: DEMO TRAINING TABLET — a nonexistent medicine used solely to demonstrate prescription verification. Never dispense or administer to a person.",
        recipientId=pharmacy.user["id"],
        dosage="1 fictional training unit",
        route="oral",
        frequency="Demonstration schedule only",
        duration="Demo workflow only",
        quantity=10,
        refills=0,
    )
    record(
        pharmacy,
        "fatima-dispense",
        fatima,
        "dispense",
        "Fatima · pharmacy verification",
        "Fictional pharmacy event: matched patient and prescription, checked remaining quantity and recorded one demonstration unit. No physical medicine supplied.",
        relatedId=rx["id"],
        quantity=1,
    )
    # Four operational states and a verifiable completion.
    for key, p, title, statuses, scope in [
        (
            "alice-review",
            alice,
            "Alice · confirm report discussion",
            ["accepted", "in_progress", "completed"],
            "nursing_observation",
        ),
        (
            "noah-collection",
            noah,
            "Noah · specimen handoff",
            ["accepted", "in_progress"],
            "lab_order",
        ),
        (
            "fatima-followup",
            fatima,
            "Fatima · arrange follow-up",
            [],
            "nursing_observation",
        ),
        (
            "leo-transport",
            leo,
            "Leo · coordinate imaging slot",
            ["accepted", "in_progress", "waiting"],
            "nursing_observation",
        ),
    ]:
        case = next(c for c in CASES if c["username"] == p.user["username"])
        task = doctor.call(
            "/care/tasks",
            {
                "patientId": p.user["id"],
                "scope": scope,
                "title": "Showcase · " + title,
                "details": "FICTIONAL DEMO: " + case["plan"],
                "assigneeId": nurse.user["id"],
                "priority": "high" if key == "leo-transport" else "routine",
                "location": case["room"],
                "taskType": "care_coordination",
                "dueAt": (anchor + timedelta(hours=4)).isoformat(),
                "requestKey": PREFIX + key,
            },
        )
        state["tasks"][key] = task
        checkpoint()
        if not state.get("staged", {}).get(key):
            flow = ["open", "accepted", "in_progress", "waiting", "completed"]
            for status in statuses:
                if flow.index(task["status"]) >= flow.index(status):
                    continue
                task = nurse.call(
                    "/care/tasks/" + task["id"],
                    {
                        "version": task["version"],
                        "status": status,
                        "comment": "Fictional presentation progress: " + title,
                    },
                    "PATCH",
                )
            if task["status"] == "completed" and not task.get("verified_by"):
                task = doctor.call(
                    "/care/tasks/" + task["id"] + "/verify",
                    {
                        "version": task["version"],
                        "comment": "Fictional independent verification of documented completion.",
                    },
                )
            state["tasks"][key] = task
            state.setdefault("staged", {})[key] = True
            checkpoint()
    # Care-context messages with an acknowledgment reply, kept out of the legal record.
    for p, subject, text in [
        (
            alice,
            "Alice · report discussion",
            "Both fictional reports are ready and reviewed. Please confirm that Alice can open them in her own timeline.",
        ),
        (
            noah,
            "Noah · pending result",
            "The fictional specimen is in processing. Please leave the review task open until an actual demo result is entered.",
        ),
        (
            leo,
            "Leo · imaging coordination",
            "The fictional imaging request is scheduled. Please confirm the room and time before moving the workflow ahead.",
        ),
    ]:
        key = p.user["username"]
        c = doctor.call(
            "/care/conversations",
            {
                "patientId": p.user["id"],
                "scope": "note",
                "kind": "patient",
                "title": "Showcase · " + subject,
                "members": [nurse.user["id"]],
                "requestKey": PREFIX + key + "-conversation",
            },
        )
        state["conversations"][key] = c["id"]
        doctor.call(
            "/care/messages",
            {
                "conversationId": c["id"],
                "body": "FICTIONAL DEMO — " + text,
                "priority": "routine",
                "mentions": [nurse.user["id"]],
                "requestKey": PREFIX + key + "-message-1",
            },
        )
        nurse.call(
            "/care/messages",
            {
                "conversationId": c["id"],
                "body": "FICTIONAL DEMO — acknowledged. I can see the assigned task and the dated patient history; I will update the task separately from this operational message.",
                "priority": "routine",
                "requestKey": PREFIX + key + "-message-2",
            },
        )
        checkpoint()
    # Explicit handoff ownership; a second handoff stays unacknowledged to demonstrate the control.
    for key, p, ack in [("alice-handoff", alice, True), ("leo-handoff", leo, False)]:
        if key not in state["handoffs"]:
            h = nurse.call(
                "/ecosystem/handoffs",
                {
                    "patientId": p.user["id"],
                    "incomingId": doctor.user["id"],
                    "patientStatus": "FICTIONAL SHOWCASE "
                    + key
                    + ": patient history available in the authorized chart.",
                    "pendingTasks": (
                        "Report discussion completed."
                        if ack
                        else "Imaging coordination remains waiting; check the task owner and timing."
                    ),
                    "medications": "No real medication instruction. Any training prescription is explicitly fictional.",
                    "tests": (
                        "Alice CBC and chest sample reports reviewed."
                        if ack
                        else "Left ankle imaging request scheduled; no result available."
                    ),
                    "observations": "See the nurse-authored dated vital entry; do not copy it as a new measurement.",
                    "concerns": "No real escalation. This field demonstrates structured handoff context.",
                },
            )
            state["handoffs"][key] = h
            checkpoint()
        h = state["handoffs"][key]
        if ack and h["status"] == "sent":
            state["handoffs"][key] = doctor.call(
                "/ecosystem/handoffs/" + h["id"] + "/acknowledge",
                {"version": h["version"]},
            )
            checkpoint()
    # Insurance: compare approved invented plans and an explicit UNKNOWN real-provider result.
    insurer = clients["hospitalinsurer"]
    existing = insurer.call("/insurance/plans")
    for name, premium, deductible, maximum, network in [
        ("Showcase · Harbor Starter", 220, 1800, 6500, "HMO"),
        ("Showcase · Harbor Flexible", 365, 900, 4500, "PPO"),
        ("Showcase · Harbor Family", 480, 1500, 7000, "EPO"),
    ]:
        plan = next((p for p in existing if p["name"] == name), None)
        if not plan:
            plan = insurer.call(
                "/insurance/plans",
                {
                    "name": name,
                    "region": "Demo region · New Jersey example",
                    "networkType": network,
                    "currency": "USD",
                    "monthlyPremium": premium,
                    "deductible": deductible,
                    "copay": "Fictional office visit: $25",
                    "coinsurance": "Fictional example: 20% after deductible",
                    "outOfPocket": maximum,
                    "coverage": "Invented comparison: outpatient visits, hospital care, diagnostic services and prescriptions. No actual benefits or network exist.",
                    "eligibility": "Fictional adult/family comparison only; not available for enrollment.",
                },
            )
        if plan["status"] == "pending":
            plan = clients["security"].call(
                "/insurance/plans/" + plan["id"] + "/review",
                {
                    "version": plan["version"],
                    "status": "approved",
                    "reason": "Fictional presentation listing only; no actual insurance sale.",
                },
            )
        if plan["id"] not in state["plans"]:
            state["plans"].append(plan["id"])
    for p, company in [
        (noah, "Example Unconnected Provider — Fictional"),
        (fatima, "Synthetic Harbor Health"),
    ]:
        profiles = p.call("/insurance/profiles")
        profile = next((x for x in profiles if x["company"] == company), None)
        if not profile:
            profile = p.call(
                "/insurance/profiles",
                {
                    "company": company,
                    "plan": "Showcase · fictional member plan",
                    "memberId": "DEMO-" + p.user["username"].upper(),
                    "groupId": "DEMO-GROUP-2026",
                    "policyholder": p.user["name"],
                    "relationship": "self",
                    "coverageOrder": "primary",
                    "effectiveDate": anchor.date().replace(day=1).isoformat(),
                    "expirationDate": (anchor + timedelta(days=365)).date().isoformat(),
                    "coverageSummary": "Invented patient-entered coverage description. No real coverage is asserted.",
                },
            )
        shares = p.call("/insurance/shares")
        if not any(
            s["profile_id"] == profile["id"] and s["status"] == "active" for s in shares
        ):
            p.call(
                "/insurance/shares",
                {
                    "profileId": profile["id"],
                    "organizationId": admin.user["organizationId"],
                    "granteeId": clients["hospitalbilling"].user["id"],
                    "purpose": "eligibility",
                    "expiresAt": expiry,
                },
            )
        check = clients["hospitalbilling"].call(
            "/insurance/profiles/" + profile["id"] + "/eligibility",
            {"requestKey": PREFIX + p.user["username"] + "-eligibility"},
        )
        state.setdefault("insurance", {})[p.user["username"]] = {
            "profileId": profile["id"],
            "company": company,
            "status": check["status"],
            "synthetic": check["synthetic"],
        }
        checkpoint()
    state["lastVerifiedAt"] = datetime.now(timezone.utc).isoformat()
    state["counts"] = {
        key: len(state[key])
        for key in [
            "patients",
            "records",
            "orders",
            "tasks",
            "conversations",
            "handoffs",
            "appointments",
            "plans",
        ]
    }
    checkpoint()
    print(
        json.dumps(
            {
                "synthetic": True,
                "scheduleDate": state["scheduleDate"],
                "counts": state["counts"],
                "insurance": state["insurance"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
