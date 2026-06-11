import { supabaseAdmin } from "../config/supabase.js";

export const appRepository = {
    async getLatestUpdate(platform: string) {
        return supabaseAdmin
            .from("app_updates")
            .select("latest_version, url_zip, force_update")
            .eq("platform", platform)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
    }
};
