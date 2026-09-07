"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@/components/ui";

/**
 * P0 UAT (2026-09-07) — GİRİŞ EKRANINDA DEMO KİMLİK BİLGİSİ YOK.
 *
 * Burada eskiden `DEMO_PERSONAS` adlı, 14 hesabın e-posta ve AÇIK METİN
 * PAROLASINI içeren bir dizi vardı ve "Demo ile giriş" düğmeleri olarak
 * render ediliyordu. Bu bir client component olduğu için o parolalar
 * yalnızca ekranda değil, HER ZİYARETÇİYE giden JS paketinin İÇİNDE de
 * bulunuyordu — koşullu gizleme bunu çözmezdi, bu yüzden liste tamamen
 * SİLİNDİ (parola alanının ön-doldurulması da kaldırıldı).
 *
 * Test hesapları test veritabanında durmaya devam eder; envanterleri
 * `docs/testing/TEST_ACCOUNT_CATALOG.md`'de PAROLASIZ tutulur, parolalar
 * yalnız parola yöneticisinde saklanır.
 *
 * NOT (operatör aksiyonu): bu parolalar git geçmişinde kalmıştır; ekrandan
 * kaldırılmaları rotasyon YERİNE GEÇMEZ.
 */
export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <div className="space-y-5">
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
