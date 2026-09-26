import type { Row } from "../../care/contracts";
export type EcosystemActionContext = {
  role: string;
  section: string;
  selected: Row | null;
  d: Row;
};
