import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { blogService } from "../services/blog.service.js";
import {
    createBlogPostSchema,
    updateBlogPostSchema,
    listBlogPostsQuerySchema
} from "../schemas/blog.schema.js";

export const adminBlogController = {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
        logger.info("AdminBlogController.list - Starting");
        const query = listBlogPostsQuerySchema.parse(request.query);
        const result = await blogService.listAdminPosts(query.page, query.limit, query.status);
        return reply.status(200).send(result);
    },

    get: async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        logger.info({ postId: id }, "AdminBlogController.get - Starting");
        const post = await blogService.getPost(id);
        return reply.status(200).send(post);
    },

    create: async (request: FastifyRequest, reply: FastifyReply) => {
        logger.info("AdminBlogController.create - Starting");
        const user = (request as any).user;
        const data = createBlogPostSchema.parse(request.body);
        const post = await blogService.createPost(user.sub, data);
        return reply.status(201).send(post);
    },

    update: async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        logger.info({ postId: id }, "AdminBlogController.update - Starting");
        const data = updateBlogPostSchema.parse(request.body);
        const post = await blogService.updatePost(id, data);
        return reply.status(200).send(post);
    },

    delete: async (request: FastifyRequest, reply: FastifyReply) => {
        const { id } = request.params as { id: string };
        logger.info({ postId: id }, "AdminBlogController.delete - Starting");
        await blogService.deletePost(id);
        return reply.status(200).send({ success: true });
    },

    uploadCover: async (request: FastifyRequest, reply: FastifyReply) => {
        logger.info("AdminBlogController.uploadCover - Starting");
        const { file, filename } = request.body as { file: string; filename: string };
        if (!file || !filename) {
            return reply.status(400).send({ error: "file and filename are required" });
        }
        const result = await blogService.uploadCoverImage(file, filename);
        return reply.status(200).send(result);
    }
};

export const publicBlogController = {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
        logger.info("PublicBlogController.list - Starting");
        const query = listBlogPostsQuerySchema.parse(request.query);
        const result = await blogService.listPublicPosts(query.page, query.limit);
        return reply.status(200).send(result);
    },

    get: async (request: FastifyRequest, reply: FastifyReply) => {
        const { slug } = request.params as { slug: string };
        logger.info({ postSlug: slug }, "PublicBlogController.get - Starting");
        const post = await blogService.getPublicPost(slug);
        return reply.status(200).send(post);
    }
};
