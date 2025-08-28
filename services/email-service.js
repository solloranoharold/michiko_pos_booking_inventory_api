const { google } = require('googleapis');
const admin = require('../firebaseAdmin.js');
const moment = require('moment-timezone');

class EmailService {
    constructor() {
        this.firestore = admin.firestore();
        this.gmail = null;
        this.oauth2Client = null;
        this.isInitialized = false;
    }

    // Initialize Gmail API client
    async initialize() {
        try {
            if (this.isInitialized) {
                return true;
            }

            const scopes = [
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.compose'
            ];

            this.oauth2Client = new google.auth.JWT({
                email: process.env.GOOGLE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
                key: (process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
                scopes,
                subject: process.env.GOOGLE_WORKSPACE_EMAIL 
            });

            await this.oauth2Client.authorize();
            this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
            this.isInitialized = true;

            console.log('Gmail API initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize Gmail API:', error);
            return false;
        }
    }

    // Get all accounts by role and branch
    async getAccountsByRoleAndBranch(branchId = null) {
        try {
            const accounts = [];
            
            // Get master_admin and super_admin (no branch filtering)
            const adminRoles = ['master_admin', 'super_admin'];
            for (const role of adminRoles) {
                const snapshot = await this.firestore.collection('accounts')
                    .where('role', '==', role)
                    .where('status', '==', 'active')
                    .get();
                
                snapshot.forEach(doc => {
                    const accountData = doc.data();
                    if (accountData.email) {
                        accounts.push({
                            id: doc.id,
                            email: accountData.email,
                            role: role,
                            branch_id: accountData.branch_id || null,
                            fullname: accountData.fullname || accountData.name || 'Unknown User',
                            isCalendarShared: accountData.isCalendarShared || false
                        });
                    }
                });
            }

            // Get branch-specific roles
            const branchRoles = ['branch', 'cashier'];
            for (const role of branchRoles) {
                let query = this.firestore.collection('accounts')
                    .where('role', '==', role)
                    .where('status', '==', 'active');
                
                if (branchId) {
                    query = query.where('branch_id', '==', branchId);
                }
                
                const snapshot = await query.get();
                snapshot.forEach(doc => {
                    const accountData = doc.data();
                    if (accountData.email) {
                        accounts.push({
                            id: doc.id,
                            email: accountData.email,
                            role: role,
                            branch_id: accountData.branch_id,
                            fullname: accountData.fullname || accountData.name || 'Unknown User',
                            isCalendarShared: accountData.isCalendarShared || false
                        });
                    }
                });
            }

            return accounts;
        } catch (error) {
            console.error('Error fetching accounts by role and branch:', error);
            return [];
        }
    }

    // Create email content for different notification types
    createEmailContent(type, data) {
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        
        // Get branch name for subject line, fallback to "Michiko POS" if not available
        const branchName = data.branchName || 'Michiko POS';
        
        switch (type) {
            case 'booking_created':
                return {
                    subject: `New Booking - ${branchName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                            <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h2 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">📅 New Booking Notification</h2>
                                
                                <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #27ae60; margin: 0 0 15px 0;">✅ Booking Details</h3>
                                    <p><strong>Booking ID:</strong> ${data.booking_id}</p>
                                    <p><strong>Date:</strong> ${data.date}</p>
                                    <p><strong>Time:</strong> ${data.time}</p>
                                    <p><strong>Status:</strong> <span style="color: #27ae60; font-weight: bold;">${data.status.toUpperCase()}</span></p>
                                </div>

                                <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #1976d2; margin: 0 0 15px 0;">👤 Client Information</h3>
                                    <p><strong>Name:</strong> ${data.clientName}</p>
                                    <p><strong>Email:</strong> ${data.clientEmail}</p>
                                    <p><strong>Phone:</strong> ${data.clientPhone}</p>
                                    ${data.clientAddress ? `<p><strong>Address:</strong> ${data.clientAddress}</p>` : ''}
                                </div>

                                <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #f57c00; margin: 0 0 15px 0;">🏢 Branch Information</h3>
                                    <p><strong>Branch:</strong> ${data.branchName}</p>
                                    <p><strong>Location:</strong> ${data.branchAddress}</p>
                                    <p><strong>Contact:</strong> ${data.branchPhone}</p>
                                </div>

                                ${data.services && data.services.length > 0 ? `
                                <div style="background-color: #f3e5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #7b1fa2; margin: 0 0 15px 0;">💼 Services Booked</h3>
                                    <ul style="margin: 0; padding-left: 20px;">
                                        ${data.services.map(service => `<li>${service.name} (${service.category}) - ₱${service.price.toFixed(2)}</li>`).join('')}
                                    </ul>
                                    <p style="margin-top: 15px; font-weight: bold; color: #7b1fa2;">
                                        Total Cost: ₱${data.totalCost.toFixed(2)}
                                    </p>
                                </div>
                                ` : ''}

                                ${data.notes ? `
                                <div style="background-color: #fce4ec; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #c2185b; margin: 0 0 15px 0;">📝 Notes</h3>
                                    <p style="margin: 0;">${data.notes}</p>
                                </div>
                                ` : ''}

                                <div style="text-align: center; margin-top: 30px;">
                                    <a href="https://calendar.google.com/calendar/u/0/r" 
                                       style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                        View Google Calendar
                                    </a>
                                </div>

                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #7f8c8d; font-size: 12px;">
                                    <p>This is an automated notification from the Michiko POS Booking System.</p>
                                    <p>Sent on ${moment.tz('Asia/Manila').format('MMMM DD, YYYY [at] h:mm A')}</p>
                                </div>
                            </div>
                        </div>
                    `
                };

            case 'booking_updated':
                return {
                    subject: `Booking Updated - ${branchName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                            <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h2 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">📝 Booking Update Notification</h2>
                                
                                <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #f57c00; margin: 0 0 15px 0;">🔄 Update Summary</h3>
                                    <p><strong>Booking ID:</strong> ${data.booking_id}</p>
                                    <p><strong>Updated:</strong> ${data.updated_at}</p>
                                    <p><strong>Current Status:</strong> <span style="color: #27ae60; font-weight: bold;">${data.status.toUpperCase()}</span></p>
                                </div>

                                <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #1976d2; margin: 0 0 15px 0;">👤 Client Information</h3>
                                    <p><strong>Name:</strong> ${data.clientName}</p>
                                    <p><strong>Email:</strong> ${data.clientEmail}</p>
                                    <p><strong>Phone:</strong> ${data.clientPhone}</p>
                                    ${data.clientAddress ? `<p><strong>Address:</strong> ${data.clientAddress}</p>` : ''}
                                </div>

                                <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #f57c00; margin: 0 0 15px 0;">🏢 Branch Information</h3>
                                    <p><strong>Branch:</strong> ${data.branchName}</p>
                                    <p><strong>Location:</strong> ${data.branchAddress}</p>
                                    <p><strong>Contact:</strong> ${data.branchPhone}</p>
                                </div>

                                ${data.services && data.services.length > 0 ? `
                                <div style="background-color: #f3e5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #7b1fa2; margin: 0 0 15px 0;">💼 Services Booked</h3>
                                    <ul style="margin: 0; padding-left: 20px;">
                                        ${data.services.map(service => `<li>${service.name} (${service.category}) - ₱${service.price.toFixed(2)}</li>`).join('')}
                                    </ul>
                                    <p style="margin-top: 15px; font-weight: bold; color: #7f8c8d; font-size: 12px;">
                                        Total Cost: ₱${data.totalCost.toFixed(2)}
                                    </p>
                                </div>
                                ` : ''}

                                ${data.notes ? `
                                <div style="background-color: #fce4ec; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #c2185b; margin: 0 0 15px 0;">📝 Notes</h3>
                                    <p style="margin: 0;">${data.notes}</p>
                                </div>
                                ` : ''}

                                <div style="text-align: center; margin-top: 30px;">
                                    <a href="${baseUrl}/bookings/${data.booking_id}" 
                                       style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                        View Updated Booking
                                    </a>
                                </div>

                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #7f8c8d; font-size: 12px;">
                                    <p>This is an automated notification from the Michiko POS Booking System.</p>
                                    <p>Sent on ${moment.tz('Asia/Manila').format('MMMM DD, YYYY [at] h:mm A')}</p>
                                </div>
                            </div>
                        </div>
                    `
                };

            case 'booking_status_changed':
                return {
                    subject: `🔄 Status Changed - ${branchName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                            <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                                <h2 style="color: #2c3e50; text-align: center; margin-bottom: 30px;">🔄 Status Change Notification</h2>
                                
                                <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #f57c00; margin: 0 0 15px 0;">📊 Status Update</h3>
                                    <p><strong>Booking ID:</strong> ${data.booking_id}</p>
                                    <p><strong>Previous Status:</strong> <span style="color: #e74c3c; font-weight: bold;">${data.previousStatus.toUpperCase()}</span></p>
                                    <p><strong>New Status:</strong> <span style="color: #27ae60; font-weight: bold;">${data.status.toUpperCase()}</span></p>
                                    <p><strong>Changed:</strong> ${data.updated_at}</p>
                                </div>

                                <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #1976d2; margin: 0 0 15px 0;">👤 Client Information</h3>
                                    <p><strong>Name:</strong> ${data.clientName}</p>
                                    <p><strong>Email:</strong> ${data.clientEmail}</p>
                                    <p><strong>Phone:</strong> ${data.clientPhone}</p>
                                    ${data.clientAddress ? `<p><strong>Address:</strong> ${data.clientAddress}</p>` : ''}
                                </div>

                                <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #f57c00; margin: 0 0 15px 0;">🏢 Branch Information</h3>
                                    <p><strong>Branch:</strong> ${data.branchName}</p>
                                    <p><strong>Location:</strong> ${data.branchAddress}</p>
                                    <p><strong>Contact:</strong> ${data.branchPhone}</p>
                                </div>

                                ${data.services && data.services.length > 0 ? `
                                <div style="background-color: #f3e5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #7b1fa2; margin: 0 0 15px 0;">💼 Services Booked</h3>
                                    <ul style="margin: 0; padding-left: 20px;">
                                        ${data.services.map(service => `<li>${service.name} (${service.category}) - ₱${service.price.toFixed(2)}</li>`).join('')}
                                    </ul>
                                    <p style="margin-top: 15px; font-weight: bold; color: #7b1fa2;">
                                        Total Cost: ₱${data.totalCost.toFixed(2)}
                                    </p>
                                </div>
                                ` : ''}

                                ${data.notes ? `
                                <div style="background-color: #fce4ec; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                    <h3 style="color: #c2185b; margin: 0 0 15px 0;">📝 Notes</h3>
                                    <p style="margin: 0;">${data.notes}</p>
                                </div>
                                ` : ''}

                                <div style="text-align: center; margin-top: 30px;">
                                    <a href="https://calendar.google.com/calendar/u/0/r" 
                                       style="background-color: #3498db; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                        View Google Calendar
                                    </a>
                                </div>

                                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #7f8c8d; font-size: 12px;">
                                    <p>This is an automated notification from the Michiko POS Booking System.</p>
                                    <p>Sent on ${moment.tz('Asia/Manila').format('MMMM DD, YYYY [at] h:mm A')}</p>
                                </div>
                            </div>
                        </div>
                    `
                };

            default:
                return {
                    subject: `Notification from ${branchName}`,
                    html: '<p>You have a new notification.</p>'
                };
        }
    }

    // Send email using Gmail API
    async sendEmail(to, subject, htmlContent, branchName = 'Michiko POS', branchEmail = null) {
        try {
            if (!this.isInitialized) {
                const initialized = await this.initialize();
                if (!initialized) {
                    throw new Error('Gmail API not initialized');
                }
            }

            // Use provided google workspace email or fallback to default
            const fromEmail =  process.env.GOOGLE_WORKSPACE_EMAIL  || branchEmail ;

            // Create email message
            const emailLines = [
                `To: ${to}`,
                `From: ${branchName} <${fromEmail}>`,
                'Content-Type: text/html; charset=utf-8',
                'MIME-Version: 1.0',
                `Subject: ${subject}`,
                '',
                htmlContent
            ];

            const email = emailLines.join('\r\n').trim();
            const base64Email = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

            // Send email
            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: base64Email
                }
            });

