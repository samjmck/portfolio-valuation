import { createClient } from "npm:redis@4.6.4";
import * as superjson from "npm:superjson@1.12.2";

export interface Cache {
    get<T>(key: string): Promise<T | null>;
    put(key: string, value: unknown, expirationSeconds?: number): Promise<void>;
}

export class EmptyCache implements Cache {
    async get<T>(key: string): Promise<T | null> {
        return null;
    }

    async put(key: string, value: unknown, expirationSeconds?: number): Promise<void> {}
}

export class OverrideCache implements Cache {
    constructor(
        private overrides: Map<string, unknown>,
        private underlyingCache: Cache,
    ) {}

    async get<T>(key: string): Promise<T | null> {
        const override = this.overrides.get(key);
        if(override !== undefined) {
            return override as T;
        }
        return this.underlyingCache.get<T>(key);
    }

    async put(key: string, value: unknown, expirationSeconds?: number): Promise<void> {
        return this.underlyingCache.put(key, value, expirationSeconds);
    }
}

export class RedisCache implements Cache {
    constructor(
        private redisClient: ReturnType<typeof createClient>,
    ) {}

    async get<T>(key: string): Promise<T | null> {
        const result = await this.redisClient.get(key);
        if(result === null) {
            return null;
        }
        return superjson.parse(result);
    }

    async put(key: string, value: unknown, expirationSeconds?: number): Promise<void> {
        await this.redisClient.set(key, superjson.stringify(value));
        if(expirationSeconds !== undefined) {
            await this.redisClient.expire(key, expirationSeconds);
        }
    }
}
