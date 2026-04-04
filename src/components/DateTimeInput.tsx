/**
 * Custom datetime input that replaces the native `datetime-local` picker
 * with a compact calendar grid popover matching the app's design system.
 *
 * Accepts/emits values in "YYYY-MM-DDTHH:mm" format (same as datetime-local)
 * so it's a drop-in replacement wherever that format is used.
 *
 * Future dates are not allowed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const DAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
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

const timeSelectClass =
  "px-2 py-1 rounded-md border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-bg text-xs text-slate-800 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all appearance-none cursor-pointer";

export function DateTimeInput({ id, value, onChange }: DateTimeInputProps) {
  const [open, setOpen] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseValue(value), [value]);
  const today = useMemo(() => new Date(), []);
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  // Calendar view state
  const [viewYear, setViewYear] = useState(parsed?.year ?? todayYear);
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? todayMonth);

  // Sync view when value changes externally
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [parsed, parsed?.year, parsed?.month]);

  // Close on outside click / Escape
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

  const isDateFuture = useCallback(
    (year: number, month: number, day: number) => {
      if (year > todayYear) return true;
      if (year < todayYear) return false;
      if (month > todayMonth) return true;
      if (month < todayMonth) return false;
      return day > todayDay;
    },
    [todayYear, todayMonth, todayDay],
  );

  const canGoPrev = viewYear > todayYear - 30;
  const canGoNext = useMemo(() => {
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    return nextYear < todayYear || (nextYear === todayYear && nextMonth <= todayMonth);
  }, [viewMonth, viewYear, todayYear, todayMonth]);

  const handlePrevMonth = () => {
    if (!canGoPrev) return;
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleYearSelect = (year: number) => {
    setViewYear(year);
    // If the new year is the current year and the current viewMonth is in the future, clamp to today's month
    if (year === todayYear && viewMonth > todayMonth) {
      setViewMonth(todayMonth);
    }
    setShowYearPicker(false);
  };

  const handleDayClick = useCallback(
    (day: number) => {
      if (isDateFuture(viewYear, viewMonth, day)) return;
      const now = new Date();
      const base = parsed ?? { hour: now.getHours(), minute: now.getMinutes() };
      onChange(buildValue(viewYear, viewMonth, day, base.hour, base.minute));
    },
    [viewYear, viewMonth, parsed, onChange, isDateFuture],
  );

  const handleTimePart = useCallback(
    (part: "hour" | "minute", val: number) => {
      const now = new Date();
      const base = parsed ?? {
        year: now.getFullYear(),
        month: now.getMonth(),
        day: now.getDate(),
        hour: 0,
        minute: 0,
      };
      const updated = { ...base, [part]: val };
      onChange(buildValue(updated.year, updated.month, updated.day, updated.hour, updated.minute));
    },
    [parsed, onChange],
  );

  const handleAmPm = useCallback(
    (ampm: "AM" | "PM") => {
      if (!parsed) return;
      const isCurrentlyPm = parsed.hour >= 12;
      if (ampm === "PM" && !isCurrentlyPm) {
        handleTimePart("hour", parsed.hour + 12);
      } else if (ampm === "AM" && isCurrentlyPm) {
        handleTimePart("hour", parsed.hour - 12);
      }
    },
    [parsed, handleTimePart],
  );

  const handleHour12Change = useCallback(
    (h12: number) => {
      if (!parsed) return;
      const isPm = parsed.hour >= 12;
      const h24 = isPm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
      handleTimePart("hour", h24);
    },
    [parsed, handleTimePart],
  );

  const setToNow = useCallback(() => {
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
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setShowYearPicker(false);
  }, [onChange]);

  const hour12 = parsed ? parsed.hour % 12 || 12 : 12;
  const isPm = parsed ? parsed.hour >= 12 : false;
  const displayText = formatDisplay(value);

  // Build calendar grid cells: negative = empty spacer, positive = day number
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = getFirstDayOfWeek(viewYear, viewMonth);
  const cells: number[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(-(i + 1));
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Year range for the year picker
  const yearList = Array.from({ length: 31 }, (_, i) => todayYear - 30 + i).reverse();

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button */}
      <button
        id={id}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowYearPicker(false);
        }}
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

      {/* Popover panel — fixed width so it stays compact on wide triggers */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-72 p-3 bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-xl space-y-2">
          {/* Month/year navigation header */}
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={!canGoPrev || showYearPicker}
              aria-label="Previous month"
              className={`p-1 rounded-md transition-colors ${
                canGoPrev && !showYearPicker
                  ? "hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted"
                  : "text-slate-300 dark:text-slate-600 cursor-not-allowed"
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            <div className="flex items-center gap-1 flex-1 justify-center">
              <span className="text-xs font-semibold text-slate-700 dark:text-dark-text select-none">
                {MONTHS[viewMonth].slice(0, 3)}
              </span>
              {/* Clickable year — toggles the year picker */}
              <button
                type="button"
                onClick={() => setShowYearPicker((v) => !v)}
                className={`flex items-center gap-0.5 text-xs font-semibold rounded px-1 py-0.5 transition-colors select-none ${
                  showYearPicker
                    ? "bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400"
                    : "text-slate-700 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-surface-alt"
                }`}
                aria-label="Select year"
              >
                {viewYear}
                <svg
                  className={`w-3 h-3 transition-transform ${showYearPicker ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={!canGoNext || showYearPicker}
              aria-label="Next month"
              className={`p-1 rounded-md transition-colors ${
                canGoNext && !showYearPicker
                  ? "hover:bg-slate-100 dark:hover:bg-dark-surface-alt text-slate-500 dark:text-dark-text-muted"
                  : "text-slate-300 dark:text-slate-600 cursor-not-allowed"
              }`}
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Year picker grid */}
          {showYearPicker ? (
            <div className="grid grid-cols-4 gap-1 max-h-44 overflow-y-auto py-0.5">
              {yearList.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleYearSelect(year)}
                  className={`py-1.5 rounded-md text-xs font-medium transition-colors ${
                    year === viewYear
                      ? "bg-primary-600 text-white"
                      : year === todayYear
                        ? "border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                        : "text-slate-700 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-surface-alt"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7">
                {DAYS_SHORT.map((d) => (
                  <div
                    key={d}
                    className="text-center text-[10px] font-medium text-slate-400 dark:text-slate-500 pb-0.5 select-none"
                  >
                    {d}
                  </div>
                ))}

                {/* Calendar day cells: negative values are empty spacers */}
                {cells.map((cell) => {
                  if (cell < 0) {
                    return <div key={cell} />;
                  }
                  const day = cell;
                  const isFuture = isDateFuture(viewYear, viewMonth, day);
                  const isSelected =
                    parsed?.day === day && parsed?.month === viewMonth && parsed?.year === viewYear;
                  const isToday =
                    day === todayDay && viewMonth === todayMonth && viewYear === todayYear;

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleDayClick(day)}
                      disabled={isFuture}
                      className={`
                        h-8 flex items-center justify-center rounded-md text-xs transition-colors select-none
                        ${
                          isSelected
                            ? "bg-primary-600 text-white font-semibold"
                            : isFuture
                              ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                              : isToday
                                ? "border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 font-medium"
                                : "text-slate-700 dark:text-dark-text hover:bg-slate-100 dark:hover:bg-dark-surface-alt"
                        }
                      `}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Time row */}
          <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-dark-border flex-wrap">
            <span className="text-[10px] font-medium text-slate-500 dark:text-dark-text-muted">
              Time
            </span>

            <select
              value={parsed ? hour12 : ""}
              onChange={(e) => handleHour12Change(parseInt(e.target.value, 10))}
              className={timeSelectClass}
            >
              {!parsed && <option value="">—</option>}
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>

            <span className="text-slate-400 font-medium text-xs select-none">:</span>

            <select
              value={parsed?.minute ?? ""}
              onChange={(e) => handleTimePart("minute", parseInt(e.target.value, 10))}
              className={timeSelectClass}
            >
              {!parsed && <option value="">—</option>}
              {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, "0")}
                </option>
              ))}
            </select>

            {/* AM/PM toggle */}
            <div className="flex rounded-md border border-slate-200 dark:border-dark-border overflow-hidden text-xs">
              {(["AM", "PM"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => handleAmPm(period)}
                  className={`px-2 py-1 transition-colors ${
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
                onClick={setToNow}
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
