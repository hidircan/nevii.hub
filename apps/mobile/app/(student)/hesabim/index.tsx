import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function StudentHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
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
      ]}
    />
  );
}
