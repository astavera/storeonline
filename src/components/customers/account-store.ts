/** Shared browser state for the non-navigating customer account drawer. */

let accountPanelOpen = false;
const listeners = new Set<() => void>();

export function isAccountPanelOpen() {
  return accountPanelOpen;
}

export function setAccountPanelOpen(open: boolean) {
  if (accountPanelOpen === open) return;
  accountPanelOpen = open;
  listeners.forEach((listener) => listener());
}

export function subscribeToAccountPanel(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
