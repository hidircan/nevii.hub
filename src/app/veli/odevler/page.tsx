import { redirect } from "next/navigation";

/** Eski "Veli Portalı" bookmark'ı — Karma Öğrenci Portalı ile /ogrenci/odevlerim'e taşındı. */
export default function VeliOdevlerRedirect() {
  redirect("/ogrenci/odevlerim");
}
