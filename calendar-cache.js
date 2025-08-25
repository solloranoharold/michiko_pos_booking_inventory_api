require("dotenv").config();

class CalendarCache {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
        this.maxCacheSize = 1000; // Maximum number of cached items
        
        // Cache statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }
    
    // Generate cache key
    generateKey(prefix, ...params) {
        return `${prefix}:${params.join(':')}`;
    }
    
    // Set cache item
    set(key, value, ttl = this.defaultTTL) {
        // Check cache size limit
        if (this.cache.size >= this.maxCacheSize) {
            this.evictOldest();
        }
        
        this.cache.set(key, value);
        this.cacheExpiry.set(key, Date.now() + ttl);
        this.stats.sets++;
        
        console.log(`💾 Cached: ${key} (TTL: ${ttl}ms)`);
    }
    
    // Get cache item
    get(key) {
        const value = this.cache.get(key);
        const expiry = this.cacheExpiry.get(key);
        
        if (value && expiry && Date.now() < expiry) {
            this.stats.hits++;
            console.log(`✅ Cache hit: ${key}`);
            return value;
        }
        
        // Remove expired item
        if (expiry && Date.now() >= expiry) {
            this.delete(key);
        }
        
        this.stats.misses++;
        console.log(`❌ Cache miss: ${key}`);
        return null;
    }
    
    // Delete cache item
    delete(key) {
        const deleted = this.cache.delete(key);
        this.cacheExpiry.delete(key);
        if (deleted) {
            this.stats.deletes++;
            console.log(`🗑️  Cache deleted: ${key}`);
        }
        return deleted;
    }
    
    // Clear all cache
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.cacheExpiry.clear();
        console.log(`🧹 Cache cleared: ${size} items removed`);
    }
    
    // Evict oldest items when cache is full
    evictOldest() {
        const entries = Array.from(this.cacheExpiry.entries());
        entries.sort((a, b) => a[1] - b[1]); // Sort by expiry time
        
        const toDelete = Math.ceil(this.maxCacheSize * 0.1); // Delete 10% of oldest items
        for (let i = 0; i < toDelete && i < entries.length; i++) {
            this.delete(entries[i][0]);
        }
        
        console.log(`🗑️  Evicted ${toDelete} oldest cache items`);
    }
    
    // Get cache statistics
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;
        
        return {
            ...this.stats,
            total,
            hitRate: `${hitRate}%`,
            currentSize: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }
    
    // Calendar-specific cache methods
    cacheCalendarList(branchName, calendarList, ttl = 10 * 60 * 1000) {
        const key = this.generateKey('calendarList', branchName);
        this.set(key, calendarList, ttl);
    }
    
    getCachedCalendarList(branchName) {
        const key = this.generateKey('calendarList', branchName);
        return this.get(key);
    }
    
    cacheCalendarEvents(calendarId, date, events, ttl = 2 * 60 * 1000) {
        const key = this.generateKey('calendarEvents', calendarId, date);
        this.set(key, events, ttl);
    }
    
    getCachedCalendarEvents(calendarId, date) {
        const key = this.generateKey('calendarEvents', calendarId, date);
        return this.get(key);
    }
    
    cacheBranchCalendar(branchId, calendarData, ttl = 30 * 60 * 1000) {
        const key = this.generateKey('branchCalendar', branchId);
        this.set(key, calendarData, ttl);
    }
    
    getCachedBranchCalendar(branchId) {
        const key = this.generateKey('branchCalendar', branchId);
        return this.get(key);
    }
    
    // Invalidate cache when calendar data changes
    invalidateCalendarCache(calendarId) {
        const keysToDelete = [];
        
        for (const key of this.cache.keys()) {
            if (key.includes(calendarId)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.delete(key));
        console.log(`🔄 Invalidated ${keysToDelete.length} cache entries for calendar ${calendarId}`);
    }
    
    // Invalidate branch-related cache
    invalidateBranchCache(branchId) {
        const keysToDelete = [];
        
        for (const key of this.cache.keys()) {
            if (key.includes(branchId)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.delete(key));
        console.log(`🔄 Invalidated ${keysToDelete.length} cache entries for branch ${branchId}`);
    }
    
    // Health check
    healthCheck() {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [key, expiry] of this.cacheExpiry.entries()) {
            if (now >= expiry) {
                expiredCount++;
            }
        }
        
        return {
            totalItems: this.cache.size,
            expiredItems: expiredCount,
            validItems: this.cache.size - expiredCount,
            memoryUsage: process.memoryUsage(),
            stats: this.getStats()
        };
    }
}

// Create a singleton instance
const calendarCache = new CalendarCache();

module.exports = { CalendarCache, calendarCache }; 