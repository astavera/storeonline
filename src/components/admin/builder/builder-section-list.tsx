/**
 * Renders sortable CMS sections with visibility, duplication, and removal actions.
 */

"use client";

import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { CmsPageDocument } from "@/lib/cms";
import { cn } from "@/lib/utils";

export function BuilderSectionList({
  document,
  onDuplicate,
  onMove,
  onRemove,
  onSelect,
  onToggleHidden,
  selectedSectionId
}: {
  document: CmsPageDocument;
  onDuplicate: (sectionId: string) => void;
  onMove: (sectionId: string, direction: -1 | 1) => void;
  onRemove: (sectionId: string) => void;
  onSelect: (sectionId: string) => void;
  onToggleHidden: (sectionId: string, hidden: boolean) => void;
  selectedSectionId: string;
}) {
  return (
    <div className="grid gap-2">
      {document.sections.map((section, index) => (
        <article
          className={cn("rounded-md border border-border bg-surface p-3 transition", selectedSectionId === section.id && "border-primary shadow-soft", section.hidden && "opacity-55")}
          key={section.id}
        >
          <button className="flex w-full items-start gap-2 text-left" onClick={() => onSelect(section.id)} type="button">
            <GripVertical aria-hidden="true" className="mt-0.5 text-secondary" size={16} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{section.label}</span>
              <span className="mt-1 block truncate text-xs text-secondary">
                {index + 1}. {section.type} / {section.variant}
              </span>
            </span>
            {section.locked ? <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-secondary">locked</span> : null}
          </button>
          <div className="mt-3 flex flex-wrap gap-1">
            <IconButton label="Move up" onClick={() => onMove(section.id, -1)}>
              <ArrowUp aria-hidden="true" size={14} />
            </IconButton>
            <IconButton label="Move down" onClick={() => onMove(section.id, 1)}>
              <ArrowDown aria-hidden="true" size={14} />
            </IconButton>
            <IconButton label="Duplicate" onClick={() => onDuplicate(section.id)}>
              <Copy aria-hidden="true" size={14} />
            </IconButton>
            <IconButton label={section.hidden ? "Show" : "Hide"} onClick={() => onToggleHidden(section.id, !section.hidden)}>
              {section.hidden ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}
            </IconButton>
            <IconButton label={section.locked ? "Hide locked section" : "Remove"} onClick={() => onRemove(section.id)}>
              <Trash2 aria-hidden="true" size={14} />
            </IconButton>
          </div>
        </article>
      ))}
    </div>
  );
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <Button aria-label={label} className="h-8 w-8 px-0" onClick={onClick} title={label} type="button" variant="quiet">
      {children}
    </Button>
  );
}
