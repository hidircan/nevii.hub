import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function ParentHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
      ownAccountPhotoOnly
      links={[
        {
          key: "iletisim",
          icon: "chatbox-ellipses-outline",
          label: "İletişim tercihleri / KVKK",
          onPress: () => router.push("/(parent)/hesabim/iletisim-tercihi"),
        },
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: "Bildirim ayarları",
          onPress: () => router.push("/(parent)/hesabim/bildirim-tercihleri"),
        },
      ]}
    />
  );
}
