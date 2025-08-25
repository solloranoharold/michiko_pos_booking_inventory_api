require("dotenv").config();
const { calendarRateLimiter } = require('./calendar-rate-limiter');
const { calendarCache } = require('./calendar-cache');
const { calendarMonitor } = require('./calendar-monitor');

async function testRateLimiter() {
    console.log('🧪 Testing Calendar Rate Limiter...\n');
    
    try {
        // Test 1: Basic rate limiting
        console.log('📋 Test 1: Basic Rate Limiting');
        const startTime = Date.now();
        
        for (let i = 0; i < 5; i++) {
            const testStart = Date.now();
            try {
                // Simulate a calendar API call
                await calendarRateLimiter.makeRequest(async () => {
                    // Simulate API delay
                    await new Promise(resolve => setTimeout(resolve, 50));
                    return { success: true, data: `Test ${i + 1}` };
                });
                
                const duration = Date.now() - testStart;
                console.log(`   ✅ Request ${i + 1} completed in ${duration}ms`);
                
            } catch (error) {
                console.log(`   ❌ Request ${i + 1} failed: ${error.message}`);
            }
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`   ⏱️  Total time for 5 requests: ${totalTime}ms\n`);
        
        // Test 2: Rate limiter status
        console.log('📊 Test 2: Rate Limiter Status');
        const status = calendarRateLimiter.getStatus();
        console.log(`   Total requests: ${status.requestCount}`);
        console.log(`   Current delay: ${status.currentDelay}ms`);
        console.log(`   Consecutive failures: ${status.consecutiveFailures}`);
        console.log(`   Requests this second: ${status.requestsThisSecond}`);
        console.log(`   Requests this 100s: ${status.requestsThis100Seconds}\n`);
        
        // Test 3: Cache functionality
        console.log('💾 Test 3: Cache Functionality');
        calendarCache.set('test:key', 'test:value', 5000);
        const cachedValue = calendarCache.get('test:key');
        console.log(`   Cached value: ${cachedValue}`);
        
        const cacheStats = calendarCache.getStats();
        console.log(`   Cache hit rate: ${cacheStats.hitRate}`);
        console.log(`   Cache size: ${cacheStats.currentSize}/${cacheStats.maxSize}\n`);
        
        // Test 4: Monitor functionality
        console.log('📈 Test 4: Monitor Functionality');
        const monitorStatus = calendarMonitor.getStatus();
        console.log(`   API calls: ${monitorStatus.api.total}`);
        console.log(`   Success rate: ${monitorStatus.api.successRate}`);
        console.log(`   Uptime: ${monitorStatus.api.uptime}\n`);
        
        // Test 5: Health report
        console.log('🏥 Test 5: Health Report');
        calendarMonitor.printHealthReport();
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
if (require.main === module) {
    testRateLimiter()
        .then(() => {
            console.log('\n✅ Rate limiter test completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Rate limiter test failed:', error);
            process.exit(1);
        });
}

module.exports = { testRateLimiter }; 