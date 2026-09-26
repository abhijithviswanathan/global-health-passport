import type { Row, Action } from "../../care/contracts";
import type { EcosystemActionContext } from "./context";
import { findSlots, bookSlot } from "./appointments";
import {
  onboardOrganization,
  createNode,
  reviewNode,
  reviewOrganization,
} from "./organization";
import {
  inviteStaff,
  createShift,
  delegatePrivileges,
  updateShift,
  reviewStaff,
} from "./workforce";
import {
  createOrder,
  nursingCare,
  sendHandoff,
  careTask,
  receiveHandoff,
  selectedCareTask,
  progressOrder,
} from "./clinical";
import {
  createInsuranceProfile,
  createPlan,
  editInsuranceProfile,
  reviewPlan,
  checkEligibility,
} from "./insurance";

/** Ordered form factories preserve the public action order for both clients. */
const builders: ((input: EcosystemActionContext) => Action[])[] = [
  findSlots,
  onboardOrganization,
  createNode,
  inviteStaff,
  createShift,
  delegatePrivileges,
  createOrder,
  nursingCare,
  sendHandoff,
  careTask,
  createInsuranceProfile,
  createPlan,
  bookSlot,
  editInsuranceProfile,
  reviewNode,
  updateShift,
  reviewStaff,
  reviewOrganization,
  reviewPlan,
  receiveHandoff,
  checkEligibility,
  selectedCareTask,
  progressOrder,
];
export function actions(
  role: string,
  section: string,
  selected: Row | null,
  d: Row,
): Action[] {
  const input = { role, section, selected, d };
  return builders.flatMap((build) => build(input));
}
