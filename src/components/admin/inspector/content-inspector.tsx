/**
 * Edits section copy and ordered content items in the CMS inspector.
 */

"use client";

import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { CmsSection, SectionContentItem } from "@/lib/cms";
import { InspectorField, InspectorInput, InspectorTextarea } from "./inspector-fields";

export function ContentInspector({ section, updateSection }: { section: CmsSection; updateSection: (patch: Partial<CmsSection>) => void }) {
  const items = section.content.items ?? [];

  function updateContent(content: Partial<CmsSection["content"]>) {
    updateSection({ content });
  }

  function updateItem(itemId: string, patch: Partial<SectionContentItem>) {
    updateContent({
      items: items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    });
  }

  function addItem() {
    const nextIndex = items.length + 1;

    updateContent({
      items: [
        ...items,
        {
          id: uniqueItemId(items, `item-${nextIndex}`),
          title: `Card ${nextIndex}`,
          body: "",
          label: "",
          href: "",
          badge: "",
          image: "",
          imageAlt: ""
        }
      ]
    });
  }

  function duplicateItem(itemId: string) {
    const source = items.find((item) => item.id === itemId);

    if (!source) {
      return;
    }

    updateContent({
      items: [
        ...items,
        {
          ...source,
          id: uniqueItemId(items, `${source.id}-copy`),
          title: source.title ? `${String(source.title)} copy` : source.title
        }
      ]
    });
  }

  function removeItem(itemId: string) {
    updateContent({ items: items.filter((item) => item.id !== itemId) });
  }

  function moveItem(itemId: string, direction: -1 | 1) {
    const currentIndex = items.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + direction;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return;
    }

    const nextItems = [...items];
    const [moved] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, moved);
    updateContent({ items: nextItems });
  }

  return (
    <div className="grid gap-3">
      <InspectorField label="Section label">
        <InspectorInput value={section.label} onChange={(event) => updateSection({ label: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="Eyebrow">
        <InspectorInput value={String(section.content.eyebrow ?? "")} onChange={(event) => updateContent({ eyebrow: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="Title">
        <InspectorInput value={String(section.content.title ?? "")} onChange={(event) => updateContent({ title: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="Body">
        <InspectorTextarea value={String(section.content.body ?? "")} onChange={(event) => updateContent({ body: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="CTA label">
        <InspectorInput value={String(section.content.primaryCtaLabel ?? "")} onChange={(event) => updateContent({ primaryCtaLabel: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="CTA URL">
        <InspectorInput value={String(section.content.primaryCtaHref ?? "")} onChange={(event) => updateContent({ primaryCtaHref: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="Secondary CTA label">
        <InspectorInput value={String(section.content.secondaryCtaLabel ?? "")} onChange={(event) => updateContent({ secondaryCtaLabel: event.currentTarget.value })} />
      </InspectorField>
      <InspectorField label="Secondary CTA URL">
        <InspectorInput value={String(section.content.secondaryCtaHref ?? "")} onChange={(event) => updateContent({ secondaryCtaHref: event.currentTarget.value })} />
      </InspectorField>
      <div className="rounded-md border border-border bg-surface-muted p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Cards / items</p>
            <p className="text-xs text-secondary">Edit cards, links, badges, and image URLs for this section.</p>
          </div>
          <button
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold"
            onClick={addItem}
            type="button"
          >
            Add card
          </button>
        </div>
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div className="grid gap-3 rounded-md border border-border bg-surface p-3" key={item.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-secondary">Card {index + 1}</p>
                <div className="flex gap-1">
                  <SmallIconButton label="Move card up" onClick={() => moveItem(item.id, -1)}>
                    <ArrowUp aria-hidden="true" size={13} />
                  </SmallIconButton>
                  <SmallIconButton label="Move card down" onClick={() => moveItem(item.id, 1)}>
                    <ArrowDown aria-hidden="true" size={13} />
                  </SmallIconButton>
                  <SmallIconButton label="Duplicate card" onClick={() => duplicateItem(item.id)}>
                    <Copy aria-hidden="true" size={13} />
                  </SmallIconButton>
                  <SmallIconButton label="Remove card" onClick={() => removeItem(item.id)}>
                    <Trash2 aria-hidden="true" size={13} />
                  </SmallIconButton>
                </div>
              </div>
              <InspectorField label="Label / button text">
                <InspectorInput value={itemValue(item.label)} onChange={(event) => updateItem(item.id, { label: event.currentTarget.value })} />
              </InspectorField>
              <InspectorField label="Title">
                <InspectorInput value={itemValue(item.title)} onChange={(event) => updateItem(item.id, { title: event.currentTarget.value })} />
              </InspectorField>
              <InspectorField label="Body">
                <InspectorTextarea rows={3} value={itemValue(item.body)} onChange={(event) => updateItem(item.id, { body: event.currentTarget.value })} />
              </InspectorField>
              <InspectorField label="Link URL">
                <InspectorInput value={itemValue(item.href)} onChange={(event) => updateItem(item.id, { href: event.currentTarget.value })} />
              </InspectorField>
              <InspectorField label="Badge">
                <InspectorInput value={itemValue(item.badge)} onChange={(event) => updateItem(item.id, { badge: event.currentTarget.value })} />
              </InspectorField>
              <InspectorField label="Image URL">
                <InspectorInput value={itemValue(item.image)} onChange={(event) => updateItem(item.id, { image: event.currentTarget.value })} />
              </InspectorField>
              <InspectorField label="Image alt text">
                <InspectorInput value={itemValue(item.imageAlt)} onChange={(event) => updateItem(item.id, { imageAlt: event.currentTarget.value })} />
              </InspectorField>
            </div>
          ))}
          {items.length === 0 ? <p className="text-xs text-secondary">This section has no cards/items yet. Add a card to create editable tiles, FAQs, benefits, or category links.</p> : null}
        </div>
      </div>
    </div>
  );
}

function SmallIconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface-muted text-secondary transition hover:border-primary hover:text-primary" onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

function itemValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function uniqueItemId(items: SectionContentItem[], preferredId: string) {
  const safeId = preferredId.replace(/[^a-zA-Z0-9._-]/g, "-");
  const existingIds = new Set(items.map((item) => item.id));
  let candidate = safeId;
  let index = 1;

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `${safeId}-${index}`;
  }

  return candidate;
}
