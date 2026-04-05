import { taskStore, type TaskStep } from "../../core/task-store.js";

interface TaskStepInput {
  title: string;
  description?: string;
}

export function taskCreate(input: { subject: string; description: string; steps?: TaskStepInput[]; activeForm?: string }): string {
  const steps: TaskStep[] | undefined = input.steps?.map((step, index) => ({
    id: `1.${index + 1}`,
    title: step.title,
    description: step.description,
    status: "pending",
  }));

  const task = taskStore.create(input.subject, input.description, steps, input.activeForm);

  let result = `Task #${task.id} created: ${task.subject}`;
  if (task.steps && task.steps.length > 0) {
    result += `\n\nSteps:\n`;
    for (const step of task.steps) {
      result += `  • ${step.title}${step.description ? ` - ${step.description}` : ""}\n`;
    }
  }
  return result;
}

export function taskUpdate(input: {
  taskId: string;
  status?: string;
  subject?: string;
  description?: string;
  steps?: Array<{ id?: string; title?: string; description?: string; status?: string }>;
  activeForm?: string;
}): string {
  let steps: TaskStep[] | undefined;

  if (input.steps) {
    const task = taskStore.get(input.taskId);
    if (task) {
      steps = [...(task.steps || [])];
      for (const stepUpdate of input.steps) {
        if (stepUpdate.id) {
          const idx = steps.findIndex((s) => s.id === stepUpdate.id);
          if (idx !== -1) {
            if (stepUpdate.title) steps[idx].title = stepUpdate.title;
            if (stepUpdate.description) steps[idx].description = stepUpdate.description;
            if (stepUpdate.status) steps[idx].status = stepUpdate.status as TaskStep["status"];
          }
        } else {
          const newStep: TaskStep = {
            id: `${task.id}.${steps.length + 1}`,
            title: stepUpdate.title || "",
            description: stepUpdate.description,
            status: (stepUpdate.status as TaskStep["status"]) || "pending",
          };
          steps.push(newStep);
        }
      }
    }
  }

  const updated = taskStore.update(input.taskId, {
    status: input.status as any,
    subject: input.subject,
    description: input.description,
    steps,
    activeForm: input.activeForm,
  });

  if (input.status === "deleted") {
    return `Task #${input.taskId} deleted.`;
  }
  if (!updated) {
    return `Error: Task #${input.taskId} not found.`;
  }

  let result = `Task #${updated.id} updated`;

  if (updated.steps && updated.steps.length > 0) {
    const completedSteps = updated.steps.filter((s) => s.status === "completed").length;
    result += `\n\nProgress: ${completedSteps}/${updated.steps.length} steps completed\n`;
    for (const step of updated.steps) {
      const stepIcon = step.status === "completed" ? "✓" : step.status === "in_progress" ? "⟳" : "○";
      result += `  ${stepIcon} ${step.id} ${step.title}\n`;
    }
  }

  const changes: string[] = [];
  if (input.status) changes.push(`status → ${input.status}`);
  if (input.subject) changes.push(`subject updated`);
  if (input.description) changes.push(`description updated`);
  if (input.steps) changes.push(`steps updated`);
  if (input.activeForm) changes.push(`activeForm updated`);

  if (changes.length > 0) {
    result += `\nChanges: ${changes.join(", ")}`;
  }

  return result;
}

export function taskList(): string {
  const tasks = taskStore.list();
  if (tasks.length === 0) return "No tasks.";

  const lines: string[] = [];
  for (const t of tasks) {
    const icon = t.status === "completed" ? "✓" : t.status === "in_progress" ? "⟳" : "○";
    let line = `${icon} #${t.id} [${t.status}] ${t.subject}`;

    if (t.steps && t.steps.length > 0) {
      const completedSteps = t.steps.filter((s) => s.status === "completed").length;
      line += ` (${completedSteps}/${t.steps.length})`;
    }

    lines.push(line);

    if (t.steps && t.steps.length > 0) {
      for (const step of t.steps) {
        const stepIcon = step.status === "completed" ? "✓" : step.status === "in_progress" ? "⟳" : "○";
        lines.push(`  ${stepIcon} ${step.id} ${step.title}`);
      }
    }
  }
  return lines.join("\n");
}
