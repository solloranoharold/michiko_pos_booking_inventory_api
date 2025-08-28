require("dotenv").config();
const { calendarRateLimiter } = require('./calendar-rate-limiter');
const { calendarCache } = require('./calendar-cache');

class CalendarMonitor {
    constructor() {
        this.startTime = Date.now();
        this.apiCalls = [];
        this.errors = [];
        this.quotaWarnings = [];
    }
    
    // Log API call
    logApiCall(endpoint, method, duration, success, error = null) {
        const call = {
            timestamp: new Date(),
            endpoint,
            method,
            duration,
            success,
            error: error?.message || null,
            statusCode: error?.response?.status || null
        };
        
        this.apiCalls.push(call);
        
        // Keep only last 1000 calls
        if (this.apiCalls.length > 1000) {
            this.apiCalls.shift();
        }
        
        // Log quota warnings
        if (error && (error.message.includes('quota') || error.message.includes('limit'))) {
            this.quotaWarnings.push({
                timestamp: new Date(),
                endpoint,
                error: error.message,
                statusCode: error.response?.status
            });
        }
        
        // Log errors
        if (!success) {
            this.errors.push(call);
        }
    }
    
    // Get API call statistics
    getApiStats() {
        const now = Date.now();
        const lastHour = now - (60 * 60 * 1000);
        const last24Hours = now - (24 * 60 * 60 * 1000);
        
        const callsLastHour = this.apiCalls.filter(call => call.timestamp.getTime() > lastHour);
        const callsLast24Hours = this.apiCalls.filter(call => call.timestamp.getTime() > last24Hours);
        
        const successfulCalls = this.apiCalls.filter(call => call.success);
        const failedCalls = this.apiCalls.filter(call => !call.success);
        
        const avgDuration = this.apiCalls.length > 0 
            ? this.apiCalls.reduce((sum, call) => sum + call.duration, 0) / this.apiCalls.length 
            : 0;
        
        return {
            total: this.apiCalls.length,
            lastHour: callsLastHour.length,
            last24Hours: callsLast24Hours.length,
            successful: successfulCalls.length,
            failed: failedCalls.length,
            successRate: this.apiCalls.length > 0 
                ? ((successfulCalls.length / this.apiCalls.length) * 100).toFixed(2) + '%'
                : '0%',
            averageDuration: avgDuration.toFixed(2) + 'ms',
            uptime: this.formatUptime(now - this.startTime)
        };
    }
    
    // Get error statistics
    getErrorStats() {
        const errorTypes = {};
        const statusCodes = {};
        
        this.errors.forEach(error => {
            const errorType = error.error || 'Unknown';
            errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
            
            if (error.statusCode) {
                statusCodes[error.statusCode] = (statusCodes[error.statusCode] || 0) + 1;
            }
        });
        
        return {
            totalErrors: this.errors.length,
            errorTypes,
            statusCodes,
            recentErrors: this.errors.slice(-10).reverse() // Last 10 errors
        };
    }
    
    // Get quota warnings
    getQuotaWarnings() {
        return {
            total: this.quotaWarnings.length,
            recent: this.quotaWarnings.slice(-20).reverse(), // Last 20 warnings
            byEndpoint: this.quotaWarnings.reduce((acc, warning) => {
                acc[warning.endpoint] = (acc[warning.endpoint] || 0) + 1;
                return acc;
            }, {})
        };
    }
    
    // Get comprehensive status
    getStatus() {
        return {
            timestamp: new Date(),
            api: this.getApiStats(),
            errors: this.getErrorStats(),
            quota: this.getQuotaWarnings(),
            rateLimiter: calendarRateLimiter.getStatus(),
            cache: calendarCache.getStats()
        };
    }
    
    // Format uptime
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
    
    // Generate health report
    generateHealthReport() {
        const status = this.getStatus();
        const report = [];
        
        report.push('🏥 CALENDAR API HEALTH REPORT');
        report.push('='.repeat(50));
        report.push(`📅 Generated: ${status.timestamp.toISOString()}`);
        report.push(`⏱️  Uptime: ${status.api.uptime}`);
        report.push('');
        
        // API Statistics
        report.push('📊 API STATISTICS');
        report.push(`   Total Calls: ${status.api.total}`);
        report.push(`   Last Hour: ${status.api.lastHour}`);
        report.push(`   Last 24h: ${status.api.last24Hours}`);
        report.push(`   Success Rate: ${status.api.successRate}`);
        report.push(`   Avg Duration: ${status.api.averageDuration}`);
        report.push('');
        
        // Rate Limiter Status
        report.push('🚦 RATE LIMITER STATUS');
        report.push(`   Current Delay: ${status.rateLimiter.currentDelay}ms`);
        report.push(`   Consecutive Failures: ${status.rateLimiter.consecutiveFailures}`);
        report.push(`   Requests This Second: ${status.rateLimiter.requestsThisSecond}`);
        report.push(`   Requests This 100s: ${status.rateLimiter.requestsThis100Seconds}`);
        report.push('');
        
        // Cache Status
        report.push('💾 CACHE STATUS');
        report.push(`   Hit Rate: ${status.cache.hitRate}`);
        report.push(`   Current Size: ${status.cache.currentSize}/${status.cache.maxSize}`);
        report.push(`   Hits: ${status.cache.hits}, Misses: ${status.cache.misses}`);
        report.push('');
        
        // Error Summary
        if (status.errors.totalErrors > 0) {
            report.push('⚠️  ERROR SUMMARY');
            report.push(`   Total Errors: ${status.errors.totalErrors}`);
            
            const topErrorTypes = Object.entries(status.errors.errorTypes)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3);
            
            topErrorTypes.forEach(([type, count]) => {
                report.push(`   ${type}: ${count}`);
            });
            report.push('');
        }
        
        // Quota Warnings
        if (status.quota.total > 0) {
            report.push('🚨 QUOTA WARNINGS');
            report.push(`   Total Warnings: ${status.quota.total}`);
            
            const topEndpoints = Object.entries(status.quota.byEndpoint)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3);
            
            topEndpoints.forEach(([endpoint, count]) => {
                report.push(`   ${endpoint}: ${count} warnings`);
            });
            report.push('');
        }
        
        // Health Status
        const isHealthy = status.api.successRate >= '95%' && 
                         status.errors.totalErrors < 10 && 
                         status.quota.total < 5;
        
        report.push('🏥 OVERALL HEALTH STATUS');
        report.push(`   Status: ${isHealthy ? '✅ HEALTHY' : '❌ NEEDS ATTENTION'}`);
        
        if (!isHealthy) {
            report.push('   Issues detected:');
            if (status.api.successRate < '95%') report.push('   - Low API success rate');
            if (status.errors.totalErrors >= 10) report.push('   - High error count');
            if (status.quota.total >= 5) report.push('   - Multiple quota warnings');
        }
        
        return report.join('\n');
    }
    
    // Print health report to console
    printHealthReport() {
        console.log(this.generateHealthReport());
    }
    
    // Export data for external monitoring
    exportData() {
        return {
            status: this.getStatus(),
            rawData: {
                apiCalls: this.apiCalls,
                errors: this.errors,
                quotaWarnings: this.quotaWarnings
            }
        };
    }
}

// Create a singleton instance
const calendarMonitor = new CalendarMonitor();

// Export the monitor and a function to log API calls
module.exports = { 
    CalendarMonitor, 
    calendarMonitor,
    logApiCall: (endpoint, method, duration, success, error) => 
        calendarMonitor.logApiCall(endpoint, method, duration, success, error)
}; 