import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function AdminHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
      links={[
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: "Bildirim ayarları",
          onPress: () => router.push("/(admin)/hesabim/bildirim-tercihleri"),
        },
        {
          key: "e-posta-degistir",
          icon: "mail-outline",
          label: "E-posta değiştir",
          onPress: () => router.push("/(admin)/hesabim/e-posta-degistir"),
        },
        {
          key: "sifre-degistir",
          icon: "lock-closed-outline",
          label: "Şifre değiştir",
          onPress: () => router.push("/(admin)/hesabim/sifre-degistir"),
        },
      ]}
    />
  );
}
