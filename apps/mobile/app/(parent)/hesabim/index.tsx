import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function ParentHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
      ownAccountPhotoOnly
      showChildContext
      links={[
        {
          key: "e-posta-degistir",
          icon: "mail-outline",
          label: "E-posta değiştir",
          onPress: () => router.push("/(parent)/hesabim/e-posta-degistir"),
        },
        {
          key: "sifre-degistir",
          icon: "lock-closed-outline",
          label: "Şifre değiştir",
          onPress: () => router.push("/(parent)/hesabim/sifre-degistir"),
        },
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: "Bildirim ayarları",
          onPress: () => router.push("/(parent)/hesabim/bildirim-tercihleri"),
        },
        {
          key: "iletisim",
          icon: "chatbox-ellipses-outline",
          label: "İletişim tercihleri / KVKK",
          onPress: () => router.push("/(parent)/hesabim/iletisim-tercihi"),
        },
        {
          key: "mufredat",
          icon: "library-outline",
          label: "Müfredat",
          onPress: () => router.push("/(parent)/gelisim"),
        },
        {
          key: "materyaller",
          icon: "folder-open-outline",
          label: "Materyaller",
          onPress: () => router.push("/(parent)/gelisim/materyaller"),
        },
        {
          key: "sozlesmeler",
          icon: "document-text-outline",
          label: "Sözleşmelerim",
          onPress: () => router.push("/(parent)/sozlesmeler"),
        },
      ]}
    />
  );
}
