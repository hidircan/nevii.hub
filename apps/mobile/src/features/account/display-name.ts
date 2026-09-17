/**
 * Profil kimliği çözümleme — saf, test edilebilir.
 *
 * Öncelik: personelin gerçek adı (TEACHER: kendi programındaki `teacherName`;
 * sunucu sahipliği doğrular) > e-posta > null.
 *
 * `null` = kimlik henüz çözülmedi → çağıran taraf iskelet gösterir; rol
 * etiketi ("Öğretmen") ASLA ad yerine konmaz — ayrı satırda rol olarak
 * gösterilir (kök neden: restore sonrası boş e-posta + `email || rol`
 * zinciri adı rol etiketine düşürüyordu).
 */
export function resolveDisplayName({
  teacherName,
  email,
}: {
  teacherName?: string | null;
  email?: string | null;
}): string | null {
  const name = teacherName?.trim();
  if (name) return name;
  const mail = email?.trim();
  if (mail) return mail;
  return null;
}
