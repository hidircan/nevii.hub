import { useRouter } from "expo-router";
import { AppHeader, ListGroup, ListRow, Screen } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useLocale } from "../../../src/i18n/locale-context";
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
  const { t: tr } = useLocale();
  const dashboard = useApiGet<AdminDashboardSummary>("/api/v1/dashboard/summary");
  const taskKpi = useApiGet<TaskKpiSummary>("/api/v1/tasks/kpi");
  const announcements = useApiGet<AnnouncementsResponse>("/api/v1/announcements/manage");
  const makeup = useApiGet<MakeupResponse>("/api/v1/makeup");
  const followUp = useApiGet<FollowUpCasesResponse>("/api/v1/tahsilat/cases");

  const items: OpsItem[] = [
    {
      key: "attendance",
      icon: "checkmark-done-outline",
      label: tr("adm.opsAtt"),
      description: tr("adm.opsAttD"),
      route: "/(admin)/islemler/yoklama",
      count: dashboard.status === "success" ? dashboard.data.pendingAttendanceCount : null,
    },
    {
      key: "makeup",
      icon: "swap-horizontal-outline",
      label: tr("adm.opsMk"),
      description: tr("adm.opsMkD"),
      route: "/(admin)/islemler/telafi",
      count:
        makeup.status === "success"
          ? makeup.data.makeupRequests.filter((m) => ["pending", "suggested", "awaiting_info"].includes(m.status)).length
          : null,
    },
    {
      key: "tahsilat",
      icon: "call-outline",
      label: tr("adm.opsColl"),
      description: tr("adm.opsCollD"),
      route: "/(admin)/islemler/tahsilat",
      count: followUp.status === "success" ? followUp.data.cases.filter((c) => !["paid", "lost"].includes(c.status)).length : null,
    },
    {
      key: "leave",
      icon: "calendar-outline",
      label: tr("adm.opsLeave"),
      description: tr("adm.opsLeaveD"),
      route: "/(admin)/islemler/izinler",
      count: null,
    },
    {
      key: "deletion",
      icon: "trash-outline",
      label: tr("adm.opsDel"),
      description: tr("adm.opsDelD"),
      route: "/(admin)/islemler/silme-talepleri",
      count: null,
    },
    {
      key: "announcements",
      icon: "megaphone-outline",
      label: tr("adm.opsAnnc"),
      description: tr("adm.opsAnncD"),
      route: "/(admin)/islemler/duyurular",
      count: announcements.status === "success" ? announcements.data.announcements.length : null,
    },
    {
      key: "tasks",
      icon: "checkbox-outline",
      label: tr("adm.opsTasks"),
      description: tr("adm.opsTasksD"),
      route: "/(admin)/islemler/is-takip",
      count: taskKpi.status === "success" ? taskKpi.data.openCount : null,
    },
    {
      key: "homework-report",
      icon: "book-outline",
      label: tr("adm.opsHwRep"),
      description: tr("adm.opsHwRepD"),
      route: "/(admin)/islemler/odev-raporu",
      count: null,
    },
    {
      key: "teacher-performance",
      icon: "school-outline",
      label: tr("adm.opsTPerf"),
      description: tr("adm.opsTPerfD"),
      route: "/(admin)/islemler/ogretmen-performans",
      count: dashboard.status === "success" ? dashboard.data.topTeachers.length : null,
    },
    {
      key: "finance",
      icon: "cash-outline",
      label: tr("adm.opsFin"),
      description: tr("adm.opsFinD"),
      route: "/(admin)/islemler/finans",
      count: dashboard.status === "success" ? dashboard.data.followUpNeededCount : null,
    },
    {
      key: "workflows",
      icon: "sync-outline",
      label: tr("adm.opsWf"),
      description: tr("adm.opsWfD"),
      route: "/(admin)/islemler/workflows",
      count: null,
    },
    {
      key: "group-lessons",
      icon: "people-outline",
      label: tr("adm.opsGroup"),
      description: tr("adm.opsGroupD"),
      route: "/(admin)/islemler/grup-dersleri",
      count: null,
    },
    {
      key: "katalog",
      icon: "business-outline",
      label: tr("adm.opsCat"),
      description: tr("adm.opsCatD"),
      route: "/(admin)/islemler/katalog",
      count: null,
    },
  ];

  return (
    <Screen>
      <AppHeader title={tr("adm.opsTitle")} subtitle={tr("adm.opsSub")} />
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
