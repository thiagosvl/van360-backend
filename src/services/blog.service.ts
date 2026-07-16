import { blogRepository } from "../repositories/blog.repository.js";
import { CreateBlogPostDTO, UpdateBlogPostDTO } from "../schemas/blog.schema.js";
import { BlogPostStatus } from "../types/enums.js";
import { triggerDeployWebhook } from "../utils/deploy.utils.js";

const _generateSlug = (title: string): string => {
    return title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
};

const _findUniqueSlug = async (title: string, currentPostId?: string): Promise<string> => {
    const baseSlug = _generateSlug(title);
    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const { data, error } = await blogRepository.getBySlug(slug);
        if (error || !data || data.id === currentPostId) {
            return slug;
        }
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
};

export const blogService = {
    async createPost(authorId: string, payload: CreateBlogPostDTO) {
        const slug = await _findUniqueSlug(payload.title);
        const data: any = {
            title: payload.title,
            slug,
            content: payload.content,
            excerpt: payload.excerpt || null,
            tags: payload.tags || [],
            status: payload.status,
            author_id: authorId,
        };

        if (payload.status === BlogPostStatus.PUBLISHED) {
            data.published_at = new Date().toISOString();
        }

        const { data: inserted, error } = await blogRepository.insert(data);
        if (error) throw error;

        if (payload.status === BlogPostStatus.PUBLISHED) {
            await triggerDeployWebhook();
        }

        return inserted;
    },

    async updatePost(id: string, payload: UpdateBlogPostDTO) {
        const current = await this.getPost(id);
        const data: any = {};

        if (payload.title) {
            data.title = payload.title;
            data.slug = await _findUniqueSlug(payload.title, id);
        }

        if (payload.content !== undefined) data.content = payload.content;
        if (payload.excerpt !== undefined) data.excerpt = payload.excerpt;
        if (payload.tags !== undefined) data.tags = payload.tags;
        if (payload.status !== undefined) {
            data.status = payload.status;
            if (payload.status === BlogPostStatus.PUBLISHED && !current.published_at) {
                data.published_at = new Date().toISOString();
            }
        }

        const { data: updated, error } = await blogRepository.update(id, data);
        if (error) throw error;

        if (updated.status === BlogPostStatus.PUBLISHED || current.status === BlogPostStatus.PUBLISHED) {
            await triggerDeployWebhook();
        }

        return updated;
    },

    async deletePost(id: string) {
        const current = await this.getPost(id);
        const { error } = await blogRepository.delete(id);
        if (error) throw error;

        if (current.status === BlogPostStatus.PUBLISHED) {
            await triggerDeployWebhook();
        }
    },

    async getPost(id: string) {
        const { data, error } = await blogRepository.getById(id);
        if (error || !data) throw new Error("Post não encontrado");
        return data;
    },

    async getPublicPost(slug: string) {
        const { data, error } = await blogRepository.getPublishedBySlug(slug);
        if (error || !data) throw new Error("Artigo não encontrado");

        return data;
    },

    async listAdminPosts(page: number, limit: number, status?: string) {
        const { data, error, count } = await blogRepository.listAll(page, limit, status);
        if (error) throw error;

        return {
            posts: data || [],
            total: count || 0,
            page,
            limit
        };
    },

    async listPublicPosts(page: number, limit: number) {
        const { data, error, count } = await blogRepository.listPublished(page, limit);
        if (error) throw error;

        return {
            posts: data || [],
            total: count || 0,
            page,
            limit
        };
    }
};
