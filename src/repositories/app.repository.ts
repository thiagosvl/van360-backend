import { supabaseAdmin } from "../config/supabase.js";

export interface AppUpdateRecord {
  id: string;
  platform: string;
  latest_version: string;
  force_update: boolean;
  url_zip: string;
  changelog?: string | null;
  created_at: string;
}

export const appRepository = {
  async getUpdatesForPlatform(platform: string): Promise<AppUpdateRecord[]> {
    const { data, error } = await supabaseAdmin
      .from("app_updates")
      .select("id, platform, latest_version, force_update, url_zip, changelog, created_at")
      .eq("platform", platform)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []) as AppUpdateRecord[];
  },

  async registerPushToken(usuarioId: string, pushToken: string, platform?: string) {
    return supabaseAdmin
      .from("dispositivos_usuario")
      .upsert({
        usuario_id: usuarioId,
        push_token: pushToken,
        platform: platform || "unknown",
        updated_at: new Date().toISOString()
      });
  },

  async registerDevice(usuarioId: string, deviceData: { device_id: string; platform: string; model?: string; app_version?: string }) {
    return supabaseAdmin
      .from("dispositivos_usuario")
      .upsert({
        usuario_id: usuarioId,
        device_id: deviceData.device_id,
        platform: deviceData.platform,
        model: deviceData.model,
        app_version: deviceData.app_version,
        updated_at: new Date().toISOString()
      });
  }
};
