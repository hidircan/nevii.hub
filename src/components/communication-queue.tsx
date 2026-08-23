"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Input, Select } from "@/components/ui";

type CommunicationEvent = {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorUserId?: string;
  reason?: string;
  at: string;
};

type Message = {
  id: string;
  recipientType: "PARENT" | "STUDENT" | "TEACHER";
  recipientName: string;
  recipientPhoneMasked: string;
  channel: "SMS" | "WHATSAPP";
  messageType: "MAKEUP_LESSON" | "LESSON" | "COLLECTION" | "ABSENCE" | "ANNOUNCEMENT" | "OTHER";
  resourceType: string;
  resourceId: string;
  status: string;
  draftBody: string;
  approvedBodySnapshot?: string;
  blockedReasonCode?: string;
  blockedReasonMessage?: string;
  attemptCount: number;
  events?: CommunicationEvent[];
  createdAt: string;
  smsChars?: number;
  smsSegments?: number;
};

const RECIPIENT_LABEL: Record<string, string> = {
  PARENT: "Veli",
  STUDENT: "Öğrenci",
  TEACHER: "Öğretmen",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Taslak",
  pending_approval: "Onay bekliyor",
  approved: "Onaylandı",
  manual_send_pending: "Manuel gönderim bekliyor",
  provider_accepted: "Sağlayıcıya iletildi",
  delivered: "Teslim edildi",
  failed: "Başarısız",
  blocked: "Gönderilemez",
};

const TYPE_LABEL: Record<string, string> = {
  MAKEUP_LESSON: "Telafi dersi",
  LESSON: "Normal ders",
  COLLECTION: "Tahsilat",
  ABSENCE: "Devamsızlık",
  ANNOUNCEMENT: "Duyuru",
  OTHER: "Diğer",
};

const SELECTABLE = new Set(["draft", "pending_approval"]);

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "İşlem başarısız");
  return json.data;
}

