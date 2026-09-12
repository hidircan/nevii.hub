import { z } from "zod";

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const tenantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug en az 2 karakter olmalı")
  .max(48, "Slug en fazla 48 karakter olabilir")
  .regex(SLUG_REGEX, "Slug yalnız küçük harf, rakam ve tek tire içerebilir");

export function suggestSlug(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return ascii.length >= 2 ? ascii : "kurum";
}
