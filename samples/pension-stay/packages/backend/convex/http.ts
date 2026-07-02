import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { isPolarEnabled, polar } from "./subscriptions";

const http = httpRouter();

auth.addHttpRoutes(http);

if (isPolarEnabled()) {
  polar.registerRoutes(http);
}

export default http;
