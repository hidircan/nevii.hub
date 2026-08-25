import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { listCallLogsTool, listMessageLogsTool } from "@/lib/services";
import { Badge, Card, Input, Label, Select, PageHeader, Button } from "@/components/ui";
import { CrmMessageReveal } from "@/components/crm-message-reveal";
import {
  actionCreateCallLog,
  actionAssignCallContact,
  actionMarkCallbackDone,
  actionCreateMessageLog,
  actionAssignMessageContact,
  actionSetMessageStatus,
} from "@/lib/actions";
import { formatDateTime } from "@/lib/utils";
import type { CrmContactType } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONTACT_TYPE_LABEL: Record<CrmContactType, string> = { student: "Öğrenci", parent: "Veli", lead: "Potansiyel kayıt" };
const CHANNEL_LABEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "E-posta", other: "Diğer" };
const STATUS_LABEL: Record<string, string> = { unread: "Okunmadı", read: "Okundu", replied: "Yanıtlandı" };

/**
 * Faz 11 — CRM arama/mesaj günlüğü. Gerçek bir telefoni/mesajlaşma
 * sağlayıcısı BAĞLI DEĞİL (bkz. communication-provider/types.ts) — kayıtlar
 * bu turda manuel girilir; telefon numarasından otomatik kişi eşleştirme
 * (tekil eşleşmede) denenir, belirsizse/başarısızsa aşağıdan manuel atanır.
 * Yalnızca SCHOOL_ADMIN/SUPER_ADMIN (hassas iletişim verisi).
 */
