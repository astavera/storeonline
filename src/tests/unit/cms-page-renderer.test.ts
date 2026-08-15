/**
 * Verifies the isolated behavior of CMS page renderer.
 */

import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageRenderer } from "@/components/cms";
import { createCmsPageDocument, createCmsSection } from "@/lib/cms";

describe("PageRenderer", () => {
  it("renders known sections from a CMS page document", () => {
    const document = createCmsPageDocument("landing", "summer", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sections: [
        createCmsSection("hero", {
          id: "landing.hero",
          content: {
            title: "Summer campaign",
            body: "Editable CMS content."
          }
        })
      ]
    });

    render(createElement(PageRenderer, { document }));

    expect(screen.getByText("Summer campaign")).not.toBeNull();
    expect(screen.getByText("Editable CMS content.")).not.toBeNull();
  });

  it("skips hidden sections", () => {
    const document = createCmsPageDocument("landing", "hidden-test", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sections: [
        createCmsSection("hero", {
          id: "landing.hidden",
          hidden: true,
          content: {
            title: "Should not render"
          }
        })
      ]
    });

    render(createElement(PageRenderer, { document }));

    expect(screen.queryByText("Should not render")).toBeNull();
  });

  it("renders a safe fallback for unknown sections", () => {
    const document = createCmsPageDocument("landing", "unknown-test", {
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      sections: [
        {
          ...createCmsSection("hero", { id: "landing.unknown" }),
          type: "newExperimentalSection",
          label: "Experimental"
        }
      ]
    });

    render(createElement(PageRenderer, { document }));

    expect(screen.getByText("Unsupported section")).not.toBeNull();
    expect(screen.getByText(/newExperimentalSection/)).not.toBeNull();
  });
});
