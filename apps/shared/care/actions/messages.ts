/** Action builders for messages; they describe forms but never grant server permission. */
import type { CareActionContext } from "./context";
import type { Action } from "../contracts";
import { patient, encounter, scope } from "../definitions";
import { messageAction } from "../forms";

export function newConversation(input: CareActionContext): Action[] {
  const { tab } = input;
  const a: Action[] = [];

  if (tab === "Messages")
    a.push({
      id: "conversation",
      label: "Start a conversation",
      path: "/care/conversations",
      fields: [
        { ...patient, optional: true },
        encounter,
        scope,
        {
          key: "kind",
          label: "Conversation type",
          type: "select",
          options: ["patient", "encounter", "direct", "group", "department"],
        },
        { key: "title", label: "Conversation title" },
        {
          key: "members",
          label: "Participants",
          type: "multi",
          source: "staff",
        },
      ],
    });
  return a;
}

export function conversationReply(input: CareActionContext): Action[] {
  const { context } = input;
  const a: Action[] = [];

  if (context.conversation)
    a.push(messageAction({ conversationId: context.conversation.id }));
  return a;
}

export function reviewedDecision(input: CareActionContext): Action[] {
  const { role, context } = input;
  const a: Action[] = [];

  if (context.message && role === "doctor")
    a.push({
      id: "promote",
      label: "Record a reviewed clinical decision",
      path: `/care/messages/${context.message.id}/record`,
      fields: [
        { key: "title", label: "Decision title" },
        { key: "details", label: "Reviewed decision", type: "long" },
        {
          key: "reviewed",
          label: "I reviewed this decision for the patient record",
          type: "check",
        },
      ],
    });
  return a;
}
