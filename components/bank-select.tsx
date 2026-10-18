"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";

type Bank = { id: string; name: string; code?: string };

/**
 * Bank picker as an inline search: type to filter the whole Paystack
 * catalogue, tap a result to select. No dropdown, no scrolling a 260-item
 * list — the selected bank is shown in the field when the search is closed.
 * value "" means "no bank selected".
 */
export function BankSelect({
  banks,
  value,
  onChange,
  id,
}: {
  banks: Bank[];
  value: string;
  onChange: (bankId: string) => void;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = banks.find((b) => b.id === value) ?? null;
  const term = query.trim().toLowerCase();
  const matches = term
    ? banks.filter((b) => b.name.toLowerCase().includes(term))
    : banks;

  // Close when tapping outside the picker (mobile-friendly; no blur race).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function pick(bank: Bank) {
    onChange(bank.id);
    close();
  }

  return (
    <div ref={boxRef} className="grid gap-1.5">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-results` : undefined}
          autoComplete="off"
          placeholder={!open && selected ? selected.name : "Search for your bank…"}
          value={open ? query : (selected?.name ?? "")}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
          className="h-9 w-full rounded-lg border border-input bg-transparent py-2 pr-9 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        />
        {(selected || open) && (
          <button
            type="button"
            aria-label={selected ? "Clear bank" : "Close search"}
            onClick={() => {
              if (selected) onChange("");
              close();
            }}
            className="absolute right-2 flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-lg bg-card ring-1 ring-foreground/10">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              No bank matches “{query.trim()}”.
            </p>
          ) : (
            <>
              <ul
                id={id ? `${id}-results` : undefined}
                role="listbox"
                className="max-h-60 overflow-y-auto overscroll-contain p-1"
              >
                {matches.map((bank) => {
                  const isSelected = bank.id === value;
                  return (
                    <li key={bank.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pick(bank)}
                        className={
                          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors " +
                          (isSelected
                            ? "bg-primary/10 font-medium text-foreground"
                            : "hover:bg-accent hover:text-accent-foreground")
                        }
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {isSelected && <Check className="size-4" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{bank.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="border-t border-foreground/10 px-3 py-1.5 text-xs text-muted-foreground">
                {matches.length} bank{matches.length === 1 ? "" : "s"} — keep typing to narrow it down
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
