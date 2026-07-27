"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";

import styles from "./HalloweenHeroCard.module.css";

type HalloweenHeroCardProps = {
  href: string;
};

type IntroState = "checking" | "flying" | "settled";

type CardCSSProperties = CSSProperties & {
  "--rotate-x": string;
  "--rotate-y": string;
  "--glow-x": string;
  "--glow-y": string;
};

type CornerName = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

type BatCorner = {
  name: CornerName;
  horizontalDirection: -1 | 1;
  verticalDirection: -1 | 1;
};

const INTRO_STORAGE_KEY = "home:halloween-bats-intro:v5";

const BAT_CORNERS: readonly BatCorner[] = [
  { name: "topLeft", horizontalDirection: -1, verticalDirection: -1 },
  { name: "topRight", horizontalDirection: 1, verticalDirection: -1 },
  { name: "bottomLeft", horizontalDirection: -1, verticalDirection: 1 },
  { name: "bottomRight", horizontalDirection: 1, verticalDirection: 1 }
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

export default function HalloweenHeroCard({ href }: HalloweenHeroCardProps) {
  const cardRef = useRef<HTMLElement | null>(null);
  const batRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [introState, setIntroState] = useState<IntroState>("checking");

  useEffect(() => {
    let disposed = false;
    let firstFrame = 0;
    let secondFrame = 0;
    const runningAnimations: Animation[] = [];
    const cleanup = () => {
      disposed = true;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      runningAnimations.forEach((animation) => {
        animation.cancel();
      });
    };
    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationAlreadyPlayed = false;

    try {
      animationAlreadyPlayed = window.sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";
    } catch {
      animationAlreadyPlayed = false;
    }

    if (prefersReducedMotion || animationAlreadyPlayed) {
      firstFrame = window.requestAnimationFrame(() => {
        if (!disposed) {
          setIntroState("settled");
        }
      });

      return cleanup;
    }

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (disposed) {
          return;
        }

        const card = cardRef.current;

        if (!card) {
          setIntroState("settled");
          return;
        }

        const cardRect = card.getBoundingClientRect();
        const cardCenterX = cardRect.left + cardRect.width / 2;
        const cardCenterY = cardRect.top + cardRect.height / 2;

        setIntroState("flying");

        const animationJobs = BAT_CORNERS.map(({ horizontalDirection, verticalDirection }, index) => {
          const bat = batRefs.current[index];

          if (!bat) {
            return Promise.resolve();
          }

          const batRect = bat.getBoundingClientRect();
          const batCenterX = batRect.left + batRect.width / 2;
          const batCenterY = batRect.top + batRect.height / 2;
          const startX = cardCenterX - batCenterX;
          const startY = cardCenterY - batCenterY;
          const curveX = horizontalDirection * 26;
          const curveY = verticalDirection * 18;
          const overshootX = horizontalDirection * 8;
          const overshootY = verticalDirection * 6;

          const animation = bat.animate(
            [
              {
                transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.14) rotate(${-horizontalDirection * 12}deg)`,
                opacity: 0,
                offset: 0
              },
              {
                transform: `translate3d(${startX * 0.88}px, ${startY * 0.88}px, 0) scale(0.44) rotate(${horizontalDirection * 8}deg)`,
                opacity: 1,
                offset: 0.2
              },
              {
                transform: `translate3d(${startX * 0.5 + curveX}px, ${startY * 0.5 + curveY}px, 0) scale(0.84) rotate(${-horizontalDirection * 10}deg)`,
                opacity: 1,
                offset: 0.6
              },
              {
                transform: `translate3d(${overshootX}px, ${overshootY}px, 0) scale(1.08) rotate(${horizontalDirection * 4}deg)`,
                opacity: 1,
                offset: 0.87
              },
              {
                transform: "translate3d(0, 0, 0) scale(1) rotate(0deg)",
                opacity: 1,
                offset: 1
              }
            ],
            {
              duration: 1500,
              delay: index * 90,
              easing: "cubic-bezier(0.2, 0.82, 0.2, 1)",
              fill: "both"
            }
          );

          runningAnimations.push(animation);
          return animation.finished.catch(() => undefined);
        });

        void Promise.all(animationJobs).then(() => {
          if (disposed) {
            return;
          }

          setIntroState("settled");

          try {
            window.sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
          } catch {
            // The card continues working if sessionStorage is unavailable.
          }
        });
      });
    });

    return cleanup;
  }, []);

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
    const rotateX = (0.5 - normalizedY) * 5;
    const rotateY = (normalizedX - 0.5) * 6;

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
    card.style.setProperty("--glow-y", "34%");
  };

  const cardStyle: CardCSSProperties = {
    "--rotate-x": "0deg",
    "--rotate-y": "0deg",
    "--glow-x": "50%",
    "--glow-y": "34%"
  };

  return (
    <article
      className={styles.card}
      data-intro-state={introState}
      onPointerCancel={resetPointerEffects}
      onPointerLeave={resetPointerEffects}
      onPointerMove={handlePointerMove}
      ref={cardRef}
      style={cardStyle}
    >
      <div aria-hidden="true" className={styles.cursorGlow} />
      <div aria-hidden="true" className={styles.innerFrame} />

      {BAT_CORNERS.map(({ name }, index) => (
        <div
          aria-hidden="true"
          className={joinClassNames(styles.batEntry, styles[name])}
          key={name}
          ref={(node) => {
            batRefs.current[index] = node;
          }}
        >
          <div className={styles.batFloat}>
            <Bat className={styles.batIcon} />
          </div>
        </div>
      ))}

      <div className={styles.content}>
        <h1 className={styles.title}>
          <span>The Halloween</span>
          <span>Headquarter</span>
        </h1>

        <Link className={styles.button} href={href}>
          <span aria-hidden="true" className={styles.buttonShine} />
          <span className={styles.buttonText}>Shop Now</span>
        </Link>
      </div>
    </article>
  );
}
