"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";

type DemoPersona = {
  label: string;
  hint: string;
  email: string;
  password: string;
};

const DEMO_PERSONAS: DemoPersona[] = [
  {
    label: "Okul yöneticisi",
    hint: "Tüm paneli yönetir",
    email: "admin@niluferacar.com.tr",
    password: "demo-admin",
  },
  {
    label: "Öğretmen — Turgay Hoşbaş",
    hint: "Piyano — Evka 3",
    email: "turgay.hosbas@niluferacar.com.tr",
    password: "demo-teacher-csv-1",
  },
  {
    label: "Öğretmen — Olcay Özdemir",
    hint: "Gitar — Evka 3",
    email: "olcay.ozdemir@niluferacar.com.tr",
    password: "demo-teacher-csv-2",
  },
  {
    label: "Öğretmen — Ebru Şirince",
    hint: "Keman — Evka 3",
    email: "ebru.sirince@niluferacar.com.tr",
    password: "demo-teacher-csv-3",
  },
  {
    label: "Öğretmen — Şevval Aydın",
    hint: "Piyano — Evka 3",
    email: "sevval.aydin@niluferacar.com.tr",
    password: "demo-teacher-csv-4",
  },
  {
    label: "Öğretmen — Gökhan Keskin",
    hint: "Bateri — Evka 3",
    email: "gokhan.keskin@niluferacar.com.tr",
    password: "demo-teacher-csv-5",
  },
  {
    label: "Öğretmen — Hilal İşçi",
    hint: "Keman — Erzene",
    email: "hilal.isci@niluferacar.com.tr",
    password: "demo-teacher-csv-6",
  },
  {
    label: "Öğretmen — Pınar Çelik",
    hint: "Piyano — Erzene",
    email: "pinar.celik@niluferacar.com.tr",
    password: "demo-teacher-csv-7",
  },
  {
    label: "Öğrenci — Ada Yılmaz",
    hint: "Kendi hesabı — yalnızca kendi verisini görür",
    email: "ada.yilmaz.demo@email.com",
    password: "demo-student-csv-1",
  },
  {
    label: "Öğrenci — Kerem Şahin",
    hint: "Kendi hesabı",
    email: "kerem.sahin.demo@email.com",
    password: "demo-student-csv-2",
  },
  {
    label: "Öğrenci — Nehir Kaya",
    hint: "Kendi hesabı",
    email: "nehir.kaya.demo@email.com",
    password: "demo-student-csv-3",
  },
  {
    label: "Öğrenci — Toprak Demir",
    hint: "Kendi hesabı",
    email: "toprak.demir.demo@email.com",
    password: "demo-student-csv-4",
  },
  {
    label: "Öğrenci — Elif Aksoy",
    hint: "Kendi hesabı",
    email: "elif.aksoy.demo@email.com",
    password: "demo-student-csv-5",
  },
  {
    label: "Öğrenci Portalı — Zeynep'in velisi",
    hint: "Ödemesi güncel, açık aksiyon yok",
    email: "selin@email.com",
    password: "demo-parent",
  },
  {
    label: "Öğrenci Portalı — Lara'nın velisi",
    hint: "Gecikmiş ödeme + açık telafi",
    email: "deniz@email.com",
    password: "demo-parent",
  },
  {
    label: "Öğrenci Portalı — Ali'nin velisi",
    hint: "Kısmi ödeme + telafi",
    email: "mehmet@email.com",
    password: "demo-parent",
  },
];

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("admin@niluferacar.com.tr");
  const [password, setPassword] = useState("demo-admin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function performLogin(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { user: { role: string } };
        error?: { message: string };
      };
      if (!json.ok) {
        setError(json.error?.message || "Giriş başarısız");
        setLoading(false);
        return;
      }

      const role = json.data?.user.role;
      let dest = nextPath || "/panel";
      if (!nextPath) {
        if (role === "TEACHER") dest = "/ogretmen";
        else if (role === "STUDENT") dest = "/ogrenci";
        else dest = "/panel";
      }
      router.replace(dest);
      router.refresh();
    } catch {
      setError("Bağlantı hatası");
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void performLogin(email, password);
  }

  function onDemoSelect(persona: DemoPersona) {
    setEmail(persona.email);
    setPassword(persona.password);
    void performLogin(persona.email, persona.password);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Demo ile giriş
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {DEMO_PERSONAS.map((p) => (
            <button
              key={p.email}
              type="button"
              disabled={loading}
              onClick={() => onDemoSelect(p)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-3 py-2 text-left text-xs hover:border-[var(--color-primary)] disabled:opacity-50"
            >
              <span className="block font-medium text-[var(--color-text)]">{p.label}</span>
              <span className="block text-[var(--color-text-muted)]">{p.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Bu hızlı seçenekler yalnızca demo amaçlıdır; gerçek kullanıcılar kendi e-posta/şifresiyle giriş yapar.
        </p>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        veya e-posta / şifre ile
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label>E-posta</Label>
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>Şifre</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </div>
  );
}
