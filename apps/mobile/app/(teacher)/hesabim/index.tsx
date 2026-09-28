import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";
import { useLocale } from "../../../src/i18n/locale-context";

export default function TeacherHesabim() {
  const router = useRouter();
  const { t: tr } = useLocale();
  return (
    <AccountScreen
      links={[
        { key: "performans", icon: "stats-chart-outline", label: tr("links.myPerformance"), onPress: () => router.push("/(teacher)/hesabim/performans") },
        { key: "materyaller", icon: "folder-open-outline", label: tr("links.myMaterials"), onPress: () => router.push("/(teacher)/hesabim/materyaller") },
        { key: "musaitlik", icon: "time-outline", label: tr("links.availability"), onPress: () => router.push("/(teacher)/hesabim/musaitlik") },
        { key: "telafi", icon: "swap-horizontal-outline", label: tr("links.myMakeups"), onPress: () => router.push("/(teacher)/telafi") },
        { key: "hakedis", icon: "cash-outline", label: tr("links.myEarnings"), onPress: () => router.push("/(teacher)/hesabim/hakedis") },
        { key: "geri-bildirim", icon: "star-outline", label: tr("links.myFeedback"), onPress: () => router.push("/(teacher)/hesabim/geri-bildirim") },
        { key: "bildirim-tercihleri", icon: "notifications-outline", label: tr("links.notifSettings"), onPress: () => router.push("/(teacher)/hesabim/bildirim-tercihleri") },
        { key: "is-takip", icon: "checkbox-outline", label: tr("links.taskTracking"), onPress: () => router.push("/(teacher)/is-takip") },
        { key: "e-posta-degistir", icon: "mail-outline", label: tr("links.changeEmail"), onPress: () => router.push("/(teacher)/hesabim/e-posta-degistir") },
        { key: "sifre-degistir", icon: "lock-closed-outline", label: tr("links.changePassword"), onPress: () => router.push("/(teacher)/hesabim/sifre-degistir") },
      ]}
    />
  );
}
