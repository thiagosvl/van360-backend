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

  async getInternalConfigs(keys: string[]): Promise<Record<string, string>> {
    const { data, error } = await supabaseAdmin
      .from("configuracao_interna")
      .select("chave, valor")
      .in("chave", keys);

    if (error) {
      throw error;
    }

    const configMap: Record<string, string> = {};
    (data || []).forEach((row: { chave: string; valor: string }) => {
      configMap[row.chave] = row.valor;
    });
    return configMap;
  }
};
