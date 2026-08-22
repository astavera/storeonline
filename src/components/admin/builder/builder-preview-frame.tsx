/**
 * Wraps builder content in the selected responsive preview frame.
 */

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { builderDeviceDesignWidth, builderDeviceWidthClass } from "./builder-device-preview";
import type { BuilderDevice } from "./types";
import { cn } from "@/lib/utils";

export function BuilderPreviewFrame({ children, device }: { children: ReactNode; device: BuilderDevice }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameSize, setFrameSize] = useState({ height: 0, width: 0 });
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const designWidth = builderDeviceDesignWidth(device);
  const scale = frameSize.width > 0 ? Math.min(1, Math.max(0.25, (frameSize.width - 2) / designWidth)) : 1;
  const viewportHeight = frameSize.height > 0 ? Math.max(640, Math.floor((frameSize.height - 2) / scale)) : 800;

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateFrameSize = () => {
      setFrameSize({ height: frame.clientHeight, width: frame.clientWidth });
    };
    const observer = new ResizeObserver(updateFrameSize);

    updateFrameSize();
    observer.observe(frame);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    initializePreviewDocument();
  }, []);

  function initializePreviewDocument() {
    const previewDocument = iframeRef.current?.contentDocument;

    if (!previewDocument) {
      return;
    }

    previewDocument.documentElement.className = document.documentElement.className;
    previewDocument.body.className = "bg-background text-primary";
    previewDocument.body.style.margin = "0";
    previewDocument.body.style.minWidth = "0";

    previewDocument.head
      .querySelectorAll('[data-website-editor-preview-style="true"]')
      .forEach((stylesheet) => stylesheet.remove());

    document
      .querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style')
      .forEach((stylesheet) => {
        const clone = stylesheet.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
        clone.dataset.websiteEditorPreviewStyle = "true";
        previewDocument.head.append(clone);
      });

    setMountNode(previewDocument.body);
  }

  return (
    <div
      className={cn(
        "mx-auto h-[calc(100vh-8rem)] min-h-[640px] overflow-auto rounded-[16px] border border-border bg-surface shadow-sm transition-all",
        builderDeviceWidthClass(device)
      )}
      data-builder-preview-frame={device}
      ref={frameRef}
    >
      <div
        className="relative mx-auto"
        style={{
          height: `${viewportHeight * scale}px`,
          width: `${designWidth * scale}px`
        }}
      >
        <div
          data-builder-preview-viewport={device}
          style={{
            height: `${viewportHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: `${designWidth}px`
          }}
        >
          <iframe
            aria-label={`${device} storefront preview`}
            className="block h-full w-full border-0 bg-surface"
            onLoad={initializePreviewDocument}
            ref={iframeRef}
            srcDoc={'<!doctype html><html><head><base href="/"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>'}
            title={`${device} storefront preview`}
          />
          {mountNode ? createPortal(children, mountNode) : null}
        </div>
      </div>
    </div>
  );
}
