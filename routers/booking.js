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

// Cache for calendar ID to avoid repeated setup
let cachedCalendarId = null;

// Helper function to get or create a calendar for bookings
async function getBookingCalendarId(calendar) {
    if (cachedCalendarId) {
        return cachedCalendarId;
    }
    
    let calendarId = process.env.GOOGLE_CALENDAR_ID;
    
    if (!calendarId) {
        try {
            // First, try to find an existing "Bookings" calendar
            const calendarList = await calendar.calendarList.list();
            const bookingsCalendar = calendarList.data.items?.find(cal => 
                cal.summary === 'Bookings Calendar' || cal.summary.includes('Booking')
            );
            
            if (bookingsCalendar) {
                calendarId = bookingsCalendar.id;
                console.log('Using existing bookings calendar:', calendarId);
            } else {
                // Create a new calendar for bookings
                const newCalendar = await calendar.calendars.insert({
                    requestBody: {
                        summary: 'Bookings Calendar',
                        description: 'Calendar for managing booking appointments',
                        timeZone: 'Asia/Manila'
                    }
                });
                calendarId = newCalendar.data.id;
                console.log('Created new bookings calendar:', calendarId);
            }
        } catch (calendarSetupError) {
            console.error('Error setting up calendar:', calendarSetupError.message);
            // Fallback: use a generated calendar ID based on service account
            calendarId = `bookings-${(process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || 'default').replace(/[@.]/g, '-')}`;
            console.log('Using fallback calendar ID:', calendarId);
        }
    }
    
    cachedCalendarId = calendarId;
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


// CREATE - Create a new booking
router.post('/createBooking', async (req, res) => { 
    try {
        let { client_id, branch_id, date, time, service_ids = [], status = 'scheduled' , notes = '' } = req.body;
        date = moment.tz(date, 'Asia/Manila').format('YYYY-MM-DD');

        // Validate required fields
        if (!client_id || !branch_id || !date || !time) {
            return res.status(400).json({ 
                error: 'Missing required fields: client_id, branch_id, date, time are required' 
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
        const [clientDetails, branchDetails, servicesDetails] = await Promise.all([
            getClientDetails(client_id),
            getBranchDetails(branch_id),
            getServicesDetails(service_ids)
        ]);

        const { services, totalCost } = servicesDetails;

        // Create enhanced calendar event using service account
        let calendarResponse = null;
        let calendarId = null;
        let scopes = [
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
            
            // Get or create a calendar for bookings
            calendarId = await getBookingCalendarId(calendar);

                // Calculate end time with default 1-hour duration
                // Parse date/time explicitly in Manila timezone to avoid timezone issues
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
                console.log('Parsed start datetime RFC3339:', startDateTime.format('YYYY-MM-DDTHH:mm:ssZ'));
                console.log('Parsed end datetime:', endDateTime.format());
                console.log('Parsed end datetime RFC3339:', endDateTime.format('YYYY-MM-DDTHH:mm:ssZ'));

                // Create detailed event description
                const servicesList = services.length > 0 
                    ? services.map(s => `• ${s.name} (${s.category}) - ₱${s.price.toFixed(2)}`).join('\n')
                    : '• No specific services selected';

                const eventDescription = `
📅 BOOKING DETAILS
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
Created: ${created_at}
                `.trim();

                const event = {
                    summary: `${clientDetails.name} - ${branchDetails.name}${services.length > 0 ? ` (${services.map(s => s.name).join(', ')})` : ''}`,
                    description: eventDescription,
                    start: { 
                        // Use RFC 3339 format with explicit timezone offset (+08:00 for Asia/Manila)
                        // This ensures Google Calendar displays the correct time regardless of user's timezone
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
                            totalCost: totalCost.toString(),
                            serviceIds: JSON.stringify(service_ids),
                            bookingStatus: status
                        }
                    }
                };

                console.log('Attempting to create calendar event with calendar ID:', calendarId);
                calendarResponse = await calendar.events.insert({ calendarId, requestBody: event });
                
                if(calendarResponse.status === 200){
                    console.log('Enhanced booking created in calendar API successfully');
                    console.log('Calendar event ID:', calendarResponse.data.id);
                    console.log('Calendar event link:', calendarResponse.data.htmlLink);
                     // Add calendar details to booking data
                        const enhancedBookingData = {
                            ...bookingData,
                            calendar_event_id: calendarResponse?.data?.id || null,
                            calendar_event_link: calendarResponse?.data?.htmlLink || null,
                            estimated_total_cost: totalCost,
                        };

                        //  save to firestore 
                        await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).set(enhancedBookingData);

                        res.status(201).json({ 
                            message: 'Booking created successfully', 
                            booking_id,
                            booking: enhancedBookingData,
                            calendar_event_id: calendarResponse?.data?.id || null,
                            calendar_event_link: calendarResponse?.data?.htmlLink || null,
                            calendar_created: !!calendarResponse,
                            estimated_total_cost: totalCost,
                            background_color: getStatusBackgroundColor(status),
                            client_details: clientDetails,
                            branch_details: branchDetails,
                            services_details: services
                        });

                }else{
                    console.log('Booking not created in calendar API');
                    res.status(500).json({ error: 'Failed to create booking' });
                }
            } catch (calendarError) {
                console.error('Error creating calendar event:', {
                    error: calendarError.message,
                    status: calendarError.response?.status,
                    statusText: calendarError.response?.statusText,
                    details: calendarError.response?.data,
                    calendarId: calendarId,
                    hasGoogleCredentials: !!(process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL)
                });
                
                // Log more specific error information
                if (calendarError.message.includes('authentication') || calendarError.message.includes('credentials')) {
                    console.log('Authentication issue detected. Please ensure:');
                    console.log('1. Google service account credentials are properly configured');
                    console.log('2. Service account has access to the calendar');
                    console.log('3. Calendar API is enabled in Google Cloud Console');
                    console.log('4. Service account has proper roles (Calendar Editor)');
                }
                
                if (calendarError.message.includes('notFound') || calendarError.response?.status === 404) {
                    console.log('Calendar not found. The service account may not have access to the specified calendar.');
                    console.log('Consider creating a shared calendar and granting access to the service account.');
                }
                
                // Create booking without calendar integration
                console.log('Creating booking without calendar integration due to calendar error');
                await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).set(bookingData);
                
                res.status(201).json({ 
                    message: 'Booking created successfully (without calendar integration)', 
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
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking' });
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
        const calendarId = await getBookingCalendarId(calendar);
        
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
        
        res.status(200).json({
            message: 'Calendar setup successful!',
            calendarId: calendarId,
            testEventCreated: true,
            testEventCleaned: true,
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