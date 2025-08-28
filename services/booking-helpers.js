// Environment variables loaded centrally in config/env.js
const admin = require('../firebaseAdmin');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const { calendarRateLimiter } = require('./calendar-rate-limiter');

const firestore = admin.firestore();

// Cache for calendar IDs by branch to avoid repeated setup
let cachedCalendarIds = new Map();

// Helper function to get or create a calendar for bookings by branch
async function getBookingCalendarId(calendar, branchName = 'Default Branch') {
    // Sanitize branch name for calendar usage
    const sanitizedBranchName = branchName.replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Default Branch';
    
    if (cachedCalendarIds.has(sanitizedBranchName)) {
        return cachedCalendarIds.get(sanitizedBranchName);
    }
    
    let calendarId = "";
    
    if (!calendarId) {
        try {
            // First, try to find an existing calendar for this branch
            const calendarList = await calendar.calendarList.list();
            const expectedCalendarName = `${sanitizedBranchName} - Bookings Calendar`;
            const branchCalendar = calendarList.data.items?.find(cal => 
                cal.summary === expectedCalendarName || 
                cal.summary.includes(`${sanitizedBranchName}`) && cal.summary.includes('Booking')
            );
            
            if (branchCalendar) {
                calendarId = branchCalendar.id;
                console.log(`Using existing calendar for ${sanitizedBranchName}:`, calendarId);
            } else {
                // Create a new calendar for this branch
                const newCalendar = await calendar.calendars.insert({
                    requestBody: {
                        summary: expectedCalendarName,
                        description: `Calendar for managing booking appointments at ${sanitizedBranchName}`,
                        timeZone: 'Asia/Manila'
                    }
                });
                calendarId = newCalendar.data.id;
                console.log(`Created new calendar for ${sanitizedBranchName}:`, calendarId);
                
                // Share the newly created calendar with master_admin users
                const sharingResult = await shareCalendarWithMasterAdmins(calendar, calendarId, sanitizedBranchName);
                if (sharingResult.shared) {
                    console.log(`Calendar shared with ${sharingResult.count} master_admin(s) for ${sanitizedBranchName}`);
                } else {
                    console.log(`Failed to share calendar with master_admin users for ${sanitizedBranchName}`);
                }
            }
        } catch (calendarSetupError) {
            console.error(`Error setting up calendar for ${sanitizedBranchName}:`, calendarSetupError.message);
            // Fallback: use a generated calendar ID based on branch and service account
            const serviceAccountId = (process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || 'default').replace(/[@.]/g, '-');
            calendarId = `bookings-${sanitizedBranchName.replace(/\s+/g, '-').toLowerCase()}-${serviceAccountId}`;
            console.log(`Using fallback calendar ID for ${sanitizedBranchName}:`, calendarId);
        }
    }
    
    cachedCalendarIds.set(sanitizedBranchName, calendarId);
    return calendarId;
}

// Helper function to get background color based on status
function getStatusBackgroundColor(status) {
    const statusColors = {
        'scheduled': '#E3F2FD',     // Light Blue
        'confirmed': '#E8F5E8',     // Light Green
        'pending': '#FFF3E0',       // Light Orange
        'cancelled': '#FFEBEE',     // Light Red
        'completed': '#F3E5F5',     // Light Purple
        'no-show': '#FAFAFA',       // Light Gray
        'rescheduled': '#E1F5FE'    // Light Cyan
    };
    return statusColors[status?.toLowerCase()] || '#F5F5F5'; // Default light gray
}

