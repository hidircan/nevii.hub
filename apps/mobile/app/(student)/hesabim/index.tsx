import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function StudentHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
      links={[
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
