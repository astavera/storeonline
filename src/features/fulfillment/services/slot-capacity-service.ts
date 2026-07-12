export type SlotCapacityState = {
  maxCapacityPoints: number;
  confirmedCapacityPoints: number;
  heldCapacityPoints: number;
};

export function canReserveCapacity(state: SlotCapacityState, requestedCapacityPoints: number) {
  return state.confirmedCapacityPoints + state.heldCapacityPoints + requestedCapacityPoints <= state.maxCapacityPoints;
}

export function capacityPointsForFulfillment(kind: "simple-mylar-pickup" | "latex-bouquet-pickup" | "large-arrangement" | "local-delivery-stop" | "same-day-rush") {
  const points = {
    "simple-mylar-pickup": 1,
    "latex-bouquet-pickup": 3,
    "large-arrangement": 8,
    "local-delivery-stop": 2,
    "same-day-rush": 2
  };

  return points[kind];
}
