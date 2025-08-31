// Environment variables loaded centrally in config/env.js
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const moment = require('moment-timezone');
// for calendar API
const { google } = require('googleapis');
const { calendarRateLimiter } = require('../services/calendar-rate-limiter');

// Import email service from services folder
const { emailService } = require('../services/email-service');

// Import helper functions from services folder
const {
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
    sendBookingConfirmationForClient
} = require('../services/booking-helpers.js');

const router = express.Router();
const firestore = admin.firestore();
const BOOKINGS_COLLECTION = 'bookings';
// create booking if client will book for himself
router.post('/createBookingperBranchClient', async (req, res) => {
    try {
        let { client_id, branch_id, date, time, service_ids = [], status = 'scheduled', notes = '' , slot = 1} = req.body;
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
            .where('client_id', '==', client_id)
            .where('status', '==', 'scheduled')
            .get();

        if (!duplicateQuery.empty) {
            return res.status(409).json({ 
                error: 'A booking with the same branch, date, and client already exists',
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
            slot,
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
                subject: process.env.GOOGLE_WORKSPACE_EMAIL 
            });
            
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            
            // Enhanced calendar setup with proper naming convention
            const branchCalendarName = `${branchDetails.name} Bookings`;
            console.log(`Setting up calendar for branch: ${branchDetails.name}`);
            console.log(`Expected calendar name: ${branchCalendarName}`);
            
            // Check if calendar already exists for this branch
            const calendarList = await calendarRateLimiter.listCalendars(calendar);
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
                const newCalendar = await calendarRateLimiter.createCalendar(calendar, {
                    summary: branchCalendarName,
                    description: `Dedicated booking calendar for ${branchDetails.name} branch. All appointments and bookings for this location are managed here.`,
                    timeZone: 'Asia/Manila'
                });
                
                calendarId = newCalendar.data.id;
                calendarCreated = true;
                console.log(`Successfully created new calendar for ${branchDetails.name}:`, calendarId);
            }
            
            // Check if calendar is already shared with authorized users before attempting to share
            console.log(`Checking existing calendar permissions for ${branchDetails.name} (Branch ID: ${branch_id})`);
            const existingPermissions = await checkCalendarPermissions(calendar, calendarId, branch_id);
            
            let sharingResult = null;
            let calendarShared = false;
            let sharingDetails = {};
            
            if (existingPermissions.needsSharing) {
                console.log(`Calendar needs sharing - sharing with users who need access for ${branchDetails.name} (Branch ID: ${branch_id})`);
                sharingResult = await shareCalendarWithBranchAuthorizedUsers(calendar, calendarId, branchDetails.name, branch_id);
                
                calendarShared = sharingResult.shared;
                sharingDetails = {
                    successful_shares: sharingResult.count,
                    shared_emails: sharingResult.emails,
                    failed_shares: sharingResult.failed_shares || [],
                    total_attempts: sharingResult.total_attempts || 0,
                    by_role: sharingResult.by_role || {},
                    access_levels: sharingResult.access_levels || {},
                    sharing_performed: !sharingResult.sharing_skipped,
                    existing_permissions: false,
                    sharing_skipped: sharingResult.sharing_skipped || false,
                    reason: sharingResult.reason || 'Sharing performed',
                    existing_users: sharingResult.existing_users || 0,
                    new_shares: sharingResult.new_shares || 0
                };
            } else {
                console.log(`Calendar already has proper permissions for ${branchDetails.name} - no sharing needed`);
                calendarShared = true;
                sharingDetails = {
                    successful_shares: existingPermissions.existingShares,
                    shared_emails: existingPermissions.existingEmails,
                    failed_shares: [],
                    total_attempts: 0,
                    by_role: existingPermissions.sharesByRole || {},
                    access_levels: existingPermissions.roleAccessLevels || {},
                    sharing_performed: false,
                    existing_permissions: true,
                    sharing_skipped: true,
                    reason: 'All users already have access',
                    existing_users: existingPermissions.existingShares,
                    new_shares: 0
                };
            }
            
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

            const baseEvent = {
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
                // how can I check if there is an existing attendee in the event?
                attendees: [
                    {
                        email: clientDetails.email,
                        displayName: clientDetails.name,
                        responseStatus: 'needsAction'
                    }
                ],
                location: branchDetails.address,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 24 hours before
                        { method: 'popup', minutes: 30 }       // 30 minutes before
                    ]
                },
                organizer: {
                    email: process.env.GOOGLE_WORKSPACE_EMAIL,
                    displayName: branchDetails.name
                },
                visibility: 'public',
                sendUpdates:'all',
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

            // Apply enhanced calendar event with color coding
            const event = getEnhancedCalendarEvent(baseEvent, status);

            console.log(`Creating calendar event in branch calendar: ${branchCalendarName} (${calendarId})`);
            calendarResponse = await calendarRateLimiter.createEvent(calendar, calendarId, event);
            
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

                // Send confirmation email to client
                let emailResult = null;
                try {
                    console.log(`Sending confirmation email to client ${clientDetails.email} for booking ${booking_id}`);
                    emailResult = await emailService.sendBookingCreatedNotification(
                        enhancedBookingData,
                        clientDetails,
                        branchDetails,
                        servicesDetails
                    );
                 
                    
                    if (emailResult.success) {
                        console.log(`Confirmation email sent successfully to ${clientDetails.email}`);
                    } else {
                        console.warn(`Failed to send confirmation email: ${emailResult.error}`);
                    }
                } catch (emailError) {
                    console.error('Error sending confirmation email:', emailError);
                    emailResult = {
                        success: false,
                        error: emailError.message,
                        skipped: false
                    };
                }
                // send also email for client affected
                let emailResultForClient = null;
                try {
                    console.log(`Sending confirmation email to client ${clientDetails.email} for booking ${booking_id}`);
                    emailResultForClient = await emailService.sendBookingConfirmationForClient(
                        enhancedBookingData,
                        clientDetails,
                        branchDetails,
                        servicesDetails
                    );
                } catch (emailError) {
                    console.error('Error sending confirmation email:', emailError);
                    emailResultForClient = {
                        success: false,
                        error: emailError.message,
                        skipped: false
                    };
                }

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
                        sharing_performed: sharingDetails.sharing_performed || false,
                        existing_permissions_used: sharingDetails.existing_permissions || false,
                        sharing_skipped: sharingDetails.sharing_skipped || false,
                        reason: sharingDetails.reason || 'Unknown',
                        existing_users: sharingDetails.existing_users || 0,
                        new_shares: sharingDetails.new_shares || 0,
                        sharing_details: sharingDetails
                    },
                    email_sent: emailResult?.success || false,
                    email_details: emailResult,
                    email_sent_for_client: emailResultForClient?.success || false,
                    email_details_for_client: emailResultForClient,
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
                calendar_details: {
                    calendar_created: false,
                    calendar_shared: false,
                    sharing_performed: false,
                    existing_permissions_used: false,
                    error: calendarError.message
                },
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

// CREATE - Create a new booking per branch with dedicated calendar
router.post('/createBookingperBranch', async (req, res) => {
    try {
        let { client_id, branch_id, date, time, service_ids = [], status = 'scheduled', notes = '' , slot = 1} = req.body;
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
            .where('client_id', '==', client_id)
            .where('status', '==', 'scheduled')
            .get();

        if (!duplicateQuery.empty) {
            return res.status(409).json({ 
                error: 'A booking with the same branch, date, and client already exists',
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
            slot,
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
                subject: process.env.GOOGLE_WORKSPACE_EMAIL 
            });
            
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            
            // Enhanced calendar setup with proper naming convention
            const branchCalendarName = `${branchDetails.name} Bookings`;
            console.log(`Setting up calendar for branch: ${branchDetails.name}`);
            console.log(`Expected calendar name: ${branchCalendarName}`);
            
            // Check if calendar already exists for this branch
            const calendarList = await calendarRateLimiter.listCalendars(calendar);
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
                const newCalendar = await calendarRateLimiter.createCalendar(calendar, {
                    summary: branchCalendarName,
                    description: `Dedicated booking calendar for ${branchDetails.name} branch. All appointments and bookings for this location are managed here.`,
                    timeZone: 'Asia/Manila'
                });
                
                calendarId = newCalendar.data.id;
                calendarCreated = true;
                console.log(`Successfully created new calendar for ${branchDetails.name}:`, calendarId);
            }
            
            // Check if calendar is already shared with authorized users before attempting to share
            console.log(`Checking existing calendar permissions for ${branchDetails.name} (Branch ID: ${branch_id})`);
            const existingPermissions = await checkCalendarPermissions(calendar, calendarId, branch_id);
            
            let sharingResult = null;
            let calendarShared = false;
            let sharingDetails = {};
            
            if (existingPermissions.needsSharing) {
                console.log(`Calendar needs sharing - sharing with users who need access for ${branchDetails.name} (Branch ID: ${branch_id})`);
                sharingResult = await shareCalendarWithBranchAuthorizedUsers(calendar, calendarId, branchDetails.name, branch_id);
                
                calendarShared = sharingResult.shared;
                sharingDetails = {
                    successful_shares: sharingResult.count,
                    shared_emails: sharingResult.emails,
                    failed_shares: sharingResult.failed_shares || [],
                    total_attempts: sharingResult.total_attempts || 0,
                    by_role: sharingResult.by_role || {},
                    access_levels: sharingResult.access_levels || {},
                    sharing_performed: !sharingResult.sharing_skipped,
                    existing_permissions: false,
                    sharing_skipped: sharingResult.sharing_skipped || false,
                    reason: sharingResult.reason || 'Sharing performed',
                    existing_users: sharingResult.existing_users || 0,
                    new_shares: sharingResult.new_shares || 0
                };
            } else {
                console.log(`Calendar already has proper permissions for ${branchDetails.name} - no sharing needed`);
                calendarShared = true;
                sharingDetails = {
                    successful_shares: existingPermissions.existingShares,
                    shared_emails: existingPermissions.existingEmails,
                    failed_shares: [],
                    total_attempts: 0,
                    by_role: existingPermissions.sharesByRole || {},
                    access_levels: existingPermissions.roleAccessLevels || {},
                    sharing_performed: false,
                    existing_permissions: true,
                    sharing_skipped: true,
                    reason: 'All users already have access',
                    existing_users: existingPermissions.existingShares,
                    new_shares: 0
                };
            }
            
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

            const baseEvent = {
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
                // how can I check if there is an existing attendee in the event?
                attendees: [
                    {
                        email: clientDetails.email,
                        displayName: clientDetails.name,
                        responseStatus: 'needsAction'
                    }
                ],
                location: branchDetails.address,
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 }, // 24 hours before
                        { method: 'popup', minutes: 30 }       // 30 minutes before
                    ]
                },
                organizer: {
                    email: process.env.GOOGLE_WORKSPACE_EMAIL,
                    displayName: branchDetails.name
                },
                visibility: 'public',
                sendUpdates:'all',
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

            // Apply enhanced calendar event with color coding
            const event = getEnhancedCalendarEvent(baseEvent, status);

            console.log(`Creating calendar event in branch calendar: ${branchCalendarName} (${calendarId})`);
            calendarResponse = await calendarRateLimiter.createEvent(calendar, calendarId, event);
            
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

                // Send confirmation email to client
                let emailResult = null;
                try {
                    console.log(`Sending confirmation email to client ${clientDetails.email} for booking ${booking_id}`);
                    emailResult = await emailService.sendBookingCreatedNotification(
                        enhancedBookingData,
                        clientDetails,
                        branchDetails,
                        servicesDetails
                    );
                    
                    if (emailResult.success) {
                        console.log(`Confirmation email sent successfully to ${clientDetails.email}`);
                    } else {
                        console.warn(`Failed to send confirmation email: ${emailResult.error}`);
                    }
                } catch (emailError) {
                    console.error('Error sending confirmation email:', emailError);
                    emailResult = {
                        success: false,
                        error: emailError.message,
                        skipped: false
                    };
                }
                   // send also email for client affected
                   let emailResultForClient = null;
                   try {
                       console.log(`Sending confirmation email to client ${clientDetails.email} for booking ${booking_id}`);
                       emailResultForClient = await emailService.sendBookingConfirmationForClient(
                           enhancedBookingData,
                           clientDetails,
                           branchDetails,
                           servicesDetails
                       );
                   } catch (emailError) {
                       console.error('Error sending confirmation email:', emailError);
                       emailResultForClient = {
                           success: false,
                           error: emailError.message,
                           skipped: false
                       };
                   }
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
                        sharing_performed: sharingDetails.sharing_performed || false,
                        existing_permissions_used: sharingDetails.existing_permissions || false,
                        sharing_skipped: sharingDetails.sharing_skipped || false,
                        reason: sharingDetails.reason || 'Unknown',
                        existing_users: sharingDetails.existing_users || 0,
                        new_shares: sharingDetails.new_shares || 0,
                        sharing_details: sharingDetails
                    },
                    email_sent: emailResult?.success || false,
                    email_details: emailResult,
                    email_sent_for_client: emailResultForClient?.success || false,
                    email_details_for_client: emailResultForClient,
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
                calendar_details: {
                    calendar_created: false,
                    calendar_shared: false,
                    sharing_performed: false,
                    existing_permissions_used: false,
                    error: calendarError.message
                },
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
        const { client_id, branch_id, date, time, service_ids, status, notes ,slot} = req.body;

        // Check if booking exists
        const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(booking_id);
        const doc = await bookingRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const currentBookingData = doc.data();
        const hasCalendarEvent = currentBookingData.calendar_event_id && currentBookingData.calendar_id;

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
        if (notes !== undefined) updateData.notes = notes;
        if (slot !== undefined) updateData.slot = slot;

        // Check for duplicate booking conflicts before updating
        // Only check if date, time, branch_id, or status is being updated
        if (date !== undefined || time !== undefined || branch_id !== undefined || status !== undefined) {
            const checkDate = date !== undefined ? date : currentBookingData.date;
            const checkTime = time !== undefined ? time : currentBookingData.time;
            const checkBranchId = branch_id !== undefined ? branch_id : currentBookingData.branch_id;
            const checkStatus = status !== undefined ? status : currentBookingData.status;
            const checkSlot = slot !== undefined ? slot : currentBookingData.slot;
            // Only check for conflicts if the status is 'scheduled' (active booking)
            if (checkStatus === 'scheduled') {
                const duplicateQuery = await firestore.collection(BOOKINGS_COLLECTION)
                    .where('branch_id', '==', checkBranchId)
                    .where('date', '==', checkDate)
                    .where('time', '==', checkTime)
                    .where('slot', '==', checkSlot)
                    .where('status', '==', 'scheduled')
                    .get();

                // Check if there are any conflicting bookings (excluding the current booking being updated)
                const conflictingBookings = duplicateQuery.docs.filter(doc => doc.id !== booking_id);
                
                if (conflictingBookings.length > 0) {
                    const conflictingBooking = conflictingBookings[0].data();
                    return res.status(409).json({ 
                        error: 'A booking with the same branch, date, time, slot and scheduled status already exists',
                        existing_booking_id: conflictingBookings[0].id,
                        conflicting_details: {
                            branch_id: checkBranchId,
                            date: checkDate,
                            time: checkTime,
                            status: checkStatus,
                            existing_client_id: conflictingBooking.client_id
                        },
                        message: 'Cannot update booking to conflict with existing scheduled appointment'
                    });
                }
            }
        }

        // Update the booking in Firestore first
        await bookingRef.update(updateData);

        // Get updated booking
        const updatedDoc = await bookingRef.get();
        const updatedBookingData = updatedDoc.data();

        // Update Google Calendar event if it exists
        let calendarUpdateResult = null;
        if (hasCalendarEvent) {
            try {
                console.log(`Updating calendar event for booking ${booking_id} in calendar ${currentBookingData.calendar_id}`);
                
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

                // Fetch updated related data for calendar event
                const [clientDetails, servicesDetails, branchDetails] = await Promise.all([
                    getClientDetails(updatedBookingData.client_id),
                    getServicesDetails(updatedBookingData.service_ids || []),
                    getBranchDetails(updatedBookingData.branch_id)
                ]);

                const { services, totalCost } = servicesDetails;

                // Create updated event description
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
Status: ${updatedBookingData.status.toUpperCase()}
Booking ID: ${booking_id}

${updatedBookingData.notes ? `📝 NOTES\n${updatedBookingData.notes}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Branch Calendar: ${currentBookingData.calendar_name || 'Branch Bookings'}
Updated: ${updateData.updated_at}
                `.trim();

                // Parse date and time for calendar event
                let startDateTime;
                const dateTimeString = `${updatedBookingData.date} ${updatedBookingData.time}`;
                
                // Try multiple formats to parse the input correctly
                startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Manila');
                
                if (!startDateTime.isValid()) {
                    startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm', 'Asia/Manila');
                }
                
                if (!startDateTime.isValid()) {
                    startDateTime = moment.tz(`${updatedBookingData.date}T${updatedBookingData.time}`, 'Asia/Manila');
                }
                
                if (!startDateTime.isValid()) {
                    throw new Error(`Unable to parse date and time: ${updatedBookingData.date} ${updatedBookingData.time}`);
                }

                const endDateTime = startDateTime.clone().add(60, 'minutes'); // Default 1-hour duration

                // Prepare base updated event data
                const baseUpdatedEvent = {
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
                    visibility: 'public',
                    extendedProperties: {
                        private: {
                            bookingId: booking_id,
                            clientId: updatedBookingData.client_id,
                            branchId: updatedBookingData.branch_id,
                            branchName: branchDetails.name,
                            totalCost: totalCost.toString(),
                            serviceIds: JSON.stringify(updatedBookingData.service_ids || []),
                            bookingStatus: updatedBookingData.status,
                            calendarType: 'branch_specific',
                            lastUpdated: updateData.updated_at
                        }
                    }
                };

                // Apply enhanced calendar event with color coding
                const updatedEvent = getEnhancedCalendarEvent(baseUpdatedEvent, updatedBookingData.status);

                // Update the calendar event
                const calendarResponse = await calendarRateLimiter.updateEvent(
                    calendar, 
                    currentBookingData.calendar_id, 
                    currentBookingData.calendar_event_id, 
                    updatedEvent
                );

                if (calendarResponse.status === 200) {
                    console.log(`Calendar event updated successfully for booking ${booking_id}`);
                    calendarUpdateResult = {
                        success: true,
                        calendar_event_id: calendarResponse.data.id,
                        calendar_event_link: calendarResponse.data.htmlLink,
                        updated_at: updateData.updated_at
                    };
                } else {
                    console.log(`Calendar event update failed for booking ${booking_id}`);
                    calendarUpdateResult = {
                        success: false,
                        error: 'Calendar API returned non-200 status'
                    };
                }

            } catch (calendarError) {
                console.error(`Error updating calendar event for booking ${booking_id}:`, calendarError.message);
                calendarUpdateResult = {
                    success: false,
                    error: calendarError.message,
                    details: calendarError.response?.data || null
                };
            }
        }

        // Send update email to client if calendar was updated successfully
        let emailResult = null;
        if (calendarUpdateResult && calendarUpdateResult.success) {
            try {
                console.log(`Sending update email to client for booking ${booking_id}`);
                
                // Fetch updated related data for email
                const [updatedClientDetails, updatedServicesDetails, updatedBranchDetails] = await Promise.all([
                    getClientDetails(updatedBookingData.client_id),
                    getServicesDetails(updatedBookingData.service_ids || []),
                    getBranchDetails(updatedBookingData.branch_id)
                ]);

                emailResult = await emailService.sendBookingUpdatedNotification(
                    updatedBookingData,
                    updatedClientDetails,
                    updatedBranchDetails,
                    updatedServicesDetails
                );
                
                if (emailResult.success) {
                    console.log(`Update email sent successfully to ${updatedClientDetails.email}`);
                } else {
                    console.warn(`Failed to send update email: ${emailResult.error}`);
                }
            } catch (emailError) {
                console.error('Error sending update email:', emailError);
                emailResult = {
                    success: false,
                    error: emailError.message,
                    skipped: false
                };
            }
        }

        // Prepare response
        const responseData = {
            message: 'Booking updated successfully',
            booking: {
                id: updatedDoc.id,
                ...updatedBookingData,
                background_color: getStatusBackgroundColor(updatedBookingData.status)
            }
        };

        // Add calendar update result if available
        if (calendarUpdateResult) {
            responseData.calendar_update = calendarUpdateResult;
        }

        // Add email result if available
        if (emailResult) {
            responseData.email_sent = emailResult.success;
            responseData.email_details = emailResult;
        }

        res.status(200).json(responseData);

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
            subject: process.env.GOOGLE_WORKSPACE_EMAIL 
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
        
        const testEventResponse = await calendarRateLimiter.createEvent(calendar, calendarId, testEvent);
        
        // Clean up the test event
        await calendarRateLimiter.deleteEvent(calendar, calendarId, testEventResponse.data.id);
        
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

// Endpoint to update existing accounts with calendar sharing status
router.post('/update-accounts-calendar-status', async (req, res) => {
    try {
        const { calendar_id, branch_name, force_update = false } = req.body;
        
        if (!calendar_id) {
            return res.status(400).json({ 
                error: 'calendar_id is required in request body' 
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
        
        // Get current ACL to see who actually has access
        const aclResponse = await calendar.acl.list({ calendarId: calendar_id });
        const currentAcl = aclResponse.data.items || [];
        
        // Extract emails that have access
        const emailsWithAccess = currentAcl
            .filter(aclEntry => aclEntry.scope && aclEntry.scope.type === 'user' && aclEntry.scope.value)
            .map(aclEntry => aclEntry.scope.value);
        
        console.log(`Found ${emailsWithAccess.length} emails with access to calendar ${calendar_id}`);
        
        // Get all accounts that should be updated
        const accountsSnapshot = await firestore.collection('accounts')
            .where('status', '==', 'active')
            .get();
        
        const updateResults = [];
        let updatedCount = 0;
        let skippedCount = 0;
        
        for (const accountDoc of accountsSnapshot.docs) {
            const accountData = accountDoc.data();
            const email = accountData.email;
            
            if (!email) {
                updateResults.push({
                    account_id: accountDoc.id,
                    email: 'No email',
                    status: 'skipped',
                    reason: 'No email found'
                });
                skippedCount++;
                continue;
            }
            
            const hasCalendarAccess = emailsWithAccess.includes(email);
            const currentStatus = accountData.calendar_shared === true;
            
            // Only update if status needs to change or if force_update is true
            if (force_update || hasCalendarAccess !== currentStatus) {
                try {
                    const updateData = {
                        calendar_shared: hasCalendarAccess,
                        updated_at: moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
                    };
                    
                    if (hasCalendarAccess) {
                        updateData.calendar_shared_at = moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
                        updateData.calendar_shared_calendar_id = calendar_id;
                        updateData.calendar_shared_branch = branch_name || 'Unknown';
                    } else {
                        // Clear calendar sharing fields if access was removed
                        updateData.calendar_shared_at = null;
                        updateData.calendar_shared_calendar_id = null;
                        updateData.calendar_shared_branch = null;
                    }
                    
                    await accountDoc.ref.update(updateData);
                    
                    updateResults.push({
                        account_id: accountDoc.id,
                        email: email,
                        status: 'updated',
                        previous_status: currentStatus,
                        new_status: hasCalendarAccess,
                        reason: hasCalendarAccess ? 'Calendar access granted' : 'Calendar access removed'
                    });
                    
                    updatedCount++;
                    
                } catch (updateError) {
                    updateResults.push({
                        account_id: accountDoc.id,
                        email: email,
                        status: 'error',
                        error: updateError.message
                    });
                }
            } else {
                updateResults.push({
                    account_id: accountDoc.id,
                    email: email,
                    status: 'skipped',
                    reason: 'Status already correct'
                });
                skippedCount++;
            }
        }
        
        res.status(200).json({
            message: 'Calendar sharing status update completed',
            calendar_id: calendar_id,
            branch_name: branch_name || 'Unknown',
            summary: {
                total_accounts: accountsSnapshot.size,
                updated: updatedCount,
                skipped: skippedCount,
                emails_with_access: emailsWithAccess.length
            },
            results: updateResults
        });
        
    } catch (error) {
        console.error('Error updating accounts calendar status:', error);
        res.status(500).json({
            error: 'Failed to update accounts calendar status',
            details: error.message
        });
    }
});

// Test endpoint for checking calendar permissions
router.get('/check-calendar-permissions', async (req, res) => {
    try {
        const { calendar_id, branch_name = 'Test Branch' } = req.query;
        
        if (!calendar_id) {
            return res.status(400).json({ 
                error: 'calendar_id is required in query parameters' 
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
        
        // Check existing permissions
        const permissions = await checkCalendarPermissions(calendar, calendar_id);
        
        res.status(200).json({
            message: 'Calendar permissions check completed',
            calendar_id: calendar_id,
            branch_name: branch_name,
            permissions: permissions,
            summary: {
                needs_sharing: permissions.needsSharing,
                existing_shares: permissions.existingShares,
                authorized_users: permissions.authorizedUsers,
                current_acl_entries: permissions.currentAcl
            }
        });
        
    } catch (error) {
        console.error('Error checking calendar permissions:', error);
        res.status(500).json({
            error: 'Failed to check calendar permissions',
            details: error.message
        });
    }
});

// Endpoint to check calendar sharing status of all accounts
router.get('/check-accounts-calendar-status', async (req, res) => {
    try {
        const { role, branch_id, status = 'active' } = req.query;
        
        let query = firestore.collection('accounts').where('status', '==', status);
        
        if (role) {
            query = query.where('role', '==', role);
        }
        
        if (branch_id) {
            query = query.where('branch_id', '==', branch_id);
        }
        
        const accountsSnapshot = await query.get();
        const accounts = [];
        
        accountsSnapshot.forEach(doc => {
            const accountData = doc.data();
            accounts.push({
                id: doc.id,
                email: accountData.email,
                role: accountData.role,
                branch_id: accountData.branch_id,
                calendar_shared: accountData.calendar_shared || false,
                calendar_shared_at: accountData.calendar_shared_at || null,
                calendar_shared_calendar_id: accountData.calendar_shared_calendar_id || null,
                calendar_shared_branch: accountData.calendar_shared_branch || null,
                status: accountData.status
            });
        });
        
        // Group by calendar sharing status
        const sharedAccounts = accounts.filter(acc => acc.calendar_shared);
        const unsharedAccounts = accounts.filter(acc => !acc.calendar_shared);
        
        // Group by role
        const accountsByRole = {};
        accounts.forEach(acc => {
            if (!accountsByRole[acc.role]) {
                accountsByRole[acc.role] = { total: 0, shared: 0, unshared: 0 };
            }
            accountsByRole[acc.role].total++;
            if (acc.calendar_shared) {
                accountsByRole[acc.role].shared++;
            } else {
                accountsByRole[acc.role].unshared++;
            }
        });
        
        res.status(200).json({
            message: 'Calendar sharing status check completed',
            summary: {
                total_accounts: accounts.length,
                shared_accounts: sharedAccounts.length,
                unshared_accounts: unsharedAccounts.length,
                sharing_percentage: accounts.length > 0 ? ((sharedAccounts.length / accounts.length) * 100).toFixed(2) + '%' : '0%'
            },
            by_role: accountsByRole,
            shared_accounts: sharedAccounts,
            unshared_accounts: unsharedAccounts,
            all_accounts: accounts
        });
        
    } catch (error) {
        console.error('Error checking accounts calendar status:', error);
        res.status(500).json({
            error: 'Failed to check accounts calendar status',
            details: error.message
        });
    }
});

// Test endpoint for calendar color system
router.get('/test-calendar-colors', async (req, res) => {
    try {
        const { status = 'scheduled' } = req.query;
        
        // Test the color system with different statuses
        const testStatuses = [
            'scheduled', 'confirmed', 'pending', 'cancelled', 'completed', 
            'no-show', 'rescheduled', 'in-progress', 'waiting', 'late', 
            'early', 'urgent', 'vip', 'walk-in', 'online', 'phone',
            'paid', 'unpaid', 'partial', 'refunded', 'maintenance', 
            'holiday', 'training', 'meeting', 'break'
        ];
        
        const colorResults = testStatuses.map(testStatus => {
            const colorId = getCalendarColorId(testStatus);
            const colorName = getCalendarColorName(colorId);
            
            return {
                status: testStatus,
                colorId: colorId,
                colorName: colorName,
                isCurrentStatus: testStatus.toLowerCase() === status.toLowerCase()
            };
        });
        
        // Test enhanced calendar event function
        const testEvent = {
            summary: 'Test Event - Color System',
            description: 'This is a test event to verify the color system.',
            start: { 
                dateTime: moment.tz('Asia/Manila').add(1, 'hour').format('YYYY-MM-DDTHH:mm:ss+08:00'),
                timeZone: 'Asia/Manila'
            },
            end: { 
                dateTime: moment.tz('Asia/Manila').add(2, 'hours').format('YYYY-MM-DDTHH:mm:ss+08:00'),
                timeZone: 'Asia/Manila'
            }
        };
        
        const enhancedEvent = getEnhancedCalendarEvent(testEvent, status);
        
        res.status(200).json({
            message: 'Calendar color system test completed',
            requested_status: status,
            color_mapping: colorResults,
            test_event: {
                original: testEvent,
                enhanced: enhancedEvent,
                color_applied: {
                    colorId: enhancedEvent.colorId,
                    colorName: getCalendarColorName(enhancedEvent.colorId)
                }
            },
            system_info: {
                total_statuses_supported: colorResults.length,
                color_ids_used: [...new Set(colorResults.map(r => r.colorId))].sort(),
                color_ids_used: [...new Set(colorResults.map(r => r.colorId))].sort(),
                default_color: {
                    colorId: '7',
                    colorName: 'Blue',
                    description: 'Default color for unknown statuses'
                }
            }
        });
        
    } catch (error) {
        console.error('Error testing calendar color system:', error);
        res.status(500).json({
            error: 'Failed to test calendar color system',
            details: error.message
        });
    }
}); 

// Test endpoint for email service
router.get('/test-email-service', async (req, res) => {
    try {
        const { test_email } = req.query;
        
        if (!test_email) {
            return res.status(400).json({ 
                error: 'test_email parameter is required' 
            });
        }

        // Test email connection
        const connectionTest = await emailService.initialize();
        
        if (!connectionTest) {
            return res.status(500).json({
                error: 'Email service connection failed',
                connection_test: { success: false, error: 'Gmail API initialization failed' },
                suggestions: [
                    'Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables',
                    'Verify Google service account credentials are correct',
                    'Ensure Gmail API is enabled in Google Cloud Console'
                ]
            });
        }

        // Create test data
        const testBookingData = {
            booking_id: 'test-booking-123',
            date: moment.tz('Asia/Manila').add(1, 'day').format('YYYY-MM-DD'),
            time: '14:00:00',
            status: 'scheduled',
            notes: 'This is a test booking for email service verification.',
            estimated_total_cost: 1500.00
        };

        const testClientDetails = {
            name: 'Test Client',
            email: test_email,
            phone: '+63 912 345 6789',
            address: '123 Test Street, Test City'
        };

        const testBranchDetails = {
            name: 'Test Branch',
            address: '456 Test Avenue, Test City',
            phone: '+63 998 765 4321',
            email: 'test@branch.com'
        };

        const testServicesDetails = {
            services: [
                { name: 'Test Service 1', category: 'Test Category', price: 750.00 },
                { name: 'Test Service 2', category: 'Test Category', price: 750.00 }
            ],
            totalCost: 1500.00
        };

        // Test sending confirmation email
        const emailResult = await emailService.sendBookingCreatedNotification(
            testBookingData,
            testClientDetails,
            testBranchDetails,
            testServicesDetails
        );

        res.status(200).json({
            message: 'Email service test completed',
            connection_test: connectionTest,
            test_data: {
                booking: testBookingData,
                client: testClientDetails,
                branch: testBranchDetails,
                services: testServicesDetails
            },
            email_result: emailResult,
            environment_check: {
                has_google_client_email: !!process.env.GOOGLE_CLIENT_EMAIL,
                has_google_private_key: !!process.env.GOOGLE_PRIVATE_KEY,
                has_google_workspace_email: !!process.env.GOOGLE_WORKSPACE_EMAIL,
                has_frontend_url: !!process.env.FRONTEND_URL
            }
        });
        
    } catch (error) {
        console.error('Email service test error:', error);
        res.status(500).json({
            error: 'Email service test failed',
            details: error.message,
                            suggestions: [
                    'Check Gmail API configuration',
                    'Verify Google service account credentials are set correctly',
                    'Ensure Gmail API is enabled in Google Cloud Console'
                ]
        });
    }
});

// Test endpoint for calendar event emails
router.get('/test-calendar-email', async (req, res) => {
    try {
        const { test_email } = req.query;
        
        if (!test_email) {
            return res.status(400).json({ 
                error: 'test_email parameter is required' 
            });
        }

        // Test email connection
        const connectionTest = await emailService.initialize();
        
        if (!connectionTest) {
            return res.status(500).json({
                error: 'Email service connection failed',
                connection_test: { success: false, error: 'Gmail API initialization failed' },
                suggestions: [
                    'Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY environment variables',
                    'Verify Google service account credentials are correct',
                    'Ensure Gmail API is enabled in Google Cloud Console'
                ]
            });
        }

        // Create test data with calendar event information
        const testBookingData = {
            booking_id: 'test-calendar-booking-456',
            date: moment.tz('Asia/Manila').add(2, 'days').format('YYYY-MM-DD'),
            time: '15:30:00',
            status: 'confirmed',
            notes: 'This is a test booking with calendar event integration.',
            estimated_total_cost: 2000.00,
            calendar_event_id: 'test_calendar_event_123456789',
            calendar_event_link: 'https://calendar.google.com/event?eid=dGVzdF9jYWxlbmRhcl9ldmVudF8xMjM0NTY3ODk',
            calendar_id: 'test_calendar_id_123',
            calendar_name: 'Test Branch Bookings'
        };

        const testClientDetails = {
            name: 'Test Calendar Client',
            email: test_email,
            phone: '+63 912 345 6789',
            address: '123 Test Street, Test City'
        };

        const testBranchDetails = {
            name: 'Test Calendar Branch',
            address: '456 Test Avenue, Test City',
            phone: '+63 998 765 4321',
            email: 'test@branch.com'
        };

        const testServicesDetails = {
            services: [
                { name: 'Calendar Test Service 1', category: 'Test Category', price: 1000.00 },
                { name: 'Calendar Test Service 2', category: 'Test Category', price: 1000.00 }
            ],
            totalCost: 2000.00
        };

        // Test sending confirmation email with calendar event
        const emailResult = await emailService.sendBookingCreatedNotification(
            testBookingData,
            testClientDetails,
            testBranchDetails,
            testServicesDetails
        );

        // Test sending update email with calendar event
        const updateEmailResult = await emailService.sendBookingUpdatedNotification(
            testBookingData,
            testClientDetails,
            testBranchDetails,
            testServicesDetails
        );

        res.status(200).json({
            message: 'Calendar event email test completed',
            connection_test: connectionTest,
            test_data: {
                booking: testBookingData,
                client: testClientDetails,
                branch: testBranchDetails,
                services: testServicesDetails
            },
            email_results: {
                confirmation: emailResult,
                update: updateEmailResult
            },
            calendar_event_info: {
                event_id: testBookingData.calendar_event_id,
                event_link: testBookingData.calendar_event_link,
                calendar_id: testBookingData.calendar_id,
                calendar_name: testBookingData.calendar_name
            },
            frontend_urls: {
                accept_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/accept/${testBookingData.booking_id}?calendar_event_id=${testBookingData.calendar_event_id}`,
                decline_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/decline/${testBookingData.booking_id}?calendar_event_id=${testBookingData.calendar_event_id}`
            },
            environment_check: {
                has_google_client_email: !!process.env.GOOGLE_CLIENT_EMAIL,
                has_google_private_key: !!process.env.GOOGLE_PRIVATE_KEY,
                has_google_workspace_email: !!process.env.GOOGLE_WORKSPACE_EMAIL,
                has_frontend_url: !!process.env.FRONTEND_URL
            }
        });
        
    } catch (error) {
        console.error('Calendar event email test error:', error);
        res.status(500).json({
            error: 'Calendar event email test failed',
            details: error.message,
            suggestions: [
                'Check Gmail API configuration',
                'Verify Google service account credentials are set correctly',
                'Ensure Gmail API is enabled in Google Cloud Console',
                'Check that calendar event data is properly formatted'
            ]
        });
    }
});

// Endpoint to update booking status without authorization (for client actions)
router.put('/updateBookingStatus/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;
        const { status, notes = '' } = req.body;

        // Validate required fields
        if (!status) {
            return res.status(400).json({ 
                error: 'status is required in request body' 
            });
        }

        // Validate status values
        const validStatuses = ['scheduled', 'confirmed', 'pending', 'cancelled', 'completed', 'no-show', 'rescheduled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: 'Invalid status value',
                valid_statuses: validStatuses,
                received_status: status
            });
        }

        // Check if booking exists
        const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(booking_id);
        const doc = await bookingRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const currentBookingData = doc.data();
        const previousStatus = currentBookingData.status;

        // Prepare update data
        const updateData = {
            status: status,
            updated_at: moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss')
        };

        // Add notes if provided
        if (notes) {
            updateData.notes = notes;
        }

        // Update the booking in Firestore
        await bookingRef.update(updateData);

        // Get updated booking data
        const updatedDoc = await bookingRef.get();
        const updatedBookingData = updatedDoc.data();

        // Update Google Calendar event if it exists
        let calendarUpdateResult = null;
        if (currentBookingData.calendar_event_id && currentBookingData.calendar_id) {
            try {
                console.log(`Updating calendar event for booking ${booking_id} with new status: ${status}`);
                
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

                // Fetch updated related data for calendar event
                const [clientDetails, servicesDetails, branchDetails] = await Promise.all([
                    getClientDetails(updatedBookingData.client_id),
                    getServicesDetails(updatedBookingData.service_ids || []),
                    getBranchDetails(updatedBookingData.branch_id)
                ]);

                const { services, totalCost } = servicesDetails;

                // Create updated event description with new status
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

${updatedBookingData.notes ? `📝 NOTES\n${updatedBookingData.notes}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Branch Calendar: ${currentBookingData.calendar_name || 'Branch Bookings'}
Status Updated: ${updateData.updated_at}
Previous Status: ${previousStatus.toUpperCase()}
                `.trim();

                // Parse date and time for calendar event
                let startDateTime;
                const dateTimeString = `${updatedBookingData.date} ${updatedBookingData.time}`;
                
                // Try multiple formats to parse the input correctly
                startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Manila');
                
                if (!startDateTime.isValid()) {
                    startDateTime = moment.tz(dateTimeString, 'YYYY-MM-DD HH:mm', 'Asia/Manila');
                }
                
                if (!startDateTime.isValid()) {
                    startDateTime = moment.tz(`${updatedBookingData.date}T${updatedBookingData.time}`, 'Asia/Manila');
                }
                
                if (!startDateTime.isValid()) {
                    throw new Error(`Unable to parse date and time: ${updatedBookingData.date} ${updatedBookingData.time}`);
                }

                const endDateTime = startDateTime.clone().add(60, 'minutes'); // Default 1-hour duration

                // Prepare base updated event data
                const baseUpdatedEvent = {
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
                    visibility: 'public',
                    extendedProperties: {
                        private: {
                            bookingId: booking_id,
                            clientId: updatedBookingData.client_id,
                            branchId: updatedBookingData.branch_id,
                            branchName: branchDetails.name,
                            totalCost: totalCost.toString(),
                            serviceIds: JSON.stringify(updatedBookingData.service_ids || []),
                            bookingStatus: status,
                            calendarType: 'branch_specific',
                            lastUpdated: updateData.updated_at,
                            previousStatus: previousStatus
                        }
                    }
                };

                // Apply enhanced calendar event with color coding
                const updatedEvent = getEnhancedCalendarEvent(baseUpdatedEvent, status);

                // Update the calendar event
                const calendarResponse = await calendarRateLimiter.updateEvent(
                    calendar, 
                    currentBookingData.calendar_id, 
                    currentBookingData.calendar_event_id, 
                    updatedEvent
                );

                if (calendarResponse.status === 200) {
                    console.log(`Calendar event updated successfully for booking ${booking_id} with status: ${status}`);
                    calendarUpdateResult = {
                        success: true,
                        calendar_event_id: calendarResponse.data.id,
                        calendar_event_link: calendarResponse.data.htmlLink,
                        updated_at: updateData.updated_at,
                        previous_status: previousStatus,
                        new_status: status
                    };
                } else {
                    console.log(`Calendar event update failed for booking ${booking_id}`);
                    calendarUpdateResult = {
                        success: false,
                        error: 'Calendar API returned non-200 status'
                    };
                }

            } catch (calendarError) {
                console.error(`Error updating calendar event for booking ${booking_id}:`, calendarError.message);
                calendarUpdateResult = {
                    success: false,
                    error: calendarError.message,
                    details: calendarError.response?.data || null
                };
            }
        }

        // Send status update notification email to client
        let emailResult = null;
        try {
            console.log(`Sending status update notification email to client for booking ${booking_id}`);
            
            // Fetch updated related data for email
            const [updatedClientDetails, updatedServicesDetails, updatedBranchDetails] = await Promise.all([
                getClientDetails(updatedBookingData.client_id),
                getServicesDetails(updatedBookingData.service_ids || []),
                getBranchDetails(updatedBookingData.branch_id)
            ]);

            // Create enhanced booking data for email
            const emailBookingData = {
                ...updatedBookingData,
                calendar_event_id: currentBookingData.calendar_event_id || null,
                calendar_event_link: currentBookingData.calendar_event_link || null,
                previous_status: previousStatus
            };

            // Send appropriate email based on status
            if (status === 'scheduled') {
                emailResult = await emailService.sendBookingCreatedNotification(
                    emailBookingData,
                    updatedClientDetails,
                    updatedBranchDetails,
                    updatedServicesDetails
                );
            } else if (status === 'cancelled') {
                emailResult = await emailService.sendBookingStatusChangedNotification(
                    emailBookingData,
                    updatedClientDetails,
                    updatedBranchDetails,
                    updatedServicesDetails,
                    previousStatus
                );
            } else if (status === 'completed') {
                emailResult = await emailService.sendBookingStatusChangedNotification(
                    emailBookingData,
                    updatedClientDetails,
                    updatedBranchDetails,
                    updatedServicesDetails,
                    previousStatus
                );
            } else if (status === 'rescheduled') {
                emailResult = await emailService.sendBookingStatusChangedNotification(
                    emailBookingData,
                    updatedClientDetails,
                    updatedBranchDetails,
                    updatedServicesDetails,
                    previousStatus
                );
            } else {
                // For other statuses, send a general update email
                emailResult = await emailService.sendBookingUpdatedNotification(
                    emailBookingData,
                    updatedClientDetails,
                    updatedBranchDetails,
                    updatedServicesDetails
                );
            }
            
            if (emailResult.success) {
                console.log(`Status update notification email sent successfully to ${updatedClientDetails.email}`);
            } else {
                console.warn(`Failed to send status update notification email: ${emailResult.error}`);
            }
        } catch (emailError) {
            console.error('Error sending status update notification email:', emailError);
            emailResult = {
                success: false,
                error: emailError.message,
                skipped: false
            };
        }

        // Prepare response
        const responseData = {
            message: `Booking status updated successfully from ${previousStatus} to ${status}`,
            booking: {
                id: updatedDoc.id,
                ...updatedBookingData,
                background_color: getStatusBackgroundColor(status),
                previous_status: previousStatus
            }
        };

        // Add calendar update result if available
        if (calendarUpdateResult) {
            responseData.calendar_update = calendarUpdateResult;
        }

        // Add email result if available
        if (emailResult) {
            responseData.email_sent = emailResult.success;
            responseData.email_details = emailResult;
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
    }
});