// Helper function to get calendar color ID based on status
function getCalendarColorId(status) {
    // Google Calendar Color ID mapping
    // Color IDs 1-11 are the default Google Calendar colors
    // Each color ID corresponds to a specific color in Google Calendar
    const colorMapping = {
        // Primary booking statuses
        'scheduled': '7',      // Blue - Default for new bookings
        'confirmed': '10',     // Green - Confirmed appointments
        'pending': '5',        // Yellow - Awaiting confirmation
        'cancelled': '11',     // Red - Cancelled appointments
        'completed': '9',      // Purple - Completed services
        'no-show': '8',        // Gray - Client didn't show up
        'rescheduled': '6',    // Orange - Rescheduled appointments
        
        // Additional statuses that might be used
        'in-progress': '3',    // Teal - Service in progress
        'waiting': '4',        // Pink - Client waiting
        'late': '2',           // Red-Orange - Late arrival
        'early': '1',          // Light Blue - Early arrival
        'urgent': '11',        // Red - Urgent/emergency
        'vip': '9',            // Purple - VIP client
        'walk-in': '4',        // Pink - Walk-in appointments
        'online': '6',         // Orange - Online bookings
        'phone': '5',          // Yellow - Phone bookings
        'referral': '3',       // Teal - Referral appointments
        
        // Payment-related statuses
        'paid': '10',          // Green - Payment completed
        'unpaid': '5',         // Yellow - Payment pending
        'partial': '6',        // Orange - Partial payment
        'refunded': '8',       // Gray - Refunded
        
        // Special statuses
        'maintenance': '8',    // Gray - System maintenance
        'holiday': '1',        // Light Blue - Holiday/closed
        'training': '3',       // Teal - Staff training
        'meeting': '7',        // Blue - Staff meetings
        'break': '2'           // Red-Orange - Break time
    };
    
    // Normalize status to lowercase and remove extra spaces
    const normalizedStatus = status?.toLowerCase()?.trim();
    
    // Return mapped color ID or default to blue (ID: 7) for unknown statuses
    return colorMapping[normalizedStatus] || '7';
}

// Helper function to get calendar color name for reference
function getCalendarColorName(colorId) {
    const colorNames = {
        '1': 'Light Blue',
        '2': 'Red-Orange', 
        '3': 'Teal',
        '4': 'Pink',
        '5': 'Yellow',
        '6': 'Orange',
        '7': 'Blue',
        '8': 'Gray',
        '9': 'Purple',
        '10': 'Green',
        '11': 'Red'
    };
    return colorNames[colorId] || 'Unknown';
}

// Helper function to get enhanced calendar event with color information
function getEnhancedCalendarEvent(eventData, status) {
    const colorId = getCalendarColorId(status);
    const colorName = getCalendarColorName(colorId);
    
    // Get custom color for full background (instead of just colorId dots)
    const customColor = getCustomBackgroundColor(status);
    
    return {
        ...eventData,
        colorId: colorId, // Keep for fallback compatibility
        // Use custom color for full background
        color: customColor,
        // Add color information to event description for better visibility
        description: `${eventData.description || ''}\n\n📅 Status: ${status?.toUpperCase() || 'UNKNOWN'}\n🎨 Color: ${colorName} (ID: ${colorId})\n🌈 Background: ${customColor}`
    };
}

// Helper function to get custom background colors for full event coloring
function getCustomBackgroundColor(status) {
    const customColors = {
        // Primary booking statuses with full background colors
        'scheduled': '#E3F2FD',     // Light Blue background
        'confirmed': '#E8F5E8',     // Light Green background
        'pending': '#FFF3E0',       // Light Orange background
        'cancelled': '#FFEBEE',     // Light Red background
        'completed': '#F3E5F5',     // Light Purple background
        'no-show': '#FAFAFA',       // Light Gray background
        'rescheduled': '#E1F5FE',   // Light Cyan background
        
        // Additional statuses
        'in-progress': '#E0F2F1',   // Light Teal background
        'waiting': '#FCE4EC',       // Light Pink background
        'late': '#FFE0B2',          // Light Red-Orange background
        'early': '#E1F5FE',         // Light Blue background
        'urgent': '#FFCDD2',        // Light Red background
        'vip': '#F3E5F5',           // Light Purple background
        'walk-in': '#FCE4EC',       // Light Pink background
        'online': '#FFF3E0',        // Light Orange background
        'phone': '#FFF3E0',         // Light Yellow background
        'referral': '#E0F2F1',      // Light Teal background
        
        // Payment-related statuses
        'paid': '#E8F5E8',          // Light Green background
        'unpaid': '#FFF3E0',        // Light Yellow background
        'partial': '#FFF3E0',       // Light Orange background
        'refunded': '#FAFAFA',      // Light Gray background
        
        // Special statuses
        'maintenance': '#FAFAFA',    // Light Gray background
        'holiday': '#E1F5FE',       // Light Blue background
        'training': '#E0F2F1',      // Light Teal background
        'meeting': '#E3F2FD',       // Light Blue background
        'break': '#FFE0B2'          // Light Red-Orange background
    };
    
    // Normalize status to lowercase and remove extra spaces
    const normalizedStatus = status?.toLowerCase()?.trim();
    
    // Return custom color or default to light blue for unknown statuses
    return customColors[normalizedStatus] || '#E3F2FD';
}

