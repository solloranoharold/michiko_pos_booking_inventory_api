# Email Service for Booking System

This document describes the email service integration for the Michiko POS Booking API, which automatically sends confirmation and update emails to clients when bookings are created or modified.

## Features

- **Automatic Email Sending**: Emails are sent automatically when bookings are created or updated
- **Professional HTML Templates**: Beautiful, responsive email templates with booking details
- **Accept/Decline Buttons**: Clients can accept or decline bookings directly from the email
- **Multiple Email Types**: Support for confirmation, update, cancellation, and reminder emails
- **Error Handling**: Graceful fallback when email service is unavailable
- **Environment-Based Configuration**: Easy configuration through environment variables

## Email Types

### 1. Booking Confirmation Email
- Sent when a new booking is created
- Includes accept/decline buttons
- Contains all booking details and service information

### 2. Booking Update Email
- Sent when an existing booking is modified
- Shows updated booking information
- No action buttons (informational only)

### 3. Booking Cancellation Email
- Sent when a booking is cancelled
- Informs client of cancellation

### 4. Booking Reminder Email
- Can be sent as a reminder before the appointment
- Includes booking details and contact information

## Setup and Configuration

### 1. Install Dependencies

```bash
npm install nodemailer
```

### 2. Environment Variables

Add the following environment variables to your `.env` file:

```env
# Email Server Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL for Accept/Decline Links
FRONTEND_URL=https://your-frontend-domain.com
```

### 3. Email Provider Examples

#### Gmail (Recommended for Development)
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-gmail@gmail.com
EMAIL_PASS=your-app-password
```

#### Outlook/Hotmail
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

#### Custom SMTP Server
```env
EMAIL_HOST=mail.yourdomain.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=your-password
```

### 4. Gmail App Password Setup

If using Gmail, you'll need to create an App Password:

1. Go to your Google Account settings
2. Navigate to Security > 2-Step Verification
3. Create an App Password for "Mail"
4. Use the generated password in your EMAIL_PASS variable

## Usage

### Automatic Email Sending

The email service is automatically integrated into the booking endpoints:

#### Create Booking (`POST /createBookingperBranch`)
- Sends confirmation email after successful calendar event creation
- Includes accept/decline buttons for client response

#### Update Booking (`PUT /updateBooking/:booking_id`)
- Sends update email after successful calendar event update
- Informational email (no action buttons)

### Manual Email Sending

You can also send emails manually using the email service:

```javascript
const emailService = require('./service/emailService');

// Send confirmation email
const result = await emailService.sendBookingConfirmation(
    bookingData,
    clientDetails,
    branchDetails,
    servicesDetails
);

// Send update email
const result = await emailService.sendBookingUpdate(
    bookingData,
    clientDetails,
    branchDetails,
    servicesDetails
);

// Send cancellation email
const result = await emailService.sendBookingCancellation(
    bookingData,
    clientDetails,
    branchDetails,
    servicesDetails
);
```

## Email Templates

### HTML Template Features
- Responsive design for mobile and desktop
- Professional styling with brand colors
- Clear booking information display
- Service details with pricing
- Branch contact information
- Action buttons for new bookings
- Status badges with color coding

### Plain Text Fallback
- Text-only version for email clients that don't support HTML
- All essential information included
- Clear formatting for readability

## Testing

### Test Email Service Endpoint

Use the test endpoint to verify email configuration:

```bash
GET /test-email-service?test_email=your-email@example.com
```

This endpoint will:
- Test email server connection
- Send a test email to the specified address
- Return detailed configuration information
- Show environment variable status

### Test Response Example

```json
{
  "message": "Email service test completed",
  "connection_test": {
    "success": true,
    "message": "Email connection verified successfully"
  },
  "email_result": {
    "success": true,
    "messageId": "test-message-id",
    "recipient": "test@example.com",
    "action": "created",
    "booking_id": "test-booking-123"
  },
  "environment_check": {
    "has_email_host": true,
    "has_email_user": true,
    "has_email_pass": true,
    "has_email_port": true,
    "has_email_secure": true,
    "has_frontend_url": true
  }
}
```

## Error Handling

The email service includes comprehensive error handling:

- **Missing Credentials**: Service gracefully disables when email credentials are missing
- **Connection Failures**: Detailed error messages for troubleshooting
- **Send Failures**: Individual email failures don't affect booking operations
- **Fallback Support**: System continues to work even when email service is unavailable

## Frontend Integration

### Accept/Decline Links

The email service generates links for clients to accept or decline bookings:

```
Accept: {FRONTEND_URL}/booking/accept/{booking_id}
Decline: {FRONTEND_URL}/booking/decline/{booking_id}
```

### Frontend Routes

Your frontend should implement these routes to handle client responses:

- `/booking/accept/{booking_id}` - Handle booking acceptance
- `/booking/decline/{booking_id}` - Handle booking decline

## Security Considerations

- **App Passwords**: Use app-specific passwords instead of account passwords
- **Environment Variables**: Never commit email credentials to version control
- **Rate Limiting**: Consider implementing rate limiting for email sending
- **Validation**: Always validate email addresses before sending

## Troubleshooting

### Common Issues

1. **"Email transporter not initialized"**
   - Check environment variables are set correctly
   - Verify email server credentials

2. **"Authentication failed"**
   - Verify username and password
   - Check if app password is required (Gmail)
   - Ensure 2FA is properly configured

3. **"Connection timeout"**
   - Check firewall settings
   - Verify email server is accessible
   - Check network connectivity

4. **"Email not received"**
   - Check spam/junk folder
   - Verify recipient email address
   - Check email server logs

### Debug Mode

Enable detailed logging by checking the console output for:
- Email service initialization messages
- Connection test results
- Email sending confirmations
- Error details and stack traces

## Performance Considerations

- **Async Processing**: Email sending is asynchronous and doesn't block booking operations
- **Connection Pooling**: Nodemailer handles connection management efficiently
- **Error Recovery**: Failed emails don't affect system performance
- **Template Caching**: Email templates are generated on-demand

## Future Enhancements

Potential improvements for the email service:

- **Email Templates**: Customizable email templates per branch
- **Scheduling**: Delayed email sending for reminders
- **Attachments**: Include PDF confirmations or receipts
- **Multi-language**: Support for multiple languages
- **Analytics**: Track email open rates and client responses
- **Queue System**: Background job processing for high-volume sending

## Support

For issues with the email service:

1. Check the console logs for error messages
2. Use the test endpoint to verify configuration
3. Verify environment variables are set correctly
4. Test email server connectivity manually
5. Check email provider documentation for specific requirements 