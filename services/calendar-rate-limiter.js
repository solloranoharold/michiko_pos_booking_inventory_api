require("dotenv").config();
const { google } = require('googleapis');

class CalendarRateLimiter {
    constructor() {
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.minDelay = 100; // Minimum 100ms between requests
        this.maxDelay = 5000; // Maximum 5 seconds between requests
        this.currentDelay = this.minDelay;
        this.consecutiveFailures = 0;
        this.maxConsecutiveFailures = 3;
        
        // Quota limits (adjust based on your Google Cloud plan)
        this.dailyQuota = 1000000; // Default free tier
        this.queriesPerSecond = 100; // Default free tier
        this.queriesPer100Seconds = 10000; // Default free tier
        
        // Request tracking
        this.requestsThisSecond = 0;
        this.requestsThis100Seconds = 0;
        this.lastSecondReset = Date.now();
        this.last100SecondsReset = Date.now();
    }
    
    async waitForNextRequest() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.currentDelay) {
            const waitTime = this.currentDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }
    
    async makeRequest(requestFunction, retryCount = 0) {
        try {
            // Wait for rate limiting
            await this.waitForNextRequest();
            
            // Check quota limits
            if (this.requestsThisSecond >= this.queriesPerSecond) {
                const waitTime = 1000 - (Date.now() - this.lastSecondReset);
                if (waitTime > 0) {
                    console.log(`⏳ Second quota limit reached, waiting ${waitTime}ms`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    this.requestsThisSecond = 0;
                    this.lastSecondReset = Date.now();
                }
            }
            
            if (this.requestsThis100Seconds >= this.queriesPer100Seconds) {
                const waitTime = 100000 - (Date.now() - this.last100SecondsReset);
                if (waitTime > 0) {
                    console.log(`⏳ 100-second quota limit reached, waiting ${waitTime}ms`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    this.requestsThis100Seconds = 0;
                    this.last100SecondsReset = Date.now();
                }
            }
            
            // Make the request
            const result = await requestFunction();
            
            // Update counters
            this.requestCount++;
            this.requestsThisSecond++;
            this.requestsThis100Seconds++;
            this.consecutiveFailures = 0;
            
            // Reduce delay on success
            this.currentDelay = Math.max(this.minDelay, this.currentDelay * 0.9);
            
            console.log(`✅ Calendar API request successful (${this.requestCount} total, delay: ${this.currentDelay.toFixed(0)}ms)`);
            return result;
            
        } catch (error) {
            this.consecutiveFailures++;
            
            if (error.response?.status === 429 || error.message.includes('quota') || error.message.includes('limit')) {
                console.log(`🚨 Quota/rate limit error: ${error.message}`);
                
                // Implement exponential backoff
                const backoffDelay = Math.min(this.maxDelay, this.currentDelay * Math.pow(2, retryCount));
                console.log(`⏳ Backing off for ${backoffDelay}ms (attempt ${retryCount + 1})`);
                
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                this.currentDelay = backoffDelay;
                
                // Retry with exponential backoff
                if (retryCount < this.maxConsecutiveFailures) {
                    return this.makeRequest(requestFunction, retryCount + 1);
                }
            }
            
            // Increase delay on failure
            this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.5);
            
            throw error;
        }
    }
    
    // Calendar-specific rate-limited methods
    async listCalendars(calendar, maxResults = 10) {
        return this.makeRequest(() => 
            calendar.calendarList.list({ maxResults })
        );
    }
    
    async createCalendar(calendar, calendarData) {
        return this.makeRequest(() => 
            calendar.calendars.insert({ requestBody: calendarData })
        );
    }
    
    async createEvent(calendar, calendarId, eventData) {
        return this.makeRequest(() => 
            calendar.events.insert({ calendarId, requestBody: eventData })
        );
    }
    
    async updateEvent(calendar, calendarId, eventId, eventData) {
        return this.makeRequest(() => 
            calendar.events.update({ calendarId, eventId, requestBody: eventData })
        );
    }
    
    async deleteEvent(calendar, calendarId, eventId) {
        return this.makeRequest(() => 
            calendar.events.delete({ calendarId, eventId })
        );
    }
    
    async shareCalendar(calendar, calendarId, aclData) {
        return this.makeRequest(() => 
            calendar.acl.insert({ calendarId, requestBody: aclData })
        );
    }
    
    // Get current status
    getStatus() {
        return {
            requestCount: this.requestCount,
            currentDelay: this.currentDelay,
            consecutiveFailures: this.consecutiveFailures,
            requestsThisSecond: this.requestsThisSecond,
            requestsThis100Seconds: this.requestsThis100Seconds,
            lastRequestTime: this.lastRequestTime
        };
    }
    
    // Reset counters (useful for testing)
    reset() {
        this.requestCount = 0;
        this.consecutiveFailures = 0;
        this.requestsThisSecond = 0;
        this.requestsThis100Seconds = 0;
        this.currentDelay = this.minDelay;
        this.lastRequestTime = 0;
        this.lastSecondReset = Date.now();
        this.last100SecondsReset = Date.now();
    }
}

// Create a singleton instance
const calendarRateLimiter = new CalendarRateLimiter();

module.exports = { CalendarRateLimiter, calendarRateLimiter }; 