// Helper functions to fetch related data for calendar events
async function getCategoryDetails(categoryId) {
    try {
        // Validate categoryId before making the Firestore call
        if (!categoryId || typeof categoryId !== 'string' || categoryId.trim() === '') {
            console.warn('Invalid categoryId provided:', categoryId);
            return { name: 'Unknown Category', description: '' };
        }
        
        const categoryDoc = await firestore.collection('categories').doc(categoryId).get();
        if (categoryDoc.exists) {
            const categoryData = categoryDoc.data();
            return {
                name: categoryData.name || 'Unknown Category',
                description: categoryData.description || ''
            };
        }
        return { name: 'Unknown Category', description: '' };
    } catch (error) {
        console.error('Error fetching category details:', error);
        return { name: 'Unknown Category', description: '' };
    }
}

async function getClientDetails(clientId) {
    try {
        const clientDoc = await firestore.collection('clients').doc(clientId).get();
        if (clientDoc.exists) {
            const clientData = clientDoc.data();
            return {
                name: clientData.fullname || 'Unknown Client',
                email: clientData.email || '',
                phone: clientData.contactNo || '',
                address: clientData.address || '',
            };
        }
        return { name: 'Unknown Client', email: '', phone: '', address: '' };
    } catch (error) {
        console.error('Error fetching client details:', error);
        return { name: 'Unknown Client', email: '', phone: '', address: '' };
    }
}

async function getBranchDetails(branchId) {
    try {
        const branchDoc = await firestore.collection('branches').doc(branchId).get();
        if (branchDoc.exists) {
            const branchData = branchDoc.data();
            return {
                name: branchData.name || 'Unknown Branch',
                address: branchData.address || '',
                phone: branchData.contactno || '',
                email: branchData.email || '',
                set_password: branchData.set_password || ''
            };
        }
        return { name: 'Unknown Branch', address: '', phone: '', email: '' };
    } catch (error) {
        console.error('Error fetching branch details:', error);
        return { name: 'Unknown Branch', address: '', phone: '', email: '' };
    }
}

async function getServicesDetails(serviceIds) {
    try {
        if (!serviceIds || serviceIds.length === 0) {
            return { services: [], totalCost: 0 };
        }

        const servicesQuery = await firestore.collection('services')
            .where('id', 'in', serviceIds)
            .get();

        const services = [];
        let totalCost = 0;

        const servicePromises = servicesQuery.docs.map(async doc => {
            const serviceData = doc.data();
            const categoryDetails = serviceData.category ? await getCategoryDetails(serviceData.category) : { name: 'No Category', description: '' };
            
            totalCost += serviceData.price || 0;
            
            return {
                name: serviceData.name || 'Unknown Service',
                description: serviceData.description || '',
                category: categoryDetails.name,
                price: serviceData.price || 0
            };
        });

        const resolvedServices = await Promise.all(servicePromises);
        services.push(...resolvedServices);

        return { services, totalCost };
    } catch (error) {
        console.error('Error fetching services details:', error);
        return { services: [], totalCost: 0 };
    }
}

// Helper function to get all master_admin emails where isCalendarShared = false
async function getMasterAdminEmails() {
    try {
        const accountsSnapshot = await firestore.collection('accounts')
            .where('role', '==', 'master_admin')
            .where('status', '==', 'active')
            .where('isCalendarShared', '==', false)
            .get();
        
        const emails = [];
        accountsSnapshot.forEach(doc => {
            const accountData = doc.data();
            if (accountData.email) {
                emails.push({
                    email: accountData.email,
                    accountId: doc.id,
                    isCalendarShared: accountData.isCalendarShared || false
                });
            }
        });
        
        console.log(`Found ${emails.length} master_admin emails where isCalendarShared = false:`, emails.map(e => `${e.email} (calendar shared: ${e.isCalendarShared})`));
        return emails;
    } catch (error) {
        console.error('Error fetching master_admin emails:', error);
        return [];
    }
}

