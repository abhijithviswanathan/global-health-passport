/** Care-team contracts: shared by the web and native renderers. */
/* eslint-disable @typescript-eslint/no-explicit-any -- permission-scoped legacy API rows */

export type Row = Record<string, any>;

export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "long"
    | "select"
    | "multi"
    | "number"
    | "check"
    | "datetime"
    | "password";
  options?: string[];
  source?: string;
  optional?: boolean;
  value?: any;
};

export type Action = {
  id: string;
  label: string;
  path: string;
  method?: string;
  fields: Field[];
  fixed?: Row;
};
