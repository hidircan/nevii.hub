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
      ]}
    />
  );
}
