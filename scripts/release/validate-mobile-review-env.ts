/**
 * Mobil review staging ÖN KONTROLÜ. Deploy/migration/build ÇALIŞTIRMAZ, ağa
 * bağlanmaz, `.env` OKUMAZ, hiçbir secret değerini yazmaz.
 *
 * Kullanım:
 *   npm run validate:mobile-review-env                  # web (Vercel deploy)
 *   npm run validate:mobile-review-env -- --target=mobile  # Expo Go / EAS preview
 *   npm run validate:mobile-review-env -- --target=store   # TestFlight / Internal / App Review
 * Çıkış kodu: HATA yoksa 0, aksi halde 1 (fail-closed).
 */
import { formatReport, TARGETS, validateMobileReviewEnv, type Target } from "./mobile-review-env";

const arg = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length) ?? "web";
if (!(TARGETS as readonly string[]).includes(arg)) {
  console.error(`[HATA] --target geçersiz — izin verilen: ${TARGETS.join(", ")}`);
  process.exit(1);
}

const { text, exitCode } = formatReport(validateMobileReviewEnv(process.env, arg as Target));
(exitCode === 0 ? console.log : console.error)(text);
process.exitCode = exitCode;
