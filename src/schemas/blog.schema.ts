import { z } from "zod";
import { BlogPostStatus } from "../types/enums.js";

export const blogPostStatusSchema = z.nativeEnum(BlogPostStatus);

export const createBlogPostSchema = z.object({
  title: z.string().min(3).max(255),
  content: z.string().min(10),
  excerpt: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).default([]),
  status: blogPostStatusSchema.default(BlogPostStatus.DRAFT),
});

export const updateBlogPostSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  content: z.string().min(10).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  tags: z.array(z.string()).optional(),
  status: blogPostStatusSchema.optional(),
  published_at: z.string().datetime().optional().nullable(),
});

export const listBlogPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.string().optional(),
});

export type CreateBlogPostDTO = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostDTO = z.infer<typeof updateBlogPostSchema>;
export type ListBlogPostsQuery = z.infer<typeof listBlogPostsQuerySchema>;
