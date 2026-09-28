/**
 * Panel sol menü — tek kaynak. Tüm panel sayfaları Sidebar üzerinden bunu kullanır.
 * Sprint: Fonksiyon Onarımı + Kurumsal UI — ana iş akışı sırası sabit.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  Wallet,
  RefreshCcw,
  GraduationCap,
  Users,
  MessageCircle,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Sparkles,
  Settings,
  Upload,
  Activity,
  ScrollText,
  ShieldCheck,
  PhoneCall,
  Brain,
  Workflow,
  Wrench,
  Package as PackageIcon,
  ListChecks,
  UserCog,
  Building2 as Building2Icon,
  Music as MusicIcon,
  CircleHelp,
  Mail,
  Briefcase,
} from "lucide-react";

export type PanelNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see this item; undefined = all panel staff */
  roles?: Array<"SUPER_ADMIN" | "SCHOOL_ADMIN" | "AI_AGENT">;
};

/**
 * Ana menü — sıra kesindir (prompt §B). Paket 7 — "Tahsilatlar" kaldırıldı
 * (Ödemeler ekranındaki "Tahsilat takibini aç" bağlantısından hâlâ
 * erişilebilir; route/izin/RBAC hiçbiri değişmedi, yalnızca sidebar
 * girdisi kaldırıldı).
 */
export const PANEL_MAIN_NAV: PanelNavItem[] = [
  { href: "/panel", label: "Özet", icon: LayoutDashboard },
  { href: "/panel/program", label: "Ders Programı", icon: CalendarDays },
  { href: "/panel/yoklama", label: "Yoklama", icon: ClipboardCheck },
  { href: "/panel/telafi", label: "Telafi Merkezi", icon: RefreshCcw },
  { href: "/panel/ogrenciler", label: "Öğrenciler", icon: GraduationCap },
  { href: "/panel/ogretmenler", label: "Öğretmenler", icon: Users },
  { href: "/panel/mufredat", label: "Müfredat", icon: MusicIcon },
];

