import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { depositWebhookEvents } from "./deposits";
import { isPolarEnabled, polar } from "./subscriptions";

const http = httpRouter();

auth.addHttpRoutes(http);

if (isPolarEnabled()) {
  // One Polar webhook serves both billing surfaces: the component persists
  // subscription and product events itself, and the order events carry
  // reservation deposits.
  polar.registerRoutes(http, { events: depositWebhookEvents });
}

export default http;
