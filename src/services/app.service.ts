import { appRepository, AppUpdateRecord } from "../repositories/app.repository.js";
import { AppError } from "../errors/AppError.js";
import { ConfigKey } from "../types/enums.js";

function compareSemver(v1: string, v2: string): number {
  if (v1 === v2) return 0;
  const cleanV1 = (v1 || "").replace(/^v/i, "").trim();
  const cleanV2 = (v2 || "").replace(/^v/i, "").trim();

  if (cleanV1 === cleanV2) return 0;
  if (cleanV2 === "builtin" || !cleanV2) return 1;
  if (cleanV1 === "builtin" || !cleanV1) return -1;

  const p1 = cleanV1.split(".").map((n) => parseInt(n, 10) || 0);
  const p2 = cleanV2.split(".").map((n) => parseInt(n, 10) || 0);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export interface NativeAppUpdateInfo {
  min_version: string;
  latest_version: string;
  title: string;
  message: string;
  is_mandatory: boolean;
  has_update: boolean;
  store_url: string;
}

export interface AppCheckUpdatesResponse extends Partial<AppUpdateRecord> {
  native?: NativeAppUpdateInfo | null;
}

export async function checkAppUpdates(
  platform: string,
  currentVersion?: string,
  nativeVersion?: string
): Promise<AppCheckUpdatesResponse | null> {
  const [rawUpdates, internalConfigs] = await Promise.all([
    appRepository.getUpdatesForPlatform(platform),
    appRepository.getInternalConfigs([
      ConfigKey.APP_ANDROID_MIN_VERSION,
      ConfigKey.APP_ANDROID_LATEST_VERSION,
      ConfigKey.APP_ANDROID_UPDATE_TITLE,
      ConfigKey.APP_ANDROID_UPDATE_MESSAGE
    ])
  ]);

  let nativeInfo: NativeAppUpdateInfo | null = null;

  if (platform === "android") {
    const minVersion = internalConfigs[ConfigKey.APP_ANDROID_MIN_VERSION] || "1.0.0";
    const latestVersion = internalConfigs[ConfigKey.APP_ANDROID_LATEST_VERSION] || "1.0.5";
    const title = internalConfigs[ConfigKey.APP_ANDROID_UPDATE_TITLE] || "Atualização Disponível";
    const message =
      internalConfigs[ConfigKey.APP_ANDROID_UPDATE_MESSAGE] ||
      "Uma nova versão do Van360 está disponível na Google Play com melhorias e novos recursos. Atualize para continuar aproveitando a melhor experiência.";
    const storeUrl = "market://details?id=com.tibis.van360";

    const isMandatory = nativeVersion ? compareSemver(nativeVersion, minVersion) < 0 : false;
    const hasUpdate = nativeVersion ? compareSemver(nativeVersion, latestVersion) < 0 : false;

    nativeInfo = {
      min_version: minVersion,
      latest_version: latestVersion,
      title,
      message,
      is_mandatory: isMandatory,
      has_update: hasUpdate,
      store_url: storeUrl
    };
  }

  if (!rawUpdates || rawUpdates.length === 0) {
    if (nativeInfo) {
      return { native: nativeInfo };
    }
    return null;
  }

  const updates = [...rawUpdates].sort((a, b) => compareSemver(b.latest_version, a.latest_version));
  const latestUpdate = updates[0];

  if (!currentVersion) {
    return {
      ...latestUpdate,
      native: nativeInfo
    };
  }

  let effectiveForceUpdate = latestUpdate.force_update;

  if (!effectiveForceUpdate) {
    const missedUpdates = updates.filter((u) => {
      const isNewerThanCurrent = compareSemver(u.latest_version, currentVersion) > 0;
      const isOlderOrEqualLatest = compareSemver(u.latest_version, latestUpdate.latest_version) <= 0;
      return isNewerThanCurrent && isOlderOrEqualLatest;
    });

    effectiveForceUpdate = missedUpdates.some((u) => u.force_update);
  }

  return {
    ...latestUpdate,
    force_update: effectiveForceUpdate,
    native: nativeInfo
  };
}

export const checkAppVersion = checkAppUpdates;
