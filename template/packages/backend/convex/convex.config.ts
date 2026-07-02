import polar from "@convex-dev/polar/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();

// Convex CLI constraint: convex.config.ts cannot import outside convex/
// (e.g. ../domain.config breaks the config bundle). Registration alone reads
// no env and is harmless when polar is off — the real optional boundary lives
// in subscriptions.ts (use-time env validation) and the UI/webhook toggles.
app.use(polar);

export default app;