export default async function CrmPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/crm");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const [callsResult, messagesResult, data] = await Promise.all([
    listCallLogsTool(session, {}),
    listMessageLogsTool(session, {}),
    readData(),
  ]);
  const calls = callsResult.ok ? callsResult.data.calls : [];
  const messages = messagesResult.ok ? messagesResult.data.messages : [];

  function contactLabel(contactType?: CrmContactType, contactId?: string): string {
    if (!contactType || !contactId) return "—";
    if (contactType === "lead") return `${CONTACT_TYPE_LABEL.lead} (${contactId})`;
    const student = data.students.find((s) => s.id === contactId);
    return `${student?.name ?? contactId} (${CONTACT_TYPE_LABEL[contactType]})`;
  }

  return (
    <div>
      <PageHeader
        title="CRM — Arama ve Mesaj Geçmişi"
        description="Gerçek bir telefoni/mesajlaşma sağlayıcısı henüz bağlı değil — kayıtlar manuel girilir. Telefon numarasından kişi eşleştirmesi otomatik denenir (tekil eşleşmede), belirsizse manuel atanır."
      />

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Aramalar</h2>
        <Card className="mb-3 overflow-x-auto !p-0">
          {calls.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz arama kaydı yok.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Numara</th>
                  <th className="px-4 py-3">Yön</th>
                  <th className="px-4 py-3">Cevaplandı</th>
                  <th className="px-4 py-3">Kişi</th>
                  <th className="px-4 py-3">Geri arama</th>
                  <th className="px-4 py-3">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{formatDateTime(c.occurredAt)}</td>
                    <td className="px-4 py-2 text-[var(--color-text)]">
                      {c.callerNumber}
                      {c.callerName ? <span className="block text-xs text-[var(--color-text-muted)]">{c.callerName}</span> : null}
                    </td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{c.direction === "inbound" ? "Gelen" : "Giden"}</td>
                    <td className="px-4 py-2">
                      <Badge status={c.answered ? "confirmed" : "cancelled"}>{c.answered ? "Evet" : "Hayır"}</Badge>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{contactLabel(c.contactType, c.contactId)}</td>
                    <td className="px-4 py-2">
                      {c.callbackDone ? (
                        <Badge status="confirmed">Tamamlandı</Badge>
                      ) : !c.answered ? (
                        <form
                          action={async () => {
                            "use server";
                            await actionMarkCallbackDone({ callId: c.id });
                          }}
                        >
                          <button
                            type="submit"
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                          >
                            Yapıldı işaretle
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {!c.contactId ? (
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await actionAssignCallContact({
                              callId: c.id,
                              contactType: String(formData.get("contactType") || "student") as CrmContactType,
                              contactId: String(formData.get("contactId") || ""),
                            });
                          }}
                          className="flex flex-wrap items-center gap-1"
                        >
                          <select name="contactType" className="rounded-md border border-[var(--color-border)] px-1.5 py-1 text-xs">
                            <option value="student">Öğrenci</option>
                            <option value="parent">Veli</option>
                            <option value="lead">Potansiyel</option>
                          </select>
                          <input
                            name="contactId"
                            placeholder="öğrenci ID"
                            required
                            className="w-24 rounded-md border border-[var(--color-border)] px-1.5 py-1 text-xs"
                          />
                          <button type="submit" className="rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-xs font-semibold">
                            Ata
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold text-[var(--color-text)]">Yeni arama kaydı</h3>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionCreateCallLog(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <Label>Telefon numarası</Label>
              <Input name="callerNumber" required placeholder="0555 000 0000" />
            </div>
            <div>
              <Label>Ad (opsiyonel)</Label>
              <Input name="callerName" />
            </div>
            <div>
              <Label>Yön</Label>
              <Select name="direction" defaultValue="inbound">
                <option value="inbound">Gelen</option>
                <option value="outbound">Giden</option>
              </Select>
            </div>
            <div>
              <Label>Tarih/saat</Label>
              <Input name="occurredAt" type="datetime-local" required />
            </div>
            <div>
              <Label>Süre (saniye, opsiyonel)</Label>
              <Input name="durationSeconds" type="number" min={0} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="answered" type="checkbox" name="answered" className="h-4 w-4" />
              <label htmlFor="answered" className="text-sm text-[var(--color-text)]">Cevaplandı</label>
            </div>
            <div className="sm:col-span-2">
              <Label>Not</Label>
              <Input name="note" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Kaydet</Button>
            </div>
          </form>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Mesajlar</h2>
        <Card className="mb-3 overflow-x-auto !p-0">
          {messages.length === 0 ? (
            <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz mesaj kaydı yok.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3">Kanal</th>
                  <th className="px-4 py-3">Gönderen</th>
                  <th className="px-4 py-3">İçerik</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Kişi</th>
                  <th className="px-4 py-3">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--color-border)] align-top last:border-0">
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{formatDateTime(m.occurredAt)}</td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{CHANNEL_LABEL[m.channel] ?? m.channel}</td>
                    <td className="px-4 py-2 text-[var(--color-text)]">{m.senderIdentifier}</td>
                    <td className="px-4 py-2">
                      <CrmMessageReveal messageId={m.id} summary={m.contentOrSummary} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <Badge status={m.status === "replied" ? "confirmed" : m.status === "read" ? "pending" : "cancelled"}>
                          {STATUS_LABEL[m.status]}
                        </Badge>
                        {m.status !== "replied" ? (
                          <form
                            action={async () => {
                              "use server";
                              await actionSetMessageStatus({ messageId: m.id, status: m.status === "unread" ? "read" : "replied" });
                            }}
                          >
                            <button type="submit" className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                              {m.status === "unread" ? "Okundu işaretle" : "Yanıtlandı işaretle"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{contactLabel(m.contactType, m.contactId)}</td>
                    <td className="px-4 py-2">
                      {!m.contactId ? (
                        <form
                          action={async (formData: FormData) => {
                            "use server";
                            await actionAssignMessageContact({
                              messageId: m.id,
                              contactType: String(formData.get("contactType") || "student") as CrmContactType,
                              contactId: String(formData.get("contactId") || ""),
                            });
                          }}
                          className="flex flex-wrap items-center gap-1"
                        >
                          <select name="contactType" className="rounded-md border border-[var(--color-border)] px-1.5 py-1 text-xs">
                            <option value="student">Öğrenci</option>
                            <option value="parent">Veli</option>
                            <option value="lead">Potansiyel</option>
                          </select>
                          <input
                            name="contactId"
                            placeholder="öğrenci ID"
                            required
                            className="w-24 rounded-md border border-[var(--color-border)] px-1.5 py-1 text-xs"
                          />
                          <button type="submit" className="rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-xs font-semibold">
                            Ata
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold text-[var(--color-text)]">Yeni mesaj kaydı</h3>
          <form
            action={async (formData: FormData) => {
              "use server";
              await actionCreateMessageLog(formData);
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <Label>Kanal</Label>
              <Select name="channel" defaultValue="sms">
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-posta</option>
                <option value="other">Diğer</option>
              </Select>
            </div>
            <div>
              <Label>Gönderen (telefon/e-posta)</Label>
              <Input name="senderIdentifier" required />
            </div>
            <div>
              <Label>Tarih/saat</Label>
              <Input name="occurredAt" type="datetime-local" required />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>İçerik</Label>
              <textarea
                name="contentOrSummary"
                required
                rows={3}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 focus:ring-2"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Kaydet</Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
