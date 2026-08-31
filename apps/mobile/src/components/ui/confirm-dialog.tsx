import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
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
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.backdrop, { backgroundColor: t.colors.overlay }]} onPress={onCancel}>
        <Pressable style={[styles.card, { backgroundColor: t.colors.bgRaised }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[t.typography.sectionTitle, { color: t.colors.text }]}>{title}</Text>
          {message ? <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8 }]}>{message}</Text> : null}
          <View style={styles.actions}>
            <Button label={cancelLabel} onPress={onCancel} variant="secondary" style={styles.actionButton} />
            <Button label={confirmLabel} onPress={onConfirm} variant={danger ? "danger" : "primary"} style={styles.actionButton} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, borderRadius: 16, padding: 20 },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  actionButton: { flex: 1 },
});
