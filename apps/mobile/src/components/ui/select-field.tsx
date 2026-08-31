import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/theme-context";
import { BottomSheet } from "./bottom-sheet";
import { Icon } from "./icon";
import { SearchInput } from "./search-input";

export type SelectOption = { label: string; value: string; description?: string };

type Props = {
  label: string;
  placeholder?: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  /** Uzun listeler için (öğrenci seçimi vb.) — tam yükseklikte, aranabilir bir panel açar. */
  searchable?: boolean;
  searchPlaceholder?: string;
};

/** Metin girişi yerine BottomSheet'ten tek seçim yapılan form alanı (öğrenci/ders seçimi vb.). */
export function SelectField({
  label,
  placeholder = "Seçiniz",
  value,
  options,
  onChange,
  error,
  searchable = false,
  searchPlaceholder = "Ara",
}: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return options;
    return options.filter((o) => o.label.toLocaleLowerCase("tr-TR").includes(q));
  }, [options, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <View style={styles.container}>
      <Text style={[t.typography.label, { color: t.colors.textMuted }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.trigger, { borderColor: error ? t.colors.danger : t.colors.border, backgroundColor: t.colors.bgMuted }]}
      >
        <Text style={[t.typography.body, { color: selected ? t.colors.text : t.colors.textMuted, flex: 1 }]} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={t.colors.textMuted} />
      </Pressable>
      {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}

      <BottomSheet visible={open} title={label} onClose={close} fullHeight={searchable}>
        {searchable ? (
          <View style={{ marginBottom: 12 }}>
            <SearchInput value={query} onChangeText={setQuery} placeholder={searchPlaceholder} />
          </View>
        ) : null}
        <FlatList
          data={visibleOptions}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          style={searchable ? { flex: 1 } : undefined}
          ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: t.colors.divider }]} />}
          ListEmptyComponent={
            searchable ? (
              <Text style={[t.typography.body, { color: t.colors.textMuted, paddingVertical: 16, textAlign: "center" }]}>
                Eşleşen sonuç yok
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.option}
              onPress={() => {
                onChange(item.value);
                close();
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[t.typography.body, { color: t.colors.text }]}>{item.label}</Text>
                {item.description ? (
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{item.description}</Text>
                ) : null}
              </View>
              {item.value === value ? <Icon name="checkmark" size={18} color={t.colors.primary} /> : null}
            </Pressable>
          )}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  option: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  divider: { height: StyleSheet.hairlineWidth },
});
