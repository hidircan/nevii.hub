import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { shortDayMonth } from "../../lib/date";
import { Icon } from "./icon";

type Props = {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  placeholder?: string;
};

/** Ekranlar arası ortak son-tarih seçici — metin girişi yerine native takvim (bkz. odevler/is-takip). */
export function DueDateField({ label, value, onChange, minimumDate, placeholder = "Tarih seçin" }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[t.typography.label, { color: t.colors.textMuted }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderWidth: 1,
          borderColor: t.colors.border,
          backgroundColor: t.colors.bgMuted,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Icon name="calendar-outline" size={18} color={t.colors.textMuted} />
        <Text style={[t.typography.body, { color: value ? t.colors.text : t.colors.textMuted }]}>
          {value ? `${shortDayMonth(value)} ${value.getFullYear()}` : placeholder}
        </Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={value ?? minimumDate ?? new Date()}
          mode="date"
          minimumDate={minimumDate}
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(event, selected) => {
            setOpen(Platform.OS === "ios");
            if (event.type === "set" && selected) onChange(selected);
          }}
        />
      ) : null}
    </View>
  );
}
