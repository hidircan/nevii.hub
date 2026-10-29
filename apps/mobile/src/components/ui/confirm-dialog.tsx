import { AppText } from "./app-text";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocale } from "../../i18n/locale-context";
import { useTheme } from "../../theme/theme-context";
import { Button } from "./button";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTheme();
  const { t: tr } = useLocale();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.backdrop, { backgroundColor: t.colors.overlay }]} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: t.colors.bgRaised }]} onPress={(e) => e.stopPropagation()}>
          {/* Uzun metin + büyük font + küçük ekran: kart taşmaz, içerik kayar. */}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <AppText style={[t.typography.sectionTitle, { color: t.colors.text }]}>{title}</AppText>
            {message ? <AppText style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8 }]}>{message}</AppText> : null}
          </ScrollView>
          <View style={styles.actions}>
            <Button label={cancelLabel ?? tr("ui.cancelDefault")} onPress={onCancel} variant="secondary" style={styles.actionButton} />
            <Button label={confirmLabel ?? tr("ui.confirmDefault")} onPress={onConfirm} variant={danger ? "danger" : "primary"} style={styles.actionButton} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, maxHeight: "85%", borderRadius: 16, padding: 20 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { flexGrow: 0 },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  actionButton: { flex: 1 },
});
