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
  Brain,
  Workflow,
  Building2,
  Wrench,
  Palette,
  Package as PackageIcon,
  Music,
  ListChecks,
  UserCog,
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
];

/** Paket 7 — Finans grubu: ödeme/hakediş/paket/kampanya ile ilgili tüm ekranlar tek yerde. */
export const PANEL_FINANCE_NAV: PanelNavItem[] = [
  { href: "/panel/odemeler", label: "Ödemeler", icon: CreditCard },
  { href: "/panel/hakedisler", label: "Öğretmen Hakedişleri", icon: Wallet },
  { href: "/panel/paketler", label: "Paketler", icon: PackageIcon, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

export const PANEL_OPS_NAV: PanelNavItem[] = [
  /** İnsan-odaklı operasyon görev takibi — /panel/workflows (AI otomasyonu) ile İLGİSİZ, ayrı modül. */
  { href: "/panel/is-takip", label: "İş Takip", icon: ListChecks },
  { href: "/panel/personel", label: "Personel", icon: UserCog, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/personel/bordrolar", label: "Bordrolar", icon: Wallet, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/personel/izinler", label: "İzinler", icon: CalendarDays, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/finans-ozeti", label: "Finans Özeti", icon: CreditCard, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  { href: "/panel/evraklar", label: "Evraklar", icon: FileText },
  { href: "/panel/deneme", label: "Deneme Dersleri", icon: FlaskConical },
  { href: "/panel/ders-duzeltme", label: "Ders düzeltme", icon: Wrench },
  { href: "/panel/duyurular", label: "Duyurular", icon: MessageCircle },
  { href: "/panel/bildirimler", label: "WhatsApp", icon: MessageCircle },
  { href: "/panel/subeler", label: "Şubeler", icon: Building2 },
  /** ÖNCELİK 4 (devam) — Yönetilebilir Enstrüman Kataloğu: yalnız admin roller. */
  { href: "/panel/enstrumanlar", label: "Enstrümanlar", icon: Music, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
  /** Paket 7 — ödev atama/teslim raporu. */
  { href: "/panel/odev-raporu", label: "Ödev Raporu", icon: FileText, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

export const PANEL_AI_NAV: PanelNavItem[] = [
  { href: "/panel/chat", label: "Asistan", icon: Sparkles },
  { href: "/panel/ai", label: "AI Özet", icon: Activity },
  { href: "/panel/ai/logs", label: "AI Log", icon: ScrollText },
  { href: "/panel/ai/memory", label: "AI Bellek", icon: Brain },
  { href: "/panel/workflows", label: "İş Akışları", icon: Workflow },
];

export const PANEL_SYSTEM_NAV: PanelNavItem[] = [
  { href: "/panel/kurulum", label: "Kurulum Merkezi", icon: Settings },
  { href: "/panel/veri-aktar", label: "Veri Aktarım Merkezi", icon: Upload },
  { href: "/gorunum-ayarlari", label: "Görünüm Ayarları", icon: Palette },
  /** Kim, ne zaman, hangi ekranda/varlıkta hangi kritik işlemi yaptı. */
  { href: "/panel/denetim-kaydi", label: "Denetim Kaydı", icon: ScrollText, roles: ["SUPER_ADMIN", "SCHOOL_ADMIN"] },
];

export function isNavActive(pathname: string, href: string): boolean {
  const base = href.split("?")[0] ?? href;
  if (base === "/panel") return pathname === "/panel";
  return pathname === base || pathname.startsWith(`${base}/`);
}
