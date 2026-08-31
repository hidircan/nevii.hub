import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../theme/theme-context";
import { Icon } from "./icon";

type Props = {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Uzun/aranabilir listeler için (öğrenci seçimi vb.) — ekranın büyük çoğunluğunu kaplar, alt kısımda dar bir şerit olarak açılmaz. */
  fullHeight?: boolean;
};

/** Filtre veya seçim listeleri için hafif alttan-açılan panel (yeni bağımlılık gerektirmez). */
export function BottomSheet({ visible, title, onClose, children, fullHeight = false }: Props) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: t.colors.overlay }]} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.sheetWrap, fullHeight ? styles.sheetWrapFull : undefined]}>
          <SafeAreaView
            edges={["bottom"]}
            style={[styles.sheet, fullHeight ? styles.sheetFull : undefined, { backgroundColor: t.colors.bgRaised }]}
          >
            <View style={[styles.handle, { backgroundColor: t.colors.border }]} />
            {title ? (
              <View style={styles.header}>
                <Text style={[t.typography.sectionTitle, { color: t.colors.text }]}>{title}</Text>
                <Pressable accessibilityLabel="Kapat" onPress={onClose} hitSlop={8}>
                  <Icon name="close" size={22} color={t.colors.textMuted} />
                </Pressable>
              </View>
            ) : null}
            {children}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheetWrap: { width: "100%" },
  sheetWrapFull: { height: "92%" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, maxHeight: "80%" },
  sheetFull: { flex: 1, maxHeight: undefined },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
});