// Helper function to get emails for multiple roles with branch filtering
// Only returns accounts where isCalendarShared = false (accounts that need calendar access)
async function getBranchAuthorizedEmails(branchId) {
    try {
        const emails = [];
        
        // Get master_admin emails (no branch filtering needed)
        const masterAdminSnapshot = await firestore.collection('accounts')
            .where('role', '==', 'master_admin')
            .where('status', '==', 'active')
            .where('isCalendarShared', '==', false)
            .get();
        
        masterAdminSnapshot.forEach(doc => {
            const accountData = doc.data();
            if (accountData.email) {
                emails.push({
                    email: accountData.email,
                    role: 'master_admin',
                    branchId: accountData.branch_id || null,
                    accountId: doc.id,
                    isCalendarShared: accountData.isCalendarShared || false
                });
            }
        });
        
        // Get super_admin emails (no branch filtering needed)
        const superAdminSnapshot = await firestore.collection('accounts')
            .where('role', '==', 'super_admin')
            .where('status', '==', 'active')
            .where('isCalendarShared', '==', false)
            .get();
        
        superAdminSnapshot.forEach(doc => {
            const accountData = doc.data();
            if (accountData.email) {
                emails.push({
                    email: accountData.email,
                    role: 'super_admin',
                    branchId: accountData.branch_id || null,
                    accountId: doc.id,
                    isCalendarShared: accountData.isCalendarShared || false
                });
            }
        });
        
        // Get branch-specific emails (branch, cashier roles)
        const branchSpecificRoles = ['branch', 'cashier'];
        
        if (branchId) {
            // If branchId is provided, only get users for that specific branch
            for (const role of branchSpecificRoles) {
                const roleSnapshot = await firestore.collection('accounts')
                    .where('role', '==', role)
                    .where('branch_id', '==', branchId)
                    .where('status', '==', 'active')
                    .where('isCalendarShared', '==', false)
                    .get();
                
                roleSnapshot.forEach(doc => {
                    const accountData = doc.data();
                    if (accountData.email) {
                        emails.push({
                            email: accountData.email,
                            role: role,
                            branchId: accountData.branch_id,
                            accountId: doc.id,
                            isCalendarShared: accountData.isCalendarShared || false
                        });
                    }
                });
            }
        } else {
            // If branchId is null, get all branch and cashier users from all branches
            for (const role of branchSpecificRoles) {
                const roleSnapshot = await firestore.collection('accounts')
                    .where('role', '==', role)
                    .where('status', '==', 'active')
                    .where('isCalendarShared', '==', false)
                    .get();
                
                roleSnapshot.forEach(doc => {
                    const accountData = doc.data();
                    if (accountData.email) {
                        emails.push({
                            email: accountData.email,
                            role: role,
                            branchId: accountData.branch_id,
                            accountId: doc.id,
                            isCalendarShared: accountData.isCalendarShared || false
                        });
                    }
                });
            }
        }
        
        // Remove duplicates by email (in case someone has multiple roles)
        const uniqueEmails = [];
        const emailSet = new Set();
        
        emails.forEach(emailObj => {
            if (!emailSet.has(emailObj.email)) {
                emailSet.add(emailObj.email);
                uniqueEmails.push(emailObj);
            }
        });
        
        const branchDescription = branchId ? `branch ${branchId}` : 'all branches';
        console.log(`Found ${uniqueEmails.length} authorized emails for ${branchDescription}:`);
        uniqueEmails.forEach(emailObj => {
            console.log(`- ${emailObj.email} (${emailObj.role}, branch: ${emailObj.branchId}, calendar shared: ${emailObj.isCalendarShared})`);
        });
        
        return uniqueEmails;
    } catch (error) {
        console.error('Error fetching branch authorized emails:', error);
        return [];
    }
}

