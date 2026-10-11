import { Redirect } from "expo-router";

/**
 * Eski haftalık-görünüm route'u — öğretmen ana ekranı (`/(teacher)/bugun`)
 * artık varsayılan olarak haftalık programı gösterir. Kayıtlı deep link'ler
 * kırılmasın diye route korunur, içeriği ana görünüme yönlenir.
 */
export default function HaftalikProgramAlias() {
  return <Redirect href="/(teacher)/bugun" />;
}
