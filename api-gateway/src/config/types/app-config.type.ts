export interface AppConfigType {
  serviceName: string;
  port: number;
  allowedOrigins: string[];
  rabbitmq: {
    url: string;
    commandExchange: string;
    eventExchange: string;
    responseExchange: string;
    rpcTimeoutMs: number;
  };
  auth: {
    cookieName: string;
    cookieSecure: boolean;
    cookieSameSite: 'strict' | 'lax' | 'none';
    jwtSecret: string;
    jwtExpiresIn: string;
  };
  gateway: {
    rateLimitTtlMs: number;
    rateLimitLimit: number;
  };
  runtimeInstanceId: string;
}
