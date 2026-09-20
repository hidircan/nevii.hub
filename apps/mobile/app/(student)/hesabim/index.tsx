import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function StudentHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
      showChildContext
      links={[
        {
          key: "e-posta-degistir",
          icon: "mail-outline",
          label: "E-posta değiştir",
          onPress: () => router.push("/(student)/hesabim/e-posta-degistir"),
        },
        {
          key: "sifre-degistir",
          icon: "lock-closed-outline",
          label: "Şifre değiştir",
          onPress: () => router.push("/(student)/hesabim/sifre-degistir"),
        },
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: "Bildirim ayarları",
          onPress: () => router.push("/(student)/hesabim/bildirim-tercihleri"),
        },
        {
          key: "iletisim-tercihi",
          icon: "megaphone-outline",
          label: "İletişim tercihleri",
          onPress: () => router.push("/(student)/hesabim/iletisim-tercihi"),
        },
        {
          key: "mufredat",
          icon: "library-outline",
          label: "Müfredat",
          onPress: () => router.push("/(student)/gelisim"),
        },
        {
          key: "materyaller",
          icon: "folder-open-outline",
          label: "Materyaller",
          onPress: () => router.push("/(student)/gelisim/materyaller"),
        },
        {
          key: "sozlesmeler",
          icon: "document-text-outline",
          label: "Sözleşmelerim",
          onPress: () => router.push("/(student)/sozlesmeler"),
        },
      ]}
    />
  );
}
