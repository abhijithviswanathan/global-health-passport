/** Communication commands change one draft transaction and return user feedback. */
import { people, roles } from "../../data.mjs";
import { requireRole, requireScope, find } from "../guards.mjs";

function sendMessage(context) {
  const { state, role, patient, at } = context;
  requireRole(role, "patient", "doctor");
  if (role === "doctor") requireScope(state, patient, "care");
  const body =
    role === "patient"
      ? "I have a question about my sample prescription. Can we discuss it at my follow-up?"
      : "Thank you. I have seen your demonstration message and will discuss your questions at the follow-up.";
  const to = role === "patient" ? "doctor" : "patient";
  state.messages.push({
    id: context.nextId("message"),
    patient,
    from: role,
    to,
    body,
    createdAt: at,
  });
  context.notify(
    to,
    patient,
    "New message from " +
      (role === "patient" ? people[patient].name : "Dr Smith"),
    body,
    "messages",
  );
  context.recordEvent(
    patient,
    "Care message sent",
    "A demonstration message was added; it does not change treatment or complete a clinical task.",
  );
  return "Example message delivered to the other perspective.";
}

function readNotice(context, input) {
  const { state, role, patient } = context;
  requireRole(role, ...Object.keys(roles));
  const n = find(state.notifications, input.id);
  if (n.role !== role || (role === "patient" && n.patient !== patient))
    throw new Error("This notification belongs to another perspective.");
  n.read = true;
  return "Notification opened.";
}

function readNotices(context) {
  const { state, role, patient } = context;
  requireRole(role, ...Object.keys(roles));
  state.notifications
    .filter(
      (n) => n.role === role && (role !== "patient" || n.patient === patient),
    )
    .forEach((n) => (n.read = true));
  return "Demo notifications marked as read.";
}

export const communicationCommands = Object.freeze({
  "send-message": sendMessage,
  "read-notice": readNotice,
  "read-notices": readNotices,
});
