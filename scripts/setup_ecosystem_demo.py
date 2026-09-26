#!/usr/bin/env python3
# Creates fictional organization/workforce and insurance examples through the API.
# This is a fixture writer, not a read-only verification or production import tool.

"""Idempotent synthetic hospital setup. Uses local API and keeps credentials in .env only."""
from pathlib import Path
import json, urllib.request, urllib.error, http.cookiejar, datetime, uuid

ROOT = Path(__file__).resolve().parents[1]
ENV = dict(
    line.split("=", 1)
    for line in (ROOT / ".env").read_text().splitlines()
    if "=" in line and not line.startswith("#")
)
if ENV.get("DEMO_MODE", "").lower() != "true":
    raise SystemExit("Synthetic DEMO_MODE only.")
PASSWORD = ENV["DEMO_PASSWORD"]
BASE = "http://localhost:8080/api"


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    def call(self, path, body=None, method=None):
        method = method or ("GET" if body is None else "POST")
        headers = {"Content-Type": "application/json"}
        if method != "GET":
            csrf = self.call("/csrf")
            headers[csrf["headerName"]] = csrf["token"]
        req = urllib.request.Request(
            BASE + path,
            data=None if body is None else json.dumps(body).encode(),
            headers=headers,
            method=method,
        )
        try:
            with self.opener.open(req, timeout=20) as response:
                return json.load(response)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{e.code}: {e.read().decode()}")

    def login(self, name):
        self.user = self.call("/auth/login", {"username": name, "password": PASSWORD})
        return self


