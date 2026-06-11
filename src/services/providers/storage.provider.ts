import { supabaseAdmin } from "../../config/supabase.js";

export const storageProvider = {
    async upload(bucket: string, path: string, fileBuffer: Buffer, options?: any) {
        return supabaseAdmin.storage
            .from(bucket)
            .upload(path, fileBuffer, options);
    },

    getPublicUrl(bucket: string, path: string) {
        const { data } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(path);
        return data.publicUrl;
    },

    async remove(bucket: string, paths: string[]) {
        return supabaseAdmin.storage
            .from(bucket)
            .remove(paths);
    },

    async download(bucket: string, path: string) {
        return supabaseAdmin.storage
            .from(bucket)
            .download(path);
    }
};
