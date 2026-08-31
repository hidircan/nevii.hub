import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { runWithTenantAsync } from "../tenant-context";
import type { ServiceContext } from "../services/context";

/**
 * Faz 2 güvenlik taraması bulgusu — `approveFollowUpCaseTool` ve
 * `sendFollowUpMessageTool` (src/lib/tahsilat/service.ts), çağıranın
 * geçirdiği `ctx.tenantId` (route katmanında `resolveWriteScope` ile
 * SUPER_ADMIN'in seçtiği kurum olabilir) yerine ambient ALS'i (istek
 * boyunca `withApiHandler`'ın kurduğu ORİJİNAL oturum kurumu) kullanan bare
 * bir `readData()` çağrısına sahipti. Bu ikisi SUPER_ADMIN çoklu-kurum
 * akışında ayrışabilir: `getFollowUpCase`/`transitionFollowUpCase` gibi
 * çağrılar açıkça `ctx.tenantId` alır ve DOĞRU kurumu hedefler, ama
 * `data.payments.find(...)`/`data.students.find(...)` YANLIŞ (ALS'in)
 * kurumun verisinden okunuyordu — sessiz bir kurumlar-arası karışma.
 *
 * Düzeltme: her iki fonksiyon da artık `readData()`'yı
 * `runWithTenantAsync(ctx.tenantId, ...)` ile sarmalıyor — store'un kendi
 * `assertTenant` koruması (bkz. store-json.ts) artık uyuşmayan bir
 * tenantId'yi SESSİZCE yanlış veri döndürmek yerine AÇIKÇA reddeder
 * (fail-closed). Bu test dosyası, json store modunda GERÇEKTEN var olan TEK
 * kurumdan (DEFAULT_TENANT_ID) farklı bir `ctx.tenantId` ile çağrıldığında
 * bu fail-closed davranışı kanıtlar, ve eşleşen (normal, tek-kurum) yolun
 * hâlâ sorunsuz çalıştığını doğrular (regresyon yok).
 */

const DATA_FILE = path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json");

const { readData } = await import("../store");
const { approveFollowUpCaseTool } = await import("../tahsilat/service");

beforeEach(async () => {
  await fs.rm(DATA_FILE, { force: true });
});

describe("approveFollowUpCaseTool — ALS/writeScope kurum uyuşmazlığı", () => {
  it("ambient ALS'den FARKLI bir ctx.tenantId ile çağrıldığında yanlış kurumun verisini sessizce kullanmaz — fail-closed hata verir", async () => {
    // Dış istek ALS'i gerçek dosyanın kurumu (DEFAULT_TENANT_ID) olarak
    // kurar — withApiHandler'ın her istekte yaptığı gibi.
    await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
      const data = await readData();
      const payment = data.payments[0];
      const student = data.students.find((s) => s.id === payment.studentId)!;

      // Route katmanı (resolveWriteScope), SUPER_ADMIN'in seçtiği FARKLI bir
      // kurumu ctx.tenantId olarak geçirir — tam olarak
      // tahsilat/cases/[id]/approve route'unun yaptığı gibi.
      const scopedCtx: ServiceContext = {
        role: "SCHOOL_ADMIN",
        userId: "super1",
        tenantId: "tenant_other_kurum",
        channel: "web",
      };

      await expect(
        approveFollowUpCaseTool(scopedCtx, {
          paymentId: payment.id,
          studentId: student.id,
          message: "Test mesajı",
        })
      ).rejects.toThrow(/Cross-tenant access denied/);
    });
  });

  it("ctx.tenantId ambient ALS ile eşleştiğinde (normal tek-kurum akışı) sorunsuz onaylar — regresyon yok", async () => {
    await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
      const data = await readData();
      const payment = data.payments[0];
      const student = data.students.find((s) => s.id === payment.studentId)!;

      const scopedCtx: ServiceContext = {
        role: "SCHOOL_ADMIN",
        userId: "admin1",
        tenantId: DEFAULT_TENANT_ID,
        channel: "web",
      };

      const result = await approveFollowUpCaseTool(scopedCtx, {
        paymentId: payment.id,
        studentId: student.id,
        message: "Test mesajı",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("approved");
        expect(result.data.approvedMessage).toContain("Test mesajı");
      }
    });
  });
});
