import { appRepository } from "../repositories/app.repository.js";

export async function checkAppUpdates(platform: string) {
    const { data, error } = await appRepository.getLatestUpdate(platform);

    if (error) {
         return null;
    }

    return data;
}
