"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardCheck,
  Clock,
  CreditCard,
  LayoutDashboard,
  Star,
  TrendingUp,
  User,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Öğretmen detayı bilgi mimarisi — öğrenci detayı ile aynı desen.
 *
 * ÖNCE: tek sayfada 14 bölüm + `#anchor` chip'leri; tıklamak ekran açmıyor,
 * kaydırıyordu; performans paneli özetle tekrarlanıyordu.
 *
 * SONRA: gerçek route sekmeleri. Bilgiler birleşik (kimlik/iletişim/portal/
 * uzmanlık/özlük/sözleşme). Saatlik ücret hakediş sekmesinde. Mevcut
 * /musaitlik /performans /hakedis /odemeler /geri-bildirim yolları korunur.
 */
const TABS = [
  { segment: "", label: "Özet", icon: LayoutDashboard },
  { segment: "bilgiler", label: "Bilgiler", icon: User },
  { segment: "program", label: "Program", icon: CalendarDays },
  { segment: "musaitlik", label: "Müsaitlik", icon: Clock },
  { segment: "ogrenciler", label: "Öğrenciler", icon: Users },
  { segment: "yoklama", label: "Yoklama", icon: ClipboardCheck },
  { segment: "performans", label: "Performans", icon: TrendingUp },
  { segment: "hakedis", label: "Hakediş", icon: Wallet },
  { segment: "odemeler", label: "Ödemeler", icon: CreditCard },
  { segment: "geri-bildirim", label: "Geri Bildirim", icon: Star },
] as const;

export function TeacherDetailTabs({ teacherId }: { teacherId: string }) {
  const pathname = usePathname();
  const base = `/panel/ogretmenler/${teacherId}`;

  return (
    <nav
      aria-label="Öğretmen bölümleri"
      className="sticky top-0 z-10 -mx-4 mb-6 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = tab.segment ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={tab.segment || "ozet"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                    : "border-transparent text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
                }`}
              >
                <tab.icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
