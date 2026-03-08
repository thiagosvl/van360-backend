import { requestContext } from '@fastify/request-context';

declare module "@fastify/request-context" {
  interface RequestData {
    ip: string;
  }
}

export function getContextIp(): string | undefined {
  try {
    return (requestContext as any).get('ip');
  } catch {
    return undefined;
  }
}
