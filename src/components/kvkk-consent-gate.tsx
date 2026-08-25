import { actionGrantKvkkConsent } from "@/lib/actions";
import type { ConsentEffectiveStatus } from "@/lib/types";

const STATUS_NOTE: Record<Exclude<ConsentEffectiveStatus, "valid">, string> = {
  missing: "Devam etmeden önce aşağıdaki KVKK aydınlatma/açık rıza metnini onaylamanız gerekiyor.",
  outdated: "Metin güncellendi — devam etmeden önce güncel metni yeniden onaylamanız gerekiyor.",
  withdrawn: "Daha önce verdiğiniz rızayı geri çekmiştiniz — devam etmek için yeniden onaylamanız gerekiyor.",
};

/**
 * Faz 8 (KVKK) — portal first-login gate ekranı. `src/middleware.ts`'e
 * DOKUNULMADI, route guard'ı bozulmadı — yalnızca `/ogrenci/layout.tsx`
 * içinde `children` yerine bu render edilir (session zaten doğrulanmış,
 * yalnızca içerik değişiyor).
 */
export function KvkkConsentGate({
  subjectType,
  subjectId,
  consentType,
  bodyText,
  version,
  status,
}: {
  subjectType: "student" | "parent" | "user";
  subjectId: string;
  consentType: string;
  bodyText: string;
  version: number;
  status: ConsentEffectiveStatus;
}) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-[var(--color-text)]">KVKK Açık Rıza Onayı</h1>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          {status === "valid" ? null : STATUS_NOTE[status]}
        </p>
        <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm text-[var(--color-text-muted)] whitespace-pre-wrap">
          {bodyText}
        </div>
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">Metin versiyonu: v{version}</p>
        <form
          action={async () => {
            "use server";
            await actionGrantKvkkConsent({ subjectType, subjectId, consentType, channel: "portal" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]"
          >
            Okudum, onaylıyorum
          </button>
        </form>
      </div>
    </div>
  );
}
