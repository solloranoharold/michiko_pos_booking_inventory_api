require("dotenv").config();
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const moment = require('moment-timezone');
// for calendar API
const { google } = require('googleapis');

const router = express.Router();
const firestore = admin.firestore();
const BOOKINGS_COLLECTION = 'bookings';

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
    const colorMapping = {
        'scheduled': '7',      // Blue
        'confirmed': '10',     // Green
        'pending': '5',        // Yellow
        'cancelled': '11',     // Red
        'completed': '9',      // Purple
        'no-show': '8',        // Gray
        'rescheduled': '6'     // Orange
    };
    return colorMapping[status?.toLowerCase()] || '1'; // Default
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
                address: clientData.address || ''
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
                email: branchData.email || ''
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

// Helper function to get all master_admin emails
async function getMasterAdminEmails() {
    try {
        const accountsSnapshot = await firestore.collection('accounts')
            .where('role', '==', 'master_admin')
            .where('status', '==', 'active')
            .get();
        
        const emails = [];
        accountsSnapshot.forEach(doc => {
            const accountData = doc.data();
            if (accountData.email) {
                emails.push(accountData.email);
            }
        });
        
        console.log(`Found ${emails.length} master_admin emails:`, emails);
        return emails;
    } catch (error) {
        console.error('Error fetching master_admin emails:', error);
        return [];
    }
}

