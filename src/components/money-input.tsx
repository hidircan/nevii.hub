"use client";

import { useState } from "react";
import { filterMoneyTyping, parseMoneyInput } from "@/lib/amount-input";
import { cn } from "@/lib/utils";

/**
 * 2026-10-04 — tam TL tutar alanı. Yazılan METİN yerelde tutulur: kullanıcı "0"ı silebilir (alan boş kalır,
 * 0'a geri dönmez), imleç atlamaz, Türkçe biçim ("1.250", "1.250,00") ve yapıştırma çalışır, mobilde
 * ondalık klavye açılır. Üst bileşen yalnız geçerli değeri alır: boş → "", geçerli → sayı. Geçersiz/kuruşlu
 * metinde üst değer DEĞİŞMEZ ve alanın altında açık hata görünür (kaydetme üst bileşenin doğrulamasıyla durur).
 */
export function MoneyInput({
  value,
  onValueChange,
  onInvalidChange,
  className,
  ...rest
}: {
  value: number | "";
  onValueChange: (value: number | "") => void;
  /** Geçersiz metin varken true — üst bileşen kaydetmeyi engelleyebilir. */
  onInvalidChange?: (invalid: boolean) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(value === "" ? "" : String(value));
  const [synced, setSynced] = useState<number | "">(value);
  const [error, setError] = useState<string | null>(null);
  // Dışarıdan değer değişti (↺ otomatik, önizleme yenilendi): metni yeniden kur. Render sırasında state deseni.
  if (value !== synced) {
    setSynced(value);
    const current = parseMoneyInput(text);
    const same = (current.kind === "empty" && value === "") || (current.kind === "ok" && current.value === value);
    if (!same) {
      setText(value === "" ? "" : String(value));
      setError(null);
    }
  }

  return (
    <span className="block">
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-invalid={rest["aria-invalid"] ?? (error ? true : undefined)}
        onChange={(e) => {
          const next = filterMoneyTyping(e.target.value);
          setText(next);
          const parsed = parseMoneyInput(next);
          if (parsed.kind === "error") {
            setError(parsed.message);
            onInvalidChange?.(true);
            return;
          }
          setError(null);
          onInvalidChange?.(false);
          const v = parsed.kind === "empty" ? "" : parsed.value;
          setSynced(v);
          onValueChange(v);
        }}
        className={cn(
          "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/30",
          className
        )}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-[11px] font-medium text-rose-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
