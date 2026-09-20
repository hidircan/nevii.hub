"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  CreditCard,
  FileText,
  LayoutDashboard,
  User,
} from "lucide-react";

/**
 * J — Öğrenci detayı bilgi mimarisi (2026-09-20).
 *
 * ÖNCE: tek sayfada 13 bölüm alt alta (858 satır) + `#anchor` linkleri. Bir
 * başlığa tıklamak "ekran açmıyor", sadece sayfayı kaydırıyordu; her açılışta
 * ödevden değerlendirmeye kadar HER ŞEY yükleniyordu.
 *
 * SONRA: 6 sekme, her biri GERÇEK bir route. Birleştirmeler bilinçli:
 *  - Genel Bilgiler + İletişim + Portal Erişimi → "Bilgiler" (kimlik & erişim
 *    aynı kişinin aynı kaydı; ayrı ayrı gezmek anlamsızdı)
 *  - Dersler + Yoklama + Yoklama Takvimi + Telafiler → "Program & Yoklama"
 *    (hepsi aynı soruya bakıyor: bu öğrenci derslerine geliyor mu?)
 *  - Müfredat + Ödev/Materyal + Karşılıklı Değerlendirmeler → "Gelişim"
 * Ayrılanlar: Ödemeler ve Sözleşmeler ayrı kalır (farklı sorumluluk, farklı
 * yetki, farklı sıklıkta kullanılır). Yeni "Özet" sekmesi eklendi — eskiden
 * hiçbir yerde "bu öğrencide durum ne?" tek bakışta görülemiyordu.
 */
const TABS = [
  { segment: "", label: "Özet", icon: LayoutDashboard },
  { segment: "bilgiler", label: "Bilgiler", icon: User },
  { segment: "program", label: "Program & Yoklama", icon: CalendarDays },
  { segment: "odemeler", label: "Ödemeler", icon: CreditCard },
  { segment: "sozlesmeler", label: "Sözleşmeler", icon: FileText },
  { segment: "gelisim", label: "Gelişim", icon: BookOpen },
  { segment: "evraklar", label: "Evraklar", icon: FileText },
] as const;

export function StudentDetailTabs({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  const base = `/panel/ogrenciler/${studentId}`;

  return (
    <nav
      aria-label="Öğrenci bölümleri"
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
