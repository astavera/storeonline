/**
 * Renders the interactive seasonal call-to-action card used by the Halloween hero.
 */

"use client";

import Link from "next/link";
import type { CSSProperties, PointerEvent } from "react";

import styles from "./halloween-hero-card.module.css";

type HalloweenHeroCardProps = {
  href: string;
};

type CardCSSProperties = CSSProperties & {
  "--rotate-x": string;
  "--rotate-y": string;
  "--glow-x": string;
  "--glow-y": string;
};

type CornerName = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

const BAT_CORNERS: readonly CornerName[] = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight"
] as const;

const LEFT_WING_PATH = `
  M120 46
  C104 41 89 31 74 16
  C54 21 33 22 10 18
  C29 29 41 43 45 60
  C56 52 69 52 80 57
  C90 62 96 71 100 82
  C108 77 115 79 120 87
  C120 70 120 57 120 46
  Z
`;

function Bat({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 240 140">
      <g fill="currentColor">
        <g className={styles.leftWing}>
          <path d={LEFT_WING_PATH} />
        </g>
        <g className={styles.rightWing}>
          <g transform="translate(240 0) scale(-1 1)">
            <path d={LEFT_WING_PATH} />
          </g>
        </g>
        <path
          d="
            M120 17
            L110 7
            L112 28
            C106 33 105 40 108 49
            C112 59 115 71 117 87
            L120 135
            L123 87
            C125 71 128 59 132 49
            C135 40 134 33 128 28
            L130 7
            Z
          "
        />
      </g>
    </svg>
  );
}

function joinClassNames(...classNames: Array<string | undefined | null | false>): string {
  return classNames.filter(Boolean).join(" ");
}

export function HalloweenHeroCard({ href }: HalloweenHeroCardProps) {
  const handlePointerMove = (event: PointerEvent<HTMLElement>): void => {
    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (event.pointerType === "touch" || prefersReducedMotion) {
      return;
    }

    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - normalizedY) * 8;
    const rotateY = (normalizedX - 0.5) * 10;

    card.style.setProperty("--rotate-x", `${rotateX.toFixed(2)}deg`);
    card.style.setProperty("--rotate-y", `${rotateY.toFixed(2)}deg`);
    card.style.setProperty("--glow-x", `${(normalizedX * 100).toFixed(1)}%`);
    card.style.setProperty("--glow-y", `${(normalizedY * 100).toFixed(1)}%`);
  };

  const resetPointerEffects = (event: PointerEvent<HTMLElement>): void => {
    const card = event.currentTarget;

    card.style.setProperty("--rotate-x", "0deg");
    card.style.setProperty("--rotate-y", "0deg");
    card.style.setProperty("--glow-x", "50%");
    card.style.setProperty("--glow-y", "50%");
  };

  const cardStyle: CardCSSProperties = {
    "--rotate-x": "0deg",
    "--rotate-y": "0deg",
    "--glow-x": "50%",
    "--glow-y": "50%"
  };

  return (
    <article
      className={styles.card}
      data-intro-state="settled"
      onPointerCancel={resetPointerEffects}
      onPointerLeave={resetPointerEffects}
      onPointerMove={handlePointerMove}
      style={cardStyle}
    >
      <div aria-hidden="true" className={styles.cursorGlow} />
      <div aria-hidden="true" className={styles.innerFrame} />

      {BAT_CORNERS.map((name) => (
        <div
          aria-hidden="true"
          className={joinClassNames(styles.batEntry, styles[name])}
          key={name}
        >
          <div className={styles.batFloat}>
            <Bat className={styles.batIcon} />
          </div>
        </div>
      ))}

      <div className={styles.content}>
        <h1 className={styles.title}>
          <span> Halloween </span>
          <span>Headquarters</span>
        </h1>

        <Link className={styles.button} href={href}>
          <span aria-hidden="true" className={styles.buttonShine} />
          <span className={styles.buttonText}>Shop Now</span>
        </Link>
      </div>
    </article>
  );
}
