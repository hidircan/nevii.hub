import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * İş 2 (bu sprint) — İş Takip'in varsayılan girişi Kanban. Önceden bu rota
 * liste görünümünü render edip bir CLIENT effect (`router.replace`,
 * localStorage tercihine bakarak) ile Kanban'a atlıyordu — bu hem
 * kullanıcı tercihi için localStorage kullanıyordu (bu projede kullanılmaz)
 * hem de liste ekranının bir anlığına flash olmasına (client-side flicker)
 * neden oluyordu. Artık kayıtsız şartsız, SUNUCU tarafında yönlendiriyor —
 * hiçbir görünüm render edilmeden. Liste görünümü kaldırılmadı, taşındı:
 * `/panel/is-takip/liste` (bkz. o dosyadaki not).
 */
export default function IsTakipPage() {
  redirect("/panel/is-takip/kanban");
}
