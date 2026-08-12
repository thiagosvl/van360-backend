export interface FirebaseMessagePayload {
    title: string;
    body: string;
    data?: Record<string, string>;
}

export * from "./templates/driver.template.js";
export * from "./templates/passenger.template.js";
