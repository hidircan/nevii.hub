import { PlaceholderScreen } from "../../src/components/placeholder-screen";

export default function AdminDersler() {
  return (
    <PlaceholderScreen
      title="Yaklaşan dersler"
      note="Admin için tüm şube/öğretmenler genelinde 'yaklaşan dersler' listesi, web panelinde program-studio.tsx içinde doğrudan store'dan üretiliyor. Mobil için bunu göstermek üzere yeni bir GET /api/v1/lessons?from=&to= (tenant-scoped, sayfalı) endpoint'i gerekiyor — henüz yok."
    />
  );
}
