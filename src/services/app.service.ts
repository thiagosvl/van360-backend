import { appRepository, AppUpdateRecord } from "../repositories/app.repository.js";
import { AppError } from "../errors/AppError.js";

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

export async function checkAppUpdates(platform: string, currentVersion?: string): Promise<AppUpdateRecord | null> {
  const rawUpdates = await appRepository.getUpdatesForPlatform(platform);

  if (!rawUpdates || rawUpdates.length === 0) {
    return null;
  }

  const updates = [...rawUpdates].sort((a, b) => compareSemver(b.latest_version, a.latest_version));
  const latestUpdate = updates[0];

  if (!currentVersion) {
    return latestUpdate;
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
  };
}

export const checkAppVersion = checkAppUpdates;
