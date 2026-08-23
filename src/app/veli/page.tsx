import { redirect } from "next/navigation";

/** Eski "Veli Portalı" bookmark'ı — Karma Öğrenci Portalı ile /ogrenci altında birleşti. */
export default function VeliPortalRedirect() {
  redirect("/ogrenci");
}
