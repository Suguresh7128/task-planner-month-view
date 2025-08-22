
import React, { useEffect, useMemo, useState } from "react";
import {
  addDays,
  subMonths,
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  isWithinInterval,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";

type Category = "To Do" | "In Progress" | "Review" | "Completed";

interface Task {
  id: string;
  name: string;
  category: Category;
  start: string; // yyyy-MM-dd
  end: string;   // yyyy-MM-dd
}

const categories: Category[] = ["To Do", "In Progress", "Review", "Completed"];
const weekdayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toISO(d: Date) {
  return format(d, "yyyy-MM-dd");
}
function fromISO(s: string) {
  return parseISO(s);
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem("tasks");
    return saved ? JSON.parse(saved) : [];
  });
  const [month, setMonth] = useState(new Date());
  const [filters, setFilters] = useState<Category[]>([]);
  const [timeFilter, setTimeFilter] = useState<number | null>(null); // weeks
  const [search, setSearch] = useState("");

  // Selection + modal state
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragEnd, setDragEnd] = useState<Date | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalRange, setModalRange] = useState<{ start: Date; end: Date } | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskCategory, setTaskCategory] = useState<Category>("To Do");

  // Resize / Move states
  const [resizing, setResizing] = useState<{ id: string; side: "left" | "right" } | null>(null);
  const [moving, setMoving] = useState<{ id: string; duration: number } | null>(null);

  const todayISO = toISO(new Date());

  useEffect(() => {
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks]);

  // Compute calendar grid (Mon-first week)
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) days.push(d);

  // Filtered tasks (category + search + time window)
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const byCategory = filters.length === 0 || filters.includes(t.category);
      const bySearch = search.trim() === "" || t.name.toLowerCase().includes(search.toLowerCase());

      let byTime = true;
      if (timeFilter) {
        const now = new Date();
        const future = addDays(now, timeFilter * 7);
        byTime =
          isWithinInterval(fromISO(t.start), { start: now, end: future }) ||
          isWithinInterval(fromISO(t.end), { start: now, end: future });
      }
      return byCategory && bySearch && byTime;
    });
  }, [tasks, filters, search, timeFilter]);

  // Grouped list under calendar (optional helper view)
  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = { "To Do": [], "In Progress": [], "Review": [], "Completed": [] };
    filteredTasks.forEach((t) => g[t.category].push(t));
    return g;
  }, [filteredTasks]);

  // Helpers
  const openCreateModal = (start: Date, end: Date) => {
    const s = start <= end ? start : end;
    const e = end >= start ? end : start;
    setModalRange({ start: s, end: e });
    setEditingTask(null);
    setTaskName("");
    setTaskCategory("To Do");
    setModalOpen(true);
  };
  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setModalRange({ start: fromISO(task.start), end: fromISO(task.end) });
    setTaskName(task.name);
    setTaskCategory(task.category);
    setModalOpen(true);
  };

  const saveTask = () => {
    if (!modalRange || taskName.trim() === "") return;
    const startISO = toISO(modalRange.start);
    const endISO = toISO(modalRange.end);
    if (editingTask) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id ? { ...t, name: taskName.trim(), category: taskCategory, start: startISO, end: endISO } : t
        )
      );
    } else {
      const newTask: Task = {
        id: Math.random().toString(36).slice(2),
        name: taskName.trim(),
        category: taskCategory,
        start: startISO < endISO ? startISO : endISO,
        end: endISO > startISO ? endISO : startISO,
      };
      setTasks((prev) => [...prev, newTask]);
    }
    setModalOpen(false);
    setModalRange(null);
    setEditingTask(null);
  };

  const deleteTask = () => {
    if (!editingTask) return;
    setTasks((prev) => prev.filter((t) => t.id != editingTask.id));
    setModalOpen(false);
    setEditingTask(null);
    setModalRange(null);
  };

  // Interaction per day tile
  const handleTileMouseDown = (d: Date) => {
    setDragStart(d);
    setDragEnd(d);
  };
  const handleTileMouseEnter = (d: Date) => {
    if (dragStart) setDragEnd(d);
    if (resizing) handleResize(resizing.id, d);
    if (moving) handleMove(moving.id, d, moving.duration);
  };
  const handleTileMouseUp = (d: Date) => {
    if (dragStart) {
      openCreateModal(dragStart, d);
      setDragStart(null);
      setDragEnd(null);
    }
    // stop resize / move at mouse up
    setResizing(null);
    setMoving(null);
  };

  // Resize
  const handleResize = (taskId: string, date: Date) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        if (resizing?.side === "left") return { ...t, start: toISO(date) };
        if (resizing?.side === "right") return { ...t, end: toISO(date) };
        return t;
      })
    );
  };

  // Move (retain duration)
  const handleStartMove = (task: Task) => {
    const dur = Math.max(0, differenceInCalendarDays(fromISO(task.end), fromISO(task.start)));
    setMoving({ id: task.id, duration: dur });
  };
  const handleMove = (taskId: string, date: Date, duration: number) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const newStart = date;
        const newEnd = addDays(date, duration);
        return { ...t, start: toISO(newStart), end: toISO(newEnd) };
      })
    );
  };

  // Day cell helpers
  const isWeekend = (d: Date) => {
    const day = d.getDay(); // 0 Sun - 6 Sat
    return day === 0 || day === 6; // weekend highlight
  };
  const isOtherMonth = (d: Date) => d.getMonth() !== month.getMonth();

  // Visual drag selection highlight
  const isInDragRange = (d: Date) => {
    if (!dragStart || !dragEnd) return false;
    const s = dragStart <= dragEnd ? dragStart : dragEnd;
    const e = dragEnd >= dragStart ? dragEnd : dragStart;
    return d >= s && d <= e;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <h1 className="text-3xl font-bold text-indigo-700">Month Task Planner</h1>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white shadow"
              onClick={() => setMonth(subMonths(month, 1))}
            >
              ◀ Prev
            </button>
            <div className="px-3 py-2 rounded-lg bg-white shadow font-semibold">{format(month, "MMMM yyyy")}</div>
            <button
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white shadow"
              onClick={() => setMonth(addMonths(month, 1))}
            >
              Next ▶
            </button>
          </div>
        </header>

        {/* Filters */}
        <section className="bg-white rounded-2xl shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by name..."
              className="border rounded-lg px-3 py-2 w-64"
            />
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <label key={c} className="flex items-center gap-2 px-3 py-2 rounded-lg border">
                  <input
                    type="checkbox"
                    checked={filters.includes(c)}
                    onChange={() =>
                      setFilters((prev) =>
                        prev.includes(c) ? prev.filter((f) => f !== c) : [...prev, c]
                      )
                    }
                  />
                  <span>{c}</span>
                </label>
              ))}
            </div>
            <select
              className="border rounded-lg px-3 py-2"
              value={timeFilter ?? ""}
              onChange={(e) => setTimeFilter(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All time</option>
              <option value="1">Within 1 week</option>
              <option value="2">Within 2 weeks</option>
              <option value="3">Within 3 weeks</option>
            </select>
          </div>
        </section>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {weekdayHeaders.map((w, i) => (
            <div
              key={w}
              className={`text-center text-xs font-semibold uppercase tracking-wide py-2 rounded ${i >= 5 ? "text-pink-700" : "text-indigo-700"}`}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <section className="grid grid-cols-7 gap-px bg-gray-300 rounded-xl overflow-hidden select-none">
          {days.map((d) => {
            const dISO = toISO(d);
            const dayTasks = filteredTasks.filter((t) =>
              isWithinInterval(fromISO(dISO), { start: fromISO(t.start), end: fromISO(t.end) })
            );

            const weekendBg = isWeekend(d) ? "bg-rose-50" : "bg-white";
            const otherMonthText = isOtherMonth(d) ? "text-gray-400" : "text-gray-700";
            const isToday = dISO === todayISO;

            return (
              <div
                key={dISO}
                className={`${weekendBg} min-h-[130px] p-1 relative ${isInDragRange(d) ? "ring-2 ring-indigo-300" : ""} ${isToday ? "outline outline-2 outline-indigo-500" : ""}`}
                onMouseDown={() => handleTileMouseDown(d)}
                onMouseEnter={() => handleTileMouseEnter(d)}
                onMouseUp={() => handleTileMouseUp(d)}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.dataset.taskid) return; // prevent conflict with task clicks
                }}
              >
                <div className={`text-xs mb-1 ${otherMonthText} ${isWeekend(d) ? "font-semibold" : ""}`}>
                  {format(d, "d")}
                </div>

                {/* tasks */}
                {dayTasks.map((t) => (
                  <div
                    key={t.id}
                    data-taskid={t.id}
                    className="relative group text-xs text-white rounded px-2 py-1 mt-1 cursor-grab active:cursor-grabbing bg-indigo-500"
                    onMouseDown={(e) => {
                      // Start MOVE (unless grabbed on handle regions)
                      const target = e.target as HTMLElement;
                      if (target.dataset.handle === "left" || target.dataset.handle === "right") return;
                      e.stopPropagation();
                      handleStartMove(t);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditModal(t);
                    }}
                  >
                    {/* left resize handle */}
                    <span
                      data-handle="left"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizing({ id: t.id, side: "left" });
                      }}
                      className="absolute left-0 top-0 h-full w-1 bg-indigo-700 opacity-0 group-hover:opacity-100 cursor-w-resize"
                    />
                    {/* label */}
                    <span className="pr-3">{t.name}</span>
                    {/* right resize handle */}
                    <span
                      data-handle="right"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setResizing({ id: t.id, side: "right" });
                      }}
                      className="absolute right-0 top-0 h-full w-1 bg-indigo-700 opacity-0 group-hover:opacity-100 cursor-e-resize"
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        {/* Grouped status list (nice helper) */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          {categories.map((c) => (
            <div key={c} className="bg-white rounded-2xl shadow p-3">
              <h3 className="font-semibold mb-2">{c}</h3>
              {grouped[c].length === 0 && <p className="text-sm text-gray-400">No tasks</p>}
              {grouped[c].map((t) => (
                <div
                  key={t.id}
                  className="bg-indigo-100 text-indigo-700 px-2 py-1 mb-1 rounded cursor-pointer truncate"
                  onClick={() => openEditModal(t)}
                >
                  {t.name}
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>

      {/* Modal */}
      {modalOpen && modalRange && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-96 max-w-[90vw] rounded-2xl shadow-xl p-6">
            <h2 className="text-lg font-bold mb-4">{editingTask ? "Edit Task" : "New Task"}</h2>

            <label className="text-sm font-medium">Task Name</label>
            <input
              className="border rounded-lg px-3 py-2 w-full mb-3 mt-1"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter task name"
            />

            <label className="text-sm font-medium">Category</label>
            <select
              className="border rounded-lg px-3 py-2 w-full mb-3 mt-1"
              value={taskCategory}
              onChange={(e) => setTaskCategory(e.target.value as Category)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="flex items-center justify-between text-xs text-gray-600 mb-4">
              <div>
                Start: <span className="font-semibold">{format(modalRange.start, "dd MMM yyyy")}</span>
              </div>
              <div>
                End: <span className="font-semibold">{format(modalRange.end, "dd MMM yyyy")}</span>
              </div>
            </div>

            <div className="flex justify-between items-center">
              {editingTask ? (
                <button
                  onClick={deleteTask}
                  className="px-3 py-2 rounded-lg bg-red-500 text-white"
                >
                  Delete
                </button>
              ) : <div />}
              <div className="flex gap-2">
                <button className="px-3 py-2 rounded-lg bg-gray-200" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button className="px-3 py-2 rounded-lg bg-indigo-600 text-white" onClick={saveTask}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
