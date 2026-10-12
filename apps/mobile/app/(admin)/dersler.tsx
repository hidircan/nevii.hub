import { PlaceholderScreen } from "../../src/components/placeholder-screen";
import { useLocale } from "../../src/i18n/locale-context";

export default function AdminDersler() {
  const { t: tr } = useLocale();
  return (
    <PlaceholderScreen
      title={tr("adm.upcomingTitle")}
      note={tr("adm.upcomingNote")}
    />
  );
}
