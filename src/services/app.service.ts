import { supabaseAdmin } from "../config/supabase.js";

export async function checkAppUpdates(platform: string) {
    const { data, error } = await supabaseAdmin
        .from("app_updates")
        .select("latest_version, url_zip, force_update")
        .eq("platform", platform)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (error) {
         return null;
    }

    return data;
}