/** Paket 7 — Finans grubu: ödeme/hakediş/paket/kampanya ile ilgili tüm ekranlar tek yerde. */
export const PANEL_FINANCE_NAV: PanelNavItem[] = [
  { href: "/panel/odemeler", label: "Ödemeler", icon: CreditCard },
  { href: "/panel/hakedisler", label: "Öğretmen Hakedişleri", icon: Wallet },
  { href: "/panel/paketler", label: "Paketler", icon: PackageIcon, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

/**
 * İş 2 — Kurulum Merkezi + Personel altına taşınanlar: Şubeler, Enstrümanlar,
 * Bordrolar, İzinler artık burada AYRI girdi değil. Route'lar ve RBAC
 * AYNEN kalır (bkz. src/app/panel/kurulum, src/app/panel/personel) —
 * yalnız üst-seviye navigasyon konumu değişti.
 */
export const PANEL_OPS_NAV: PanelNavItem[] = [
  /** İnsan-odaklı operasyon görev takibi — /panel/workflows (AI otomasyonu) ile İLGİSİZ, ayrı modül. */
  { href: "/panel/is-takip", label: "İş Takip", icon: ListChecks },
  { href: "/panel/personel", label: "Personel", icon: UserCog, roles: ["SUPER_ADMIN"] },
  /** İK / işe alım — ilanlar, aday havuzu, görüşme, e-posta (feat/ik-recruitment). */
  { href: "/panel/ik", label: "İnsan Kaynakları", icon: Briefcase, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/finans-ozeti", label: "Finans Özeti", icon: CreditCard, roles: ["SUPER_ADMIN"] },
  { href: "/panel/evraklar", label: "Evraklar", icon: FileText },
  { href: "/panel/deneme", label: "Deneme Dersleri", icon: FlaskConical },
  { href: "/panel/ders-duzeltme", label: "Ders düzeltme", icon: Wrench },
  { href: "/panel/duyurular", label: "Duyurular", icon: MessageCircle },
  { href: "/panel/bildirimler", label: "Bildirimler", icon: MessageCircle },
  { href: "/panel/iletisim-merkezi", label: "İletişim Merkezi", icon: MessageCircle, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /** Paket 7 — ödev atama/teslim raporu. */
  { href: "/panel/odev-raporu", label: "Ödev Raporu", icon: FileText, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /**
   * P0-F (2026-09-02) — kök neden: `/panel/yoklama-raporu` sayfası
   * (P0-2C, `745de96`) daha önce üretilmişti ama HİÇ menü girdisi
   * eklenmemişti — yalnız URL'yi bilenler erişebiliyordu. Sayfanın
   * kendisi ZATEN sunucu tarafında SCHOOL_ADMIN/SUPER_ADMIN'e kilitli
   * (redirect + getAttendanceReportTool içinde ayrıca RBAC) — bu girdi
   * yalnız `roles` ile AYNI kısıtı görünür/keşfedilebilir kılar,
   * öğretmen/öğrenci/veliye asla görünmez.
   */
  { href: "/panel/yoklama-raporu", label: "Yoklama Raporu", icon: FileText, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

export const PANEL_AI_NAV: PanelNavItem[] = [
  { href: "/panel/maestron-ai", label: "Asistan", icon: Sparkles },
  { href: "/panel/ai", label: "AI Özet", icon: Activity },
  { href: "/panel/ai/logs", label: "AI Log", icon: ScrollText },
  { href: "/panel/ai/memory", label: "AI Bellek", icon: Brain },
  { href: "/panel/workflows", label: "İş Akışları", icon: Workflow },
];

export const PANEL_SYSTEM_NAV: PanelNavItem[] = [
  { href: "/panel/ayarlar/kurum", label: "Kurum Ayarları", icon: Settings, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /** 10. tur iş #2 — kurum bazlı davet/şifre-sıfırlama e-posta şablonları. */
  { href: "/panel/e-posta-sablonlari", label: "E-posta Şablonları", icon: Mail, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/ayarlar/ozellikler", label: "Kurum Özellikleri", icon: ShieldCheck, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/ayarlar/entegrasyonlar", label: "Kurum Entegrasyonları", icon: Activity, roles: ["SUPER_ADMIN"] },
  { href: "/panel/kurulum", label: "Kurulum Merkezi", icon: Settings },
  /** ÇALIŞMA GÜNÜ TEK KAYNAĞI — haftalık kural + resmî tatil + zorla aç/kapat istisnaları. */
  { href: "/panel/ayarlar/calisma-gunleri", label: "Çalışma Günleri", icon: CalendarDays, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /** Kurum sahibi — öğretmen/personel performans puanı ağırlıkları. */
  { href: "/panel/ayarlar/performans", label: "Performans Ağırlıkları", icon: Activity, roles: ["SUPER_ADMIN"] },
  /** Kurum sahibi — kritik işlem şifresi (öğrenci silme). */
  { href: "/panel/ayarlar/guvenlik", label: "Güvenlik", icon: Settings, roles: ["SUPER_ADMIN"] },
  { href: "/panel/veri-aktar", label: "Veri Aktarım Merkezi", icon: Upload },
  /**
   * "Görünüm Ayarları" BİLİNÇLİ olarak burada YOK — kişisel bir tercih,
   * uygulama/iş navigasyonu değil; artık yalnız sağ üst kullanıcı
   * menüsünün "Görünüm" grubundan erişilir (bkz. user-menu.tsx). Rota
   * (`/gorunum-ayarlari`) ve cookie tabanlı tercih SAKLI kalır — yalnız
   * sidebar girdisi kaldırıldı.
   */
  /** Kim, ne zaman, hangi ekranda/varlıkta hangi kritik işlemi yaptı. */
  { href: "/panel/denetim-kaydi", label: "Denetim Kaydı", icon: ScrollText, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /** Faz 8 — hukuki metin versiyonları + tenant rıza ayarları. */
  { href: "/panel/ayarlar/kvkk", label: "KVKK Ayarları", icon: ShieldCheck, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /** Faz 11 — CRM arama/mesaj geçmişi (sağlayıcıdan bağımsız, manuel giriş). */
  { href: "/panel/crm", label: "CRM Geçmişi", icon: PhoneCall, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

/**
 * İş 2D — sidebar'da artık girdisi olmayan ama global arama/komut
 * paletinde bulunabilir kalması gereken sayfalar (bkz. panel-nav.ts
 * başındaki not). Etiket, taşındıkları üst bağlamı gösterir.
 */
export const PANEL_SEARCH_ONLY_NAV: PanelNavItem[] = [
  { href: "/panel/subeler", label: "Kurulum Merkezi › Şubeler", icon: Building2Icon },
  { href: "/panel/enstrumanlar", label: "Kurulum Merkezi › Enstrümanlar", icon: MusicIcon, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/personel/bordrolar", label: "Personel › Bordrolar", icon: Wallet, roles: ["SUPER_ADMIN"] },
  { href: "/panel/personel/izinler", label: "Personel › İzinler", icon: CalendarDays, roles: ["SUPER_ADMIN"] },
  { href: "/panel/yardim", label: "Yardım Merkezi", icon: CircleHelp },
];

export function isNavActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0] ?? href;
  if (base === "/panel") return pathname === "/panel";
  return pathname === base || pathname.startsWith(`${base}/`);
}
