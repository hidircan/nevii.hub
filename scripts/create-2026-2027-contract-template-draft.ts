/**
 * P0 kurtarma — bkz. docs/contracts/ACTIVE_TEMPLATE_RECOVERY_REPORT.md.
 *
 * tenant_nilufer_acar için AKTİF `student_enrollment_contract` şablonu,
 * 2026-08-25 tarihli GENERİK/eski placeholder'lar (`{{studentName}}`,
 * `{{branchName}}`, `{{freeText}}` vb.) içeren bir taslaktı — mevcut
 * doğrulayıcının (contract-template-schema.ts) zorunlu alanlarının HİÇBİRİNİ
 * içermiyordu, bu yüzden formal sözleşme üretimi ContractTemplateIncompleteError
 * ile engelleniyordu. Bu script, kurumsal kaynaktan (STUDENT_ENROLLMENT_CONTRACT_BODY,
 * artık 2026-2027-ogrenci-kayit-sozlesmesi-v1.md'yi yansıtıyor) YENİ bir
 * DRAFT (`active:false`) oluşturur — mevcut aktif şablona DOKUNMAZ, otomatik
 * etkinleştirme YAPMAZ. Etkinleştirme yönetici tarafından "Sözleşme
 * Şablonları" ekranından AÇIKÇA yapılmalıdır.
 *
 * Çalıştırma: npx tsx scripts/create-2026-2027-contract-template-draft.ts
 */
import { createContractTemplateDraftFromCanonicalSource } from "../src/lib/documents";

async function main() {
  const tenantId = process.env.DEFAULT_TENANT_ID || "tenant_nilufer_acar";
  const tpl = await createContractTemplateDraftFromCanonicalSource(tenantId, "system_migration_2026_2027");
  console.log(`Taslak oluşturuldu: id=${tpl.id} active=${tpl.active} tenantId=${tenantId}`);
  console.log("Etkinleştirme AYRI ve AÇIK bir adımdır — 'Sözleşme Şablonları' ekranından yönetici onayı gerekir.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
