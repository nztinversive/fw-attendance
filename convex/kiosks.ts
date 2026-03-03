import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const kiosks = await ctx.db
      .query("kiosks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return kiosks.map((k) => ({
      id: k._id,
      name: k.name,
      type: k.type,
      location: k.location,
      last_sync: k.lastSync || null,
      active: 1,
    }));
  },
});

export const create = mutation({
  args: { name: v.string(), type: v.string(), location: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("kiosks", {
      name: args.name,
      type: args.type,
      location: args.location || "",
      active: true,
    });
    return { id, name: args.name, type: args.type };
  },
});

export const updateLastSync = mutation({
  args: { id: v.id("kiosks"), lastSync: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastSync: args.lastSync });
  },
});
