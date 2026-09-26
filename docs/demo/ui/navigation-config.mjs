/** Visible sections for each public-demo perspective. */
export const navs = {
  doctor: [
    ["overview", "Today", "home"],
    ["patients", "Patients", "people"],
    ["requests", "Care requests", "list"],
    ["prescriptions", "Prescriptions", "plus"],
    ["reports", "Reports", "list"],
    ["appointments", "Schedule", "clock"],
    ["messages", "Messages", "mail"],
    ["inbox", "Inbox", "bell"],
  ],
  nurse: [
    ["queue", "My work queue", "list"],
    ["timeline", "Care timeline", "clock"],
    ["inbox", "Inbox", "bell"],
  ],
  patient: [
    ["overview", "My health", "heart"],
    ["requests", "Requests & sharing", "lock"],
    ["prescriptions", "Prescriptions", "plus"],
    ["reports", "My reports", "list"],
    ["appointments", "Appointments", "clock"],
    ["messages", "Messages", "mail"],
    ["timeline", "My timeline", "clock"],
    ["inbox", "Inbox", "bell"],
  ],
  pharmacy: [
    ["prescriptions", "Prescription queue", "plus"],
    ["inbox", "Inbox", "bell"],
  ],
  lab: [
    ["queue", "Sample queue", "list"],
    ["inbox", "Inbox", "bell"],
  ],
};
