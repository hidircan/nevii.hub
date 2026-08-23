export type E164Result = { ok: true; e164: string } | { ok: false; message: string };

/** TR yerel (5xx / 05xx / 905xx) ve + önekli değerleri E.164'e çevirir. */
export function normalizeToE164(input: string, defaultCountry = "TR"): E164Result {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, message: "Telefon numarası eksik." };
  let digits = raw.replace(/\D/g, "");
  if (!digits) return { ok: false, message: "Telefon numarası geçersiz." };

  if (defaultCountry === "TR") {
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
    else if (digits.length === 11 && digits.startsWith("0")) digits = `90${digits.slice(1)}`;
    else if (digits.length === 12 && digits.startsWith("90")) {
      /* already */
    } else if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
      return { ok: true, e164: `+${digits}` };
    } else if (digits.length < 10 || digits.length > 15) {
      return { ok: false, message: "Telefon numarası geçersiz." };
    }
    if (!digits.startsWith("90") || digits.length !== 12) {
      return { ok: false, message: "Telefon numarası E.164 olarak doğrulanamadı." };
    }
    return { ok: true, e164: `+${digits}` };
  }

  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, message: "Telefon numarası geçersiz." };
  }
  return { ok: true, e164: `+${digits}` };
}

/** UI/audit için maske — son 4 hane görünür. */
export function maskE164(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length < 6) return "***";
  return `+${d.slice(0, 2)}***${d.slice(-4)}`;
}

export function parseAllowlist(raw: string | undefined): Set<string> {
  const set = new Set<string>();
  if (!raw) return set;
  for (const part of raw.split(/[,\s]+/)) {
    const n = normalizeToE164(part);
    if (n.ok) set.add(n.e164);
  }
  return set;
}