// Helper function to share calendar with master_admin users
async function shareCalendarWithMasterAdmins(calendar, calendarId, branchName) {
    try {
        const masterAdminEmails = await getMasterAdminEmails();
        
        if (masterAdminEmails.length === 0) {
            console.log('No master_admin users found to share calendar with');
            return { shared: false, count: 0, emails: [] };
        }
        
        const sharingPromises = masterAdminEmails.map(async (emailObj) => {
            try {
                // Share calendar with master_admin with 'owner' role (full access)
                await calendarRateLimiter.shareCalendar(calendar, calendarId, {
                    role: 'owner', // owner, reader, writer, freeBusyReader
                    scope: {
                        type: 'user',
                        value: emailObj.email
                    }
                });
                
                // Update the master_admin account to mark calendar as shared
                try {
                    let accountDoc;
                    if (emailObj.accountId) {
                        accountDoc = await firestore.collection('accounts').doc(emailObj.accountId).get();
                    } else {
                        const accountQuery = await firestore.collection('accounts')
                            .where('email', '==', emailObj.email)
                            .limit(1)
                            .get();
                        
                        if (!accountQuery.empty) {
                            accountDoc = accountQuery.docs[0];
                        }
                    }
                    
                    if (accountDoc && accountDoc.exists) {
                        // Update both calendar_shared and isCalendarShared fields to true
                        await accountDoc.ref.update({
                            calendar_shared: true,
                            isCalendarShared: true, // Update the isCalendarShared field to true
                            calendar_shared_at: moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'),
                            calendar_shared_calendar_id: calendarId,
                            calendar_shared_branch: branchName
                        });
                        console.log(`Updated master_admin account for ${emailObj.email} - calendar marked as shared (isCalendarShared updated to true)`);
                    } else {
                        console.warn(`Master_admin account not found for ${emailObj.email} - cannot update calendar sharing status`);
                    }
                } catch (updateError) {
                    console.error(`Failed to update master_admin account for ${emailObj.email}:`, updateError.message);
                    // Don't fail the whole sharing process if account update fails
                }
                
                console.log(`Successfully shared ${branchName} calendar with master_admin: ${emailObj.email}`);
                return { email: emailObj.email, success: true };
            } catch (shareError) {
                console.error(`Failed to share ${branchName} calendar with ${emailObj.email}:`, shareError.message);
                return { email: emailObj.email, success: false, error: shareError.message };
            }
        });
        
        const results = await Promise.all(sharingPromises);
        const successfulShares = results.filter(r => r.success);
        const failedShares = results.filter(r => !r.success);
        
        console.log(`Calendar sharing summary for ${branchName}:`);
        console.log(`- Successfully shared with ${successfulShares.length} master_admin(s)`);
        console.log(`- Failed to share with ${failedShares.length} master_admin(s)`);
        
        if (failedShares.length > 0) {
            console.log('Failed shares:', failedShares.map(f => `${f.email}: ${f.error}`));
        }
        
        return {
            shared: successfulShares.length > 0,
            count: successfulShares.length,
            emails: successfulShares.map(s => s.email),
            failed: failedShares,
            total_attempts: masterAdminEmails.length
        };
    } catch (error) {
        console.error(`Error sharing calendar for ${branchName}:`, error);
        return { shared: false, count: 0, emails: [], error: error.message };
    }
}

