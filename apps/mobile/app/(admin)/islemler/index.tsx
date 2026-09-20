import { useRouter } from "expo-router";
import { AppHeader, ListGroup, ListRow, Screen } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import type { AdminDashboardSummary, AnnouncementsResponse, FollowUpCasesResponse, MakeupResponse, TaskKpiSummary } from "../../../src/types/api";
import type { IconName } from "../../../src/components/ui";

type OpsItem = {
  key: string;
  icon: IconName;
  label: string;
  description: string;
  route: string;
  count?: number | null;
};

export default function IslemlerIndex() {
  const router = useRouter();
  const dashboard = useApiGet<AdminDashboardSummary>("/api/v1/dashboard/summary");
  const taskKpi = useApiGet<TaskKpiSummary>("/api/v1/tasks/kpi");
  const announcements = useApiGet<AnnouncementsResponse>("/api/v1/announcements/manage");
  const makeup = useApiGet<MakeupResponse>("/api/v1/makeup");
  const followUp = useApiGet<FollowUpCasesResponse>("/api/v1/tahsilat/cases");

  const items: OpsItem[] = [
    {
      key: "attendance",
      icon: "checkmark-done-outline",
      label: "Yoklama",
      description: "Bekleyen yoklamaları tamamlayın",
      route: "/(admin)/islemler/yoklama",
      count: dashboard.status === "success" ? dashboard.data.pendingAttendanceCount : null,
    },
    {
      key: "makeup",
      icon: "swap-horizontal-outline",
      label: "Telafi merkezi",
      description: "Telafi taleplerini onayla/iptal et",
      route: "/(admin)/islemler/telafi",
      count:
        makeup.status === "success"
          ? makeup.data.makeupRequests.filter((m) => ["pending", "suggested", "awaiting_info"].includes(m.status)).length
          : null,
    },
    {
      key: "tahsilat",
      icon: "call-outline",
      label: "Tahsilat takibi (CRM)",
      description: "Ödeme takip kuyruğu ve mesaj taslakları",
      route: "/(admin)/islemler/tahsilat",
      count: followUp.status === "success" ? followUp.data.cases.filter((c) => !["paid", "lost"].includes(c.status)).length : null,
    },
    {
      key: "leave",
      icon: "calendar-outline",
      label: "İzin onayları",
      description: "Personel izin taleplerini onayla/reddet",
      route: "/(admin)/islemler/izinler",
      count: null,
    },
    {
      key: "deletion",
      icon: "trash-outline",
      label: "Silme talepleri",
      description: "Hesap silme taleplerini incele ve karara bağla",
      route: "/(admin)/islemler/silme-talepleri",
      count: null,
    },
    {
      key: "announcements",
      icon: "megaphone-outline",
      label: "Duyurular",
      description: "Duyuru oluştur ve yönet",
      route: "/(admin)/islemler/duyurular",
      count: announcements.status === "success" ? announcements.data.announcements.length : null,
    },
    {
      key: "tasks",
      icon: "checkbox-outline",
      label: "İş takip",
      description: "Açık ve gecikmiş görevler",
      route: "/(admin)/islemler/is-takip",
      count: taskKpi.status === "success" ? taskKpi.data.openCount : null,
    },
    {
      key: "homework-report",
      icon: "book-outline",
      label: "Ödev raporu",
      description: "Öğretmen bazlı ödev takibi",
      route: "/(admin)/islemler/odev-raporu",
      count: null,
    },
    {
      key: "teacher-performance",
      icon: "school-outline",
      label: "Öğretmen performansı",
      description: "Skor sıralaması ve detaylar",
      route: "/(admin)/islemler/ogretmen-performans",
      count: dashboard.status === "success" ? dashboard.data.topTeachers.length : null,
    },
    {
      key: "finance",
      icon: "cash-outline",
      label: "Finans / hakediş",
      description: "Ödeme ve hakediş özetleri",
      route: "/(admin)/islemler/finans",
      count: dashboard.status === "success" ? dashboard.data.followUpNeededCount : null,
    },
    {
      key: "workflows",
      icon: "sync-outline",
      label: "Otomasyonlar",
      description: "Zamanlanmış iş akışları ve son çalışmalar",
      route: "/(admin)/islemler/workflows",
      count: null,
    },
    {
      key: "katalog",
      icon: "business-outline",
      label: "Şube / oda / enstrüman",
      description: "Kurulum kataloğu (liste)",
      route: "/(admin)/islemler/katalog",
      count: null,
    },
  ];

  return (
    <Screen>
      <AppHeader title="İşlemler" subtitle="Kurum operasyonları" />
      <ListGroup>
        {items.map((item) => (
          <ListRow
            key={item.key}
            icon={item.icon}
            title={item.count != null ? `${item.label} · ${item.count}` : item.label}
            subtitle={item.description}
            onPress={() => router.push(item.route)}
          />
        ))}
      </ListGroup>
    </Screen>
  );
}
