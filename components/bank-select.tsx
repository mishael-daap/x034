"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Bank = { id: string; name: string };

/**
 * Reusable bank picker built on the app's Base UI select (renders its own
 * popup — works even where native <select> dropdowns are unreliable).
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
  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? "" : (v as string))}
      items={[
        ...banks.map((b) => ({ value: b.id, label: b.name })),
        { value: "none", label: "No bank (clear)" },
      ]}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select a bank" />
      </SelectTrigger>
      <SelectContent>
        {banks.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
        <SelectItem value="none">No bank (clear)</SelectItem>
      </SelectContent>
    </Select>
  );
}
