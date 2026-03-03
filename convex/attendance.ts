import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { date: v.optional(v.string()), workerId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const date = args.date || new Date().toISOString().split("T")[0];
    let records = await ctx.db.query("attendance").collect();
    records = records.filter((r) => r.timestamp.startsWith(date));
    if (args.workerId) records = records.filter((r) => r.workerId === args.workerId);
    records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Join worker and kiosk data
    const result = [];
    for (const a of records) {
      const worker = a.workerId ? await ctx.db.get(a.workerId as any).catch(() => null) : null;
      const kiosk = a.kioskId ? await ctx.db.get(a.kioskId as any).catch(() => null) : null;
      result.push({
        id: a._id,
        worker_id: a.workerId,
        event_type: a.eventType,
        kiosk_id: a.kioskId || null,
        timestamp: a.timestamp,
        synced: a.synced ? 1 : 0,
        worker_name: (worker as any)?.name || a.workerName || "",
        worker_department: (worker as any)?.department || "",
        kiosk_name: (kiosk as any)?.name || null,
        confidence: a.confidence || 0,
        liveness_confirmed: a.livenessConfirmed ? 1 : 0,
      });
    }
    return result;
  },
});

export const create = mutation({
  args: {
    workerId: v.string(),
    eventType: v.string(),
    kioskId: v.optional(v.string()),
    timestamp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("attendance", {
      workerId: args.workerId,
      eventType: args.eventType,
      kioskId: args.kioskId,
      timestamp: args.timestamp || new Date().toISOString(),
      synced: false,
    });
    return { id };
  },
});

export const bulkCreate = mutation({
  args: {
    events: v.array(
      v.object({
        id: v.optional(v.string()),
        workerId: v.string(),
        eventType: v.string(),
        kioskId: v.optional(v.string()),
        timestamp: v.string(),
        workerName: v.optional(v.string()),
        confidence: v.optional(v.float64()),
        livenessConfirmed: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let count = 0;
    for (const e of args.events) {
      await ctx.db.insert("attendance", {
        workerId: e.workerId,
        eventType: e.eventType,
        kioskId: e.kioskId,
        timestamp: e.timestamp,
        synced: true,
        workerName: e.workerName,
        confidence: e.confidence,
        livenessConfirmed: e.livenessConfirmed,
      });
      count++;
    }
    return { synced: count };
  },
});
