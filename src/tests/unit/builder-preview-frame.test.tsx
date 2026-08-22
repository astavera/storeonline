/**
 * Verifies that page-builder device previews use an isolated responsive viewport.
 */

import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BuilderPreviewFrame } from "@/components/admin/builder/builder-preview-frame";
import { builderDeviceDesignWidth } from "@/components/admin/builder/builder-device-preview";

describe("BuilderPreviewFrame", () => {
  afterEach(() => {
    document.head.querySelectorAll("[data-test-preview-style]").forEach((element) => element.remove());
  });

  it("maps every device to a real storefront viewport width", () => {
    expect(builderDeviceDesignWidth("desktop")).toBe(1440);
    expect(builderDeviceDesignWidth("tablet")).toBe(760);
    expect(builderDeviceDesignWidth("mobile")).toBe(390);
  });

  it("renders the editable page inside an iframe with the selected viewport", () => {
    const stylesheet = document.createElement("style");
    stylesheet.dataset.testPreviewStyle = "true";
    stylesheet.textContent = ".responsive-proof { display: block; }";
    document.head.append(stylesheet);

    const { container } = render(
      <BuilderPreviewFrame device="mobile">
        <div data-preview-content="true">Responsive page</div>
      </BuilderPreviewFrame>
    );
    const iframe = container.querySelector<HTMLIFrameElement>('iframe[title="mobile storefront preview"]');

    expect(iframe).not.toBeNull();

    const viewport = container.querySelector<HTMLElement>('[data-builder-preview-viewport="mobile"]');
    const previewDocument = iframe!.contentDocument;

    expect(viewport?.style.width).toBe("390px");
    expect(previewDocument?.body.querySelector('[data-preview-content="true"]')?.textContent).toBe("Responsive page");
    expect(previewDocument?.head.querySelector('[data-website-editor-preview-style="true"]')).not.toBeNull();

    fireEvent.load(iframe!);

    expect(previewDocument?.head.querySelectorAll('[data-website-editor-preview-style="true"]')).toHaveLength(1);
  });
});
