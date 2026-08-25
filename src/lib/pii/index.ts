export {
  ageFromBirthDate,
  decryptNationalId,
  encryptNationalId,
  isValidTurkishNationalId,
  maskNationalId,
  nationalIdFingerprint,
  normalizeNationalId,
  type EncryptedNationalId,
} from "./tc-identity";

export {
  decryptIban,
  encryptIban,
  isValidIban,
  maskIban,
  normalizeIban,
  type EncryptedIban,
} from "./iban";

/**
 * PRODUCT_BACKLOG — kim tam T.C. görebilir.
 * TEACHER / PARENT / STUDENT asla full plain id almaz.
 */
export function canViewFullNationalId(role: string): boolean {
  return role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
}
