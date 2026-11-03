"use client";

import { useId, useMemo, useRef, useState } from "react";

interface SuggestInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  maxLength?: number;
  maxSuggestions?: number;
}

function currentToken(raw: string): string {
  const comma = raw.lastIndexOf(",");
  return (comma >= 0 ? raw.slice(comma + 1) : raw).trim();
}

function replaceToken(raw: string, suggestion: string): string {
  const comma = raw.lastIndexOf(",");
  const head = comma >= 0 ? raw.slice(0, comma + 1).trimEnd() : "";
  return `${head ? `${head} ` : ""}${suggestion}, `;
}

function alreadyPicked(raw: string, suggestion: string): boolean {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(suggestion.toLowerCase());
}

/**
 * Comma-separated text input with a filtered suggestion dropdown.
 * Suggestions replace only the token currently being typed, so existing
 * values are preserved. Free text is always allowed.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  className = "rounded-lg border p-2 text-sm",
  maxLength,
  maxSuggestions = 8,
}: SuggestInputProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const token = currentToken(value);
  const filtered = useMemo(() => {
    const q = token.toLowerCase();
    const matches = options
      .filter((option) => !alreadyPicked(value, option))
      .filter((option) => (q ? option.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const aStarts = q && a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = q && b.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.localeCompare(b);
      });
    return matches.slice(0, maxSuggestions);
  }, [options, token, value, maxSuggestions]);

  function choose(option: string) {
    onChange(replaceToken(value, option));
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && filtered[active]) {
            e.preventDefault();
            choose(filtered[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
      />
      {open && filtered.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border p-1 text-sm shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          {filtered.map((option, index) => (
            <li key={option} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={`block w-full rounded px-2 py-1 text-left ${
                  index === active ? "font-semibold" : ""
                }`}
                style={index === active ? { background: "var(--bg)" } : undefined}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
