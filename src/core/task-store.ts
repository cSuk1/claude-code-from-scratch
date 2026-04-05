// Task store — in-memory task management for the agent.
// LLM creates/updates tasks via tools; the UI renders them dynamically.

// ─── Types ──────────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskStep {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
}

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  steps?: TaskStep[];
  /** Present continuous form shown while in_progress, e.g. "Running tests" */
  activeForm?: string;
}

export interface TaskUpdateFields {
  subject?: string;
  description?: string;
  status?: TaskStatus | "deleted";
  steps?: TaskStep[];
  activeForm?: string;
}

// ─── Store ──────────────────────────────────────────────────

class TaskStore {
  private tasks = new Map<string, Task>();
  private nextId = 1;
  private nextStepId = 1;
  private changeListeners: Array<() => void> = [];

  /** Register a callback that fires on every mutation */
  onChange(fn: () => void): () => void {
    this.changeListeners.push(fn);
    return () => {
      this.changeListeners = this.changeListeners.filter((f) => f !== fn);
    };
  }

  private notify(): void {
    for (const fn of this.changeListeners) {
      try { fn(); } catch { }
    }
  }

  /** Create a new task. Returns the created task. */
  create(subject: string, description: string, steps?: TaskStep[], activeForm?: string): Task {
    const id = String(this.nextId++);

    const processedSteps = steps?.map((step, index) => ({
      ...step,
      id: step.id || `${id}.${index + 1}`,
      status: step.status || "pending" as TaskStatus,
    }));

    const task: Task = {
      id,
      subject,
      description,
      status: "pending",
      steps: processedSteps,
      activeForm,
    };
    this.tasks.set(id, task);
    this.notify();
    return task;
  }

  /** Update a task's fields. Returns the updated task, or null if not found.
   *  Pass status="deleted" to remove the task entirely. */
  update(id: string, fields: TaskUpdateFields): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    if (fields.status === "deleted") {
      this.tasks.delete(id);
      this.notify();
      return null;
    }

    if (fields.subject !== undefined) task.subject = fields.subject;
    if (fields.description !== undefined) task.description = fields.description;
    if (fields.status !== undefined) task.status = fields.status as TaskStatus;
    if (fields.steps !== undefined) task.steps = fields.steps;
    if (fields.activeForm !== undefined) task.activeForm = fields.activeForm;

    this.notify();
    return task;
  }

  /** Get a single task by ID */
  get(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  /** List all tasks (ordered by ID) */
  list(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => Number(a.id) - Number(b.id)
    );
  }

  /** Check if there are any non-completed tasks */
  hasActiveTasks(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status !== "completed") return true;
    }
    return this.tasks.size > 0;
  }

  /** Reset everything (used by /clear) */
  clear(): void {
    this.tasks.clear();
    this.nextId = 1;
    this.nextStepId = 1;
    this.notify();
  }
}

// ─── Singleton ──────────────────────────────────────────────

export const taskStore = new TaskStore();
