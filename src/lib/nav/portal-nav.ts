/**
 * İş 5 — öğretmen/veli/öğrenci ortak portal shell'i için rol bazlı
 * navigasyon kataloğu. Panel'deki `panel-nav.ts` ile AYNI ilke: tek kaynak,
 * hem masaüstü nav hem mobil bottom nav aynı listeden türetilir (mobil en
 * fazla 4 gerçek hedef + "Diğer").
 */
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ClipboardCheck, GraduationCap, Home, LayoutGrid, TrendingUp, Users, Wallet } from "lucide-react";

export type PortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Mobil alt navigasyonda gösterilir mi (en fazla 4 + "Diğer") */
  mobile?: boolean;
};

export const TEACHER_PORTAL_NAV: PortalNavItem[] = [
  { href: "/ogretmen", label: "Bugün", icon: Home, mobile: true },
  { href: "/ogretmen/program", label: "Program", icon: CalendarDays, mobile: true },
  { href: "/ogretmen/ogrenciler", label: "Öğrenciler", icon: Users, mobile: true },
  { href: "/ogretmen/hakedis", label: "Hakediş", icon: Wallet },
  { href: "/ogretmen/odevler", label: "Ödevler", icon: ClipboardCheck },
  { href: "/ogretmen/is-takip", label: "Diğer", icon: LayoutGrid, mobile: true },
];

export const PARENT_PORTAL_NAV: PortalNavItem[] = [
  { href: "/veli", label: "Bugün", icon: Home, mobile: true },
  { href: "/veli#program", label: "Program", icon: CalendarDays, mobile: true },
  { href: "/veli/degerlendirme", label: "Gelişim", icon: TrendingUp, mobile: true },
  { href: "/veli#odemeler", label: "Ödemeler", icon: Wallet, mobile: true },
  { href: "/veli/odevler", label: "Diğer", icon: LayoutGrid },
];

export const STUDENT_PORTAL_NAV: PortalNavItem[] = [
  { href: "/ogrenci", label: "Bugün", icon: Home, mobile: true },
  { href: "/ogrenci#haftalik-program", label: "Program", icon: CalendarDays, mobile: true },
  { href: "/ogrenci/odevlerim", label: "Ödevler", icon: ClipboardCheck, mobile: true },
  { href: "/ogrenci/mufredat", label: "Gelişim", icon: GraduationCap, mobile: true },
  { href: "/ogrenci/materyaller", label: "Diğer", icon: LayoutGrid },
];
