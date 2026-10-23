import { useEffect, useState } from "react";
import { AppText } from "./app-text";
import { View } from "react-native";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { Icon } from "./icon";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

type Props = {
  /** Sunucunun damgaladığı GERÇEK başlangıç zamanı — tek doğruluk kaynağı, burada asla üretilmez. */
  actualStartAt: string;
  /** Planlanan bitiş — geçildiğinde "süre doldu" vurgusu için (yalnızca görsel, ders otomatik bitirilmez). */
  scheduledEndAt?: string;
};

/** Devam eden bir ders için canlı geçen süre — saniyede bir yerel olarak tikler, kaynak HER ZAMAN sunucu actualStartAt'ıdır. */
export function LiveLessonTimer({ actualStartAt, scheduledEndAt }: Props) {
  const t = useTheme();
  const { t: tr } = useLocale();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startMs = new Date(actualStartAt).getTime();
  const overtime = !!scheduledEndAt && now >= new Date(scheduledEndAt).getTime();

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Icon name="time-outline" size={16} color={overtime ? t.colors.warning : t.colors.primary} />
      <AppText
        style={[
          t.typography.cardTitle,
          { color: overtime ? t.colors.warning : t.colors.text, fontVariant: ["tabular-nums"] },
        ]}
      >
        {formatElapsed(now - startMs)}
      </AppText>
      {overtime ? (
        <AppText style={[t.typography.caption, { color: t.colors.warning }]}>{tr("ui.overtimeDone")}</AppText>
      ) : null}
    </View>
  );
}
