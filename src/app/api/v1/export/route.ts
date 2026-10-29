import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api/handler";
import { jsonFail } from "@/lib/api/http";
import { readData } from "@/lib/store";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { resolveWriteScope, ALL_MODE_WRITE_DENIED_MESSAGE } from "@/lib/institution/write-scope";
import {
  buildInstitutionExport,
  EXPORT_ENTITIES,
  type ExportEntity,
  type StandaloneExportData,
} from "@/lib/export/institution-export";
import { recordAuditLog } from "@/lib/audit/log";
import { listAllNotifications } from "@/lib/notifications";
import { listAnnouncements } from "@/lib/announcements";
import { listAllAssessments } from "@/lib/assessment";
import { listAllAvailabilityRequests } from "@/lib/teacher-availability";
import { listAllHomework, listAllHomeworkSubmissions } from "@/lib/homework";
import { listTeachingMaterials } from "@/lib/teaching-materials";
import { listTeacherFeedback } from "@/lib/teacher-feedback";
import { listAllCurriculumTopics } from "@/lib/curriculum";
import { listAllTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/export?entity=students — kurumun TEK bir varlık türünü CSV
 * olarak indirir. `readData()` zaten oturum/ALS'e göre tenant-scoped
 * döndüğü için başka bir kurumun tek bir kaydı bile bu yanıta giremez.
 * "Tüm kurumlar" görünümü (SUPER_ADMIN) için de export REDDEDİLİR — mevcut
 * "Tüm kurumlar görünümünde işlem yapılamaz" yazma-engelleme desenine
 * paralel (bkz. `resolveWriteScope`).
 *
 * DÜZELTME (Faz 2 güvenlik taraması) — yukarıdaki "readData() zaten ALS'e
 * göre tenant-scoped" varsayımı SUPER_ADMIN'in kendi JWT'sindeki ana kurum
 * DIŞINDA bir kurum seçtiği (kurum cookie) senaryoda YANLIŞTI:
 * `withApiHandler` ALS'yi ctx.tenantId (oturumun ANA kurumu) ile kurar,
 * ancak `scope.tenantId` (resolveWriteScope) seçili kurumu yansıtır — bu
 * ikisi SUPER_ADMIN çoklu-kurum akışında AYRIŞABİLİR. Açık sarmalama
 * olmadan `readData()` yanlış kurumun ana varlık verisini (students/
 * payments/lessons) dönebilirken, aşağıdaki `extra.*` alanları zaten doğru
 * `scope.tenantId` ile çağrılıyordu — tutarsız, kurumlar-arası karışık bir
 * export'a yol açardı. `runWithTenantAsync(scope.tenantId, ...)` ile
 * sarmalamak `readData()`'yı da aynı (seçili) kuruma sabitler.
 */
export const GET = withApiHandler(
  async ({ ctx, searchParams }) => {
    const scope = await resolveWriteScope(ctx);
    if (scope.mode !== "single") {
      return jsonFail(
        "FORBIDDEN",
        scope.mode === "all" ? ALL_MODE_WRITE_DENIED_MESSAGE : scope.reason
      );
    }

    const entityParam = searchParams.get("entity");
    if (!entityParam || !EXPORT_ENTITIES.includes(entityParam as ExportEntity)) {
      return jsonFail(
        "VALIDATION_ERROR",
        `Geçerli bir 'entity' parametresi gerekli: ${EXPORT_ENTITIES.join(", ")}`
      );
    }
    const entity = entityParam as ExportEntity;

    const data = await runWithTenantAsync(scope.tenantId, () => readData());
    const extra: StandaloneExportData = {};
    switch (entity) {
      case "notifications":
        extra.notifications = await listAllNotifications(scope.tenantId);
        break;
      case "announcements":
        extra.announcements = await listAnnouncements(scope.tenantId);
        break;
      case "lessonAssessments":
        extra.lessonAssessments = await listAllAssessments(scope.tenantId);
        break;
      case "teacherAvailabilityRequests":
        extra.teacherAvailabilityRequests = await listAllAvailabilityRequests(scope.tenantId);
        break;
      case "homework":
        extra.homework = await listAllHomework(scope.tenantId);
        break;
      case "homeworkSubmissions":
        extra.homeworkSubmissions = await listAllHomeworkSubmissions(scope.tenantId);
        break;
      case "teachingMaterials":
        extra.teachingMaterials = await listTeachingMaterials(scope.tenantId);
        break;
      case "teacherFeedback":
        extra.teacherFeedback = await listTeacherFeedback(scope.tenantId);
        break;
      case "studentCurriculumTopics":
        extra.studentCurriculumTopics = await listAllCurriculumTopics(scope.tenantId);
        break;
      case "tasks":
        extra.tasks = await listAllTasks(scope.tenantId);
        break;
      default:
        break;
    }
    const files = buildInstitutionExport(data, [entity], extra);
    const csv = files[entity];

    void recordAuditLog({
      tenantId: scope.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: "export.institution_data",
      entityType: "Export",
      entityId: entity,
      outcome: "success",
      meta: { entity, rowCount: csv.split("\r\n").length - 1 },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity}.csv"`,
        // Kurum verisi + kullanıcıya özel: ara önbelleklerde tutulmaz (diğer
        // dosya/ek rotalarıyla aynı desen; dynamic rota varsayılanını açık yazar).
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  },
  { permission: "export:institution" }
);
