import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("expire typing", { minutes: 1 }, internal.maintenance.sweepTyping, {});
crons.interval("expire unused uploads", { hours: 1 }, internal.maintenance.sweepUploads, {});
crons.interval("resume account deletion", { minutes: 10 }, internal.deletion.supervise, {});
export default crons;
