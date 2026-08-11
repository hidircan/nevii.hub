"use client";

/**
 * Personel Modülü yönetim ekranı — aynı desen instrument-catalog-manager.tsx
 * ile: liste + satır içi düzenleme + aktif/pasif toggle + yeni kayıt formu.
 * Öğretmen dışı personeli (idari/muhasebe/resepsiyon) kapsar; Teacher'a
 * dokunmaz. Liste büyüyebileceği için mevcut client-side sayfalama
 * (usePagination/PaginationControls — Öğrenciler/Ödemeler ile aynı, bkz.
 * pagination-controls.tsx) kullanılır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actionCreateStaffMember, actionUpdateStaffMember } from "@/lib/actions";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { usePagination, PaginationControls } from "@/components/pagination-controls";
import type { StaffMember } from "@/lib/types";

export function StaffManager({
  staff,
  branches,
  canWrite,
}: {
  staff: StaffMember[];
  branches: { id: string; shortName: string }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    position: string;
    phone: string;
    email: string;
    branchId: string;
  } | null>(null);

  const sorted = [...staff].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const { pageItems, page, setPage, pageSize, setPageSize, totalPages, totalCount } = usePagination(sorted, 10);

  function branchLabel(branchId?: string) {
    if (!branchId) return "—";
    return branches.find((b) => b.id === branchId)?.shortName ?? "—";
  }

  async function onCreate(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      const result = await actionCreateStaffMember(formData);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function toggleStatus(member: StaffMember) {
    startTransition(async () => {
      const result = await actionUpdateStaffMember({
        staffId: member.id,
        status: member.status === "active" ? "passive" : "active",
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      router.refresh();
    });
  }

  function startEdit(member: StaffMember) {
    setEditingId(member.id);
    setEditDraft({
      name: member.name,
      position: member.position,
      phone: member.phone ?? "",
      email: member.email ?? "",
      branchId: member.branchId ?? "",
    });
  }

  function saveEdit(memberId: string) {
    if (!editDraft) return;
    startTransition(async () => {
      const result = await actionUpdateStaffMember({
        staffId: memberId,
        name: editDraft.name,
        position: editDraft.position,
        phone: editDraft.phone || undefined,
        email: editDraft.email || undefined,
        branchId: editDraft.branchId || undefined,
      });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setEditingId(null);
      setEditDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {!canWrite ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bu ekranı yalnızca yöneticiler düzenleyebilir.
        </p>
      ) : null}

      {formError ? <p className="text-xs font-medium text-rose-600">{formError}</p> : null}

      <Card className="overflow-hidden !p-0">
        {staff.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-muted)]">Henüz personel kaydı yok.</p>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Ad Soyad</th>
                  <th className="px-4 py-3">Rol / Görev</th>
                  <th className="px-4 py-3">Telefon</th>
                  <th className="px-4 py-3">E-posta</th>
                  <th className="px-4 py-3">Şube</th>
                  <th className="px-4 py-3">Durum</th>
                  {canWrite ? <th className="px-4 py-3">İşlemler</th> : null}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((member) => {
                  const isEditing = editingId === member.id && editDraft;
                  return (
                    <tr key={member.id} className="border-b border-[var(--color-border)] last:border-0">
                      {isEditing ? (
                        <>
                          <td className="px-4 py-2">
                            <Input
                              value={editDraft.name}
                              onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              value={editDraft.position}
                              onChange={(e) => setEditDraft({ ...editDraft, position: e.target.value })}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              value={editDraft.phone}
                              onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="email"
                              value={editDraft.email}
                              onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Select
                              value={editDraft.branchId}
                              onChange={(e) => setEditDraft({ ...editDraft, branchId: e.target.value })}
                            >
                              <option value="">—</option>
                              {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.shortName}
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="px-4 py-2">
                            <Badge status={member.status === "active" ? "confirmed" : "archived"}>
                              {member.status === "active" ? "Aktif" : "Pasif"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => saveEdit(member.id)}
                                className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                              >
                                Kaydet
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditDraft(null);
                                }}
                                className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)]"
                              >
                                Vazgeç
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-medium text-[var(--color-text)]">{member.name}</td>
                          <td className="px-4 py-2 text-[var(--color-text-muted)]">{member.position}</td>
                          <td className="px-4 py-2 text-[var(--color-text-muted)]">{member.phone || "—"}</td>
                          <td className="px-4 py-2 text-[var(--color-text-muted)]">{member.email || "—"}</td>
                          <td className="px-4 py-2 text-[var(--color-text-muted)]">{branchLabel(member.branchId)}</td>
                          <td className="px-4 py-2">
                            <Badge status={member.status === "active" ? "confirmed" : "archived"}>
                              {member.status === "active" ? "Aktif" : "Pasif"}
                            </Badge>
                          </td>
                          {canWrite ? (
                            <td className="px-4 py-2">
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => startEdit(member)}
                                  className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                                >
                                  Düzenle
                                </button>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => toggleStatus(member)}
                                  className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-50"
                                >
                                  {member.status === "active" ? "Pasife Al" : "Aktifleştir"}
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>

      {canWrite ? (
        <Card>
          <h2 className="mb-3 font-semibold text-[var(--color-text)]">Yeni personel ekle</h2>
          <form action={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>Ad Soyad</Label>
              <Input name="name" required placeholder="Örn. Ayşe Yılmaz" />
            </div>
            <div>
              <Label>Rol / Görev</Label>
              <Input name="position" required placeholder="Örn. Muhasebe, Resepsiyon" />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input name="phone" placeholder="0555 000 0000" />
            </div>
            <div>
              <Label>E-posta</Label>
              <Input name="email" type="email" placeholder="ornek@okul.com" />
            </div>
            <div>
              <Label>Şube</Label>
              <Select name="branchId" defaultValue="">
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label>Not</Label>
              <Input name="notes" placeholder="Opsiyonel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={pending}>
                {pending ? "Ekleniyor…" : "Ekle"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
