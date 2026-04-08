import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const SUPPORTED_ENCODING_LENGTHS = new Set([128, 512]);

function isSupportedFaceEncoding(encoding?: number[]) {
  return (
    encoding === undefined ||
    (SUPPORTED_ENCODING_LENGTHS.has(encoding.length) && encoding.every((value) => Number.isFinite(value)))
  );
}

export const list = query({
  args: { includeEncodings: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const workers = await ctx.db
      .query("workers")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return workers.map((w) => ({
      id: w._id,
      name: w.name,
      department: w.department,
      photo_url: null,
      ...(args.includeEncodings ? { face_encoding: w.faceEncoding || null } : {}),
      enrolled_at: w.enrolledAt,
      active: 1,
    }));
  },
});

export const get = query({
  args: { id: v.id("workers") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.id);
    if (!w || !w.active) return null;
    return { id: w._id, name: w.name, department: w.department, photo_url: null, face_encoding: w.faceEncoding || null, enrolled_at: w.enrolledAt, active: 1 };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    department: v.optional(v.string()),
    faceEncoding: v.optional(v.array(v.float64())),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("Worker name is required");
    }
    if (!isSupportedFaceEncoding(args.faceEncoding)) {
      throw new Error("faceEncoding must contain 128 or 512 finite values");
    }
    const now = new Date().toISOString();
    const id = await ctx.db.insert("workers", {
      name,
      department: args.department || "",
      faceEncoding: args.faceEncoding,
      photoStorageIds: args.photoStorageIds,
      enrolledAt: now,
      updatedAt: now,
      active: true,
    });
    return { id, name, department: args.department || "" };
  },
});

export const update = mutation({
  args: {
    id: v.id("workers"),
    name: v.optional(v.string()),
    department: v.optional(v.string()),
    faceEncoding: v.optional(v.array(v.float64())),
    photoStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (!isSupportedFaceEncoding(fields.faceEncoding)) {
      throw new Error("faceEncoding must contain 128 or 512 finite values");
    }
    if (fields.name !== undefined) {
      const trimmedName = fields.name.trim();
      if (!trimmedName) {
        throw new Error("Worker name is required");
      }
      updates.name = trimmedName;
    }
    if (fields.department !== undefined) updates.department = fields.department;
    if (fields.faceEncoding !== undefined) updates.faceEncoding = fields.faceEncoding;
    if (fields.photoStorageIds !== undefined) updates.photoStorageIds = fields.photoStorageIds;
    updates.updatedAt = new Date().toISOString();
    await ctx.db.patch(id, updates);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("workers") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { active: false, updatedAt: new Date().toISOString() });
    return { ok: true };
  },
});

export const listForSync = query({
  args: { since: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("workers").collect();
    const since = args.since || "1970-01-01T00:00:00.000Z";
    const filtered = all.filter((w) => (w.updatedAt || w.enrolledAt) > since);
    const result = [];
    for (const w of filtered) {
      let photoUrls: string[] = [];
      if (w.photoStorageIds) {
        for (const sid of w.photoStorageIds) {
          const url = await ctx.storage.getUrl(sid);
          if (url) photoUrls.push(url);
        }
      }
      result.push({
        id: w._id,
        name: w.name,
        department: w.department,
        photo_url: photoUrls[0] || null,
        face_encoding: w.faceEncoding || null,
        enrolled_at: w.enrolledAt,
        updated_at: w.updatedAt || w.enrolledAt,
        active: w.active ? 1 : 0,
      });
    }
    return result;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getPhotoUrls = query({
  args: { id: v.id("workers") },
  handler: async (ctx, args) => {
    const w = await ctx.db.get(args.id);
    if (!w || !w.active) return null;
    const photos: string[] = [];
    if (w.photoStorageIds) {
      for (const sid of w.photoStorageIds) {
        const url = await ctx.storage.getUrl(sid);
        if (url) photos.push(url);
      }
    }
    return { worker_id: w._id, name: w.name, photos, count: photos.length };
  },
});
