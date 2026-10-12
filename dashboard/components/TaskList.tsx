"use client";

import { useState, useTransition } from "react";
import type { TaskRow } from "@/lib/tasks";
import { addTask, setTaskDone } from "@/app/dashboard/task-actions";

export function TaskList({ initialTasks }: { initialTasks: TaskRow[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleToggle(task: TaskRow) {
    const done = !task.done;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done } : t)));
    startTransition(async () => {
      await setTaskDone(task.id, done);
    });
  }

  function handleAdd() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    startTransition(async () => {
      await addTask(text);
    });
  }

  return (
    <section className="rounded-xl border border-[color:var(--border-hairline)] bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink-primary">Tasks</h2>
      <div className="mb-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
          placeholder="Add a task…"
          className="flex-1 rounded-lg border border-[color:var(--border-hairline)] bg-[color:var(--page-plane)] px-3 py-1.5 text-sm text-ink-primary"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draft.trim() || isPending}
          className="rounded-lg bg-[color:var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-ink-muted">No tasks yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => handleToggle(task)}
                className="h-4 w-4 accent-[color:var(--accent)]"
              />
              <span className={task.done ? "text-ink-muted line-through" : "text-ink-primary"}>
                {task.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