// Helper function to check existing calendar permissions using database tracking
async function checkCalendarPermissions(calendar, calendarId, branchId = null) {
    try {
        // Get all authorized users that should have access
        const authorizedUsers = await getBranchAuthorizedEmails(branchId);
        
        if (authorizedUsers.length === 0) {
            console.log('No authorized users found - no sharing needed');
            return {
                needsSharing: false,
                existingShares: 0,
                existingEmails: [],
                sharesByRole: {},
                roleAccessLevels: {},
                currentAcl: 0,
                authorizedUsers: 0
            };
        }
        
        // Define expected access levels by role
        const roleAccessLevels = {
            'master_admin': 'owner',    // Full access
            'super_admin': 'owner',     // Full access
            'branch': 'writer',         // Can create/edit events
            'cashier': 'reader'         // Read-only access
        };
        
        // Check which users already have calendar access from database
        // Users with isCalendarShared = true already have access
        const usersWithAccess = [];
        const usersNeedingAccess = [];
        const sharesByRole = {};
        
        // Initialize role counters
        Object.keys(roleAccessLevels).forEach(role => {
            sharesByRole[role] = { existing: 0, needed: 0, emails: [] };
        });
        
        // Check each user's calendar sharing status
        for (const userObj of authorizedUsers) {
            try {
                // Use the accountId from the userObj if available, otherwise query by email
                let accountDoc;
                if (userObj.accountId) {
                    accountDoc = await firestore.collection('accounts').doc(userObj.accountId).get();
                } else {
                    const accountQuery = await firestore.collection('accounts')
                        .where('email', '==', userObj.email)
                        .limit(1)
                        .get();
                    if (!accountQuery.empty) {
                        accountDoc = accountQuery.docs[0];
                    }
                }
                
                if (accountDoc && accountDoc.exists) {
                    const accountData = accountDoc.data();
                    // Check isCalendarShared field as the primary indicator
                    const hasCalendarAccess = accountData.isCalendarShared === true;
                    
                    if (hasCalendarAccess) {
                        usersWithAccess.push({
                            email: userObj.email,
                            role: userObj.role,
                            expectedAccess: roleAccessLevels[userObj.role] || 'reader'
                        });
                        
                        if (sharesByRole[userObj.role]) {
                            sharesByRole[userObj.role].existing++;
                            sharesByRole[userObj.role].emails.push(userObj.email);
                        }
                    } else {
                        usersNeedingAccess.push({
                            email: userObj.email,
                            role: userObj.role,
                            expectedAccess: roleAccessLevels[userObj.role] || 'reader'
                        });
                        
                        if (sharesByRole[userObj.role]) {
                            sharesByRole[userObj.role].needed++;
                        }
                    }
                } else {
                    // Account not found, assume access needed
                    usersNeedingAccess.push({
                        email: userObj.email,
                        role: userObj.role,
                        expectedAccess: roleAccessLevels[userObj.role] || 'reader'
                    });
                    
                    if (sharesByRole[userObj.role]) {
                        sharesByRole[userObj.role].needed++;
                    }
                }
            } catch (userError) {
                console.error(`Error checking calendar access for ${userObj.email}:`, userError.message);
                // Assume access needed if we can't check
                usersNeedingAccess.push({
                    email: userObj.email,
                    role: userObj.role,
                    expectedAccess: roleAccessLevels[userObj.role] || 'reader'
                });
                
                if (sharesByRole[userObj.role]) {
                    sharesByRole[userObj.role].needed++;
                }
            }
        }
        
        const needsSharing = usersNeedingAccess.length > 0;
        
        console.log(`Calendar permissions check for calendar ${calendarId}:`);
        console.log(`- Users with access: ${usersWithAccess.length}`);
        console.log(`- Users needing access: ${usersNeedingAccess.length}`);
        console.log(`- Total authorized users: ${authorizedUsers.length}`);
        console.log(`- Needs sharing: ${needsSharing}`);
        
        Object.keys(sharesByRole).forEach(role => {
            const roleData = sharesByRole[role];
            if (roleData.existing > 0 || roleData.needed > 0) {
                console.log(`- ${role}: ${roleData.existing} existing, ${roleData.needed} needed`);
            }
        });
        
        return {
            needsSharing,
            existingShares: usersWithAccess.length,
            existingEmails: usersWithAccess.map(u => u.email),
            sharesByRole,
            roleAccessLevels,
            currentAcl: 0, // Not using ACL anymore
            authorizedUsers: authorizedUsers.length,
            usersWithAccess,
            usersNeedingAccess
        };
        
    } catch (error) {
        console.error('Error checking calendar permissions:', error);
        // If we can't check permissions, assume sharing is needed
        return {
            needsSharing: true,
            existingShares: 0,
            existingEmails: [],
            sharesByRole: {},
            roleAccessLevels: {},
            currentAcl: 0,
            authorizedUsers: 0,
            error: error.message
        };
    }
}

