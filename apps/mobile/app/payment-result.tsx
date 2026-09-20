import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { personaOf, useAuth } from "../src/auth/auth-context";
import { Button, EmptyState, Screen } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

/**
 * `neviihub://payment-result?status=success|cancelled&paymentId=...`
 * (bkz. POST /api/v1/mobile/payments/:paymentId/checkout).
 *
 * Bu ekran sonucu KANIT saymaz: "paid" durumuna geçiş SADECE doğrulanmış
 * webhook ile olur. Başarıda bile gösterilen "kontrol ediliyor" dilidir;
 * bakiye, odak/ön-plan kancalarıyla zaten tazelenir.
 */
export default function PaymentResultScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { status } = useLocalSearchParams<{ status?: string; paymentId?: string }>();

  const persona = personaOf(user);
  const listRoute = persona === "parent" ? "/(parent)/odemeler" : persona === "student" ? "/(student)/odemeler" : "/notifications";
  const success = status === "success";

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <EmptyState
          icon={success ? "checkmark-circle-outline" : "close-circle-outline"}
          title={success ? "Ödeme tamamlandı" : "Ödeme tamamlanmadı"}
          description={
            success
              ? "Ödemeniz alınıyor — bakiyeniz kısa süre içinde güncellenir. Güncellenmediyse listeyi yenileyin."
              : "Ödeme sağlayıcı sayfasında tamamlanmadı. Dilerseniz ödemeler listesinden tekrar deneyebilirsiniz."
          }
        />
        <Text style={[t.typography.caption, { color: t.colors.textMuted, textAlign: "center", marginTop: 4 }]}>
          Sonuç bilgilendirme amaçlıdır; kesin durum ödemeler listesinde görünür.
        </Text>
        <View style={{ marginTop: 16 }}>
          <Button label="Ödemeler listesine dön" onPress={() => router.replace(listRoute as never)} />
        </View>
      </View>
    </Screen>
  );
}
