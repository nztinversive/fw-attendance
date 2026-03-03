import { query } from "./_generated/server";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];

    const allWorkers = await ctx.db
      .query("workers")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const totalWorkers = allWorkers.length;

    // Get today's records
    const allAttendance = await ctx.db.query("attendance").collect();
    const todayAttendance = allAttendance.filter((a) => a.timestamp.startsWith(today));

    // Latest event per worker
    const workerStatus = new Map<string, { eventType: string; timestamp: string }>();
    for (const a of todayAttendance) {
      const existing = workerStatus.get(a.workerId);
      if (!existing || a.timestamp > existing.timestamp) {
        workerStatus.set(a.workerId, { eventType: a.eventType, timestamp: a.timestamp });
      }
    }

    let clockedIn = 0;
    let clockedOut = 0;
    for (const s of workerStatus.values()) {
      if (s.eventType === "clock_in") clockedIn++;
      else clockedOut++;
    }
    const notArrived = totalWorkers - workerStatus.size;

    // Average arrival
    const firstIns = new Map<string, string>();
    for (const a of todayAttendance) {
      if (a.eventType === "clock_in") {
        const existing = firstIns.get(a.workerId);
        if (!existing || a.timestamp < existing) {
          firstIns.set(a.workerId, a.timestamp);
        }
      }
    }

    let avgArrival: string | null = null;
    if (firstIns.size > 0) {
      const totalMinutes = [...firstIns.values()].reduce((sum, ts) => {
        const d = new Date(ts);
        return sum + d.getUTCHours() * 60 + d.getUTCMinutes();
      }, 0);
      const avgMin = Math.round(totalMinutes / firstIns.size);
      const h = Math.floor(avgMin / 60);
      const m = avgMin % 60;
      avgArrival = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    }

    // Schedule check
    const dayOfWeek = new Date().getDay();
    const schedules = await ctx.db
      .query("schedules")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const hasScheduleToday = schedules.some((s) => {
      try {
        return (JSON.parse(s.days) as number[]).includes(dayOfWeek);
      } catch {
        return false;
      }
    });

    return {
      totalWorkers,
      clockedIn,
      clockedOut,
      notArrived,
      avgArrival,
      ...(hasScheduleToday ? {} : { scheduleWarning: "No schedule found for today" }),
    };
  },
});
