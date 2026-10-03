import { useCallback, useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../src/api/client";
import {
  blockedCopyFor,
  policyGateFor,
  refreshMobilePolicy,
  type InstitutionBrand,
  type MobilePolicy,
  type PolicyRefresh,
} from "../src/api/policy";
import { personaOf, useAuth, type AuthUser } from "../src/auth/auth-context";
import { UNSUPPORTED_COPY } from "../src/auth/role-to-persona";
import { Button, Icon, type IconName } from "../src/components/ui";
import { useTheme } from "../src/theme/theme-context";

const PERSONA_HOME = {
  admin: "/(admin)/ozet",
  teacher: "/(teacher)/bugun",
  student: "/(student)/anasayfa",
  parent: "/(parent)/anasayfa",
} as const;

/**
 * Uygulama girişi — auth durumuna göre login'e, persona sekmesine, oturum
 * doğrulama hatasına (token'lar korunur, tekrar dene) veya fail-closed
 * "desteklenmeyen hesap" ekranına yönlendirir. Yapay gecikme YOK.
 */
export default function Index() {
  const { status, user, error, retry, logout } = useAuth();
  const t = useTheme();

  if (status === "loading") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
        <View style={styles.center}>
          <View style={[styles.logo, { backgroundColor: t.colors.primarySoft }]}>
            <Icon name="musical-notes" size={34} color={t.colors.primary} />
          </View>
          <Text style={[t.typography.screenTitle, { color: t.colors.text, marginTop: 20 }]}>Nevii Hub</Text>
          <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
            Eğitim Kurumları Merkezi Yönetim Sistemi
          </Text>
          <ActivityIndicator color={t.colors.primary} style={{ marginTop: 28 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (status === "error") {
    return (
      <GateScreen
        icon="cloud-offline-outline"
        title="Oturum doğrulanamadı"
        body={error ?? "Sunucuya bağlanılamadı."}
        primary={{ label: "Tekrar dene", onPress: retry }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  if (status === "signedOut" || !user) return <Redirect href="/login" />;

  if (user.resolution.kind === "unsupported") {
    const copy = UNSUPPORTED_COPY[user.resolution.reason];
    return (
      <GateScreen
        icon="lock-closed-outline"
        title={copy.title}
        body={copy.body}
        primary={{ label: "Web panelini aç", onPress: () => void Linking.openURL(`${API_BASE_URL}${copy.webPath}`) }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  return <PolicyGate user={user} logout={logout} />;
}

/**
 * NeviiOS mobil policy kapısı (Control Center 2026-09-28): oturum sonrası
 * sunucu kararını okur; bakım/güncelleme/kapalı portalda ilgili ekrana
 * düşer, aksi halde persona ana sayfasına yönlendirir. Yeniden açılışta
 * karar tazelenir (tenant-anahtarlı önbellek yalnız çevrimdışıyken,
 * etiketli gösterilir). Yetki her istekte sunucuda yeniden doğrulanır.
 */
function PolicyGate({ user, logout }: { user: AuthUser; logout: () => void }) {
  const t = useTheme();
  const persona = personaOf(user);
  const home = persona ? PERSONA_HOME[persona] : null;
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; gate: "ok" }
    | { status: "ready"; gate: Exclude<ReturnType<typeof policyGateFor>, "ok">; policy: MobilePolicy; brand: InstitutionBrand | null; fromCache: boolean }
    | { status: "error"; message: string }
  >({ status: "loading" });

  // Durum yalnız yanıt gelince güncellenir; başlangıç durumu zaten "loading".
  const fetchPolicy = useCallback(() => {
    void refreshMobilePolicy(user.tenantId, user.userId).then((res: PolicyRefresh | null) => {
      if (!res) {
        setState({ status: "error", message: "Mobil erişim kararı alınamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." });
        return;
      }
      const gate = policyGateFor(res.policy);
      if (gate === "ok") setState({ status: "ready", gate });
      else setState({ status: "ready", gate, policy: res.policy, brand: res.brand, fromCache: res.fromCache });
    });
  }, [user.tenantId, user.userId]);

  useEffect(fetchPolicy, [fetchPolicy]);

  /** "Tekrar dene": olay işleyicisinde yükleniyor durumuna dönülüp yeniden istenir. */
  const load = () => {
    setState({ status: "loading" });
    fetchPolicy();
  };

  if (state.status === "loading") {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
        <View style={styles.center}>
          <ActivityIndicator color={t.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (state.status === "error") {
    return (
      <GateScreen
        icon="cloud-offline-outline"
        title="Mobil kararı alınamadı"
        body={state.message}
        primary={{ label: "Tekrar dene", onPress: load }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  if (state.gate === "ok" && home) return <Redirect href={home} />;

  const brandLine = state.status === "ready" && state.gate !== "ok" && state.brand?.name ? `\n\n${state.brand.name}` : "";
  const staleNote =
    state.status === "ready" && state.gate !== "ok" && state.fromCache ? "\n\n(Çevrimdışı önbellekteki son karar gösteriliyor.)" : "";

  if (state.gate === "maintenance") {
    const message = state.policy.maintenance.message || "Kurumunuz mobil uygulamada bakım çalışması yapıyor.";
    const brandMessage = state.brand?.loginMessage ? `\n\n${state.brand.loginMessage}` : "";
    return (
      <GateScreen
        icon="construct-outline"
        title="Bakım çalışması"
        body={`${message}${brandLine}${brandMessage}${staleNote}`}
        primary={{ label: "Tekrar dene", onPress: load }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  if (state.gate === "update") {
    const isAndroid = state.policy.platform === "android";
    const platform = isAndroid ? "Android" : "iOS";
    const want = isAndroid ? state.policy.minVersion.android : state.policy.minVersion.ios;
    return (
      <GateScreen
        icon="arrow-up-circle-outline"
        title="Güncelleme gerekli"
        body={`Bu sürüm artık desteklenmiyor. ${platform} için en az ${want} sürümüne güncelleyin.${brandLine}${staleNote}`}
        primary={{ label: "Tekrar dene", onPress: load }}
        secondary={{ label: "Çıkış yap", onPress: logout }}
      />
    );
  }

  const copy = blockedCopyFor(persona, state.gate === "blocked" ? state.policy.reasons : []);
  return (
    <GateScreen
      icon="lock-closed-outline"
      title={copy.title}
      body={`${copy.body}${brandLine}${staleNote}`}
      primary={{ label: "Tekrar dene", onPress: load }}
      secondary={{ label: "Çıkış yap", onPress: logout }}
    />
  );
}

type GateAction = { label: string; onPress: () => void };

function GateScreen({ icon, title, body, primary, secondary }: { icon: IconName; title: string; body: string; primary: GateAction; secondary: GateAction }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.colors.bg }]}>
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <View style={[styles.logo, { backgroundColor: t.colors.bgMuted }]}>
          <Icon name={icon} size={30} color={t.colors.textMuted} />
        </View>
        <Text accessibilityRole="header" style={[t.typography.cardTitle, { color: t.colors.text, marginTop: 20, textAlign: "center" }]}>
          {title}
        </Text>
        <Text style={[t.typography.body, { color: t.colors.textMuted, marginTop: 8, textAlign: "center" }]}>{body}</Text>
        <View style={{ alignSelf: "stretch", gap: 10, marginTop: 28 }}>
          <Button label={primary.label} onPress={primary.onPress} />
          <Button label={secondary.label} onPress={secondary.onPress} variant="secondary" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