            console.log(`Email sent successfully to ${to}:`, response.data.id);
            return {
                success: true,
                messageId: response.data.id,
                to: to
            };

        } catch (error) {
            console.error(`Failed to send email to ${to}:`, error);
            return {
                success: false,
                error: error.message,
                to: to
            };
        }
    }

    // Send notification emails to all relevant accounts
    async sendNotificationEmails(type, data, branchId = null) {
        try {
            console.log(`Sending ${type} notification emails for branch: ${branchId || 'all branches'}`);
            
            // Get accounts based on role and branch
            const accounts = await this.getAccountsByRoleAndBranch(branchId);
            
            if (accounts.length === 0) {
                console.log('No accounts found to send notifications to');
                return {
                    success: false,
                    message: 'No accounts found',
                    emails_sent: 0,
                    total_accounts: 0
                };
            }

            console.log(`Found ${accounts.length} accounts to notify`);

            // Create email content
            const emailContent = this.createEmailContent(type, data);
            
            // Send emails to all accounts
            const emailPromises = accounts.map(account => 
                this.sendEmail(account.email, emailContent.subject, emailContent.html, data.branchName || 'Michiko POS', data.branchEmail)
            );

            const results = await Promise.all(emailPromises);
            
            // Analyze results
            const successfulEmails = results.filter(r => r.success);
            const failedEmails = results.filter(r => !r.success);
            
            // Group results by role
            const resultsByRole = {};
            accounts.forEach((account, index) => {
                const result = results[index];
                if (!resultsByRole[account.role]) {
                    resultsByRole[account.role] = { total: 0, successful: 0, failed: 0, emails: [] };
                }
                
                resultsByRole[account.role].total++;
                if (result.success) {
                    resultsByRole[account.role].successful++;
                    resultsByRole[account.role].emails.push(account.email);
                } else {
                    resultsByRole[account.role].failed++;
                }
            });

            console.log(`Email notification results for ${type}:`);
            console.log(`- Total accounts: ${accounts.length}`);
            console.log(`- Successful emails: ${successfulEmails.length}`);
            console.log(`- Failed emails: ${failedEmails.length}`);
            
            Object.keys(resultsByRole).forEach(role => {
                const roleData = resultsByRole[role];
                console.log(`- ${role}: ${roleData.successful}/${roleData.total} successful`);
            });

            return {
                success: successfulEmails.length > 0,
                message: `Sent ${successfulEmails.length} out of ${accounts.length} emails`,
                emails_sent: successfulEmails.length,
                total_accounts: accounts.length,
                failed_emails: failedEmails.length,
                results_by_role: resultsByRole,
                failed_details: failedEmails,
                notification_type: type,
                branch_id: branchId
            };

        } catch (error) {
            console.error(`Error sending notification emails for ${type}:`, error);
            return {
                success: false,
                error: error.message,
                emails_sent: 0,
                total_accounts: 0
            };
        }
    }

    // Send booking created notification
    async sendBookingCreatedNotification(bookingData, clientDetails, branchDetails, servicesDetails) {
        const emailData = {
            booking_id: bookingData.booking_id,
            date: bookingData.date,
            time: bookingData.time,
            status: bookingData.status,
            notes: bookingData.notes || '',
            clientName: clientDetails.name,
            clientEmail: clientDetails.email,
            clientPhone: clientDetails.phone,
            clientAddress: clientDetails.address,
            branchName: branchDetails.name,
            branchAddress: branchDetails.address,
            branchPhone: branchDetails.phone,
            branchEmail: branchDetails.email,
            services: servicesDetails.services,
            totalCost: servicesDetails.totalCost,
            created_at: bookingData.created_at
        };

        return await this.sendNotificationEmails('booking_created', emailData, bookingData.branch_id);
    }

    // Send booking updated notification
    async sendBookingUpdatedNotification(bookingData, clientDetails, branchDetails, servicesDetails, previousData = null) {
        const emailData = {
            booking_id: bookingData.booking_id,
            date: bookingData.date,
            time: bookingData.time,
            status: bookingData.status,
            notes: bookingData.notes || '',
            clientName: clientDetails.name,
            clientEmail: clientDetails.email,
            clientPhone: clientDetails.phone,
            clientAddress: clientDetails.address,
            branchName: branchDetails.name,
            branchAddress: branchDetails.address,
            branchPhone: branchDetails.phone,
            branchEmail: branchDetails.email,
            services: servicesDetails.services,
            totalCost: servicesDetails.totalCost,
            updated_at: bookingData.updated_at,
            previousData: previousData
        };

        return await this.sendNotificationEmails('booking_updated', emailData, bookingData.branch_id);
    }

    // Send booking status changed notification
    async sendBookingStatusChangedNotification(bookingData, clientDetails, branchDetails, servicesDetails, previousStatus) {
        const emailData = {
            booking_id: bookingData.booking_id,
            date: bookingData.date,
            time: bookingData.time,
            status: bookingData.status,
            previousStatus: previousStatus,
            notes: bookingData.notes || '',
            clientName: clientDetails.name,
            clientEmail: clientDetails.email,
            clientPhone: clientDetails.phone,
            clientAddress: clientDetails.address,
            branchName: branchDetails.name,
            branchAddress: branchDetails.address,
            branchPhone: branchDetails.phone,
            branchEmail: branchDetails.email,
            services: servicesDetails.services,
            totalCost: servicesDetails.totalCost,
            updated_at: bookingData.updated_at
        };

        return await this.sendNotificationEmails('booking_status_changed', emailData, bookingData.branch_id);
    }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = { emailService, EmailService }; 