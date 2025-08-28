const admin = require('../firebaseAdmin');
const { google } = require('googleapis');
const { shareCalendarWithMasterAdmins } = require('./booking-helpers');

const firestore = admin.firestore();

// Cache for calendar IDs by branch to avoid repeated setup
let cachedCalendarIds = new Map();

// Calendar management functions for branches
async function createBranchCalendar(branchName, branchId) {
    try {
        console.log(`Creating calendar for branch: ${branchName} (ID: ${branchId})`);
        
        // Initialize Google Calendar API with JWT authentication
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
        
        // Sanitize branch name for calendar usage
        const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Default Branch';
        const expectedCalendarName = `${sanitizedBranchName} - Bookings Calendar`;
        
        // Check if calendar already exists
        const calendarList = await calendar.calendarList.list();
        const existingCalendar = calendarList.data.items?.find(cal => 
            cal.summary === expectedCalendarName || 
            (cal.summary.includes(sanitizedBranchName) && cal.summary.includes('Booking'))
        );
        
        let calendarId;
        let isNewCalendar = false;
        
        if (existingCalendar) {
            calendarId = existingCalendar.id;
            console.log(`Using existing calendar for ${sanitizedBranchName}: ${calendarId}`);
        } else {
            // Create new calendar
            const newCalendar = await calendar.calendars.insert({
                requestBody: {
                    summary: expectedCalendarName,
                    description: `Calendar for managing booking appointments at ${sanitizedBranchName}`,
                    timeZone: 'Asia/Manila',
                    location: `Branch: ${sanitizedBranchName}`,
                    selected: true
                }
            });
            calendarId = newCalendar.data.id;
            isNewCalendar = true;
            console.log(`Created new calendar for ${sanitizedBranchName}: ${calendarId}`);
        }
        
        // Share calendar with master_admin users
        const sharingResult = await shareCalendarWithMasterAdmins(calendar, calendarId, sanitizedBranchName);
        
        // Update cache
        cachedCalendarIds.set(sanitizedBranchName, calendarId);
        
        // Store calendar information in Firestore for tracking
        await storeCalendarInfo(branchId, branchName, calendarId, expectedCalendarName, isNewCalendar);
        
        return {
            success: true,
            calendarId,
            calendarName: expectedCalendarName,
            isNewCalendar,
            sharingResult,
            message: isNewCalendar ? 
                `Calendar created successfully for ${sanitizedBranchName}` : 
                `Calendar already exists for ${sanitizedBranchName}`
        };
        
    } catch (error) {
        console.error(`Error creating calendar for branch ${branchName}:`, error);
        return {
            success: false,
            error: error.message,
            message: `Failed to create calendar for ${branchName}`
        };
    }
}

// Update branch calendar function
async function updateBranchCalendar(branchId, oldBranchName, newBranchName) {
    try {
        console.log(`Updating calendar for branch: ${oldBranchName} -> ${newBranchName} (ID: ${branchId})`);
        
        // Initialize Google Calendar API with JWT authentication
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
        
        // Sanitize names
        const oldSanitizedName = oldBranchName.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
        const newSanitizedName = newBranchName.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
        
        // Get existing calendar info from Firestore
        const calendarInfo = await getCalendarInfo(branchId);
        
        if (!calendarInfo || !calendarInfo.calendarId) {
            console.log(`No existing calendar found for branch ${oldBranchName}, creating new one`);
            return await createBranchCalendar(newBranchName, branchId);
        }
        
        const oldCalendarName = `${oldSanitizedName} - Bookings Calendar`;
        const newCalendarName = `${newSanitizedName} - Bookings Calendar`;
        
        // Update calendar name if it changed
        if (oldCalendarName !== newCalendarName) {
            try {
                await calendar.calendars.update({
                    calendarId: calendarInfo.calendarId,
                    requestBody: {
                        summary: newCalendarName,
                        description: `Calendar for managing booking appointments at ${newSanitizedName}`,
                        location: `Branch: ${newSanitizedName}`
                    }
                });
                console.log(`Updated calendar name from "${oldCalendarName}" to "${newCalendarName}"`);
            } catch (updateError) {
                console.error(`Failed to update calendar name:`, updateError.message);
                // Continue with other updates even if name update fails
            }
        }
        
        // Update calendar information in Firestore
        await updateCalendarInfo(branchId, newBranchName, calendarInfo.calendarId, newCalendarName);
        
        // Update cache
        cachedCalendarIds.delete(oldSanitizedName);
        cachedCalendarIds.set(newSanitizedName, calendarInfo.calendarId);
        
        return {
            success: true,
            calendarId: calendarInfo.calendarId,
            calendarName: newCalendarName,
            isNewCalendar: false,
            message: `Calendar updated successfully for ${newSanitizedName}`
        };
        
    } catch (error) {
        console.error(`Error updating calendar for branch ${oldBranchName}:`, error);
        return {
            success: false,
            error: error.message,
            message: `Failed to update calendar for ${newBranchName}`
        };
    }
}

// Delete branch calendar function
async function deleteBranchCalendar(branchId, branchName) {
    try {
        console.log(`Deleting calendar for branch: ${branchName} (ID: ${branchId})`);
        
        // Get calendar info
        const calendarInfo = await getCalendarInfo(branchId);
        if (!calendarInfo || !calendarInfo.calendarId) {
            console.log(`No calendar found for branch ${branchName}`);
            return { success: true, message: `No calendar found for ${branchName}` };
        }
        
        // Initialize Google Calendar API with JWT authentication
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
        
        // Delete the calendar
        await calendar.calendars.delete({
            calendarId: calendarInfo.calendarId
        });
        
        // Remove from cache
        const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
        cachedCalendarIds.delete(sanitizedBranchName);
        
        // Remove from Firestore
        await firestore.collection('branch_calendars').doc(branchId).delete();
        
        console.log(`Successfully deleted calendar for branch ${branchName}`);
        return {
            success: true,
            message: `Calendar deleted successfully for ${branchName}`
        };
        
    } catch (error) {
        console.error(`Error deleting calendar for branch ${branchName}:`, error);
        return {
            success: false,
            error: error.message,
            message: `Failed to delete calendar for ${branchName}`
        };
    }
}

// Helper functions
async function storeCalendarInfo(branchId, branchName, calendarId, calendarName, isNewCalendar) {
    try {
        const calendarData = {
            branch_id: branchId,
            branch_name: branchName,
            calendar_id: calendarId,
            calendar_name: calendarName,
            is_new_calendar: isNewCalendar,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'active'
        };
        
        await firestore.collection('branch_calendars').doc(branchId).set(calendarData);
        console.log(`Stored calendar info for branch ${branchName}`);
        
    } catch (error) {
        console.error(`Error storing calendar info for branch ${branchName}:`, error);
    }
}

async function getCalendarInfo(branchId) {
    try {
        const doc = await firestore.collection('branch_calendars').doc(branchId).get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        console.error(`Error getting calendar info for branch ${branchId}:`, error);
        return null;
    }
}

async function updateCalendarInfo(branchId, branchName, calendarId, calendarName) {
    try {
        const updateData = {
            branch_name: branchName,
            updated_at: new Date().toISOString()
        };
        
        await firestore.collection('branch_calendars').doc(branchId).update(updateData);
        console.log(`Updated calendar info for branch ${branchName}`);
        
    } catch (error) {
        console.error(`Error updating calendar info for branch ${branchName}:`, error);
    }
}

module.exports = {
    createBranchCalendar,
    updateBranchCalendar,
    deleteBranchCalendar,
    getCalendarInfo,
    storeCalendarInfo,
    updateCalendarInfo
};
