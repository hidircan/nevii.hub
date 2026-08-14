import { describe, it, expect } from "vitest";
import { createConversation, getConversation } from "../ai/conversations";

/**
 * FAZ6 — global popup ile tam sayfa Asistan aynı `activeConversationId`'i
 * paylaşıyor (useAssistant() context + AssistantChatBody initialConversationId
 * prop'u). Bu paylaşımın güvenli olması `getConversation`'ın tenant+userId
 * kapsamlı olmasına bağlı — conversationId tek başına yeterli değil, aksi
 * halde ID'yi tahmin eden biri başka bir kullanıcının/tenant'ın sohbet
 * geçmişini (tool sonuçları dahil) okuyabilirdi.
 */
describe("AI conversation tenant/user izolasyonu", () => {
  it("başka bir userId ile aynı conversationId'ye erişilemez", async () => {
    const conv = await createConversation("tenant_a", "user_owner", "test");
    const asOwner = await getConversation("tenant_a", "user_owner", conv.id);
    expect(asOwner?.id).toBe(conv.id);

    const asOtherUser = await getConversation("tenant_a", "user_attacker", conv.id);
    expect(asOtherUser).toBeNull();
  });

  it("başka bir tenantId ile aynı conversationId'ye erişilemez (aynı userId olsa bile)", async () => {
    const conv = await createConversation("tenant_b", "user_shared_id", "test");
    const crossTenant = await getConversation("tenant_other", "user_shared_id", conv.id);
    expect(crossTenant).toBeNull();
  });
});
