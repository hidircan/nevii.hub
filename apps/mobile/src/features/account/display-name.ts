/**
 * Profil kimliği çözümleme — saf, test edilebilir.
 *
 * Öncelik: sunucunun `mobile/session` yanıtındaki `fullName` (TEACHER için
 * `Teacher.name`, diğer roller için `User.displayName`) → öğretmenin kendi
 * programındaki `teacherName` (eski istemci/sunucu uyumu) → `null`.
 *
 * E-posta ADA DÖNÜŞMEZ: e-posta ayrı bir iletişim satırıdır, kimlik yerine
 * geçmez. `null` = kimlik henüz çözülmedi → çağıran taraf iskelet gösterir;
 * rol etiketi ("Öğretmen") ASLA ad yerine konmaz.
 */
export function resolveDisplayName({
  fullName,
  teacherName,
}: {
  fullName?: string | null;
  teacherName?: string | null;
}): string | null {
  const full = fullName?.trim();
  if (full) return full;
  const teacher = teacherName?.trim();
  if (teacher) return teacher;
  return null;
}
