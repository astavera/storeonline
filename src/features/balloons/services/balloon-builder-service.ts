export type BalloonComponentKind = "stocked-variation" | "non-stocked-modifier";

export function requiresSquareVariation(kind: BalloonComponentKind) {
  return kind === "stocked-variation";
}

export function buildBalloonSectionId(step: string) {
  return `balloons.${step}`;
}