// Helper function to get emails for multiple roles with branch filtering
async function getBranchAuthorizedEmails(branchId) {
    try {
        const emails = [];
        
        // Get master_admin emails (no branch filtering needed)
        const masterAdminSnapshot = await firestore.collection('accounts')
            .where('role', '==', 'master_admin')
            .where('status', '==', 'active')
            .get();
        
        masterAdminSnapshot.forEach(doc => {
            const accountData = doc.data();
            if (accountData.email) {
                emails.push({
                    email: accountData.email,
                    role: 'master_admin',
                    branchId: accountData.branch_id || null
                });
            }
        });
        
        // Get super_admin emails (no branch filtering needed)
        const superAdminSnapshot = await firestore.collection('accounts')
            .where('role', '==', 'super_admin')
            .where('status', '==', 'active')
            .get();
        
        superAdminSnapshot.forEach(doc => {
            const accountData = doc.data();
            if (accountData.email) {
                emails.push({
                    email: accountData.email,
                    role: 'super_admin',
                    branchId: accountData.branch_id || null
                });
            }
        });
        
        // Get branch-specific emails (branch, cashier roles with matching branch_id)
        const branchSpecificRoles = ['branch', 'cashier'];
        
        for (const role of branchSpecificRoles) {
            const roleSnapshot = await firestore.collection('accounts')
                .where('role', '==', role)
                .where('branch_id', '==', branchId)
                .where('status', '==', 'active')
                .get();
            
            roleSnapshot.forEach(doc => {
                const accountData = doc.data();
                if (accountData.email) {
                    emails.push({
                        email: accountData.email,
                        role: role,
                        branchId: accountData.branch_id
                    });
                }
            });
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
        
        console.log(`Found ${uniqueEmails.length} authorized emails for branch ${branchId}:`);
        uniqueEmails.forEach(emailObj => {
            console.log(`- ${emailObj.email} (${emailObj.role}, branch: ${emailObj.branchId})`);
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
        
        const sharingPromises = masterAdminEmails.map(async (email) => {
            try {
                // Share calendar with master_admin with 'owner' role (full access)
                await calendar.acl.insert({
                    calendarId: calendarId,
                    requestBody: {
                        role: 'owner', // owner, reader, writer, freeBusyReader
                        scope: {
                            type: 'user',
                            value: email
                        }
                    }
                });
                console.log(`Successfully shared ${branchName} calendar with master_admin: ${email}`);
                return { email, success: true };
            } catch (shareError) {
                console.error(`Failed to share ${branchName} calendar with ${email}:`, shareError.message);
                return { email, success: false, error: shareError.message };
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

// Helper function to share branch calendar with all authorized users (master_admin, super_admin, branch, cashier)
async function shareCalendarWithBranchAuthorizedUsers(calendar, calendarId, branchName, branchId) {
    try {
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
        
        const sharingPromises = authorizedUsers.map(async (userObj) => {
            try {
                const accessLevel = roleAccessLevels[userObj.role] || 'reader';
                
                // Share calendar with appropriate access level
                await calendar.acl.insert({
                    calendarId: calendarId,
                    requestBody: {
                        role: accessLevel,
                        scope: {
                            type: 'user',
                            value: userObj.email
                        }
                    }
                });
                
                console.log(`Successfully shared ${branchName} calendar with ${userObj.role}: ${userObj.email} (${accessLevel} access)`);
                return { 
                    email: userObj.email, 
                    role: userObj.role,
                    accessLevel: accessLevel,
                    branchId: userObj.branchId,
                    success: true 
                };
            } catch (shareError) {
                console.error(`Failed to share ${branchName} calendar with ${userObj.role} ${userObj.email}:`, shareError.message);
                return { 
                    email: userObj.email, 
                    role: userObj.role,
                    accessLevel: roleAccessLevels[userObj.role] || 'reader',
                    branchId: userObj.branchId,
                    success: false, 
                    error: shareError.message 
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
        
        console.log(`Branch calendar sharing summary for ${branchName} (Branch ID: ${branchId}):`);
        console.log(`- Total authorized users: ${authorizedUsers.length}`);
        console.log(`- Successfully shared with: ${successfulShares.length} users`);
        console.log(`- Failed to share with: ${failedShares.length} users`);
        
        Object.keys(sharesByRole).forEach(role => {
            const roleData = sharesByRole[role];
            console.log(`- ${role}: ${roleData.successful} successful, ${roleData.failed} failed`);
        });
        
        if (failedShares.length > 0) {
            console.log('Failed shares:', failedShares.map(f => `${f.email} (${f.role}): ${f.error}`));
        }
        
        return {
            shared: successfulShares.length > 0,
            count: successfulShares.length,
            emails: successfulShares.map(s => s.email),
            by_role: sharesByRole,
            successful_shares: successfulShares,
            failed_shares: failedShares,
            total_attempts: authorizedUsers.length,
            access_levels: roleAccessLevels
        };
    } catch (error) {
        console.error(`Error sharing branch calendar for ${branchName}:`, error);
        return { shared: false, count: 0, emails: [], error: error.message };
    }
}



// CREATE - Create a new booking per branch with dedicated calendar
router.post('/createBookingperBranch', async (req, res) => {
    try {
        let { client_id, branch_id, date, time, service_ids = [], status = 'scheduled', notes = '' } = req.body;
        date = moment.tz(date, 'Asia/Manila').format('YYYY-MM-DD');

        // Validate required fields
        if (!client_id || !branch_id || !date || !time) {
            return res.status(400).json({ 
                error: 'Missing required fields: client_id, branch_id, date, time are required' 
            });
        }

        // Get branch details first to ensure branch exists
        const branchDetails = await getBranchDetails(branch_id);
        if (!branchDetails.name || branchDetails.name === 'Unknown Branch') {
            return res.status(404).json({ 
                error: 'Branch not found or invalid branch_id provided' 
            });
        }

        // Check for duplicate booking
        const duplicateQuery = await firestore.collection(BOOKINGS_COLLECTION)
            .where('branch_id', '==', branch_id)
            .where('date', '==', date)
            .where('time', '==', time)
            .get();

        if (!duplicateQuery.empty) {
            return res.status(409).json({ 
                error: 'A booking with the same branch, date, and time already exists',
                existing_booking_id: duplicateQuery.docs[0].id
            });
        }

        const booking_id = uuidv4();
        const created_at = moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
        const updated_at = moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');

        const bookingData = {
            booking_id,
            client_id,
            branch_id,
            date,
            time,
            service_ids,
            status,
            notes,
            created_at,
            updated_at
        };

        // Fetch related data for rich calendar event
        const [clientDetails, servicesDetails] = await Promise.all([
            getClientDetails(client_id),
            getServicesDetails(service_ids)
        ]);

        const { services, totalCost } = servicesDetails;

        // Setup Google Calendar integration with enhanced branch-specific logic
        let calendarResponse = null;
        let calendarId = null;
        let calendarCreated = false;
        let calendarShared = false;
        let sharingDetails = {};
        
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ];
        
        try {
            // Use Google service account credentials for calendar API
            const oauth2Client = new google.auth.JWT({
                email: process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
                key: (process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
                scopes,
            });
            
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            
            // Enhanced calendar setup with proper naming convention
            const branchCalendarName = `${branchDetails.name} Bookings`;
            console.log(`Setting up calendar for branch: ${branchDetails.name}`);
            console.log(`Expected calendar name: ${branchCalendarName}`);
            
            // Check if calendar already exists for this branch
            const calendarList = await calendar.calendarList.list();
            let existingCalendar = calendarList.data.items?.find(cal => 
                cal.summary === branchCalendarName ||
                cal.summary === `${branchDetails.name} - Bookings Calendar`
            );
            
            if (existingCalendar) {
                calendarId = existingCalendar.id;
                console.log(`Using existing calendar for ${branchDetails.name}:`, calendarId);
            } else {
                // Create new calendar for this branch
                console.log(`Creating new calendar for branch: ${branchDetails.name}`);
                const newCalendar = await calendar.calendars.insert({
                    requestBody: {
                        summary: branchCalendarName,
                        description: `Dedicated booking calendar for ${branchDetails.name} branch. All appointments and bookings for this location are managed here.`,
                        timeZone: 'Asia/Manila'
                    }
                });
                
                calendarId = newCalendar.data.id;
                calendarCreated = true;
                console.log(`Successfully created new calendar for ${branchDetails.name}:`, calendarId);
            }
            
            // Always attempt to share calendar with all authorized users (master_admin, super_admin, branch, cashier)
            console.log(`Ensuring calendar is shared with all authorized users for ${branchDetails.name} (Branch ID: ${branch_id})`);
            const sharingResult = await shareCalendarWithBranchAuthorizedUsers(calendar, calendarId, branchDetails.name, branch_id);
            
            calendarShared = sharingResult.shared;
            sharingDetails = {
                successful_shares: sharingResult.count,
                shared_emails: sharingResult.emails,
                failed_shares: sharingResult.failed_shares || [],
                total_attempts: sharingResult.total_attempts || 0,
                by_role: sharingResult.by_role || {},
                access_levels: sharingResult.access_levels || {}
            };
            
            console.log(`Calendar sharing result for ${branchDetails.name}:`, sharingDetails);

            // Create enhanced calendar event
            console.log('Input date:', date, 'Input time:', time);
            
            // Create moment object in Manila timezone with explicit format parsing
            const dateTimeString = `${date} ${time}`;
            console.log('Combined datetime string:', dateTimeString);
            
            // Try multiple formats to parse the input correctly
            let startDateTime;
            
            // Try HH:mm:ss format first
            startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Manila');
            
            // If that fails, try HH:mm format
            if (!startDateTime.isValid()) {
                startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm', 'Asia/Manila');
            }
            
            // If still not valid, try fallback with T separator
            if (!startDateTime.isValid()) {
                startDateTime = moment.tz(`${date}T${time}`, 'Asia/Manila');
            }
            
            // If all parsing attempts fail, throw an error
            if (!startDateTime.isValid()) {
                throw new Error(`Unable to parse date and time: ${date} ${time}`);
            }

            const endDateTime = startDateTime.clone().add(60, 'minutes'); // Default 1-hour duration
            
            console.log('Parsed start datetime:', startDateTime.format());
            console.log('Parsed end datetime:', endDateTime.format());

            // Create detailed event description
            const servicesList = services.length > 0 
                ? services.map(s => `• ${s.name} (${s.category}) - ₱${s.price.toFixed(2)}`).join('\n')
                : '• No specific services selected';

            const eventDescription = `
📅 BRANCH BOOKING DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 CLIENT INFORMATION
Name: ${clientDetails.name}
Email: ${clientDetails.email}
Phone: ${clientDetails.phone}
${clientDetails.address ? `Address: ${clientDetails.address}` : ''}

🏢 BRANCH INFORMATION  
Branch: ${branchDetails.name}
Location: ${branchDetails.address}
Contact: ${branchDetails.phone}
${branchDetails.email ? `Email: ${branchDetails.email}` : ''}

💼 SERVICES BOOKED
${servicesList}

💰 BOOKING SUMMARY
Total Cost: ₱${totalCost.toFixed(2)}
Status: ${status.toUpperCase()}
Booking ID: ${booking_id}

${notes ? `📝 NOTES\n${notes}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Branch Calendar: ${branchCalendarName}
Created: ${created_at}
            `.trim();

            const event = {
                summary: `${clientDetails.name} - ${branchDetails.name}${services.length > 0 ? ` (${services.map(s => s.name).join(', ')})` : ''}`,
                description: eventDescription,
                start: { 
                    dateTime: startDateTime.format('YYYY-MM-DDTHH:mm:ss+08:00'),
                    timeZone: 'Asia/Manila'
                },
                end: { 
                    dateTime: endDateTime.format('YYYY-MM-DDTHH:mm:ss+08:00'),
                    timeZone: 'Asia/Manila'
                },
                location: branchDetails.address,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 24 hours before
                        { method: 'popup', minutes: 30 }       // 30 minutes before
                    ]
                },
                colorId: getCalendarColorId(status),
                visibility: 'public',
                extendedProperties: {
                    private: {
                        bookingId: booking_id,
                        clientId: client_id,
                        branchId: branch_id,
                        branchName: branchDetails.name,
                        totalCost: totalCost.toString(),
                        serviceIds: JSON.stringify(service_ids),
                        bookingStatus: status,
                        calendarType: 'branch_specific'
                    }
                }
            };

            console.log(`Creating calendar event in branch calendar: ${branchCalendarName} (${calendarId})`);
            calendarResponse = await calendar.events.insert({ 
                calendarId, 
                requestBody: event 
            });
            
            if (calendarResponse.status === 200) {
                console.log('Enhanced branch booking created in calendar API successfully');
                console.log('Calendar event ID:', calendarResponse.data.id);
                console.log('Calendar event link:', calendarResponse.data.htmlLink);
                
                // Add calendar details to booking data
                const enhancedBookingData = {
                    ...bookingData,
                    calendar_event_id: calendarResponse?.data?.id || null,
                    calendar_event_link: calendarResponse?.data?.htmlLink || null,
                    calendar_id: calendarId,
                    calendar_name: branchCalendarName,
                    estimated_total_cost: totalCost,
                };

                // Save to firestore 
                await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).set(enhancedBookingData);

                res.status(201).json({ 
                    message: 'Branch booking created successfully with dedicated calendar', 
                    booking_id,
                    booking: enhancedBookingData,
                    calendar_event_id: calendarResponse?.data?.id || null,
                    calendar_event_link: calendarResponse?.data?.htmlLink || null,
                    calendar_details: {
                        calendar_id: calendarId,
                        calendar_name: branchCalendarName,
                        calendar_created: calendarCreated,
                        calendar_shared: calendarShared,
                        sharing_details: sharingDetails
                    },
                    estimated_total_cost: totalCost,
                    background_color: getStatusBackgroundColor(status),
                    client_details: clientDetails,
                    branch_details: branchDetails,
                    services_details: services
                });

            } else {
                console.log('Branch booking not created in calendar API');
                res.status(500).json({ error: 'Failed to create branch booking in calendar' });
            }
            
        } catch (calendarError) {
            console.error('Error creating branch calendar event:', {
                error: calendarError.message,
                status: calendarError.response?.status,
                statusText: calendarError.response?.statusText,
                details: calendarError.response?.data,
                calendarId: calendarId,
                branchName: branchDetails.name,
                hasGoogleCredentials: !!(process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL)
            });
            
            // Create booking without calendar integration
            console.log('Creating branch booking without calendar integration due to calendar error');
            await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).set(bookingData);
            
            res.status(201).json({ 
                message: 'Branch booking created successfully (without calendar integration)', 
                booking_id,
                booking: {
                    ...bookingData,
                    background_color: getStatusBackgroundColor(status)
                },
                calendar_created: false,
                calendar_error: calendarError.message,
                estimated_total_cost: totalCost,
                background_color: getStatusBackgroundColor(status),
                client_details: clientDetails,
                branch_details: branchDetails,
                services_details: services
            });
            return;
        }

    } catch (error) {
        console.error('Error creating branch booking:', error);
        res.status(500).json({ error: 'Failed to create branch booking' });
    }
});

// READ - Get all bookings
router.get('/getBookings', async (req, res) => {
    try {
        const { branch_id, dates = [] } = req.query;

       
        let query = firestore.collection(BOOKINGS_COLLECTION);
        
        // Parse dates parameter - it could be a string or array
        let datesArray = [];
        if (dates) {
            if (Array.isArray(dates)) {
                datesArray = dates;
            } else if (typeof dates === 'string') {
                // Handle comma-separated dates or single date
                datesArray = dates.includes(',') ? dates.split(',').map(d => d.trim()) : [dates];
            }
        }
        
        if (datesArray.length === 0) {
            return res.status(400).json({ 
                error: 'dates array is required and cannot be empty' 
            });
        }
        
        // Sort dates to get the range
        const sortedDates = datesArray.sort();
        const startDate = sortedDates[0];
        const endDate = sortedDates[sortedDates.length - 1];
        // Use date range query for better performance with large date arrays
        if (startDate === endDate) {
            // Single date - use equality for better performance
            query = query.where('date', '==', startDate);
        } else {
            // Date range - use >= and <= operators
            query = query.where('date', '>=', startDate).where('date', '<=', endDate);
        }

        if (branch_id) {
            query = query.where('branch_id', '==', branch_id);
        }

        // Order by date first, then by time
        query = query.orderBy('date').orderBy('time');

        const snapshot = await query.get();
        const bookings = [];

        // Filter results to only include dates that were specifically requested
        // This is necessary when using date range queries to ensure we only return
        // bookings for the exact dates requested
        const dateSet = new Set(datesArray);

        // Collect all bookings that match the requested dates
        const matchingBookings = [];
        snapshot.forEach(doc => {
            const bookingData = doc.data();
            
            // Only include bookings that match the requested dates exactly
            if (dateSet.has(bookingData.date)) {
                matchingBookings.push({
                    id: doc.id,
                    ...bookingData,
                    background_color: getStatusBackgroundColor(bookingData.status)
                });
            }
        });

        // Fetch service details, client names, and branch names for all bookings
        const bookingsWithDetails = await Promise.all(
            matchingBookings.map(async (booking) => {
                const [servicesDetails, clientDetails, branchDetails] = await Promise.all([
                    booking.service_ids && booking.service_ids.length > 0 
                        ? getServicesDetails(booking.service_ids)
                        : { services: [], totalCost: 0 },
                    getClientDetails(booking.client_id),
                    getBranchDetails(booking.branch_id)
                ]);

                return {
                    ...booking,
                    services: servicesDetails.services.map(service => service.name),
                    estimated_total_cost: servicesDetails.totalCost,
                    client: clientDetails.name,
                    branch: branchDetails.name
                };
            })
        );

        bookings.push(...bookingsWithDetails);

        res.status(200).json({ 
            data:bookings,
            count: bookings.length,
            dates_queried: datesArray,
            date_range: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
            total_dates_requested: datesArray.length
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// READ - Get booking by ID
router.get('/getBooking/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;

        const doc = await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const bookingData = doc.data();
        
        // Fetch service details, client name, and branch name
        const [servicesDetails, clientDetails, branchDetails] = await Promise.all([
            bookingData.service_ids && bookingData.service_ids.length > 0 
                ? getServicesDetails(bookingData.service_ids)
                : { services: [], totalCost: 0 },
            getClientDetails(bookingData.client_id),
            getBranchDetails(bookingData.branch_id)
        ]);
        
        res.status(200).json({ 
            booking: {
                id: doc.id,
                ...bookingData,
                background_color: getStatusBackgroundColor(bookingData.status),
                services: servicesDetails.services.map(service => service.name),
                estimated_total_cost: servicesDetails.totalCost,
                client: clientDetails.name,
                branch: branchDetails.name
            }
        });

    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ error: 'Failed to fetch booking' });
    }
});

// UPDATE - Update a booking
router.put('/updateBooking/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;
        const { client_id, branch_id, date, time, service_ids, status } = req.body;

        // Check if booking exists
        const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(booking_id);
        const doc = await bookingRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Prepare update data (only include fields that are provided)
        const updateData = {
            updated_at: moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
        };

        if (client_id !== undefined) updateData.client_id = client_id;
        if (branch_id !== undefined) updateData.branch_id = branch_id;
        if (date !== undefined) updateData.date = date;
        if (time !== undefined) updateData.time = time;
        if (service_ids !== undefined) updateData.service_ids = service_ids;
        if (status !== undefined) updateData.status = status;

        await bookingRef.update(updateData);

        // Get updated booking
        const updatedDoc = await bookingRef.get();
        const updatedBookingData = updatedDoc.data();

        res.status(200).json({ 
            message: 'Booking updated successfully',
            booking: {
                id: updatedDoc.id,
                ...updatedBookingData,
                background_color: getStatusBackgroundColor(updatedBookingData.status)
            }
        });

    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ error: 'Failed to update booking' });
    }
});

// DELETE - Delete a booking
router.delete('/deleteBooking/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;

        // Check if booking exists
        const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(booking_id);
        const doc = await bookingRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        await bookingRef.delete();

        res.status(200).json({ 
            message: 'Booking deleted successfully',
            booking_id 
        });

    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

// ADDITIONAL - Get bookings by date range
router.get('/getBookingsByDateRange', async (req, res) => {
    try {
        const { start_date, end_date, branch_id, status } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ 
                error: 'start_date and end_date are required' 
            });
        }

        let query = firestore.collection(BOOKINGS_COLLECTION)
                            .where('date', '>=', start_date)
                            .where('date', '<=', end_date);

        if (branch_id) {
            query = query.where('branch_id', '==', branch_id);
        }
        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('date').orderBy('time');

        const snapshot = await query.get();
        const bookings = [];

        // Collect all bookings first
        const allBookings = [];
        snapshot.forEach(doc => {
            const bookingData = doc.data();
            allBookings.push({
                id: doc.id,
                ...bookingData,
                background_color: getStatusBackgroundColor(bookingData.status)
            });
        });

        // Fetch service details, client names, and branch names for all bookings
        const bookingsWithDetails = await Promise.all(
            allBookings.map(async (booking) => {
                const [servicesDetails, clientDetails, branchDetails] = await Promise.all([
                    booking.service_ids && booking.service_ids.length > 0 
                        ? getServicesDetails(booking.service_ids)
                        : { services: [], totalCost: 0 },
                    getClientDetails(booking.client_id),
                    getBranchDetails(booking.branch_id)
                ]);

                return {
                    ...booking,
                    services: servicesDetails.services.map(service => service.name),
                    estimated_total_cost: servicesDetails.totalCost,
                    client: clientDetails.name,
                    branch: branchDetails.name
                };
            })
        );

        bookings.push(...bookingsWithDetails);

        res.status(200).json({ 
            bookings,
            count: bookings.length,
            date_range: { start_date, end_date }
        });

    } catch (error) {
        console.error('Error fetching bookings by date range:', error);
        res.status(500).json({ error: 'Failed to fetch bookings by date range' });
    }
});

// Test endpoint for calendar setup and verification
router.get('/test-calendar-setup', async (req, res) => {
    try {
        const { branch_name = 'Test Branch' } = req.query; // Allow testing with specific branch name
        
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
        
        // Test calendar access and setup
        const calendarId = await getBookingCalendarId(calendar, branch_name);
        
        // Try to create a test event
        const testEvent = {
            summary: 'Test Event - Calendar Setup Verification',
            description: 'This is a test event to verify calendar setup is working correctly.',
            start: { 
                dateTime: moment.tz('Asia/Manila').add(1, 'hour').format('YYYY-MM-DDTHH:mm:ss+08:00'),
                timeZone: 'Asia/Manila'
            },
            end: { 
                dateTime: moment.tz('Asia/Manila').add(2, 'hours').format('YYYY-MM-DDTHH:mm:ss+08:00'),
                timeZone: 'Asia/Manila'
            }
        };
        
        const testEventResponse = await calendar.events.insert({ 
            calendarId, 
            requestBody: testEvent 
        });
        
        // Clean up the test event
        await calendar.events.delete({
            calendarId,
            eventId: testEventResponse.data.id
        });
        
        // Test calendar sharing with master_admin users
        const sharingResult = await shareCalendarWithMasterAdmins(calendar, calendarId, branch_name);
        
        res.status(200).json({
            message: 'Calendar setup successful!',
            branchName: branch_name,
            calendarId: calendarId,
            calendarName: `${branch_name} - Bookings Calendar`,
            testEventCreated: true,
            testEventCleaned: true,
            calendarSharing: {
                successful: sharingResult.shared,
                count: sharingResult.count,
                emails: sharingResult.emails,
                failed: sharingResult.failed || [],
                total_attempts: sharingResult.total_attempts || 0
            },
            credentials: {
                hasGoogleEmail: !!(process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL),
                hasPrivateKey: !!(process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)
            }
        });
        
    } catch (error) {
        console.error('Calendar setup test error:', error);
        res.status(500).json({
            error: 'Calendar setup failed',
            details: error.message,
            suggestions: [
                'Verify Google service account credentials are correct',
                'Ensure Calendar API is enabled in Google Cloud Console',
                'Check that service account has Calendar Editor role',
                'Verify environment variables GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are set'
            ]
        });
    }
});
router.get('/getBookingById/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await firestore.collection(BOOKINGS_COLLECTION).doc(id).get();
        return res.status(200).json({data:booking.data()});
    } catch (error) {
        res.status(500).json({ error: 'Failed to get booking' });
    }
});
module.exports = router;

// Test endpoint for calendar authentication
router.get('/test-calendar-auth', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(400).json({ 
                error: 'No authorization header provided',
                help: 'Include Authorization header with OAuth 2.0 access token'
            });
        }

        // Extract access token
        let accessToken = authHeader;
        if (authHeader.startsWith('Bearer ')) {
            accessToken = authHeader.substring(7);
        } else if (authHeader.startsWith('bearer ')) {
            accessToken = authHeader.substring(7);
        }

        if (!accessToken || accessToken.length < 10) {
            return res.status(400).json({ 
                error: 'Invalid access token format',
                received_length: accessToken?.length || 0,
                help: 'Token should be at least 10 characters long'
            });
        }

        // Test calendar API access
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: accessToken });
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        // Try to list calendars to test authentication
        const calendarList = await calendar.calendarList.list({
            maxResults: 5
        });

        res.status(200).json({
            message: 'Calendar authentication successful!',
            token_length: accessToken.length,
            calendars_found: calendarList.data.items?.length || 0,
            primary_calendar: calendarList.data.items?.find(cal => cal.id === 'primary')?.summary || 'Not found',
            scopes_needed: [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events'
            ],
            help: 'Your token is working. You can now create bookings with calendar events.'
        });

    } catch (error) {
        console.error('Calendar auth test error:', error);
        
        let errorMessage = 'Unknown error';
        let helpMessage = 'Check your access token and try again';
        
        if (error.message.includes('authentication') || error.message.includes('credentials')) {
            errorMessage = 'Authentication failed';
            helpMessage = 'Your access token is invalid, expired, or lacks required scopes';
        } else if (error.message.includes('quota') || error.message.includes('limit')) {
            errorMessage = 'API quota exceeded';
            helpMessage = 'Wait and try again later, or check your API quotas';
        }

        res.status(401).json({
            error: errorMessage,
            details: error.message,
            help: helpMessage,
            required_scopes: [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events'
            ],
            token_info: {
                provided: !!authHeader,
                format_looks_valid: accessToken && accessToken.length >= 10,
                length: accessToken?.length || 0
            }
        });
    }
}); 

// Endpoint to manually share existing calendars with master_admin users
router.post('/share-calendar-with-admins', async (req, res) => {
    try {
        const { branch_name } = req.body;
        
        if (!branch_name) {
            return res.status(400).json({ 
                error: 'branch_name is required in request body' 
            });
        }
        
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
        
        // Get the calendar ID for the specified branch
        const calendarId = await getBookingCalendarId(calendar, branch_name);
        
        // Share the calendar with master_admin users
        const sharingResult = await shareCalendarWithMasterAdmins(calendar, calendarId, branch_name);
        
        res.status(200).json({
            message: `Calendar sharing process completed for ${branch_name}`,
            branchName: branch_name,
            calendarId: calendarId,
            calendarName: `${branch_name} - Bookings Calendar`,
            sharing: {
                successful: sharingResult.shared,
                count: sharingResult.count,
                emails: sharingResult.emails,
                failed: sharingResult.failed || [],
                total_attempts: sharingResult.total_attempts || 0
            }
        });
        
    } catch (error) {
        console.error('Error sharing calendar with admins:', error);
        res.status(500).json({
            error: 'Failed to share calendar with master_admin users',
            details: error.message,
            suggestions: [
                'Verify Google service account credentials are correct',
                'Ensure Calendar API is enabled in Google Cloud Console',
                'Check that service account has Calendar Editor role',
                'Verify master_admin accounts exist in the database'
            ]
        });
    }
}); 

// Endpoint to share calendars for all branches with master_admin users
router.post('/share-all-calendars-with-admins', async (req, res) => {
    try {
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
        
        // Get all branches from database
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
            return res.status(404).json({
                message: 'No branches found in database',
                branches_processed: 0
            });
        }
        
        console.log(`Found ${branches.length} branches to process for calendar sharing`);
        
        // Process each branch
        const results = [];
        for (const branch of branches) {
            try {
                console.log(`Processing calendar sharing for branch: ${branch.name}`);
                
                // Get or create calendar for this branch
                const calendarId = await getBookingCalendarId(calendar, branch.name);
                
                // Share calendar with master_admin users
                const sharingResult = await shareCalendarWithMasterAdmins(calendar, calendarId, branch.name);
                
                results.push({
                    branchId: branch.id,
                    branchName: branch.name,
                    calendarId: calendarId,
                    sharing: sharingResult,
                    success: true
                });
                
            } catch (branchError) {
                console.error(`Error processing branch ${branch.name}:`, branchError.message);
                results.push({
                    branchId: branch.id,
                    branchName: branch.name,
                    error: branchError.message,
                    success: false
                });
            }
        }
        
        // Calculate summary statistics
        const successfulBranches = results.filter(r => r.success);
        const failedBranches = results.filter(r => !r.success);
        const totalSharedEmails = successfulBranches.reduce((sum, r) => sum + (r.sharing?.count || 0), 0);
        
        res.status(200).json({
            message: 'Bulk calendar sharing process completed',
            summary: {
                total_branches: branches.length,
                successful_branches: successfulBranches.length,
                failed_branches: failedBranches.length,
                total_admin_emails_shared: totalSharedEmails
            },
            results: results
        });
        
    } catch (error) {
        console.error('Error in bulk calendar sharing:', error);
        res.status(500).json({
            error: 'Failed to share calendars with master_admin users',
            details: error.message,
            suggestions: [
                'Verify Google service account credentials are correct',
                'Ensure Calendar API is enabled in Google Cloud Console',
                'Check that service account has Calendar Editor role',
                'Verify master_admin accounts exist in the database',
                'Ensure branches collection exists and has valid data'
            ]
        });
    }
}); 