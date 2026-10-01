"use client";

/**
 * Yeni personel kayıt formu (A–E gruplu) — `/panel/personel/yeni`
 * sayfasında kullanılır. Liste ekranındaki `StaffManager` YALNIZCA liste/
 * düzenleme yapar; ekleme akışı bu bileşen üzerinden ayrı sayfadadır.
 * Alan seti ve portal sonucu metinleri `StaffManager`ın önceki satır-içi
 * formuyla BİREBİR aynıdır (davranış değişmedi, yalnız yerleşim taşındı).
 */

import { useState, useTransition } from "react";
import Link from "@/components/link";
import { actionCreateStaffMember } from "@/lib/actions";
import { Button, Card, Input, Label, Select } from "@/components/ui";

export function StaffCreateForm({ branches }: { branches: { id: string; shortName: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [createdStaffId, setCreatedStaffId] = useState<string | null>(null);

  async function onCreate(formData: FormData) {
    setFormError(null);
    setFormNotice(null);
    setCreatedStaffId(null);
    startTransition(async () => {
      const result = await actionCreateStaffMember(formData);
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      setCreatedStaffId(result.staffId);
      const portal = result.portal;
      if (portal?.status === "created") {
        setFormNotice(
          portal.delivered
            ? "Personel kaydedildi, portal hesabı oluşturuldu ve davet e-postası gönderildi."
            : "Personel kaydedildi ve portal hesabı oluşturuldu, ancak davet e-postası GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış. Davet, personel detayındaki “Portal erişimi” kartından yeniden gönderilebilir."
        );
      } else if (portal?.status === "linked") {
        setFormNotice("Personel kaydedildi ve mevcut portal hesabıyla güvenli şekilde ilişkilendirildi.");
      } else if (portal?.status === "duplicate_blocked") {
        setFormNotice(`Personel kaydedildi, ancak portal adımı atlandı: ${portal.message}`);
      } else {
        setFormNotice("Personel kaydedildi.");
      }
    });
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-[var(--color-text)]">Yeni personel ekle</h2>
      <p className="mb-4 text-xs text-[var(--color-text-muted)]">
        Sağlık/adli sicil/din/sendika gibi özel nitelikli veriler ile IBAN/maaş bilgileri bu formda İSTENMEZ.
      </p>
      {formError ? <p className="mb-3 text-xs font-medium text-rose-600">{formError}</p> : null}
      {formNotice ? (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-800">{formNotice}</p>
          {createdStaffId ? (
            <div className="mt-1.5 flex flex-wrap gap-3 text-xs font-medium">
              <Link href={`/panel/personel/${createdStaffId}`} className="text-[var(--color-primary)] hover:underline">
                Personel detayını görüntüle →
              </Link>
              <Link href="/panel/personel" className="text-[var(--color-text-muted)] hover:underline">
                Personel listesine dön
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      <form action={onCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-3">
          A. Kimlik ve iletişim
        </p>
        <div>
          <Label>Ad</Label>
          <Input name="firstName" required placeholder="Örn. Ayşe" autoComplete="given-name" />
        </div>
        <div>
          <Label>Soyad</Label>
          <Input name="lastName" required placeholder="Örn. Yılmaz" autoComplete="family-name" />
        </div>
        <div>
          <Label>E-posta</Label>
          <Input name="email" type="email" placeholder="ornek@okul.com" autoComplete="email" />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input name="phone" placeholder="0555 000 0000" autoComplete="tel" />
        </div>
        <div>
          <Label>Doğum tarihi</Label>
          <Input name="birthDate" type="date" />
        </div>
        <div>
          <Label>İl</Label>
          <Input name="city" placeholder="Örn. İzmir" />
        </div>
        <div>
          <Label>İlçe</Label>
          <Input name="district" placeholder="Örn. Bornova" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Açık adres</Label>
          <Input name="address" placeholder="Mahalle, sokak, no" />
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-3">
          B. İş bilgileri
        </p>
        <div>
          <Label>Unvan / görev</Label>
          <Input name="position" required placeholder="Örn. Muhasebe, Resepsiyon" />
        </div>
        <div>
          <Label>Departman / görev alanı</Label>
          <Input name="department" placeholder="Örn. İdari işler" />
        </div>
        <div>
          <Label>Şube / kurum kapsamı</Label>
          <Select name="branchId" defaultValue="">
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.shortName}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>İşe giriş tarihi</Label>
          <Input name="hireDate" type="date" />
        </div>
        <div>
          <Label>Çalışma durumu</Label>
          <Select name="employmentType" defaultValue="">
            <option value="">—</option>
            <option value="full_time">Tam zamanlı</option>
            <option value="part_time">Yarı zamanlı</option>
            <option value="contract">Sözleşmeli</option>
            <option value="intern">Stajyer</option>
          </Select>
        </div>
        <div>
          <Label>Durum</Label>
          <Select name="status" defaultValue="active">
            <option value="active">Aktif</option>
            <option value="on_leave">İzinli</option>
            <option value="passive">Pasif</option>
          </Select>
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-3">
          C. Acil durum
        </p>
        <div>
          <Label>Acil durumda aranacak kişi</Label>
          <Input name="emergencyContactName" placeholder="Ad Soyad" />
        </div>
        <div>
          <Label>Yakınlık derecesi</Label>
          <Input name="emergencyContactRelationship" placeholder="Örn. Eşi, Babası" />
        </div>
        <div>
          <Label>Acil durum telefonu</Label>
          <Input name="emergencyContactPhone" placeholder="0555 000 0000" />
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-3">
          D. Özlük / yönetici notu
        </p>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Yönetici notu (yalnız yetkili yöneticiler görür)</Label>
          <Input name="personnelNotes" placeholder="Opsiyonel" />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <Label>Genel not</Label>
          <Input name="notes" placeholder="Opsiyonel" />
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:col-span-2 lg:col-span-3">
          E. Portal erişimi ve rol
        </p>
        <div className="flex items-start gap-2 sm:col-span-2 lg:col-span-3">
          <input id="staff-create-portal" name="createPortalAccess" type="checkbox" value="on" className="mt-1" />
          <label htmlFor="staff-create-portal" className="text-sm text-[var(--color-text)]">
            Portal erişimi oluştur
            <span className="block text-xs font-normal text-[var(--color-text-muted)]">
              İşaretlenmezse yalnız personel kaydı açılır; e-posta dolu olması tek başına hesap açmaz.
            </span>
          </label>
        </div>
        <div>
          <Label>Uygulama rolü</Label>
          <Select name="portalRole" defaultValue="SCHOOL_ADMIN">
            <option value="SCHOOL_ADMIN">Yönetim paneli (SCHOOL_ADMIN)</option>
          </Select>
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            Platform sahibi (SUPER_ADMIN), öğretmen, veli/öğrenci ve AI rolleri bu ekrandan atanamaz.
          </p>
        </div>
        <div className="flex items-start gap-2 sm:col-span-2">
          <input id="staff-send-invite" name="sendInvitation" type="checkbox" value="on" defaultChecked className="mt-1" />
          <label htmlFor="staff-send-invite" className="text-sm text-[var(--color-text)]">
            Davet e-postası gönder
            <span className="block text-xs font-normal text-[var(--color-text-muted)]">
              Alıcı, tek kullanımlık bağlantıyla kendi şifresini belirler. Bu ortamda e-posta sağlayıcısı yoksa
              gönderim “yapılandırılmamış” olarak işaretlenir (sahte başarı yok).
            </span>
          </label>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Ekleniyor…" : "Ekle"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
