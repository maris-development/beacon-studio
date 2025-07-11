
import { browser } from '$app/environment';

// Add this at the top of your file (or in a global .d.ts file if used in multiple files)
declare global {
    interface Window {
        memoryCache: Map<string, unknown>;
    }
}

export const ONE_HOUR_MS = 1000 * 60 * 60; // 1 hour in milliseconds
export const ONE_DAY_MS = 1000 * 60 * 60 * 24; // 1 day in milliseconds

class CacheItem<T> {
    input_date: Date;
    max_age: number = ONE_DAY_MS;
    data: T;

    static create<T>(data: T ) {
        const item = new CacheItem<T>();
        item.data = data;
        item.input_date = new Date();
        return item;
    }

    static createWithMaxAge<T>(data: T, maxAge: number) {
        const item = CacheItem.create(data);
        item.setMaxAge(maxAge);
        return item;
    }

    isExpired(): boolean {
        const now = new Date();
        const age = now.getTime() - this.input_date.getTime();
        return age > this.max_age;
    }

    setMaxAge(maxAge: number): void {
        this.max_age = maxAge;
    }

    expire(): void {
        this.input_date = new Date(0); // Set to epoch time to indicate expiration
    }
}

export class LocalStorageCache {

    maxAge = ONE_DAY_MS;

    get<T>(cacheKey: string): T | null {
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
            const data = JSON.parse(cachedData) as CacheItem<T>;

            if (data.isExpired()) {
                this.clear(cacheKey);
                return null;
            }

            return data.data;
        }

        return null;
    }

    set<T>(cacheKey: string, data: T): void {
        const cacheItem = CacheItem.createWithMaxAge(data, this.maxAge);
        localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    }

    clear(cacheKey: string): void {
        localStorage.removeItem(cacheKey);
    }

}

export class SessionStorageCache {
    maxAge = ONE_HOUR_MS;

    get<T>(cacheKey: string): T | null {

        const cachedData = sessionStorage.getItem(cacheKey);

        if (cachedData) {
            const data = JSON.parse(cachedData) as CacheItem<T>;

            if (data.isExpired()) {
                this.clear(cacheKey);
                return null;
            }

            return data.data;
        }

        return null;
    }

    set<T>(cacheKey: string, data: T): void {
        const cacheItem = CacheItem.createWithMaxAge(data, this.maxAge);
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    }

    clear(cacheKey: string): void {
        sessionStorage.removeItem(cacheKey);
    }
}

export class MemoryCache {

    maxAge = ONE_HOUR_MS;

    constructor() {
		if (!browser) {
            throw new Error('MemoryCache can only be used in a browser environment. Check environment using $app/environment');
        }
        if(!window.memoryCache) {
            this.initCache();
        }
        this.initCache();
    }

    private initCache<T>() {
        if(!window.memoryCache) {
            window.memoryCache = new Map<string, T>();
        }
    }

    get<T>(cacheKey: string): T | null {
        const cachedData = (window.memoryCache.get(cacheKey) || null) as CacheItem<T> | null;

        if (cachedData) {
            if (cachedData.isExpired()) {
                this.clear(cacheKey);
                return null;
            }
            return cachedData.data;
        }
        
        return null;
    }

    set<T>(cacheKey: string, data: T): void {
        const cacheItem = CacheItem.createWithMaxAge(data, this.maxAge);
        window.memoryCache.set(cacheKey, cacheItem);
    }

    clear(cacheKey: string): void {
        window.memoryCache.delete(cacheKey);
    }
}