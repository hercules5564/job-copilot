"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  fetchSuggestions as localFetcher,
  splitHighlight,
  type Suggestion,
  type SuggestionFetcher,
  type SuggestionKind,
} from "../lib/suggestions";

export interface AutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  kind: SuggestionKind;
  /**
   * "single" replaces the whole value. "csv" treats the text after the last
   * comma as the active token and inserts a selected suggestion there.
   */
  mode?: "single" | "csv";
  placeholder?: string;
  className?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  maxSuggestions?: number;
  debounceMs?: number;
  /** Swap the local dataset for a remote provider without changing the UI. */
  fetcher?: SuggestionFetcher;
  "aria-label"?: string;
  "data-testid"?: string;
}

function activeToken(value: string, mode: "single" | "csv"): string {
  if (mode === "single") return value;
  const comma = value.lastIndexOf(",");
  return comma === -1 ? value : value.slice(comma + 1);
}

function insertCsvToken(value: string, label: string): string {
  const comma = value.lastIndexOf(",");
  const head = comma === -1 ? "" : value.slice(0, comma + 1).replace(/\s+$/, "");
  return `${head}${head ? " " : ""}${label}, `;
}

export function Autocomplete({
  id,
  value,
  onChange,
  kind,
  mode = "single",
  placeholder,
  className,
  maxLength,
  required,
  disabled,
  autoComplete = "off",
  maxSuggestions = 7,
  debounceMs = 120,
  fetcher,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
}: AutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const inputId = id ?? `autocomplete-${generatedId}`;
  const listId = `${inputId}-listbox`;

  const token = useMemo(() => activeToken(value, mode), [value, mode]);
  const query = token.trim();

  const fetcherFn = fetcher ?? localFetcher;

  // Fetch (debounced) only while the panel is open and there is a query.
  useEffect(() => {
    if (!open || !query) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      Promise.resolve(fetcherFn(kind, query, { limit: maxSuggestions, signal: controller.signal }))
        .then((result) => {
          if (cancelled) return;
          setItems(result);
          setActive(-1);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, Math.max(0, debounceMs));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, kind, maxSuggestions, debounceMs, fetcherFn]);

  // Close when interacting outside the input + panel.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active option visible on long lists / small screens.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, listId]);

  function choose(suggestion: Suggestion) {
    onChange(mode === "single" ? suggestion.label : insertCsvToken(value, suggestion.label));
    setOpen(false);
    setActive(-1);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    onChange(next);
    const nextToken = activeToken(next, mode).trim();
    setOpen(nextToken.length > 0);
    setActive(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        if (query) {
          setOpen(true);
          setActive(items.length > 0 ? 0 : -1);
        }
        return;
      }
      if (items.length === 0) return;
      setActive((current) => (current + 1) % items.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!open) return;
      event.preventDefault();
      if (items.length === 0) return;
      setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      // Only intercept Enter when a suggestion is actually available; with no
      // matches the form submits normally so custom values still work.
      if (open && items.length > 0) {
        event.preventDefault();
        choose(items[active >= 0 ? active : 0]);
      }
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      setActive(-1);
    }
  }

  const showEmpty = open && !loading && items.length === 0 && query.length > 0;

  return (
    <div ref={rootRef} className="cf-autocomplete">
      <input
        ref={inputRef}
        id={inputId}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (query) setOpen(true);
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-haspopup="listbox"
        role="combobox"
        data-testid={dataTestId}
        spellCheck={false}
      />

      <ul
        id={listId}
        role="listbox"
        aria-label={kind === "role" ? "Job role suggestions" : "Location suggestions"}
        aria-hidden={!open}
        className={`cf-autocomplete-panel${open ? " is-open" : ""}`}
        data-testid={dataTestId ? `${dataTestId}-listbox` : undefined}
      >
        {loading ? (
          <li className="cf-autocomplete-status" role="presentation">
            <span className="cf-autocomplete-spinner" aria-hidden="true" />
            Searching…
          </li>
        ) : showEmpty ? (
          <li className="cf-autocomplete-status" role="presentation">
            No matches — keep typing to use a custom value.
          </li>
        ) : (
          items.map((suggestion, index) => {
            const highlight = splitHighlight(suggestion.label, query);
            return (
              <li
                key={suggestion.label}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                data-active={index === active ? "true" : undefined}
                className="cf-autocomplete-option"
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
              >
                <span>
                  {highlight.before}
                  {highlight.match ? <mark>{highlight.match}</mark> : null}
                  {highlight.after}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
