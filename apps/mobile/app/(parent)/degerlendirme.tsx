import { PlaceholderScreen } from "../../src/components/placeholder-screen";
import { useLocale } from "../../src/i18n/locale-context";

/** İlk aşamada yalnız giriş noktası (spesifikasyonun istediği gibi) — form/akış sonraki iterasyonda. */
export default function ParentDegerlendirme() {
  const { t: tr } = useLocale();
  return <PlaceholderScreen title={tr("parentEval.title")} note={tr("parentEval.note")} />;
}
