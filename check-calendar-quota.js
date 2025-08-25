require("dotenv").config();
const { google } = require('googleapis');

async function checkCalendarQuota() {
    try {
        console.log('🔍 Checking Google Calendar API quota usage...\n');
        
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];
        
        const oauth2Client = new google.auth.JWT({
            email: process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
            key: (process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
            scopes,
        });
        
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        // Test basic API access
        console.log('📅 Testing Calendar API access...');
        const calendarList = await calendar.calendarList.list({ maxResults: 5 });
        console.log(`✅ Successfully accessed Calendar API`);
        console.log(`📊 Found ${calendarList.data.items?.length || 0} calendars\n`);
        
        // Check for rate limiting headers
        const quotaInfo = {
            quotaLimit: calendarList.headers['x-ratelimit-limit'],
            quotaRemaining: calendarList.headers['x-ratelimit-remaining'],
            quotaReset: calendarList.headers['x-ratelimit-reset'],
            quotaWindow: calendarList.headers['x-ratelimit-window']
        };
        
        console.log('📊 Quota Information:');
        Object.entries(quotaInfo).forEach(([key, value]) => {
            if (value) {
                console.log(`   ${key}: ${value}`);
            }
        });
        
        // Check if we're hitting limits
        if (quotaInfo.quotaRemaining && quotaInfo.quotaLimit) {
            const remaining = parseInt(quotaInfo.quotaRemaining);
            const limit = parseInt(quotaInfo.quotaLimit);
            const usagePercent = ((limit - remaining) / limit * 100).toFixed(1);
            
            console.log(`\n⚠️  Quota Usage: ${usagePercent}% (${remaining}/${limit} remaining)`);
            
            if (remaining < limit * 0.1) {
                console.log('🚨 WARNING: Quota nearly exhausted!');
            } else if (remaining < limit * 0.3) {
                console.log('⚠️  WARNING: Quota usage is high');
            } else {
                console.log('✅ Quota usage is normal');
            }
        }
        
        console.log('\n🔧 Recommendations:');
        console.log('1. Check Google Cloud Console for detailed quota usage');
        console.log('2. Implement rate limiting in your application');
        console.log('3. Consider upgrading to a paid Google Cloud plan');
        console.log('4. Cache calendar data to reduce API calls');
        console.log('5. Batch calendar operations when possible');
        
    } catch (error) {
        console.error('❌ Error checking calendar quota:', error.message);
        
        if (error.message.includes('quota') || error.message.includes('limit')) {
            console.log('\n🚨 QUOTA LIMIT DETECTED!');
            console.log('\n🔧 Immediate Actions:');
            console.log('1. Wait for quota reset (usually 24 hours)');
            console.log('2. Check Google Cloud Console quotas');
            console.log('3. Implement exponential backoff');
            console.log('4. Reduce API call frequency');
        }
        
        if (error.response?.status === 429) {
            console.log('\n📊 Rate Limit Details:');
            console.log(`Status: ${error.response.status}`);
            console.log(`Retry-After: ${error.response.headers['retry-after'] || 'Unknown'}`);
        }
    }
}

// Run the check
if (require.main === module) {
    checkCalendarQuota()
        .then(() => {
            console.log('\n✅ Quota check completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Quota check failed:', error);
            process.exit(1);
        });
}

module.exports = { checkCalendarQuota }; 