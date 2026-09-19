/** Fictional, public presentation fixtures. No real patient data or medical advice. */
export const people = [
  {
    id: 0,
    name: "Alice Morgan",
    age: 34,
    job: "Museum programme coordinator",
    healthId: "KW6V6HRCU",
    story: "Review of a recent cough and fatigue episode",
    history:
      "Chief complaint: dry cough and tiredness for three days during a busy exhibition week. Onset gradual; symptoms more noticeable late in the day. No previous similar episode recorded in this fictional story. Past history: seasonal nasal symptoms. Family history: parent with high blood pressure. Personal history: walks to work, does not smoke, lives with a partner. Occupation: museum programme coordinator. Fictional address: 14 Example Lane, Demo District. No real contact information.",
    allergy:
      "Patient reports a rash after penicillin as a teenager; timing and original documentation are not available. Demonstrates a patient-reported allergy requiring reconciliation, not verified testing.",
    plan: "Review the attached fictional reports, reconcile the reported allergy, document the discussion and confirm the next follow-up with Alice. No real treatment instruction.",
    vitals: {
      temperature_c: 36.8,
      spo2_percent: 98,
      pulse_bpm: 76,
      systolic_mmhg: 118,
      diastolic_mmhg: 76,
    },
    room: "Clinic A · Room 2",
    time: "08:00",
    initials: "AM",
  },
  {
    id: 1,
    name: "Noah Bennett",
    age: 52,
    job: "Bus route dispatcher",
    healthId: "CAGNH5SDP",
    story: "Routine health review with blood work pending",
    history:
      "Chief complaint: routine annual review and a request to discuss occasional tiredness after rotating shifts. Symptoms occur near the end of a long workday. Past history: no surgeries reported in this fictional record. Family history: sibling with raised cholesterol. Personal history: irregular sleep during shift changes; enjoys weekend gardening. Occupation: bus route dispatcher. Fictional address: 22 Sample Crescent, Demo District.",
    allergy:
      "No medication allergies reported at this fictional intake. This is a reported history, not an assertion that every exposure is safe.",
    plan: "Keep the laboratory task visible until the result arrives. Show how the clinician can prepare a draft and return later without copying the patient history.",
    vitals: {
      temperature_c: 36.6,
      spo2_percent: 99,
      pulse_bpm: 70,
      systolic_mmhg: 126,
      diastolic_mmhg: 80,
    },
    room: "Clinic A · Room 3",
    time: "08:30",
    initials: "NB",
  },
  {
    id: 2,
    name: "Fatima Rahman",
    age: 28,
    job: "Product illustrator",
    healthId: "TWH6XXC2Q",
    story: "Follow-up for recurring seasonal nasal symptoms",
    history:
      "Chief complaint: sneezing and itchy eyes recurring during spring cleaning. Onset intermittent over two weeks; patient notices symptoms around dusty storage boxes. Past history: similar seasonal symptoms in prior years. Family history: sibling reports hay-fever symptoms. Personal history: works from a home studio, no tobacco use reported. Occupation: product illustrator. Fictional address: 8 Illustration Walk, Demo District.",
    allergy:
      "No drug allergies reported; patient describes sensitivity to dust. Keep environmental symptoms distinct from a confirmed drug allergy.",
    plan: "Use the follow-up task and message thread to confirm the symptom history and reconcile the demonstration medication list. No real prescribing advice.",
    vitals: {
      temperature_c: 36.5,
      spo2_percent: 99,
      pulse_bpm: 74,
      systolic_mmhg: 112,
      diastolic_mmhg: 72,
    },
    room: "Clinic B · Room 1",
    time: "09:00",
    initials: "FR",
  },
  {
    id: 3,
    name: "Leo Fernandes",
    age: 41,
    job: "Primary-school teacher",
    healthId: "ZLNACMBWM",
    story: "Ankle discomfort after a weekend walk; imaging pending",
    history:
      "Chief complaint: left ankle discomfort after stepping off a low kerb during a weekend walk. Patient reports swelling later that evening and discomfort on stairs. Past history: a similar minor injury several years ago; no operation reported. Family history: no relevant condition reported in the fictional interview. Personal history: active at school, enjoys hiking. Occupation: primary-school teacher. Fictional address: 31 Storybook Road, Demo District.",
    allergy:
      "Patient reports nausea with an unnamed pain medicine; original name and circumstances are unknown. Demonstrates an unreconciled intolerance rather than a confirmed allergy.",
    plan: "Coordinate the imaging appointment, document the reported symptoms and leave the report-review task open until a report is available.",
    vitals: {
      temperature_c: 36.7,
      spo2_percent: 98,
      pulse_bpm: 78,
      systolic_mmhg: 122,
      diastolic_mmhg: 78,
    },
    room: "Clinic B · Room 4",
    time: "09:30",
    initials: "LF",
  },
];

export const roles = {
  doctor: {
    name: "Dr Smith",
    title: "Doctor",
    initials: "DS",
    home: "overview",
  },
  nurse: {
    name: "Nurse Williams",
    title: "Nurse",
    initials: "NW",
    home: "queue",
  },
  patient: {
    name: "Alice Morgan",
    title: "Patient",
    initials: "AM",
    home: "overview",
  },
  pharmacy: {
    name: "Pharmacist Davis",
    title: "Pharmacy",
    initials: "PD",
    home: "prescriptions",
  },
  lab: {
    name: "Technician Lee",
    title: "Laboratory",
    initials: "TL",
    home: "queue",
  },
};
export const scopes = {
  records: {
    title: "History & reports",
    detail: "Dr Smith can read the shared history, allergies and reports.",
  },
  care: {
    title: "Nursing & follow-up",
    detail:
      "Dr Smith and assigned Nurse Williams can coordinate tasks, observations and follow-up; Technician Lee receives assigned specimen work.",
  },
  prescriptions: {
    title: "Prescriptions",
    detail:
      "Dr Smith and the assigned demonstration pharmacy can manage prescription details.",
  },
};
export const taskTypes = {
  vitals: {
    title: "Record pre-visit observations",
    detail:
      "Confirm the fictional patient and record temperature, oxygen saturation, pulse and blood pressure before the consultation.",
    result:
      "Sample intake observations recorded. Patient identity and observation time confirmed for this demonstration.",
  },
  specimen: {
    title: "Collect the requested blood sample",
    detail:
      "Confirm the fictional patient and CBC order, label the sample, and hand it to Technician Lee. Collection does not mean a result is ready.",
    result:
      "Fictional EDTA sample labelled and handed to the laboratory. Analysis is pending.",
  },
  followup: {
    title: "Coordinate a follow-up visit",
    detail:
      "Contact the patient through the demonstration inbox and confirm the next appointment arrangements.",
    result:
      "Follow-up coordination note added. The patient still confirms any appointment invitation separately.",
  },
};
export const medicine = {
  name: "DemoCare A",
  strength: "10 mg",
  form: "Example tablet",
  dose: "1 example tablet",
  route: "Oral (illustrative)",
  frequency: "Once daily (illustrative)",
  duration: "5 days",
  quantity: 5,
  refills: 0,
  instructions:
    "Fictional directions to demonstrate a prescription layout. This invented medicine must not be taken or prescribed.",
};
export const sampleReport = {
  name: "Complete blood count",
  specimen: "Fictional EDTA whole blood",
  values: [
    ["White blood cells", "6.8", "×10⁹/L"],
    ["Haemoglobin", "13.2", "g/dL"],
    ["Platelets", "254", "×10⁹/L"],
  ],
};
export const demoStart = Date.parse("2026-09-11T08:00:00-04:00");
