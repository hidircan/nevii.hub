import { useRouter } from "expo-router";
import { AccountScreen } from "../../../src/features/account/account-screen";
import { useLocale } from "../../../src/i18n/locale-context";

export default function ParentHesabim() {
  const router = useRouter();
  const { t: tr } = useLocale();
  return (
    <AccountScreen
      ownAccountPhotoOnly
      showChildContext
      links={[
        {
          key: "e-posta-degistir",
          icon: "mail-outline",
          label: tr("links.changeEmail"),
          onPress: () => router.push("/(parent)/hesabim/e-posta-degistir"),
        },
        {
          key: "sifre-degistir",
          icon: "lock-closed-outline",
          label: tr("links.changePassword"),
          onPress: () => router.push("/(parent)/hesabim/sifre-degistir"),
        },
        {
          key: "bildirim-tercihleri",
          icon: "notifications-outline",
          label: tr("links.notifSettings"),
          onPress: () => router.push("/(parent)/hesabim/bildirim-tercihleri"),
        },
        {
          key: "iletisim",
          icon: "chatbox-ellipses-outline",
          label: tr("links.contactPrefsKvkk"),
          onPress: () => router.push("/(parent)/hesabim/iletisim-tercihi"),
        },
        {
          key: "mufredat",
          icon: "library-outline",
          label: tr("links.curriculum"),
          onPress: () => router.push("/(parent)/gelisim"),
        },
        {
          key: "materyaller",
          icon: "folder-open-outline",
          label: tr("links.materials"),
          onPress: () => router.push("/(parent)/gelisim/materyaller"),
        },
        {
          key: "sozlesmeler",
          icon: "document-text-outline",
          label: tr("links.myContracts"),
          onPress: () => router.push("/(parent)/sozlesmeler"),
        },
      ]}
    />
  );
}
