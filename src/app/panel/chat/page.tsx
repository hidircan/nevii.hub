import { redirect } from "next/navigation";

/**
 * The chat experience moved off this dedicated page and into the full-screen
 * assistant panel at /panel/maestron-ai. This route stays alive — for
 * bookmarks/back-navigation/AI log links (`/panel/ai/logs` labels its
 * history with this path) — and now redirects straight to that big screen
 * instead of showing a placeholder that only opened the small popup.
 */
export default function PanelChatPage() {
  redirect("/panel/maestron-ai");
}
