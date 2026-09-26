/** Fresh public fixtures for each independent demo session. */
import { scopes, medicine, demoStart } from "../data.mjs";
export function createState() {
  return {
    tick: 0,
    sequence: 20,
    requests: [
      {
        id: "access-noah",
        patient: 1,
        status: "pending",
        scope: ["records", "care"],
        requestedAt: demoStart - 600000,
      },
    ],
    grants: [2, 3].map((patient) => ({
      patient,
      scope: Object.keys(scopes),
      expiresAt: demoStart + 7 * 86400000,
    })),
    tasks: [
      {
        id: "task-fatima",
        patient: 2,
        type: "vitals",
        status: "accepted",
        priority: "Routine",
        due: "09:00",
        createdAt: demoStart - 1200000,
      },
      {
        id: "task-leo",
        patient: 3,
        type: "specimen",
        status: "requested",
        priority: "Routine",
        due: "09:30",
        createdAt: demoStart - 600000,
      },
    ],
    prescriptions: [
      {
        id: "rx-fatima",
        patient: 2,
        status: "ready",
        medicine: { ...medicine, name: "SampleMed B" },
        createdAt: demoStart - 86400000,
        read: true,
      },
    ],
    reports: [
      {
        id: "report-alice",
        patient: 0,
        kind: "cbc",
        status: "reviewed",
        observedAt: demoStart - 86400000,
        createdAt: demoStart - 3600000,
      },
    ],
    labs: [],
    observations: [],
    appointments: [],
    messages: [
      {
        id: "msg-fatima",
        patient: 2,
        from: "doctor",
        to: "patient",
        body: "Your demonstration prescription is ready at Harbor Pharmacy. Open Prescriptions to see the collection status.",
        createdAt: demoStart - 600000,
      },
    ],
    events: [],
    notifications: [
      {
        id: "notice-nurse",
        role: "nurse",
        patient: 3,
        title: "New request from Dr Smith",
        detail:
          "Collect the requested blood sample · Leo Fernandes · due 09:30.",
        view: "queue",
        read: false,
        at: demoStart - 600000,
      },
      {
        id: "notice-noah",
        role: "patient",
        patient: 1,
        title: "Dr Smith requested access",
        detail: "Review the history and nursing scopes before sharing.",
        view: "requests",
        read: false,
        at: demoStart - 600000,
      },
      {
        id: "notice-fatima",
        role: "patient",
        patient: 2,
        title: "Your sample prescription is ready",
        detail: "Harbor Pharmacy · SampleMed B · fictional example.",
        view: "prescriptions",
        read: false,
        at: demoStart - 600000,
      },
    ],
  };
}
