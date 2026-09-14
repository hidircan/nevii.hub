import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";

export default function TeacherHesabim() {
  const router = useRouter();
  return (
    <AccountScreen
      links={[
        { key: "performans", icon: "stats-chart-outline", label: "Performansım", onPress: () => router.push("/(teacher)/hesabim/performans") },
        { key: "materyaller", icon: "folder-open-outline", label: "Materyallerim", onPress: () => router.push("/(teacher)/hesabim/materyaller") },
        { key: "musaitlik", icon: "time-outline", label: "Müsaitlik", onPress: () => router.push("/(teacher)/hesabim/musaitlik") },
        { key: "telafi", icon: "swap-horizontal-outline", label: "Telafilerim", onPress: () => router.push("/(teacher)/telafi") },
        { key: "hakedis", icon: "cash-outline", label: "Hakedişlerim", onPress: () => router.push("/(teacher)/hesabim/hakedis") },
        { key: "geri-bildirim", icon: "star-outline", label: "Geri bildirim özetim", onPress: () => router.push("/(teacher)/hesabim/geri-bildirim") },
        { key: "bildirim-tercihleri", icon: "notifications-outline", label: "Bildirim ayarları", onPress: () => router.push("/(teacher)/hesabim/bildirim-tercihleri") },
        { key: "sifre-degistir", icon: "lock-closed-outline", label: "Şifre değiştir", onPress: () => router.push("/(teacher)/hesabim/sifre-degistir") },
      ]}
    />
  );
}
