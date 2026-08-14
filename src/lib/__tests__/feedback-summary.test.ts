import { describe, it, expect } from "vitest";
import {
  computeFeedbackSummaryStats,
  formatDeterministicFeedbackSummary,
  FEEDBACK_SUMMARY_MIN_RESPONSES,
} from "../feedback-summary";

const CRITERIA = ["clarity", "communication"];
const LABELS = { clarity: "Anlaşılırlık", communication: "İletişim" };

describe("computeFeedbackSummaryStats", () => {
  it("3'ten az kayıtta eligible:false döner, ortalama/tema hesaplanmaz", () => {
    const stats = computeFeedbackSummaryStats(
      [{ scores: { clarity: 5, communication: 5 } }, { scores: { clarity: 4, communication: 4 } }],
      CRITERIA
    );
    expect(stats.eligible).toBe(false);
    expect(stats.responseCount).toBe(2);
    expect(stats.criteriaAverages).toEqual({});
  });

  it(`tam olarak ${FEEDBACK_SUMMARY_MIN_RESPONSES} kayıtta eligible:true olur ve ortalama doğru hesaplanır`, () => {
    const rows = [
      { scores: { clarity: 5, communication: 3 } },
      { scores: { clarity: 4, communication: 3 } },
      { scores: { clarity: 3, communication: 3 } },
    ];
    const stats = computeFeedbackSummaryStats(rows, CRITERIA);
    expect(stats.eligible).toBe(true);
    expect(stats.criteriaAverages.clarity).toBe(4);
    expect(stats.criteriaAverages.communication).toBe(3);
  });

  it("yalnızca tekrarlayan kelimeler tema sayılır, tek seferlik kelimeler dahil edilmez", () => {
    const rows = [
      { scores: { clarity: 5, communication: 5 }, comment: "iletişim çok iyiydi" },
      { scores: { clarity: 5, communication: 5 }, comment: "iletişim harikaydı" },
      { scores: { clarity: 5, communication: 5 }, comment: "başka bir konu" },
    ];
    const stats = computeFeedbackSummaryStats(rows, CRITERIA);
    expect(stats.themes).toContain("iletişim");
    expect(stats.commentCount).toBe(3);
  });

  it("hiçbir ham yorum metni themes içinde tam cümle olarak yer almaz (yalnız tek kelime)", () => {
    const rows = [
      { scores: { clarity: 5, communication: 5 }, comment: "Ahmet çok yardımcı oldu bugün" },
      { scores: { clarity: 5, communication: 5 }, comment: "Ahmet çok yardımcı oldu dün de" },
      { scores: { clarity: 5, communication: 5 }, comment: "farklı bir yorum" },
    ];
    const stats = computeFeedbackSummaryStats(rows, CRITERIA);
    for (const theme of stats.themes) {
      expect(theme.split(" ")).toHaveLength(1);
    }
  });
});

describe("formatDeterministicFeedbackSummary", () => {
  it("eligible:false iken minimum kayıt uyarısı döner", () => {
    const text = formatDeterministicFeedbackSummary(
      { responseCount: 1, eligible: false, criteriaAverages: {}, commentCount: 0, themes: [] },
      LABELS
    );
    expect(text).toContain("en az 3 değerlendirme");
  });

  it("eligible:true iken 5 başlığı da içerir", () => {
    const text = formatDeterministicFeedbackSummary(
      {
        responseCount: 3,
        eligible: true,
        criteriaAverages: { clarity: 4.5, communication: 3.8 },
        commentCount: 2,
        themes: ["iletişim"],
      },
      LABELS
    );
    expect(text).toContain("Genel eğilim");
    expect(text).toContain("Güçlü yönler");
    expect(text).toContain("Dikkat edilmesi gerekenler");
    expect(text).toContain("Tekrarlayan temalar");
    expect(text).toContain("Önerilen yönetici aksiyonu");
  });
});
