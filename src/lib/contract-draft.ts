"use client";

import { useEffect, useRef, useState } from "react";

/**
 * UAT 2026-09-24 (D) — sözleşme formunun KAYDEDİLMEMİŞ girdileri, "Öğrenci
 * kaydına geri dön" → "Sözleşme adımına dön" gidiş-dönüşünde kaybolmasın.
 *
 * Yalnız sekme belleğinde (modül değişkeni) tutulur: URL'ye, localStorage/
 * sessionStorage'a yazılmaz; sayfa yenilenince/sekme kapanınca silinir (TC gibi
 * hassas alanlar kalıcı depoya düşmez). Yalnız kullanıcının ön-doldurmadan
 * FARKLI girdiği alanlar saklanır — kayıt düzeltilip dönüldüğünde dokunulmamış
 * alanlar taze ön-doldurmayı alır.
 */
const drafts = new Map<string, Map<string, unknown>>();

export function readContractDraftField(key: string, field: string): { found: boolean; value?: unknown } {
  const d = drafts.get(key);
  return d && d.has(field) ? { found: true, value: d.get(field) } : { found: false };
}

export function writeContractDraftField(key: string, field: string, value: unknown, initial: unknown): void {
  const d = drafts.get(key) ?? new Map<string, unknown>();
  if (Object.is(value, initial)) d.delete(field);
  else d.set(field, value);
  if (d.size > 0) drafts.set(key, d);
  else drafts.delete(key);
}

export function hasContractDraft(key: string): boolean {
  return drafts.has(key);
}

export function clearContractDraft(key: string): void {
  drafts.delete(key);
}

export function useContractDraft<T>(key: string, field: string, initial: T) {
  const initialRef = useRef(initial);
  const [value, setValue] = useState<T>(() => {
    const saved = readContractDraftField(key, field);
    return saved.found ? (saved.value as T) : initial;
  });
  useEffect(() => {
    writeContractDraftField(key, field, value, initialRef.current);
  }, [key, field, value]);
  return [value, setValue] as const;
}