export function CommunicationQueue({
  initialMessages,
  canWrite = true,
}: {
  initialMessages: Message[];
  canWrite?: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [recipientFilter, setRecipientFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [lastBulkResult, setLastBulkResult] = useState<{ approvedCount: number; skippedCount: number; failedCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<string>("");

  const hasActiveFilters =
    channelFilter !== "all" ||
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    recipientFilter !== "all" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    search.trim() !== "";

  function clearFilters() {
    setChannelFilter("all");
    setStatusFilter("all");
    setTypeFilter("all");
    setRecipientFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  const filtered = messages.filter((m) => {
    if (channelFilter !== "all" && m.channel !== channelFilter) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    if (typeFilter !== "all" && m.messageType !== typeFilter) return false;
    if (recipientFilter !== "all" && m.recipientType !== recipientFilter) return false;
    if (dateFrom && m.createdAt < dateFrom) return false;
    if (dateTo && m.createdAt > `${dateTo}T23:59:59.999Z`) return false;
    if (search.trim() && !m.recipientName.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const selectedMessages = useMemo(() => messages.filter((m) => selected.has(m.id)), [messages, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectPageEligible() {
    setSelected(new Set(filtered.filter((m) => SELECTABLE.has(m.status)).map((m) => m.id)));
  }

  async function approveOne(id: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await postJson(`/api/v1/iletisim-merkezi/${id}/approve`, {});
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...data.message } : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onay başarısız");
    } finally {
      setBusy(false);
    }
  }

  function toggleExpand(m: Message) {
    if (expandedId === m.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(m.id);
    setEditDraft(m.draftBody);
  }

  async function saveEdit(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/iletisim-merkezi/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftBody: editDraft }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "Kaydedilemedi");
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...json.data.message } : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function bulkApprove() {
    if (!confirmChecked || selectedMessages.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const data = await postJson("/api/v1/iletisim-merkezi/bulk-approve", {
        ids: selectedMessages.map((m) => m.id),
        confirm: true,
      });
      const byId = new Map<string, string>(data.items.map((i: { id: string; outcome: string }) => [i.id, i.outcome]));
      setMessages((prev) =>
        prev.map((m) => (byId.get(m.id) === "approved" ? { ...m, status: "approved" } : m))
      );
      setLastBulkResult(data);
      setSelected(new Set());
      setReviewOpen(false);
      setConfirmChecked(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu onay başarısız");
    } finally {
      setBusy(false);
    }
  }

  const dist = useMemo(() => {
    const sms = selectedMessages.filter((m) => m.channel === "SMS");
    const wa = selectedMessages.filter((m) => m.channel === "WHATSAPP");
    const totalSegments = sms.reduce((sum, m) => sum + (m.smsSegments ?? 1), 0);
    const recipientCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    for (const m of selectedMessages) {
      recipientCounts[m.recipientType] = (recipientCounts[m.recipientType] ?? 0) + 1;
      typeCounts[m.messageType] = (typeCounts[m.messageType] ?? 0) + 1;
    }
    return { sms: sms.length, wa: wa.length, totalSegments, recipientCounts, typeCounts };
  }, [selectedMessages]);

  const groupedForReview = useMemo(() => {
    const groups = new Map<string, Message[]>();
    for (const m of selectedMessages) {
      const key = `${TYPE_LABEL[m.messageType] ?? m.messageType} · ${m.channel === "SMS" ? "SMS" : "WhatsApp"}`;
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [selectedMessages]);

  return (
    <div className="mb-10">
      {error && (
        <Card className="mb-3 border-red-200 bg-red-50/60">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}
      {lastBulkResult && (
        <Card className="mb-3 border-emerald-100 bg-emerald-50/50">
          <p className="text-sm text-[var(--color-text)]">
            Toplu onay tamamlandı: {lastBulkResult.approvedCount} onaylandı, {lastBulkResult.skippedCount} atlandı,{" "}
            {lastBulkResult.failedCount} başarısız. Bu işlem hiçbir mesajı otomatik göndermedi.
          </p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
          <option value="all">Tüm kanallar</option>
          <option value="SMS">SMS</option>
          <option value="WHATSAPP">WhatsApp</option>
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tüm durumlar</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Tüm mesaj türleri</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={recipientFilter} onChange={(e) => setRecipientFilter(e.target.value)}>
          <option value="all">Tüm alıcı türleri</option>
          {Object.entries(RECIPIENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Başlangıç tarihi" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Bitiş tarihi" />
        <Input
          type="search"
          placeholder="Alıcı adına göre ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[180px]"
        />
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} className="text-xs font-medium text-[var(--color-primary)] underline">
            Filtreleri temizle
          </button>
        )}
        {canWrite && (
          <Button onClick={selectPageEligible} className="bg-[var(--color-surface-muted)] text-[var(--color-text)]">
            Uygun mesajları seç
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <Card className="mb-4 border-sky-100 bg-sky-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-text)]">
              {selected.size} mesaj seçili · SMS {dist.sms} · WhatsApp {dist.wa} · toplam segment {dist.totalSegments}
              <br />
              <span className="text-xs text-[var(--color-text-muted)]">
                {Object.entries(dist.recipientCounts)
                  .map(([k, v]) => `${RECIPIENT_LABEL[k] ?? k} ${v}`)
                  .join(" · ")}{" "}
                — Blocked/uygun olmayan kayıtlar seçime dahil edilmedi.
              </span>
            </p>
            <Button onClick={() => setReviewOpen(true)}>Seçilenleri incele ve onayla</Button>
          </div>
        </Card>
      )}

      {reviewOpen && (
        <Card className="mb-4 border-2 border-sky-200">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Toplu mesaj onayı</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {selectedMessages.length} mesaj onaylanacak · SMS {dist.sms} · WhatsApp {dist.wa} · tahmini {dist.totalSegments}{" "}
            SMS segmenti (sağlayıcıya göre değişen maliyet)
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Alıcı dağılımı: {Object.entries(dist.recipientCounts).map(([k, v]) => `${RECIPIENT_LABEL[k] ?? k} ${v}`).join(" · ")} · Tür
            dağılımı: {Object.entries(dist.typeCounts).map(([k, v]) => `${TYPE_LABEL[k] ?? k} ${v}`).join(" · ")}
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Bu işlem mesajları otomatik olarak müşterilere göndermez. SMS kayıtları güvenli gönderim akışında hazır
            olur; WhatsApp kayıtları manuel gönderim kuyruğunda kalır. Blocked/uygun olmayan kayıtlar bu işlemin dışındadır.
          </p>
          <div className="mt-3 max-h-96 space-y-4 overflow-y-auto">
            {groupedForReview.map(([groupLabel, groupMessages]) => (
              <div key={groupLabel}>
                <p className="text-xs font-semibold text-[var(--color-text)]">
                  {groupLabel} · {groupMessages.length} alıcı
                </p>
                <div className="mt-1 space-y-2">
                  {groupMessages.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--color-text)]">
                          {m.recipientName} ({m.recipientPhoneMasked}) · {m.resourceType}:{m.resourceId}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-muted)]">{m.draftBody}</p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-red-600 underline"
                        onClick={() => toggle(m.id)}
                      >
                        Çıkar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm text-[var(--color-text)]">
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-0.5" />
            Bu mesajların gönderime hazır hâle geleceğini onaylıyorum
          </label>
          <div className="mt-4 flex gap-2">
            <Button disabled={!confirmChecked || busy || selectedMessages.length === 0} onClick={bulkApprove}>
              {selectedMessages.length} mesajı onayla
            </Button>
            <Button className="bg-[var(--color-surface-muted)] text-[var(--color-text)]" onClick={() => setReviewOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">Filtreye uyan mesaj yok.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => {
            const selectable = canWrite && SELECTABLE.has(m.status);
            return (
              <Card key={m.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {selectable ? (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(m.id)}
                        onChange={() => toggle(m.id)}
                      />
                    ) : (
                      <span className="mt-1 h-4 w-4 shrink-0" title="Bu durumda seçilemez" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--color-text)]">{m.recipientName}</p>
                        <Badge>{m.channel}</Badge>
                        <Badge>{TYPE_LABEL[m.messageType] ?? m.messageType}</Badge>
                        <Badge status={m.status === "delivered" || m.status === "approved" ? "success" : m.status === "blocked" || m.status === "failed" ? "error" : undefined}>
                          {STATUS_LABEL[m.status] ?? m.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {RECIPIENT_LABEL[m.recipientType] ?? m.recipientType} · {m.recipientPhoneMasked}
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--color-surface-muted)] p-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
                        {m.approvedBodySnapshot ?? m.draftBody}
                      </pre>
                      {m.blockedReasonMessage && (
                        <p className="mt-2 text-xs text-red-600">Gönderilemez: {m.blockedReasonMessage}</p>
                      )}

                      {expandedId === m.id && (
                        <div className="mt-3 space-y-3 rounded-xl border border-[var(--color-border)] p-3">
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-3">
                            <div>
                              <dt className="font-medium text-[var(--color-text)]">İlişkili kayıt</dt>
                              <dd>
                                {m.resourceType} · {m.resourceId}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium text-[var(--color-text)]">Oluşturulma</dt>
                              <dd>{new Date(m.createdAt).toLocaleString("tr-TR")}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-[var(--color-text)]">Deneme sayısı</dt>
                              <dd>{m.attemptCount}</dd>
                            </div>
                            {m.channel === "SMS" && m.smsSegments !== undefined && (
                              <div>
                                <dt className="font-medium text-[var(--color-text)]">SMS segment</dt>
                                <dd>
                                  {m.smsChars} karakter · {m.smsSegments} segment (tahmini maliyet sağlayıcıya göre değişir)
                                </dd>
                              </div>
                            )}
                          </dl>

                          {(m.events?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-xs font-medium text-[var(--color-text)]">Audit özeti</p>
                              <ul className="mt-1 space-y-0.5 text-xs text-[var(--color-text-muted)]">
                                {m.events!.slice(-5).map((ev) => (
                                  <li key={ev.id}>
                                    {new Date(ev.at).toLocaleString("tr-TR")} · {ev.fromStatus} → {ev.toStatus}
                                    {ev.reason ? ` (${ev.reason})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {canWrite && (m.status === "draft" || m.status === "pending_approval" || m.status === "approved") && (
                            <div>
                              <label className="text-xs font-medium text-[var(--color-text)]">Taslağı düzenle</label>
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                maxLength={600}
                                rows={3}
                                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-transparent p-2 text-xs text-[var(--color-text)]"
                              />
                              <div className="mt-2 flex items-center gap-2">
                                <Button disabled={busy || !editDraft.trim()} onClick={() => saveEdit(m.id)} className="text-xs">
                                  Kaydet
                                </Button>
                                {m.status === "approved" && (
                                  <span className="text-xs text-amber-600">Kaydetmek mevcut onayı geçersiz kılar.</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => toggleExpand(m)}
                      className="whitespace-nowrap text-xs font-medium text-[var(--color-primary)] underline"
                    >
                      {expandedId === m.id ? "Kapat" : "İncele"}
                    </button>
                    {selectable && (
                      <Button disabled={busy} onClick={() => approveOne(m.id)} className="whitespace-nowrap">
                        Onayla
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
