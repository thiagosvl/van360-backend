import { z } from 'zod';

export const registerPushTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
  platform: z.enum(['android', 'ios', 'web', 'unknown']).default('unknown'),
});

export type RegisterPushTokenSchema = z.infer<typeof registerPushTokenSchema>;

export const revokePushTokenSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export type RevokePushTokenSchema = z.infer<typeof revokePushTokenSchema>;
