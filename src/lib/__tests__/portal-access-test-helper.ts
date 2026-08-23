/**
 * Karma Öğrenci Portalı — test-only helper. `canAccessStudent`/
 * `assertStudentAccess` (src/lib/services/context.ts) artık STUDENT rolü
 * için `ctx.studentId` karşılaştırması DEĞİL, aktif bir
 * `StudentPortalAccess` kaydı arıyor (bkz. src/lib/student-portal-access.ts).
 * Eski testler `role: "PARENT", studentId: "sX"` ile örtük erişim
 * varsayıyordu — artık STUDENT rolüyle önce bu helper'la aktif erişim
 * kaydı oluşturulmalı, yoksa FORBIDDEN döner.
 */
import type { ServiceContext } from "../services/context";
import { inviteStudentPortalAccess, activateStudentPortalAccess, type PortalAccessType } from "../student-portal-access";

export async function grantStudentAccess(
  ctx: Pick<ServiceContext, "tenantId" | "userId">,
  studentId: string,
  accessType: PortalAccessType = "GUARDIAN"
): Promise<void> {
  await inviteStudentPortalAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    studentId,
    accessType,
    invitedBy: "test-setup",
  });
  await activateStudentPortalAccess(ctx.tenantId, ctx.userId, studentId);
}
