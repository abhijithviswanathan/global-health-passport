import type { Row, Action } from "../contracts";
import type { CareActionContext } from "./context";
import {
  newRecord,
  registerPatient,
  readFreshnessRules,
  selectedRecord,
} from "./records";
import { newTask, selectedTask } from "./tasks";
import {
  newConversation,
  conversationReply,
  reviewedDecision,
} from "./messages";
import { newAppointment, appointmentStage } from "./schedule";
import {
  assignPatient,
  provisionStaff,
  freshnessRule,
  staffAccess,
  clinicalVerification,
} from "./staff";

/** Ordered form factories preserve the public action order for both clients. */
const builders: ((input: CareActionContext) => Action[])[] = [
  newRecord,
  newTask,
  newConversation,
  newAppointment,
  assignPatient,
  registerPatient,
  provisionStaff,
  readFreshnessRules,
  selectedRecord,
  selectedTask,
  conversationReply,
  appointmentStage,
  reviewedDecision,
  freshnessRule,
  staffAccess,
  clinicalVerification,
];
export function actions(
  role: string,
  tab: string,
  context: Row = {},
): Action[] {
  const input = { role, tab, context };
  return builders.flatMap((build) => build(input));
}
