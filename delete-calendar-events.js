const admin = require('./firebaseAdmin.js');
const { google } = require('googleapis');
const moment = require('moment-timezone');

// Initialize Firestore
const firestore = admin.firestore();

// Helper function to get or create a calendar for bookings by branch
async function getBookingCalendarId(calendar, branchName = 'Default Branch') {
    const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Default Branch';
    
    try {
        // First, try to find an existing calendar for this branch
        const calendarList = await calendar.calendarList.list();
        const expectedCalendarName = `${sanitizedBranchName} - Bookings Calendar`;
        const branchCalendar = calendarList.data.items?.find(cal => 
            cal.summary === expectedCalendarName || 
            cal.summary.includes(`${sanitizedBranchName}`) && cal.summary.includes('Booking')
        );
        
        if (branchCalendar) {
            console.log(`Found existing calendar for ${sanitizedBranchName}:`, branchCalendar.id);
            return branchCalendar.id;
        } else {
            console.log(`No calendar found for ${sanitizedBranchName}`);
            return null;
        }
    } catch (error) {
        console.error(`Error finding calendar for ${sanitizedBranchName}:`, error.message);
        return null;
    }
}

// Function to delete all events from a specific calendar
async function deleteAllEventsFromCalendar(calendar, calendarId, branchName) {
    try {
        console.log(`\n🗑️  Deleting all events from calendar: ${branchName} (${calendarId})`);
        
        // Get all events from the calendar
        const eventsResponse = await calendar.events.list({
            calendarId: calendarId,
            timeMin: moment.tz('2020-01-01', 'Asia/Manila').format(),
            timeMax: moment.tz('2030-12-31', 'Asia/Manila').format(),
            singleEvents: true,
            orderBy: 'startTime'
        });
        
        const events = eventsResponse.data.items || [];
        console.log(`Found ${events.length} events to delete`);
        
        if (events.length === 0) {
            console.log(`✅ No events found in ${branchName} calendar`);
            return { deleted: 0, errors: 0, total: 0 };
        }
        
        let deletedCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Delete events in batches to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(events.length/batchSize)} (${batch.length} events)`);
            
            const batchPromises = batch.map(async (event) => {
                try {
                    await calendar.events.delete({
                        calendarId: calendarId,
                        eventId: event.id
                    });
                    console.log(`  ✅ Deleted: ${event.summary || 'Untitled'} (${event.id})`);
                    return { success: true, eventId: event.id, summary: event.summary };
                } catch (deleteError) {
                    console.log(`  ❌ Failed to delete: ${event.summary || 'Untitled'} (${event.id}) - ${deleteError.message}`);
                    return { success: false, eventId: event.id, summary: event.summary, error: deleteError.message };
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            // Count results
            batchResults.forEach(result => {
                if (result.success) {
                    deletedCount++;
                } else {
                    errorCount++;
                    errors.push(result);
                }
            });
            
            // Small delay between batches to avoid rate limiting
            if (i + batchSize < events.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`\n📊 Deletion Summary for ${branchName}:`);
        console.log(`  ✅ Successfully deleted: ${deletedCount} events`);
        console.log(`  ❌ Failed to delete: ${errorCount} events`);
        console.log(`  📊 Total events processed: ${events.length}`);
        
        if (errors.length > 0) {
            console.log(`\n❌ Errors encountered:`);
            errors.forEach(error => {
                console.log(`  - ${error.summary || 'Untitled'} (${error.eventId}): ${error.error}`);
            });
        }
        
        return { deleted: deletedCount, errors: errorCount, total: events.length, errorDetails: errors };
        
    } catch (error) {
        console.error(`❌ Error deleting events from ${branchName} calendar:`, error.message);
        return { deleted: 0, errors: 1, total: 0, error: error.message };
    }
}

// Main function to delete events from all branch calendars
async function deleteAllBranchCalendarEvents() {
    try {
        console.log('🚀 Starting calendar event deletion process...\n');
        
        // Initialize Google Calendar API
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];
        
        const oauth2Client = new google.auth.JWT({
            email: process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
            key: (process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
            scopes,
            subject: process.env.GOOGLE_WORKSPACE_EMAIL 
        });
        
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        // Get all branches from database
        console.log('📋 Fetching branches from database...');
        const branchesSnapshot = await firestore.collection('branches').get();
        const branches = [];
        
        branchesSnapshot.forEach(doc => {
            const branchData = doc.data();
            if (branchData.name) {
                branches.push({
                    id: doc.id,
                    name: branchData.name
                });
            }
        });
        
        if (branches.length === 0) {
            console.log('❌ No branches found in database');
            return;
        }
        
        console.log(`Found ${branches.length} branches to process:\n`);
        branches.forEach((branch, index) => {
            console.log(`  ${index + 1}. ${branch.name} (ID: ${branch.id})`);
        });
        
        // Process each branch
        const results = [];
        let totalEventsDeleted = 0;
        let totalErrors = 0;
        
        for (const branch of branches) {
            try {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`Processing Branch: ${branch.name}`);
                console.log(`${'='.repeat(60)}`);
                
                // Get calendar ID for this branch
                const calendarId = await getBookingCalendarId(calendar, branch.name);
                
                if (!calendarId) {
                    console.log(`⚠️  No calendar found for ${branch.name} - skipping`);
                    results.push({
                        branchId: branch.id,
                        branchName: branch.name,
                        calendarId: null,
                        status: 'no_calendar',
                        deleted: 0,
                        errors: 0
                    });
                    continue;
                }
                
                // Delete all events from this calendar
                const deletionResult = await deleteAllEventsFromCalendar(calendar, calendarId, branch.name);
                
                results.push({
                    branchId: branch.id,
                    branchName: branch.name,
                    calendarId: calendarId,
                    status: 'completed',
                    ...deletionResult
                });
                
                totalEventsDeleted += deletionResult.deleted;
                totalErrors += deletionResult.errors;
                
            } catch (branchError) {
                console.error(`❌ Error processing branch ${branch.name}:`, branchError.message);
                results.push({
                    branchId: branch.id,
                    branchName: branch.name,
                    status: 'error',
                    error: branchError.message
                });
            }
        }
        
        // Print final summary
        console.log(`\n${'='.repeat(80)}`);
        console.log('🎯 FINAL DELETION SUMMARY');
        console.log(`${'='.repeat(80)}`);
        console.log(`📊 Total Branches Processed: ${branches.length}`);
        console.log(`✅ Total Events Deleted: ${totalEventsDeleted}`);
        console.log(`❌ Total Errors: ${totalErrors}`);
        console.log(`🏢 Branches with Calendars: ${results.filter(r => r.calendarId).length}`);
        console.log(`⚠️  Branches without Calendars: ${results.filter(r => !r.calendarId).length}`);
        
        console.log(`\n📋 Detailed Results by Branch:`);
        results.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.branchName}`);
            if (result.calendarId) {
                console.log(`   📅 Calendar ID: ${result.calendarId}`);
                console.log(`   ✅ Events Deleted: ${result.deleted || 0}`);
                console.log(`   ❌ Errors: ${result.errors || 0}`);
                console.log(`   📊 Total Processed: ${result.total || 0}`);
            } else {
                console.log(`   ⚠️  No calendar found`);
            }
            if (result.status === 'error') {
                console.log(`   ❌ Error: ${result.error}`);
            }
        });
        
        console.log(`\n🎉 Calendar event deletion process completed!`);
        
    } catch (error) {
        console.error('❌ Fatal error in calendar event deletion:', error);
        process.exit(1);
    }
}

