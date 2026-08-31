import { redirect } from "next/navigation";

/** Karma Öğrenci Portalı — /ogrenci/odevlerim ile AYNI desen. */
export default function VeliSozlesmelerimRedirect() {
  redirect("/ogrenci/sozlesmelerim");
}