// Helper function to share branch calendar with only users who need access
async function shareCalendarWithBranchAuthorizedUsers(calendar, calendarId, branchName, branchId) {
    try {
        // First check existing permissions to see who already has access
        const existingPermissions = await checkCalendarPermissions(calendar, calendarId);
        
        if (!existingPermissions.needsSharing) {
            console.log(`Calendar ${calendarId} already has all necessary permissions - no sharing needed`);
            return {
                shared: true,
                count: existingPermissions.existingShares,
                emails: existingPermissions.existingEmails,
                by_role: existingPermissions.sharesByRole,
                successful_shares: [],
                failed_shares: [],
                total_attempts: 0,
                access_levels: existingPermissions.roleAccessLevels,
                sharing_skipped: true,
                reason: 'All users already have access'
            };
        }
        
        // Get authorized users for this specific branch
        const authorizedUsers = await getBranchAuthorizedEmails(branchId);
        
        if (authorizedUsers.length === 0) {
            console.log(`No authorized users found to share ${branchName} calendar with`);
            return { shared: false, count: 0, emails: [], by_role: {} };
        }
        
        // Define access levels by role
        const roleAccessLevels = {
            'master_admin': 'owner',    // Full access
            'super_admin': 'owner',     // Full access
            'branch': 'writer',         // Can create/edit events
            'cashier': 'reader'         // Read-only access
        };
        
        // Filter out users who already have access
        // Since getBranchAuthorizedEmails only returns users where isCalendarShared = false,
        // all users in authorizedUsers need access
        const usersNeedingAccess = authorizedUsers.filter(userObj => {
            // Check if user already has calendar access from database
            const hasAccess = existingPermissions.existingEmails.includes(userObj.email);
            if (hasAccess) {
                console.log(`User ${userObj.email} (${userObj.role}) already has calendar access - skipping`);
            }
            return !hasAccess;
        });
        
        if (usersNeedingAccess.length === 0) {
            console.log(`All authorized users for ${branchName} already have calendar access`);
            return {
                shared: true,
                count: existingPermissions.existingShares,
                emails: existingPermissions.existingEmails,
                by_role: existingPermissions.sharesByRole,
                successful_shares: [],
                failed_shares: [],
                total_attempts: 0,
                access_levels: roleAccessLevels,
                sharing_skipped: true,
                reason: 'All branch users already have access'
            };
        }
        
        console.log(`Sharing calendar with ${usersNeedingAccess.length} users who need access (${authorizedUsers.length - usersNeedingAccess.length} already have access)`);
        
        // Only share with users who need access
        const sharingPromises = usersNeedingAccess.map(async (userObj) => {
            try {
                const accessLevel = roleAccessLevels[userObj.role] || 'reader';
                
                // Share calendar with appropriate access level
                await calendarRateLimiter.shareCalendar(calendar, calendarId, {
                    role: accessLevel,
                    scope: {
                        type: 'user',
                        value: userObj.email
                    }
                });
                
                // Update the user's account to mark calendar as shared
                try {
                    // Use the accountId from userObj if available, otherwise query by email
                    let accountDoc;
                    if (userObj.accountId) {
                        accountDoc = await firestore.collection('accounts').doc(userObj.accountId).get();
                    } else {
                        const accountQuery = await firestore.collection('accounts')
                            .where('email', '==', userObj.email)
                            .limit(1)
                            .get();
                        
                        if (!accountQuery.empty) {
                            accountDoc = accountQuery.docs[0];
                        }
                    }
                    
                    if (accountDoc && accountDoc.exists) {
                        // Update both calendar_shared and isCalendarShared fields to true
                        await accountDoc.ref.update({
                            calendar_shared: true,
                            isCalendarShared: true, // Update the isCalendarShared field to true
                            calendar_shared_at: moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'),
                            calendar_shared_calendar_id: calendarId,
                            calendar_shared_branch: branchName
                        });
                        console.log(`Updated account for ${userObj.email} - calendar marked as shared (isCalendarShared updated to true)`);
                    } else {
                        console.warn(`Account not found for ${userObj.email} - cannot update calendar sharing status`);
                    }
                } catch (updateError) {
                    console.error(`Failed to update account for ${userObj.email}:`, updateError.message);
                    // Don't fail the whole sharing process if account update fails
                }
                
                console.log(`Successfully shared ${branchName} calendar with ${userObj.role}: ${userObj.email} (${accessLevel} access)`);
                return { 
                    email: userObj.email, 
                    role: userObj.role,
                    accessLevel: accessLevel,
                    branchId: userObj.branchId,
                    success: true,
                    account_updated: true
                };
            } catch (shareError) {
                console.error(`Failed to share ${branchName} calendar with ${userObj.role} ${userObj.email}:`, shareError.message);
                return { 
                    email: userObj.email, 
                    role: userObj.role,
                    accessLevel: roleAccessLevels[userObj.role] || 'reader',
                    branchId: userObj.branchId,
                    success: false, 
                    error: shareError.message,
                    account_updated: false
                };
            }
        });
        
        const results = await Promise.all(sharingPromises);
        const successfulShares = results.filter(r => r.success);
        const failedShares = results.filter(r => !r.success);
        
        // Group results by role for detailed reporting
        const sharesByRole = {};
        results.forEach(result => {
            if (!sharesByRole[result.role]) {
                sharesByRole[result.role] = { successful: 0, failed: 0, emails: [] };
            }
            if (result.success) {
                sharesByRole[result.role].successful++;
                sharesByRole[result.role].emails.push(result.email);
            } else {
                sharesByRole[result.role].failed++;
            }
        });
        
        // Merge with existing shares for complete picture
        Object.keys(existingPermissions.sharesByRole).forEach(role => {
            if (!sharesByRole[role]) {
                sharesByRole[role] = { successful: 0, failed: 0, emails: [] };
            }
            // Add existing shares
            sharesByRole[role].existing = existingPermissions.sharesByRole[role].existing || 0;
            sharesByRole[role].emails = [...new Set([
                ...sharesByRole[role].emails,
                ...(existingPermissions.sharesByRole[role].emails || [])
            ])];
        });
        
        console.log(`Branch calendar sharing summary for ${branchName} (Branch ID: ${branchId}):`);
        console.log(`- Total authorized users: ${authorizedUsers.length}`);
        console.log(`- Users already had access: ${existingPermissions.existingShares}`);
        console.log(`- New shares attempted: ${usersNeedingAccess.length}`);
        console.log(`- Successfully shared with: ${successfulShares.length} new users`);
        console.log(`- Failed to share with: ${failedShares.length} users`);
        
        Object.keys(sharesByRole).forEach(role => {
            const roleData = sharesByRole[role];
            if (roleData.successful > 0 || roleData.failed > 0 || roleData.existing > 0) {
                console.log(`- ${role}: ${roleData.existing} existing, ${roleData.successful} new successful, ${roleData.failed} failed`);
            }
        });
        
        if (failedShares.length > 0) {
            console.log('Failed shares:', failedShares.map(f => `${f.email} (${f.role}): ${f.error}`));
        }
        
        return {
            shared: successfulShares.length > 0 || existingPermissions.existingShares > 0,
            count: successfulShares.length + existingPermissions.existingShares,
            emails: [...new Set([...successfulShares.map(s => s.email), ...existingPermissions.existingEmails])],
            by_role: sharesByRole,
            successful_shares: successfulShares,
            failed_shares: failedShares,
            total_attempts: usersNeedingAccess.length,
            access_levels: roleAccessLevels,
            sharing_skipped: false,
            reason: 'Partial sharing performed',
            existing_users: existingPermissions.existingShares,
            new_shares: successfulShares.length
        };
    } catch (error) {
        console.error(`Error sharing branch calendar for ${branchName}:`, error);
        return { shared: false, count: 0, emails: [], error: error.message };
    }
}

