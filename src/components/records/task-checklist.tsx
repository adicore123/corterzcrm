"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks } from "lucide-react";
import { TaskProgress } from "@/components/record-cells";
import { requestJson } from "@/lib/client-api";
import type { Standard } from "@/lib/validation/models";

export function TaskChecklist({ record, readOnly = false }: { record: Standard; readOnly?: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(record.tasks);
  const [version, setVersion] = useState(record.updatedAt);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function toggle(taskId: string) {
    if (readOnly || busyId) return;
    const nextTasks = tasks.map((task) => task.id === taskId ? { ...task, done: !task.done } : task);
    setBusyId(taskId);
    setError("");
    try {
      const saved = await requestJson<{ updatedAt: string }>("/api/records/standards/" + record.id, "PATCH", {
        tasks: nextTasks,
        version,
      });
      setTasks(nextTasks);
      setVersion(saved.updatedAt);
      startTransition(() => router.refresh());
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusyId("");
    }
  }

  return <section className="card detail-card">
    <div className="section-heading">
      <h2><span className="section-icon"><ListChecks size={18} /></span>מה נשאר לעשות?</h2>
      <TaskProgress tasks={tasks} />
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {tasks.length ? <ul className="task-list">{tasks.map((task) =>
      <li key={task.id} className={task.done ? "task-done" : ""}>
        <button type="button" className="task-toggle" disabled={readOnly || Boolean(busyId)} onClick={() => toggle(task.id)}
          aria-pressed={task.done} aria-label={(task.done ? "ביטול סימון משימה: " : "סימון משימה כהושלמה: ") + task.title}>
          <span className="task-state" aria-hidden>{task.done && <Check size={15} />}</span>
          <span>{task.title}</span>
        </button>
      </li>)}</ul> : <p className="muted">אין משימות בתיק.</p>}
  </section>;
}
