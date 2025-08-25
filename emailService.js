require("dotenv").config();
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');

// Global transporter variable
let transporter = null;

// Initialize nodemailer transporter
function initializeTransporter() {
    try {
        // Check if we have email credentials
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.warn('Email credentials not found. Email service will be disabled.');
            transporter = null;
            return;
        }

        // Validate email host format
        const emailHost = process.env.EMAIL_HOST.trim();
        if (!emailHost.includes('.') || emailHost === 'gmail') {
            console.error('Invalid EMAIL_HOST format. Please use full SMTP server address (e.g., smtp.gmail.com)');
            transporter = null;
            return;
        }

        console.log(`Initializing email transporter with host: ${emailHost}`);

        transporter = nodemailer.createTransport({
            host: emailHost,
            port: process.env.EMAIL_PORT || 587,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false // Only for development/testing
            }
        });

        console.log('Email transporter initialized successfully');
    } catch (error) {
        console.error('Error initializing email transporter:', error);
        transporter = null;
    }
}

// Test email connection
async function testConnection() {
    if (!transporter) {
        return { success: false, error: 'Email transporter not initialized' };
    }

    try {
        await transporter.verify();
        return { success: true, message: 'Email connection verified successfully' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Generate HTML email template for booking confirmation
function generateBookingEmailHTML(bookingData, clientDetails, branchDetails, servicesDetails, action = 'created') {
    const { 
        booking_id, 
        date, 
        time, 
        status, 
        notes,
        estimated_total_cost,
        calendar_event_id,
        calendar_event_link
    } = bookingData;

    const { name: clientName, email: clientEmail } = clientDetails;
    const { name: branchName, address: branchAddress, phone: branchPhone } = branchDetails;
    const { services } = servicesDetails;

    // Format date and time
    const formattedDate = moment.tz(date, 'YYYY-MM-DD', 'Asia/Manila').format('dddd, MMMM Do YYYY');
    const formattedTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Manila').format('h:mm A');

    // Generate services list
    const servicesList = services.length > 0 
        ? services.map(service => `<li>${service.name} (${service.category}) }</li>`).join('')
        : '<li>No specific services selected</li>';

    // Generate action buttons with calendar event ID included
    const acceptButton = `
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/status/${booking_id}?status=scheduled" 
            style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-right: 10px; display: inline-block;">
            ✅ Accept Booking
        </a>`;

    const declineButton = `
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/booking/status/${booking_id}?status=cancelled" 
           style="background-color: #f44336; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            ❌ Decline Booking
        </a>`;

    const actionButtons = action === 'created' ? `${acceptButton}${declineButton}` : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking ${action === 'created' ? 'Confirmation' : 'Update'} - ${branchName}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            max-width: 600px; 
            margin: 0 auto; 
            padding: 20px;
            background-color: #f4f4f4;
        }
        .email-container {
            background-color: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #4CAF50;
            margin: 0;
            font-size: 28px;
        }
        .booking-details {
            background-color: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
        }
        .detail-label {
            font-weight: bold;
            color: #555;
        }
        .detail-value {
            color: #333;
        }
        .services-list {
            background-color: #f9f9f9;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .services-list ul {
            margin: 0;
            padding-left: 20px;
        }
        .services-list li {
            margin: 8px 0;
        }
        .total-cost {
            background-color: #e8f5e8;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin: 20px 0;
            border-left: 5px solid #4CAF50;
        }
        .total-cost h3 {
            margin: 0;
            color: #2e7d32;
            font-size: 20px;
        }
        .action-buttons {
            text-align: center;
            margin: 30px 0;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .status-scheduled { background-color: #e3f2fd; color: #1976d2; }
        .status-confirmed { background-color: #e8f5e8; color: #2e7d32; }
        .status-pending { background-color: #fff3e0; color: #f57c00; }
        .status-cancelled { background-color: #ffebee; color: #c62828; }
        .status-completed { background-color: #f3e5f5; color: #7b1fa2; }
        .status-no-show { background-color: #fafafa; color: #424242; }
        .status-rescheduled { background-color: #e1f5fe; color: #0277bd; }
        .branch-info {
            background-color: #e3f2fd;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 5px solid #2196f3;
        }
        .calendar-info {
            background-color: #f3e5f5;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 5px solid #9c27b0;
        }
        .calendar-info h3 {
            margin: 0 0 10px 0;
            color: #7b1fa2;
        }
        .calendar-info a {
            color: #2196f3;
            text-decoration: none;
            font-weight: bold;
        }
        .calendar-info a:hover {
            text-decoration: underline;
        }
        .calendar-event-id {
            background-color: #e8eaf6;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            color: #3f51b5;
            border: 1px solid #c5cae9;
        }
        .notes {
            background-color: #fff3e0;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 5px solid #ff9800;
        }
        .notes h4 {
            margin: 0 0 10px 0;
            color: #e65100;
        }
        @media (max-width: 600px) {
            .email-container { padding: 20px; }
            .detail-row { flex-direction: column; }
            .action-buttons a { display: block; margin: 10px 0; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>🏢 ${branchName}</h1>
            <p>Booking ${action === 'created' ? 'Confirmation' : 'Update'}</p>
        </div>

        <div class="branch-info">
            <h3>📍 Branch Information</h3>
            <p><strong>Address:</strong> ${branchAddress}</p>
            <p><strong>Phone:</strong> ${branchPhone}</p>
        </div>

        <div class="booking-details">
            <h3>📅 Booking Details</h3>
            <div class="detail-row">
                <span class="detail-label">Booking ID:</span>
                <span class="detail-value">${booking_id}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${formattedDate}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Time:</span>
                <span class="detail-value">${formattedTime}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">
                    <span class="status-badge status-${status.toLowerCase()}">${status}</span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Client:</span>
                <span class="detail-value">${clientName}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Client Email:</span>
                <span class="detail-value">${clientEmail}</span>
            </div>
        </div>

        <div class="services-list">
            <h3>💼 Services Booked</h3>
            <ul>
                ${servicesList}
            </ul>
        </div>

        ${notes ? `
        <div class="notes">
            <h4>📝 Additional Notes</h4>
            <p>${notes}</p>
        </div>
        ` : ''}

        ${actionButtons ? `
        <div class="action-buttons">
            <h3>Please confirm your booking:</h3>
            ${actionButtons}
        </div>
        ` : ''}

        <div class="footer">
            <p><strong>Important:</strong> Please respond to this email or use the buttons above to confirm or decline your booking.</p>
            <p>If you have any questions, please contact us at ${branchPhone} or reply to this email.</p>
            <p>This is an automated email from ${branchName} booking system.</p>
            <p>Generated on: ${moment.tz('Asia/Manila').format('MMMM Do YYYY, h:mm A')}</p>
        </div>
    </div>
</body>
</html>`;
}

// Generate plain text email for fallback
function generateBookingEmailText(bookingData, clientDetails, branchDetails, servicesDetails, action = 'created') {
    const { 
        booking_id, 
        date, 
        time, 
        status, 
        notes,
        estimated_total_cost,
        calendar_event_id,
        calendar_event_link
    } = bookingData;

    const { name: clientName, email: clientEmail } = clientDetails;
    const { name: branchName, address: branchAddress, phone: branchPhone } = branchDetails;
    const { services } = servicesDetails;

    const formattedDate = moment.tz(date, 'YYYY-MM-DD', 'Asia/Manila').format('dddd, MMMM Do YYYY');
    const formattedTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm:ss', 'Asia/Manila').format('h:mm A');

    const servicesList = services.length > 0 
        ? services.map(service => `- ${service.name} (${service.category})`).join('\n')
        : '- No specific services selected';

    // Include calendar event information in plain text
    const calendarEventInfo = calendar_event_id ? `
CALENDAR EVENT:
Event ID: ${calendar_event_id}
${calendar_event_link ? `View in Google Calendar: ${calendar_event_link}` : ''}
` : '';

    // Include calendar event ID in action URLs
    const calendarEventParam = calendar_event_id ? `?calendar_event_id=${calendar_event_id}` : '';
    
    const actionInstructions = action === 'created' 
        ? `\n\nPLEASE CONFIRM YOUR BOOKING:\nTo accept: Visit ${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/accept/${booking_id}${calendarEventParam}\nTo decline: Visit ${process.env.FRONTEND_URL || 'http://localhost:3000'}/booking/decline/${booking_id}${calendarEventParam}`
        : '';

    return `
BOOKING ${action.toUpperCase()} - ${branchName.toUpperCase()}

BRANCH INFORMATION:
Branch: ${branchName}
Address: ${branchAddress}
Phone: ${branchPhone}

BOOKING DETAILS:
Booking ID: ${booking_id}
Date: ${formattedDate}
Time: ${formattedTime}
Status: ${status}
Client: ${clientName}
Client Email: ${clientEmail}

${calendarEventInfo}SERVICES BOOKED:
${servicesList}

TOTAL ESTIMATED COST: ₱${estimated_total_cost.toFixed(2)}

${notes ? `ADDITIONAL NOTES:\n${notes}\n` : ''}${actionInstructions}

IMPORTANT: Please respond to this email or use the links above to confirm or decline your booking.

If you have any questions, please contact us at ${branchPhone} or reply to this email.

This is an automated email from ${branchName} booking system.
Generated on: ${moment.tz('Asia/Manila').format('MMMM Do YYYY, h:mm A')}`;
}

// Send booking confirmation email
async function sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, action = 'created') {
    // Check if we have branch-specific email credentials
    const hasBranchCredentials = branchDetails.email && branchDetails.set_password;
    
    // if no branch credentials, use global transporter
    if ( !hasBranchCredentials) {
        console.warn('Email transporter not available and no branch credentials. Skipping email send.');
        return {
            success: false,
            error: 'Email transporter not initialized and no branch credentials',
            skipped: true
        };
    }

    try {
        const { email: clientEmail } = clientDetails;
        const { name: branchName } = branchDetails;

        if (!clientEmail) {
            return {
                success: false,
                error: 'Client email not provided',
                skipped: true
            };
        }

        // Create branch-specific transporter if credentials are provided
        let emailTransporter = transporter;
        if (hasBranchCredentials) {
            try {
                console.log(`Creating branch-specific email transporter for ${branchName}`);
                
                // Try different SSL/TLS configurations to handle protocol mismatches
                const transporterConfigs = [
                    {
                        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                        port: process.env.EMAIL_PORT || 587,
                        secure: false, // Start with non-SSL
                        auth: {
                            user: branchDetails.email,
                            pass: branchDetails.set_password
                        },
                        tls: {
                            rejectUnauthorized: false,
                            ciphers: 'SSLv3'
                        }
                    },
                    {
                        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                        port: process.env.EMAIL_PORT || 587,
                        secure: false,
                        auth: {
                            user: branchDetails.email,
                            pass: branchDetails.set_password
                        },
                        tls: {
                            rejectUnauthorized: false,
                            minVersion: 'TLSv1',
                            maxVersion: 'TLSv1.3'
                        }
                    },
                    {
                        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
                        port: process.env.EMAIL_PORT || 587,
                        secure: false,
                        auth: {
                            user: branchDetails.email,
                            pass: branchDetails.set_password
                        },
                        tls: false // Disable TLS completely
                    }
                ];

                let connectionSuccessful = false;
                for (let i = 0; i < transporterConfigs.length && !connectionSuccessful; i++) {
                    try {
                        console.log(`Trying transporter config ${i + 1} for ${branchName}`);
                        emailTransporter = nodemailer.createTransport(transporterConfigs[i]);
                        
                        // Test the branch-specific connection
                        await emailTransporter.verify();
                        console.log(`Branch-specific email transporter verified successfully for ${branchName} with config ${i + 1}`);
                        connectionSuccessful = true;
                    } catch (configError) {
                        console.log(`Config ${i + 1} failed for ${branchName}:`, configError.message);
                        if (i === transporterConfigs.length - 1) {
                            // Last config failed, throw the error
                            throw configError;
                        }
                    }
                }
                
            } catch (error) {
                console.error(`Error creating branch-specific email transporter for ${branchName}:`, error);
                // Fall back to global transporter if branch-specific fails
                if (!transporter) {
                    return {
                        success: false,
                        error: `Branch email credentials failed and no global transporter available: ${error.message}`,
                        skipped: true
                    };
                }
                console.log(`Falling back to global email transporter for ${branchName}`);
            }
        }

        const subject = action === 'created' 
            ? `📅 Booking Confirmation - ${branchName}`
            : `📝 Booking Update - ${branchName}`;

        const htmlContent = generateBookingEmailHTML(bookingData, clientDetails, branchDetails, servicesDetails, action);
        const textContent = generateBookingEmailText(bookingData, clientDetails, branchDetails, servicesDetails, action);

        const mailOptions = {
            from: `"${branchName} Booking System" <${hasBranchCredentials ? branchDetails.email : process.env.EMAIL_USER}>`,
            to: clientEmail,
            subject: subject,
            text: textContent,
            html: htmlContent,
            headers: {
                'X-Booking-ID': bookingData.booking_id,
                'X-Branch-Name': branchName,
                'X-Action': action
            }
        };

        // Send email using the appropriate transporter
        const result = await emailTransporter.sendMail(mailOptions);

        console.log(`Booking email sent successfully to ${clientEmail} for booking ${bookingData.booking_id} using ${hasBranchCredentials ? 'branch-specific' : 'global'} credentials`);
        
        return {
            success: true,
            messageId: result.messageId,
            recipient: clientEmail,
            action: action,
            booking_id: bookingData.booking_id,
            branch_name: branchName,
            sent_at: moment.tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'),
            credentials_used: hasBranchCredentials ? 'branch-specific' : 'global'
        };

    } catch (error) {
        console.error('Error sending booking email:', error);
        
        // Provide more helpful error messages
        let errorMessage = error.message;
        if (error.code === 'ENOTFOUND') {
            errorMessage = `Email server not found. Please check your EMAIL_HOST configuration (current: ${process.env.EMAIL_HOST}). Use full SMTP address like 'smtp.gmail.com'`;
        } else if (error.code === 'EAUTH') {
            errorMessage = hasBranchCredentials 
                ? `Branch email authentication failed. Please check the email and password for branch ${branchDetails.name}.`
                : 'Email authentication failed. Please check your EMAIL_USER and EMAIL_PASS credentials.';
        } else if (error.code === 'ECONNECTION') {
            errorMessage = 'Failed to connect to email server. Please check your EMAIL_HOST and EMAIL_PORT settings.';
        }
        
        return {
            success: false,
            error: errorMessage,
            recipient: clientDetails.email,
            action: action,
            booking_id: bookingData.booking_id,
            branch_name: branchDetails.name,
            errorCode: error.code,
            credentials_used: hasBranchCredentials ? 'branch-specific' : 'global'
        };
    }
}

// Send booking confirmation email (for new bookings)
async function sendBookingConfirmation(bookingData, clientDetails, branchDetails, servicesDetails) {
    return sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, 'created');
}

// Send booking update email (for updated bookings)
async function sendBookingUpdate(bookingData, clientDetails, branchDetails, servicesDetails) {
    return sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, 'updated');
}

// Send booking completion email
async function sendBookingCompletion(bookingData, clientDetails, branchDetails, servicesDetails) {
    return sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, 'completed');
}

// Send booking cancellation email
async function sendBookingCancellation(bookingData, clientDetails, branchDetails, servicesDetails) {
    return sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, 'cancelled');
}

// Send reminder email
async function sendBookingReminder(bookingData, clientDetails, branchDetails, servicesDetails) {
    return sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, 'reminder');
}

// Send calendar event update email (when calendar event is created/updated)
async function sendCalendarEventUpdate(bookingData, clientDetails, branchDetails, servicesDetails, action = 'created') {
    return sendBookingEmail(bookingData, clientDetails, branchDetails, servicesDetails, `calendar_${action}`);
}

// Get calendar event information for email templates
function getCalendarEventInfo(bookingData) {
    const { calendar_event_id, calendar_event_link } = bookingData;
    
    if (!calendar_event_id) {
        return {
            hasCalendarEvent: false,
            eventId: null,
            eventLink: null,
            calendarSection: '',
            actionUrlParams: ''
        };
    }

    return {
        hasCalendarEvent: true,
        eventId: calendar_event_id,
        eventLink: calendar_event_link,
        actionUrlParams: `?calendar_event_id=${calendar_event_id}`
    };
}

// Export all functions
module.exports = {
    initializeTransporter,
    testConnection,
    generateBookingEmailHTML,
    generateBookingEmailText,
    sendBookingEmail,
    sendBookingConfirmation,
    sendBookingUpdate,
    sendBookingCompletion,
    sendBookingCancellation,
    sendBookingReminder,
    sendCalendarEventUpdate,
    getCalendarEventInfo
}; 