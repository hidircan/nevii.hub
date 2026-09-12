"use client";

/**
 * Ders planı şablon önizlemesi — veli + öğretmen varsayılan gövdeleri
 * üzerinde oynayıp ANINDA önizleme + placeholder validation görülür.
 * AYNI saf render motoru server taslak üretimiyle paylaşılır
 * (`lesson-plan-templates.ts`), bu yüzden önizlemede geçerli olan gönderimde
 * de geçerlidir. Düzenleme burada ÖNİZLEME amaçlıdır; kalıcı katalog
 * değişikliği ayrı bir store+denetim işidir (backlog — bkz. rapor).
 * Onaylanan mesaj gövdesi snapshot olarak donar, şablon değişikliğinden
 * ETKİLENMEZ.
 */

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import {
  LESSON_PLAN_PARENT_TEMPLATE,
  LESSON_PLAN_TEACHER_TEMPLATE,
  LESSON_PLAN_PLACEHOLDER_DOC,
  LESSON_PLAN_PREVIEW_VARS,
  renderLessonPlanTemplate,
} from "@/lib/communications/lesson-plan-templates";
import type { LessonPlanTemplateVars } from "@/lib/communications/lesson-plan-templates";

export function LessonPlanTemplatePreview() {
  const [parentTemplate, setParentTemplate] = useState(LESSON_PLAN_PARENT_TEMPLATE);
  const [teacherTemplate, setTeacherTemplate] = useState(LESSON_PLAN_TEACHER_TEMPLATE);
  const [vars, setVars] = useState<LessonPlanTemplateVars>(LESSON_PLAN_PREVIEW_VARS);

  const parentResult = useMemo(() => renderLessonPlanTemplate(parentTemplate, vars), [parentTemplate, vars]);
  const teacherResult = useMemo(() => renderLessonPlanTemplate(teacherTemplate, vars), [teacherTemplate, vars]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TemplateEditor
        title="Veli şablonu (ders planı)"
        template={parentTemplate}
        onChange={setParentTemplate}
        vars={vars}
        onVarsChange={setVars}
        result={parentResult}
      />
      <TemplateEditor
        title="Öğretmen şablonu (ders planı)"
        template={teacherTemplate}
        onChange={setTeacherTemplate}
        vars={vars}
        onVarsChange={setVars}
        result={teacherResult}
      />
    </div>
  );
}

function TemplateEditor({
  title,
  template,
  onChange,
  vars,
  onVarsChange,
  result,
}: {
  title: string;
  template: string;
  onChange: (v: string) => void;
  vars: LessonPlanTemplateVars;
  onVarsChange: (v: LessonPlanTemplateVars) => void;
  result: { ok: true; body: string } | { ok: false; message: string };
}) {
  return (
    <Card>
      <p className="font-semibold text-[var(--color-text)]">{title}</p>
      <label className="mt-3 block text-xs font-medium text-[var(--color-text-muted)]">
        Şablon (desteklenen yer tutucular: {LESSON_PLAN_PLACEHOLDER_DOC})
      </label>
      <textarea
        value={template}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-relaxed text-[var(--color-text)]"
      />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(vars) as (keyof LessonPlanTemplateVars)[]).map((k) => (
          <label key={k} className="block text-xs text-[var(--color-text-muted)]">
            {`{${k}}`}
            <input
              value={vars[k]}
              onChange={(e) => onVarsChange({ ...vars, [k]: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)]"
            />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs font-medium text-[var(--color-text)]">Önizleme</p>
      {result.ok ? (
        <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-[var(--color-surface-muted)] p-3 text-xs leading-relaxed text-[var(--color-text)]">
          {result.body}
        </pre>
      ) : (
        <p className="mt-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700" role="alert">
          {result.message}
        </p>
      )}
    </Card>
  );
}