// Function to delete events from a specific calendar by ID
async function deleteEventsFromSpecificCalendar(calendarId) {
    try {
        console.log(`\n🗑️  Deleting events from specific calendar: ${calendarId}`);
        
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
        
        // Verify calendar exists
        try {
            const calendarInfo = await calendar.calendars.get({ calendarId });
            console.log(`📅 Calendar found: ${calendarInfo.data.summary}`);
        } catch (error) {
            console.log(`❌ Calendar not found or access denied: ${calendarId}`);
            return;
        }
        
        const result = await deleteAllEventsFromCalendar(calendar, calendarId, `Calendar ${calendarId}`);
        return result;
        
    } catch (error) {
        console.error(`❌ Error deleting events from calendar ${calendarId}:`, error.message);
        return { deleted: 0, errors: 1, total: 0, error: error.message };
    }
}

// Check if script is run directly
if (require.main === module) {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // No arguments - delete from all branch calendars
        console.log('🗑️  Running calendar event deletion for ALL branch calendars...');
        deleteAllBranchCalendarEvents();
    } else if (args[0] === '--calendar-id' && args[1]) {
        // Delete from specific calendar ID
        console.log(`🗑️  Running calendar event deletion for specific calendar: ${args[1]}`);
        deleteEventsFromSpecificCalendar(args[1]);
    } else if (args[0] === '--help' || args[0] === '-h') {
        console.log(`
🗑️  Calendar Event Deletion Script

Usage:
  node delete-calendar-events.js                    # Delete events from all branch calendars
  node delete-calendar-events.js --calendar-id ID   # Delete events from specific calendar ID
  node delete-calendar-events.js --help             # Show this help message

Examples:
  node delete-calendar-events.js
  node delete-calendar-events.js --calendar-id abc123@group.calendar.google.com

⚠️  WARNING: This script will permanently delete ALL events from the specified calendars!
        `);
    } else {
        console.log('❌ Invalid arguments. Use --help for usage information.');
        process.exit(1);
    }
}

module.exports = {
    deleteAllBranchCalendarEvents,
    deleteEventsFromSpecificCalendar,
    deleteAllEventsFromCalendar
}; 