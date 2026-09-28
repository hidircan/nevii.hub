import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";
import { useLocale } from "../../../src/i18n/locale-context";

export default function StudentHesabim() {
  const router = useRouter();
  const { t: tr } = useLocale();
  return (
    <AccountScreen
      showChildContext
      links={[
        {
          key: "e-posta-degistir",
          icon: "mail-outline",
          label: tr("links.changeEmail"),
          onPress: () => router.push("/(student)/hesabim/e-posta-degistir"),
        },
        {
          key: "sifre-degistir",
          icon: "lock-closed-outline",
          label: tr("links.changePassword"),
          onPress: () => router.push("/(student)/hesabim/sifre-degistir"),
        },
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: tr("links.notifSettings"),
          onPress: () => router.push("/(student)/hesabim/bildirim-tercihleri"),
        },
        {
          key: "iletisim-tercihi",
          icon: "megaphone-outline",
          label: tr("links.contactPrefs"),
          onPress: () => router.push("/(student)/hesabim/iletisim-tercihi"),
        },
        {
          key: "mufredat",
          icon: "library-outline",
          label: tr("links.curriculum"),
          onPress: () => router.push("/(student)/gelisim"),
        },
        {
          key: "materyaller",
          icon: "folder-open-outline",
          label: tr("links.materials"),
          onPress: () => router.push("/(student)/gelisim/materyaller"),
        },
        {
          key: "sozlesmeler",
          icon: "document-text-outline",
          label: tr("links.myContracts"),
          onPress: () => router.push("/(student)/sozlesmeler"),
        },
      ]}
    />
  );
}
