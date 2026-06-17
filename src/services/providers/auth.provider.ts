import { supabaseAdmin } from "../../config/supabase.js";
import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";

export const authProvider = {
    async createUser(data: any) {
        return supabaseAdmin.auth.admin.createUser(data);
    },

    async deleteUser(userId: string) {
        return supabaseAdmin.auth.admin.deleteUser(userId);
    },

    async updateUserById(userId: string, data: any) {
        return supabaseAdmin.auth.admin.updateUserById(userId, data);
    },

    async signInWithPassword(data: any) {
        // CRÍTICO: Criar um client temporário para não poluir a sessão do supabaseAdmin global
        const tempClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        return tempClient.auth.signInWithPassword(data);
    },

    async getUser(token: string) {
        return supabaseAdmin.auth.getUser(token);
    },

    async resetPasswordForEmail(email: string, options: any) {
        return supabaseAdmin.auth.resetPasswordForEmail(email, options);
    },

    async signOut(token: string) {
        return supabaseAdmin.auth.admin.signOut(token);
    },

    async refreshSession(data: any) {
        // CRÍTICO: Criar um client temporário para não poluir a sessão do supabaseAdmin global
        const tempClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        return tempClient.auth.refreshSession(data);
    }
};
