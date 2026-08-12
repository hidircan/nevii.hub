"use client";

/**
 * Read-only-by-default, section-by-section edit container. Wraps a Card:
 * shows `readOnly` content with a top-right "Düzenle" button when `canEdit`
 * is true; clicking it swaps in `edit({ close })` (a form). The form itself
 * still owns its own save/error/success state and server action call — this
 * component only owns the open/closed toggle. Call `close()` from the form
 * (e.g. after a successful save) to collapse back to read-only.
 */

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui";

export function SectionEditCard({
  canEdit,
  readOnly,
  edit,
  className,
}: {
  canEdit: boolean;
  readOnly: ReactNode;
  edit: (helpers: { close: () => void }) => ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const close = () => setEditing(false);

  return (
    <Card className={className}>
      {editing ? (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={close}
            className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            Vazgeç
          </button>
        </div>
      ) : canEdit ? (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Düzenle
          </button>
        </div>
      ) : null}
      {editing ? edit({ close }) : readOnly}
    </Card>
  );
}
