/**
 * Shared colour picker with preset swatches and a custom colour popover.
 *
 * Displays 4 preset colour circles followed by a "custom" button that opens
 * an inline popover containing a saturation/brightness gradient area, a hue
 * slider, and a hex input. The popover is dismissed by clicking outside or
 * pressing Escape.
 *
 * The component is fully controlled via `value` (hex string) and `onChange`.
 */

import { useState, useRef, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Colour-space helpers                                               */
/* ------------------------------------------------------------------ */

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const r = Math.round(f(5) * 255);
  const g = Math.round(f(3) * 255);
  const b = Math.round(f(1) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Preset colours shared by Signature & Watermark tools               */
/* ------------------------------------------------------------------ */

const PRESETS = [
  { label: "Black", hex: "#1e293b" },
  { label: "Grey", hex: "#6b7280" },
  { label: "Blue", hex: "#1d4ed8" },
  { label: "Red", hex: "#dc2626" },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const svAreaRef = useRef<HTMLDivElement>(null);

  const isPreset = PRESETS.some((p) => p.hex === value);

  // Internal HSV state for the popover – synced from value when opening
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value);

  // Sync internal state when popover opens
  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        const converted = hexToHsv(value);
        setHsv(converted);
        setHexInput(value);
      }
      return !prev;
    });
  }, [value]);

  // Close on click-outside or Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  /* ---- Saturation/Brightness drag ---- */
  const draggingSV = useRef(false);

  const updateSV = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      const next = { ...hsv, s, v };
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setHexInput(hex);
      onChange(hex);
    },
    [hsv, onChange],
  );

  const handleSVPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingSV.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateSV(e.clientX, e.clientY);
    },
    [updateSV],
  );

  const handleSVPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingSV.current) return;
      updateSV(e.clientX, e.clientY);
    },
    [updateSV],
  );

  const handleSVPointerUp = useCallback(() => {
    draggingSV.current = false;
  }, []);

  /* ---- Hue slider ---- */
  const handleHueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const h = Number(e.target.value);
      const next = { ...hsv, h };
      setHsv(next);
      const hex = hsvToHex(next.h, next.s, next.v);
      setHexInput(hex);
      onChange(hex);
    },
    [hsv, onChange],
  );

  /* ---- Hex input ---- */
  const handleHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setHexInput(raw);
      if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
        setHsv(hexToHsv(raw));
        onChange(raw.toLowerCase());
      }
    },
    [onChange],
  );

  const hueColor = hsvToHex(hsv.h, 1, 1);

  return (
    <div className="relative" ref={popoverRef}>
      <div className="flex items-center gap-2.5">
        <span className="text-xs text-slate-400 dark:text-dark-text-muted shrink-0">Color:</span>

        {PRESETS.map((p) => (
          <button
            key={p.hex}
            aria-label={`${p.label} color${value === p.hex ? " (selected)" : ""}`}
            onClick={() => {
              onChange(p.hex);
              setOpen(false);
            }}
            className={`relative w-6 h-6 sm:w-5 sm:h-5 rounded-full border-2 touch-manipulation motion-safe:transition-transform ${
              value === p.hex
                ? "border-primary-500 scale-125"
                : "border-slate-300 dark:border-dark-border hover:scale-110"
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1`}
            style={{ backgroundColor: p.hex }}
          />
        ))}

        {/* Custom colour trigger */}
        <button
          aria-label={`Custom color${!isPreset ? ` (${value})` : ""}${open ? " — picker open" : ""}`}
          aria-expanded={open}
          onClick={toggleOpen}
          className={`relative w-6 h-6 sm:w-5 sm:h-5 rounded-full border-2 touch-manipulation motion-safe:transition-transform flex items-center justify-center ${
            open || !isPreset
              ? "border-primary-500 scale-125"
              : "border-slate-300 dark:border-dark-border hover:scale-110"
          } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1`}
          style={{
            background: !isPreset
              ? value
              : "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          }}
        >
          {isPreset && (
            <span
              className="text-white text-[9px] font-bold drop-shadow-sm leading-none"
              aria-hidden="true"
            >
              +
            </span>
          )}
        </button>
      </div>

      {/* ---- Popover ---- */}
      {open && (
        <div className="absolute left-0 z-50 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-xl p-3 space-y-3">
          {/* Saturation / Brightness area */}
          <div
            ref={svAreaRef}
            role="presentation"
            aria-label="Saturation and brightness picker"
            className="relative w-full h-40 sm:h-36 rounded-lg cursor-crosshair touch-none select-none"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
            }}
            onPointerDown={handleSVPointerDown}
            onPointerMove={handleSVPointerMove}
            onPointerUp={handleSVPointerUp}
          >
            {/* Indicator */}
            <div
              className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${hsv.s * 100}%`,
                top: `${(1 - hsv.v) * 100}%`,
                backgroundColor: value,
              }}
            />
          </div>

          {/* Hue slider */}
          <input
            type="range"
            aria-label="Hue"
            min={0}
            max={360}
            value={Math.round(hsv.h)}
            onChange={handleHueChange}
            className="w-full h-3 rounded-full appearance-none cursor-pointer touch-manipulation [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-slate-300 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-slate-300 [&::-moz-range-thumb]:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
            style={{
              background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
            }}
          />

          {/* Hex input + preview */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-md border border-slate-200 dark:border-dark-border shrink-0"
              style={{ backgroundColor: value }}
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label="Hex color value"
              name="hex-color"
              autoComplete="off"
              value={hexInput}
              onChange={handleHexInput}
              maxLength={7}
              spellCheck={false}
              inputMode="text"
              className="flex-1 min-w-0 px-2 py-1.5 text-sm sm:text-xs font-mono border border-slate-300 dark:border-dark-border dark:bg-dark-surface-alt dark:text-dark-text rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