def main():
    security = Client().login("security")
    personal = Client().login("carepatient")

    def organization(username, name, kind):
        try:
            admin = Client().login(username)
        except RuntimeError as e:
            if not str(e).startswith("401"):
                raise
            personal.call(
                "/ecosystem/onboard",
                {
                    "name": name,
                    "type": kind,
                    "adminUsername": username,
                    "adminName": "Synthetic organization administrator",
                    "password": PASSWORD,
                },
            )
            admin = Client().login(username)
        workspace = admin.call("/ecosystem/workspace")
        o = workspace["organization"]
        if o["name"] != name:
            raise SystemExit(
                "Existing username belongs to a different fixture; preserved."
            )
        if o["status"] == "pending":
            security.call(
                "/ecosystem/organizations/" + o["id"] + "/verify",
                {
                    "version": o["version"],
                    "status": "verified",
                    "evidence": "Synthetic demonstration fixture only. No real institution verified.",
                },
            )
        return admin

    admin = organization("hospitaladmin", "NorthStar Hospital — Synthetic", "hospital")
    try:
        patient = Client().login("hospitalalice")
    except RuntimeError as e:
        if not str(e).startswith("401"):
            raise
        Client().call(
            "/auth/register",
            {
                "username": "hospitalalice",
                "displayName": "Alice Morgan",
                "password": PASSWORD,
            },
        )
        patient = Client().login("hospitalalice")
    users = {}
    clients = {}
    jobs = [
        ("hospitaldoctor", "physician", "Dr Smith", "Emergency Department"),
        ("hospitalnurse", "nurse", "Nurse Williams", "Emergency Department"),
        ("hospitallab", "laboratory_technician", "Technician Lee", "Laboratory"),
        ("hospitalimaging", "radiology_technician", "Technician Patel", "Radiology"),
        ("hospitalradiologist", "radiologist", "Dr Ahmed", "Radiology"),
        ("hospitalpharmacy", "pharmacist", "Pharmacist Davis", "Pharmacy"),
        ("hospitalbilling", "billing_staff", "Billing Taylor", "Billing"),
        ("hospitalreception", "receptionist", "Reception Jordan", "Reception"),
    ]
    now = datetime.datetime.now(datetime.timezone.utc)
    expiry = (now + datetime.timedelta(days=90)).isoformat()
    nodes = admin.call("/ecosystem/workspace")["nodes"]
    for department in dict.fromkeys(x[3] for x in jobs):
        if not any(n["name"] == department for n in nodes):
            nodes.append(
                admin.call(
                    "/ecosystem/nodes",
                    {
                        "kind": "department",
                        "name": department,
                        "details": "Synthetic hospital department",
                    },
                )
            )
    for username, job, name, department in jobs:
        member = next(
            (
                e
                for e in admin.call("/ecosystem/workspace")["staff"]
                if e["name"] == name
            ),
            None,
        )
        if not member:
            inv = admin.call(
                "/ecosystem/invitations",
                {
                    "username": username,
                    "professionalRole": job,
                    "department": department,
                },
            )
            Client().call(
                "/ecosystem/invitations/accept",
                {
                    "invitationToken": inv["invitationToken"],
                    "name": name,
                    "password": PASSWORD,
                },
            )
            member = next(
                e
                for e in admin.call("/ecosystem/workspace")["staff"]
                if e["name"] == name
            )
            admin.call(
                "/ecosystem/employment/" + member["id"],
                {
                    "version": member["version"],
                    "professionalRole": job,
                    "department": department,
                    "nodeId": next(n["id"] for n in nodes if n["name"] == department),
                    "status": "active",
                    "credentialStatus": "verified",
                    "credentialUntil": expiry,
                    "license": "SYNTHETIC-ONLY",
                    "jurisdiction": "Synthetic",
                    "specialty": "General care",
                    "evidence": "Synthetic demonstration; no real license checked",
                },
                "PATCH",
            )
        c = Client().login(username)
        clients[username] = c
        users[username] = c.user
    admin.call("/care/registration", {"healthId": patient.user["healthId"]})
    allscopes = [
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
    assignments = admin.call("/care/assignments")
    grants = patient.call("/consents")
    for username, u in users.items():
        scopes = (
            ["registration"] if u["role"] in ["reception", "billing"] else allscopes
        )
        if u["role"] == "billing":
            continue
        if not any(
            a["staff_id"] == u["id"] and a["patient_id"] == patient.user["id"]
            for a in assignments
        ):
            admin.call(
                "/care/assignments",
                {
                    "healthId": patient.user["healthId"],
                    "staffId": u["id"],
                    "scopes": scopes,
                    "expiresAt": expiry,
                },
            )
        if u["role"] != "reception" and not any(
            g["grantee_id"] == u["id"] and g["status"] == "active" for g in grants
        ):
            patient.call(
                "/consents",
                {
                    "patientId": patient.user["id"],
                    "granteeId": u["id"],
                    "purpose": "treatment",
                    "scopes": allscopes,
                    "expiresAt": expiry,
                },
            )
    workspace = admin.call("/ecosystem/workspace")
    start = now.replace(hour=12, minute=0, second=0, microsecond=0)
    end = start + datetime.timedelta(hours=10)
    # A shift still being open does not make its earlier appointment bookable.
    # Keep the whole fixture window in the future when setup runs later in the day.
    if start < now:
        start += datetime.timedelta(days=1)
        end += datetime.timedelta(days=1)
    for username in [
        "hospitaldoctor",
        "hospitalnurse",
        "hospitallab",
        "hospitalimaging",
    ]:
        e = next(e for e in workspace["staff"] if e["user_id"] == users[username]["id"])
        if not any(
            s["employee_id"] == e["id"]
            and s["starts_at"] == start.isoformat().replace("+00:00", "Z")
            for s in workspace["shifts"]
        ):
            admin.call(
                "/ecosystem/shifts",
                {
                    "employeeId": e["id"],
                    "nodeId": e["node_id"],
                    "kind": "shift",
                    "startsAt": start.isoformat(),
                    "endsAt": end.isoformat(),
                    "publicBooking": username == "hospitaldoctor",
                    "specialty": "General care",
                },
            )
    appointments = clients["hospitaldoctor"].call("/care/workspace")["appointments"]
    appointment = next(
        (a for a in appointments if a["patient_id"] == patient.user["id"]), None
    )
    if not appointment:
        appointment = admin.call(
            "/care/appointments",
            {
                "patientId": patient.user["id"],
                "doctorId": users["hospitaldoctor"]["id"],
                "startsAt": (start + datetime.timedelta(hours=2)).isoformat(),
                "duration": 30,
                "mode": "in_person",
                "requestKey": "ecosystem-demo-appointment",
            },
        )
    doctor = clients["hospitaldoctor"]
    nurse = clients["hospitalnurse"]
    common = {"patientId": patient.user["id"], "encounterId": appointment["id"]}
    nurse.call(
        "/care/records",
        {
            **common,
            "kind": "vital",
            "title": "Alice · synthetic intake",
            "details": "Synthetic demonstration measurement",
            "observedAt": now.isoformat(),
            "sourceType": "nurse_observation",
            "measurements": {
                "pulse_bpm": 72,
                "spo2_percent": 98,
                "temperature_c": 36.8,
            },
            "idempotencyKey": "ecosystem-demo-intake",
        },
    )
    orders = []
    for kind, code, recipient in [
        ("laboratory", "CBC", "hospitallab"),
        ("imaging", "Chest X-ray", "hospitalimaging"),
    ]:
        orders.append(
            doctor.call(
                "/ecosystem/orders",
                {
                    **common,
                    "kind": kind,
                    "code": code,
                    "modality": "DX",
                    "specimenType": "whole blood",
                    "instructions": "Synthetic workflow only; no actual investigation requested.",
                    "priority": "routine",
                    "assigneeId": users[recipient]["id"],
                    "requestKey": "ecosystem-demo-" + kind,
                },
            )
        )
    doctor.call(
        "/care/tasks",
        {
            **common,
            "scope": "nursing_observation",
            "assigneeId": users["hospitalnurse"]["id"],
            "title": "Alice · intake and handoff",
            "details": "Record observations and prepare a handoff for the incoming care team. Synthetic only.",
            "priority": "routine",
            "location": "Emergency · Bed 4",
            "taskType": "follow_up_assessment",
            "dueAt": (now + datetime.timedelta(hours=2)).isoformat(),
            "requestKey": "ecosystem-demo-task",
        },
    )
    profiles = patient.call("/insurance/profiles")
    profile = next(
        (p for p in profiles if p["company"] == "Synthetic Example Insurance"), None
    )
    if not profile:
        profile = patient.call(
            "/insurance/profiles",
            {
                "company": "Synthetic Example Insurance",
                "plan": "Synthetic Family Plan",
                "memberId": "SYNTHETIC-ALICE-01",
                "groupId": "SYNTHETIC-GROUP",
                "policyholder": "Alice Morgan (Synthetic)",
                "relationship": "self",
                "coverageOrder": "primary",
                "effectiveDate": "2026-01-01",
                "expirationDate": "2027-12-31",
                "coverageSummary": "Training fixture. Not real coverage.",
            },
        )
    if not any(
        s["profile_id"] == profile["id"] and s["status"] == "active"
        for s in patient.call("/insurance/shares")
    ):
        patient.call(
            "/insurance/shares",
            {
                "profileId": profile["id"],
                "organizationId": admin.user["organizationId"],
                "granteeId": users["hospitalbilling"]["id"],
                "purpose": "eligibility",
                "expiresAt": expiry,
            },
        )
    clients["hospitalbilling"].call(
        "/insurance/profiles/" + profile["id"] + "/eligibility",
        {"requestKey": "ecosystem-demo-eligibility"},
    )
    insurer = organization(
        "hospitalinsurer", "Synthetic Example Insurance Marketplace", "insurer"
    )
    plans = insurer.call("/insurance/plans")
    if not plans:
        plans = [
            insurer.call(
                "/insurance/plans",
                {
                    "name": "Synthetic Clear Plan",
                    "region": "New Jersey",
                    "networkType": "PPO",
                    "currency": "USD",
                    "monthlyPremium": 300,
                    "deductible": 1000,
                    "copay": "$20 synthetic",
                    "coinsurance": "20% synthetic",
                    "outOfPocket": 5000,
                    "coverage": "Fictional plan for comparison training",
                    "eligibility": "Synthetic example only",
                },
            )
        ]
    for plan in plans:
        if plan["status"] == "pending":
            security.call(
                "/insurance/plans/" + plan["id"] + "/review",
                {
                    "version": plan["version"],
                    "status": "approved",
                    "reason": "Synthetic comparison plan; no actual insurance offer.",
                },
            )
    evidence = {
        "synthetic": True,
        "organization": admin.call("/ecosystem/workspace")["organization"],
        "patient": patient.user,
        "staff": users,
        "admin": admin.user,
        "insurer": insurer.user,
        "appointment": appointment,
        "orders": orders,
    }
    (ROOT / "docs/evidence/ecosystem-demo.json").write_text(
        json.dumps(evidence, indent=2) + "\n"
    )
    print(
        "Synthetic NorthStar hospital ready. Accounts: hospitaladmin, hospitaldoctor, hospitalnurse, hospitallab, hospitalimaging, hospitalradiologist, hospitalpharmacy, hospitalbilling, hospitalreception, hospitalinsurer, hospitalalice. Use the existing local demo password in LOCAL_ACCESS.txt."
    )


if __name__ == "__main__":
    main()
