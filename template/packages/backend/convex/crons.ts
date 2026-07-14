import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "reset demo playground",
  { minuteUTC: 0 },
  internal.demoReset.resetPlayground,
  {},
);

export default crons;
