-- Deneme dersi: ders sonrası sonuç/görüşme notu (hazırlık notu `notes` alanında kalır). Additive.
ALTER TABLE "TrialLesson" ADD COLUMN "resultNotes" TEXT;
ALTER TABLE "TrialLesson" ADD COLUMN "resultNotesAt" TIMESTAMP(3);
ALTER TABLE "TrialLesson" ADD COLUMN "resultNotesByUserId" TEXT;
