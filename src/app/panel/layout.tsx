import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel");
  }

  // School staff only for admin panel
  if (session.role === "TEACHER") redirect("/ogretmen");
  if (session.role === "PARENT") redirect("/veli");
  if (session.role === "STUDENT") redirect("/ogrenci");

  const kurum = await getInstitutionContext(session);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userLabel={session.userId}
        roleLabel={session.role}
        role={session.role}
        kurumlar={kurum.available}
        kurumSelection={kurum.selection}
        canSeeAllKurumlar={session.role === "SUPER_ADMIN"}
      />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
          <div className="mb-6 flex justify-end">
            <div className="w-full sm:w-80">
              <CommandPalette role={session.role} />
            </div>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
