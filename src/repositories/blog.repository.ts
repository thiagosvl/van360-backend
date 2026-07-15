import { supabaseAdmin } from "../config/supabase.js";
import { BlogPostStatus } from "../types/enums.js";

export const blogRepository = {
    async insert(data: any) {
        return supabaseAdmin
            .from("blog_posts")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: any) {
        return supabaseAdmin
            .from("blog_posts")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async delete(id: string) {
        return supabaseAdmin
            .from("blog_posts")
            .delete()
            .eq("id", id);
    },

    async getById(id: string) {
        return supabaseAdmin
            .from("blog_posts")
            .select("*")
            .eq("id", id)
            .single();
    },

    async getBySlug(slug: string) {
        return supabaseAdmin
            .from("blog_posts")
            .select("*")
            .eq("slug", slug)
            .single();
    },

    async getPublishedBySlug(slug: string) {
        return supabaseAdmin
            .from("blog_posts")
            .select("id, title, slug, content, excerpt, tags, views, published_at, created_at, updated_at")
            .eq("slug", slug)
            .eq("status", BlogPostStatus.PUBLISHED)
            .single();
    },

    async listAll(page: number, limit: number, status?: string) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabaseAdmin
            .from("blog_posts")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false });

        if (status) {
            query = query.eq("status", status);
        }

        return query.range(from, to);
    },

    async listPublished(page: number, limit: number) {
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        return supabaseAdmin
            .from("blog_posts")
            .select("id, title, slug, excerpt, tags, views, published_at, created_at", { count: "exact" })
            .eq("status", BlogPostStatus.PUBLISHED)
            .order("published_at", { ascending: false })
            .range(from, to);
    },

    async incrementViews(id: string, currentViews: number) {
        return supabaseAdmin
            .from("blog_posts")
            .update({ views: currentViews + 1 })
            .eq("id", id);
    }
};
