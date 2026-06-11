import { supabaseAdmin } from "../../config/supabase.js";

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
        return supabaseAdmin.auth.signInWithPassword(data);
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
        return supabaseAdmin.auth.refreshSession(data);
    }
};
