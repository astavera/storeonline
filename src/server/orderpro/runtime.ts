/**
 * Implements server-side runtime behavior and persistence boundaries.
 */

import "server-only";
import { createAuth0TokenProvider } from "@/server/orderpro/auth0-token-provider";
import { createOrderProClient, type OrderProClient } from "@/server/orderpro/client";
import { getOrderProM2mConfiguration } from "@/server/orderpro/config";

type RuntimeOrderProClientResult =
  | { ready: false; state: "DISABLED" }
  | { ready: false; state: "INVALID"; invalidVariables: string[] }
  | { ready: true; state: "READY"; client: OrderProClient };

let runtimeClient: OrderProClient | null = null;

export function getRuntimeOrderProClient(): RuntimeOrderProClientResult {
  const configuration = getOrderProM2mConfiguration();
  if (!configuration.enabled) {
    return configuration.state === "DISABLED"
      ? { ready: false, state: "DISABLED" }
      : { ready: false, state: "INVALID", invalidVariables: configuration.invalidVariables };
  }

  if (!runtimeClient) {
    const tokenProvider = createAuth0TokenProvider({ config: configuration.config.auth0 });
    runtimeClient = createOrderProClient({ config: configuration.config.api, tokenProvider });
  }

  return { ready: true, state: "READY", client: runtimeClient };
}
