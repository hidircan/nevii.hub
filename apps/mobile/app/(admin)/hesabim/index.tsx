import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";
import { useLocale } from "../../../src/i18n/locale-context";

export default function AdminHesabim() {
  const router = useRouter();
  const { t: tr } = useLocale();
  return (
    <AccountScreen
      links={[
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: tr("links.notifSettings"),
          onPress: () => router.push("/(admin)/hesabim/bildirim-tercihleri"),
        },
        {
          key: "e-posta-degistir",
          icon: "mail-outline",
          label: tr("links.changeEmail"),
          onPress: () => router.push("/(admin)/hesabim/e-posta-degistir"),
        },
        {
          key: "sifre-degistir",
          icon: "lock-closed-outline",
          label: tr("links.changePassword"),
          onPress: () => router.push("/(admin)/hesabim/sifre-degistir"),
        },
      ]}
    />
  );
}
