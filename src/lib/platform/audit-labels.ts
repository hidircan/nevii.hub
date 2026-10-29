/**
 * Denetim eylem kodları → kullanıcı dili. Özet ve Denetim ekranları ortak
 * kullanır; ham kod başlık ipucunda (title) durur, birincil metin her zaman
 * okunabilir cümledir. Bilinmeyen kodlar son bölümü sadeleştirilerek gösterilir.
 */
const LABELS: Record<string, string> = {
  // Katalog ve paketler
  "platform.catalog.plan_upsert": "Paket kaydedildi",
  "platform.catalog.plan_delete": "Paket silindi",
  "platform.catalog.plan_status": "Paket satış durumu değişti",
  "platform.catalog.plan_rename": "Paket anahtarı değişti",
  "platform.catalog.module_upsert": "Modül güncellendi",
  "platform.policy.draft": "Taslak açıldı",
  "platform.policy.publish": "Katalog yayınlandı",
  "platform.policy.discard": "Taslak atıldı",
  "platform.policy.rollback": "Önceki sürüme dönüldü",
  "platform.subscription.snapshot": "Kurum paket hakları donduruldu",
  // Kurumlar
  "platform.tenant.draft": "Kurum taslağı oluşturuldu",
  "platform.tenant.invite_owner": "Kurum sahibi davet edildi",
  "platform.tenant.provision": "Kurum açıldı",
  "platform.tenant.retry_provision": "Kurum açılışı yeniden denendi",
  "platform.tenant.update": "Kurum bilgileri güncellendi",
  "platform.branch_access.grant": "Şube erişimi verildi",
  "platform.branch_access.revoke": "Şube erişimi kaldırıldı",
  // Kullanıcılar
  "platform.user.invite": "Kullanıcı davet edildi",
  "platform.user.invite_resend": "Davet yeniden gönderildi",
  "platform.user.invite_revoke": "Davet iptal edildi",
  "platform.user.password_reset_start": "Parola sıfırlama başlatıldı",
  "platform.user.password_reset_complete": "Parola sıfırlama tamamlandı",
  "platform.user.role_change": "Kullanıcı rolü değişti",
  "platform.user.deactivate": "Kullanıcı pasife alındı",
  "platform.user.reactivate": "Kullanıcı yeniden etkinleştirildi",
  "platform.user.soft_delete": "Kullanıcı silindi (geri alınabilir)",
  "platform.user.hard_delete": "Kullanıcı kalıcı silindi",
  "platform.user.portal_enable": "Portal erişimi açıldı",
  "platform.user.portal_disable": "Portal erişimi kapatıldı",
  // Roller
  "platform.role.create": "Rol oluşturuldu",
  "platform.role.update": "Rol güncellendi",
  "platform.role.archive": "Rol arşivlendi",
  "platform.role.assign": "Rol atandı",
  "platform.role.unassign": "Rol kaldırıldı",
  "platform.role.preset_change": "Hazır rol değişti",
  // Ayarlar ve entegrasyonlar
  "platform.feature.update": "Kurum özelliği değişti",
  "platform.setting.update": "Ayar değişti",
  "platform.setting.reset": "Ayar sıfırlandı",
  "platform.integration.update": "Entegrasyon güncellendi",
  "platform.integration.test": "Entegrasyon bağlantısı denendi",
  "platform.logo.update": "Logo değişti",
  "platform.logo.reset": "Logo sıfırlandı",
  "site.social.update": "Sosyal medya bağlantıları güncellendi",
  "site.mobileApps.update": "Mobil uygulama bağlantıları güncellendi",
  "site.content.update": "Site metinleri güncellendi",
  // Operasyon
  "platform.session.revoke": "Oturum kapatıldı",
  "platform.session.revoke_all": "Tüm oturumlar kapatıldı",
  "platform.support.open": "Destek erişimi açıldı",
  "platform.support.view": "Destek erişimiyle görüntülendi",
  "platform.support.end": "Destek erişimi kapatıldı",
  "platform.invitation.accept": "Davet kabul edildi",
  "platform.deployment.record": "Dağıtım kaydedildi",
  "platform.deployment.ingest": "Dağıtım bilgisi aktarıldı",
  "platform.release.create": "Sürüm oluşturuldu",
  "platform.release.ingest": "Sürüm bilgisi aktarıldı",
  "platform.retention.cleanup": "Eski kayıt temizliği yapıldı",
  "platform.retention.dry_run": "Eski kayıt temizliği önizlendi",
  "saas.job.clash_review": "Tahsilat çakışması incelendi",
  "saas.edoc.resend_email": "E-belge e-postası yeniden gönderildi",
  "saas.edoc.retry": "E-belge düzenleme yeniden denendi",
  "saas.access_denied": "Yetkisiz işlem engellendi",
  // Giriş ve güvenlik
  "auth.login_success": "Giriş yapıldı",
  "auth.success": "Giriş yapıldı",
  "auth.login_failed": "Giriş denemesi başarısız",
  "auth.login_failure_reason": "Giriş denemesi başarısız",
  "auth.password_changed": "Parola değişti",
  "auth.email_changed": "E-posta değişti",
  "auth.email_change_requested": "E-posta değişimi istendi",
  "auth.invalid_token": "Geçersiz bağlantı kullanıldı",
  "auth.tenant_mismatch": "Yetkisiz kurum erişimi engellendi",
  "authz.denied": "Yetkisiz işlem engellendi",
  "security.critical_password_change": "Kritik parola değişimi",
  "csrf.rejected": "Geçersiz form gönderimi engellendi",
};

export function auditActionLabel(action: string): string {
  const hit = LABELS[action];
  if (hit) return hit;
  const last = action.split(".").pop() ?? action;
  const words = last.replace(/_/g, " ").trim();
  return words ? words[0]!.toLocaleUpperCase("tr") + words.slice(1) : action;
}

const ENTITY_LABELS: Record<string, string> = {
  CommercialCatalog: "Katalog",
  PolicyVersion: "Katalog sürümü",
  TenantCustomRole: "Özel rol",
  RolePreset: "Rol hazır ayarı",
  RetentionJob: "Temizlik işi",
  SupportAccessSession: "Destek erişimi",
  PlatformLogo: "Logo",
  OwnerInvitation: "Sahip daveti",
  UserSession: "Oturum",
  SiteSocial: "Sosyal medya",
  SiteMobileApps: "Mobil uygulama",
  SiteContent: "Site metinleri",
  User: "Kullanıcı",
  Auth: "Giriş",
  Student: "Öğrenci",
  student: "Öğrenci",
  Payment: "Ödeme",
  Task: "Görev",
  TeacherPayout: "Hakediş",
  School: "Kurum",
  Package: "Paket",
  Lesson: "Ders",
  MakeupRequest: "Telafi isteği",
  HomeworkSubmission: "Ödev teslimi",
  CommunicationMessage: "Mesaj",
  StudentContract: "Sözleşme",
  PaymentFollowUpCase: "Tahsilat dosyası",
  SmsInbound: "Gelen SMS",
  EDocument: "E-Belge",
};

export function auditEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/** Filtre listesi için kayıt türleri (kod + okunabilir ad). */
export const AUDIT_ENTITY_OPTIONS = Object.entries(ENTITY_LABELS)
  .map(([code, label]) => ({ code, label }))
  .sort((a, b) => a.label.localeCompare(b.label, "tr"));

const OUTCOME_LABELS: Record<string, string> = {
  success: "Başarılı",
  denied: "Engellendi",
  error: "Hata",
};

export function auditOutcomeLabel(outcome: string): string {
  return OUTCOME_LABELS[outcome] ?? outcome;
}
