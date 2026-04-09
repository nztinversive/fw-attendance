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
      kiosk_id: k.kioskId || null,
      type: k.type,
      location: k.location,
      last_sync: k.lastSync || null,
      active: 1,
    }));
  },
});

export const create = mutation({
  args: { name: v.string(), kioskId: v.optional(v.string()), type: v.string(), location: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("kiosks", {
      name: args.name,
      kioskId: args.kioskId,
      type: args.type,
      location: args.location || "",
      active: true,
    });
    return { id, name: args.name, type: args.type };
  },
});

export const findByKioskId = query({
  args: { kioskId: v.string() },
  handler: async (ctx, args) => {
    const lookup = args.kioskId.trim().toLowerCase();
    if (!lookup) {
      return null;
    }

    const directMatches = await ctx.db
      .query("kiosks")
      .withIndex("by_kiosk_id", (q) => q.eq("kioskId", args.kioskId))
      .collect();
    const directMatch = directMatches.find((k) => k.active);
    if (directMatch) {
      return {
        id: directMatch._id,
        name: directMatch.name,
        kiosk_id: directMatch.kioskId || null,
        type: directMatch.type,
        location: directMatch.location,
        last_sync: directMatch.lastSync || null,
        active: 1,
      };
    }

    const kiosks = await ctx.db
      .query("kiosks")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    const match = kiosks.find(
      (k) =>
        k.name.trim().toLowerCase() === lookup ||
        (k.kioskId || "").trim().toLowerCase() === lookup,
    );
    if (!match) {
      return null;
    }

    return {
      id: match._id,
      name: match.name,
      kiosk_id: match.kioskId || null,
      type: match.type,
      location: match.location,
      last_sync: match.lastSync || null,
      active: 1,
    };
  },
});

export const updateLastSync = mutation({
  args: { id: v.id("kiosks"), lastSync: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { lastSync: args.lastSync });
  },
});