// Calendar management functions for branches
async function createBranchCalendar(branchName, branchId) {
    try {
        console.log(`Creating calendar for branch: ${branchName} (ID: ${branchId})`);
        
        // Initialize Google Calendar API
        const calendar = google.calendar({ version: 'v3', auth: admin.credential });
        
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

async function updateBranchCalendar(branchId, oldBranchName, newBranchName) {
    try {
        console.log(`Updating calendar for branch: ${oldBranchName} -> ${newBranchName} (ID: ${branchId})`);
        
        // Initialize Google Calendar API
        const calendar = google.calendar({ version: 'v3', auth: admin.credential });
        
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
        
        // Store in a dedicated collection for tracking
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
            calendar_id: calendarId,
            branch_name: branchName,
            calendar_name: calendarName,
            updated_at: new Date().toISOString()
        };
        
        await firestore.collection('branch_calendars').doc(branchId).update(updateData);
        console.log(`Updated calendar info for branch ${branchName}`);
        
    } catch (error) {
        console.error(`Error updating calendar info for branch ${branchName}:`, error);
    }
}

async function deleteBranchCalendar(branchId, branchName) {
    try {
        console.log(`Deleting calendar for branch: ${branchName} (ID: ${branchId})`);
        
        // Get calendar info
        const calendarInfo = await getCalendarInfo(branchId);
        if (!calendarInfo || !calendarInfo.calendarId) {
            console.log(`No calendar found for branch ${branchName}`);
            return { success: true, message: `No calendar found for ${branchName}` };
        }
        
        // Initialize Google Calendar API
        const calendar = google.calendar({ version: 'v3', auth: admin.credential });
        
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

module.exports = {
    getBookingCalendarId,
    getStatusBackgroundColor,
    getCalendarColorId,
    getCalendarColorName,
    getEnhancedCalendarEvent,
    getCustomBackgroundColor,
    getCategoryDetails,
    getClientDetails,
    getBranchDetails,
    getServicesDetails,
    getMasterAdminEmails,
    getBranchAuthorizedEmails,
    shareCalendarWithMasterAdmins,
    checkCalendarPermissions,
    shareCalendarWithBranchAuthorizedUsers,
    createBranchCalendar,
    updateBranchCalendar,
    storeCalendarInfo,
    getCalendarInfo,
    updateCalendarInfo,
    deleteBranchCalendar
};
