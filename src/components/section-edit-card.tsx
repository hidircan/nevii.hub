"use client";

/**
 * Read-only-by-default, section-by-section edit container. Wraps a Card:
 * shows `readOnly` content with a top-right "Düzenle" button when `canEdit`
 * is true; clicking it swaps in the serializable `edit` ReactNode (a form).
 *
 * Server Components MUST NOT pass function props into this client component.
 * After a successful save, if the edit child accepts optional `onSaved`, it is
 * injected here on the client via cloneElement so the section collapses.
 */

import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui";

type WithOnSaved = { onSaved?: () => void };

export function SectionEditCard({
  canEdit,
  readOnly,
  edit,
  className,
  defaultEditing = false,
}: {
  canEdit: boolean;
  readOnly: ReactNode;
  /** Form / editor tree — plain ReactNode only (no render props from Server Components). */
  edit: ReactNode;
  className?: string;
  /**
   * P0 (2026-09-05) — sözleşme adımından "Öğrenci Kaydını Düzenle" ile
   * gelindiğinde bölüm DOĞRUDAN düzenleme modunda açılır; kullanıcı ayrıca
   * "Düzenle"ye tıklamak zorunda kalmaz.
   */
  defaultEditing?: boolean;
}) {
  const [editing, setEditing] = useState(canEdit && defaultEditing);
  const close = () => setEditing(false);

  const editNode =
    editing && isValidElement(edit)
      ? cloneElement(edit as ReactElement<WithOnSaved>, {
          onSaved: () => {
            const prev = (edit as ReactElement<WithOnSaved>).props.onSaved;
            prev?.();
            close();
          },
        })
      : edit;

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
      {editing ? editNode : readOnly}
    </Card>
  );
}
