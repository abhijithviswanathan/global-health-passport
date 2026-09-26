/** Action builders for tasks; they describe forms but never grant server permission. */
import type { CareActionContext } from "./context";
import type { Action, Row } from "../contracts";
import { patient, encounter, scope } from "../definitions";
import { messageAction } from "../forms";

export function newTask(input: CareActionContext): Action[] {
  const { tab } = input;
  const a: Action[] = [];

  if (tab === "Tasks")
    a.push({
      id: "task",
      label: "Assign a task",
      path: "/care/tasks",
      fields: [
        { ...patient, optional: true },
        encounter,
        scope,
        { key: "title", label: "Task title" },
        { key: "details", label: "Instructions", type: "long" },
        {
          key: "assigneeId",
          label: "Assignee (leave blank for a team)",
          type: "select",
          source: "staff",
          optional: true,
        },
        {
          key: "team",
          label: "Team department (if no assignee)",
          optional: true,
        },
        {
          key: "priority",
          label: "Priority",
          type: "select",
          options: ["routine", "high", "urgent"],
        },
        {
          key: "dueAt",
          label: "Due date and time with UTC offset",
          type: "datetime",
          optional: true,
        },
        {
          key: "acknowledgeBy",
          label: "Acknowledge by (with UTC offset)",
          type: "datetime",
          optional: true,
        },
      ],
    });
  return a;
}

export function selectedTask(input: CareActionContext): Action[] {
  const { context } = input;
  const a: Action[] = [];

  const t = context.task as Row | undefined;
  if (t) {
    if (!t.assignee_id || t.assignee_id === context.userId) {
      const next: Record<string, string[]> = {
        open: ["accepted", "cancelled", "escalated"],
        accepted: [
          "in_progress",
          "blocked",
          "waiting",
          "cancelled",
          "escalated",
        ],
        in_progress: [
          "completed",
          "blocked",
          "waiting",
          "cancelled",
          "escalated",
        ],
        blocked: ["in_progress", "cancelled"],
        waiting: ["in_progress", "cancelled"],
        escalated: ["in_progress", "cancelled"],
      };
      if (next[t.status])
        a.push({
          id: "taskstatus",
          label: t.status === "open" ? "Accept task" : "Update task",
          path: `/care/tasks/${t.id}`,
          method: "PATCH",
          fixed: { version: t.version },
          fields: [
            {
              key: "status",
              label: "Next status",
              type: "select",
              options: next[t.status],
            },
            {
              key: "comment",
              label: "Acknowledgment or progress",
              type: "long",
            },
          ],
        });
    }
    if (
      t.status === "completed" &&
      !t.verified_by &&
      t.creator_id === context.userId &&
      t.assignee_id !== context.userId
    )
      a.push({
        id: "verifytask",
        label: "Verify completed task",
        path: `/care/tasks/${t.id}/verify`,
        fixed: { version: t.version },
        fields: [
          { key: "comment", label: "Independent verification", type: "long" },
        ],
      });
    a.push(messageAction({ taskId: t.id }));
  }
  return a;
}
