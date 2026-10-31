/**
 * Metni yalın bir pencerede yazdırma diyaloğuyla açar: "PDF olarak kaydet" Türkçe karakterleri bozmaz,
 * dosya adı başlıktan gelir. Metin DOM'a textContent ile girer, HTML olarak yorumlanmaz.
 * Pencere engellendiyse false döner.
 */
export function printText(title: string, text: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  const doc = w.document;
  doc.title = title;
  doc.body.style.cssText = "margin:2cm;font:11pt/1.55 Georgia,'Times New Roman',serif;color:#000";
  const body = doc.createElement("div");
  body.textContent = text;
  body.style.whiteSpace = "pre-wrap";
  doc.body.append(body);
  w.focus();
  w.print();
  return true;
}
