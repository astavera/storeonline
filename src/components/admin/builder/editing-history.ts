export type EditingHistory<T> = {
  past: T[];
  present: T;
  future: T[];
};

const defaultHistoryLimit = 50;

export function createEditingHistory<T>(initial: T): EditingHistory<T> {
  return { past: [], present: initial, future: [] };
}

export function commitEditingHistory<T>(history: EditingHistory<T>, next: T, limit = defaultHistoryLimit): EditingHistory<T> {
  if (Object.is(history.present, next)) return history;
  return {
    past: [...history.past, history.present].slice(-limit),
    present: next,
    future: []
  };
}

export function undoEditingHistory<T>(history: EditingHistory<T>): EditingHistory<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future]
  };
}

export function redoEditingHistory<T>(history: EditingHistory<T>): EditingHistory<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-defaultHistoryLimit),
    present: next,
    future: history.future.slice(1)
  };
}
