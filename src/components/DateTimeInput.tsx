/**
 * Custom datetime input that replaces the native `datetime-local` picker
 * with a fully styled popover matching the app's design system.
 *
 * Accepts/emits values in "YYYY-MM-DDTHH:mm" format (same as datetime-local)
 * so it's a drop-in replacement wherever that format is used.
 */

import { useState, useRef, useEffect, useCallback } from "react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function parseValue(value: string) {
  if (!value || value.length < 16) return null;
  const year = parseInt(value.slice(0, 4), 10);
  const month = parseInt(value.slice(5, 7), 10) - 1;
  const day = parseInt(value.slice(8, 10), 10);
  const hour = parseInt(value.slice(11, 13), 10);
  const minute = parseInt(value.slice(14, 16), 10);
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  )
    return null;
  return { year, month, day, hour, minute };
}

function buildValue(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

function formatDisplay(value: string): string {
  const p = parseValue(value);
  if (!p) return "";
  const hour12 = p.hour % 12 || 12;
  const ampm = p.hour >= 12 ? "PM" : "AM";
  const min = p.minute.toString().padStart(2, "0");
  return `${p.day} ${MONTHS[p.month].slice(0, 3)} ${p.year}, ${hour12}:${min} ${ampm}`;
}

interface DateTimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

const selectClass =
  "px-2 py-1.5 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-sm text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all appearance-none cursor-pointer";

export function DateTimeInput({ id, value, onChange }: DateTimeInputProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const parsed = parseValue(value);
  const currentYear = new Date().getFullYear();

  const handlePart = useCallback(
    (part: "year" | "month" | "day" | "hour" | "minute", val: number) => {
      const now = new Date();
      const base = parsed ?? {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        hour: 0,
        minute: 0,
      };
      const updated = { ...base, [part]: val };
      // Clamp day to valid range when month/year changes
      const maxDay = getDaysInMonth(updated.year, updated.month);
      updated.day = Math.min(updated.day, maxDay);
      onChange(buildValue(updated.year, updated.month, updated.day, updated.hour, updated.minute));
    },
    [parsed, onChange],
  );

  const handleAmPm = useCallback(
    (ampm: "AM" | "PM") => {
      if (!parsed) return;
      const isCurrentlyPm = parsed.hour >= 12;
      if (ampm === "PM" && !isCurrentlyPm) {
        handlePart("hour", parsed.hour + 12);
      } else if (ampm === "AM" && isCurrentlyPm) {
        handlePart("hour", parsed.hour - 12);
      }
    },
    [parsed, handlePart],
  );

  const handleHour12Change = useCallback(
    (h12: number) => {
      if (!parsed) return;
      const isPm = parsed.hour >= 12;
      const h24 = isPm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
      handlePart("hour", h24);
    },
    [parsed, handlePart],
  );

  const setToday = useCallback(() => {
    const now = new Date();
    onChange(
      buildValue(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
      ),
    );
  }, [onChange]);

  const daysInMonth = parsed ? getDaysInMonth(parsed.year, parsed.month) : 31;
  const hour12 = parsed ? parsed.hour % 12 || 12 : 12;
  const isPm = parsed ? parsed.hour >= 12 : false;
  const displayText = formatDisplay(value);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-bg text-sm text-left focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all flex items-center justify-between gap-2"
      >
        <span
          className={
            displayText
              ? "text-slate-800 dark:text-dark-text"
              : "text-slate-400 dark:text-slate-500"
          }
        >
          {displayText || "Not set"}
        </span>
        <svg
          className="w-4 h-4 text-slate-400 shrink-0"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zM4 8h12v8H4V8z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Popover panel */}
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 p-4 bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-xl space-y-3">
          {/* Date row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted w-8">
              Date
            </span>

            {/* Day */}
            <select
              value={parsed?.day ?? ""}
              onChange={(e) => handlePart("day", parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {!parsed && <option value="">—</option>}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {/* Month */}
            <select
              value={parsed?.month ?? ""}
              onChange={(e) => handlePart("month", parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {!parsed && <option value="">—</option>}
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>

            {/* Year */}
            <select
              value={parsed?.year ?? ""}
              onChange={(e) => handlePart("year", parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {!parsed && <option value="">—</option>}
              {Array.from({ length: 50 }, (_, i) => currentYear - 30 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Time row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 dark:text-dark-text-muted w-8">
              Time
            </span>

            {/* Hour */}
            <select
              value={parsed ? hour12 : ""}
              onChange={(e) => handleHour12Change(parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {!parsed && <option value="">—</option>}
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <span className="text-slate-400 font-medium text-sm">:</span>

            {/* Minute */}
            <select
              value={parsed?.minute ?? ""}
              onChange={(e) => handlePart("minute", parseInt(e.target.value, 10))}
              className={selectClass}
            >
              {!parsed && <option value="">—</option>}
              {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, "0")}
                </option>
              ))}
            </select>

            {/* AM/PM toggle */}
            <div className="flex rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden text-sm">
              {(["AM", "PM"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => handleAmPm(period)}
                  className={`px-3 py-1.5 transition-colors ${
                    parsed && (period === "PM") === isPm
                      ? "bg-primary-600 text-white font-medium"
                      : "bg-white dark:bg-dark-bg text-slate-600 dark:text-dark-text-muted hover:bg-slate-50 dark:hover:bg-dark-surface-alt"
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-dark-border">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs text-slate-500 dark:text-dark-text-muted hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Clear
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={setToday}
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 transition-colors"
              >
                Now
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 px-3 py-1 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
