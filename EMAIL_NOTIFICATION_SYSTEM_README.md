# Email Notification System for Michiko POS Booking API

## Overview

The Email Notification System integrates with the Michiko POS Booking API to automatically send email notifications to all relevant user accounts when booking events occur. The system uses Gmail API to send professional, HTML-formatted emails to different user roles based on their permissions and branch assignments.

## Features

### 🎯 **Role-Based Notifications**
- **master_admin**: Receives notifications for all branches
- **super_admin**: Receives notifications for all branches  
- **branch**: Receives notifications only for their assigned branch
- **cashier**: Receives notifications only for their assigned branch

### 📧 **Notification Types**
1. **Booking Created** (`booking_created`)
   - Sent when a new booking is created via `createBookingperBranch`
   - Includes complete booking details, client info, and service information

2. **Booking Updated** (`booking_updated`)
   - Sent when a booking is modified via `updateBooking`
   - Shows updated information and previous data

3. **Booking Status Changed** (`booking_status_changed`)
   - Sent when booking status changes via `updateBookingStatus`
   - Highlights the status change and new status

### 🎨 **Professional Email Design**
- HTML-formatted emails with responsive design
- Color-coded sections for different types of information
- Professional styling with Michiko POS branding
- Mobile-friendly layout
- **Branch-specific email subjects** for easy identification

### 🌐 **Branch-Specific Targeting**
- Notifications are automatically filtered by branch
- Users only receive notifications relevant to their assigned branch
- Master and super admins receive notifications for all branches

## Setup Requirements

### 1. **Google Cloud Console Setup**
```bash
# Enable Gmail API in Google Cloud Console
# Go to: https://console.cloud.google.com/apis/library/gmail.googleapis.com
# Click "Enable"
```

### 2. **Service Account Configuration**
```bash
# Ensure your service account has Gmail API access
# Add the following scopes to your service account:
# - https://www.googleapis.com/auth/gmail.send
# - https://www.googleapis.com/auth/gmail.compose
```

### 3. **Environment Variables**
```bash
# Add these to your .env file
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FRONTEND_URL=https://your-frontend-domain.com  # Optional, for email links
```

### 4. **Install Dependencies**
```bash
npm install googleapis
```

## API Integration

### **Automatic Notifications**

The email system is automatically integrated into the following booking routes:

#### 1. **POST /createBookingperBranch**
```javascript
// Automatically sends 'booking_created' notifications
// to all relevant accounts based on branch and roles
```

#### 2. **PUT /updateBooking/:booking_id**
```javascript
// Automatically sends 'booking_updated' notifications
// to all relevant accounts based on branch and roles
```

#### 3. **PUT /updateBookingStatus/:booking_id**
```javascript
// Automatically sends 'booking_status_changed' notifications
// to all relevant accounts based on branch and roles
```

### **Manual Notification Endpoints**

#### 1. **Test Email Service**
```http
GET /test-email-service?branch_id=123&email_type=booking_created
```
**Purpose**: Test the email service with sample data
**Parameters**:
- `branch_id` (optional): Test with specific branch
- `email_type`: Type of notification to test

#### 2. **Send Manual Notifications**
```http
POST /send-email-notifications
Content-Type: application/json

{
  "notification_type": "booking_created",
  "booking_data": { /* booking object */ },
  "client_details": { /* client object */ },
  "branch_details": { /* branch object */ },
  "services_details": { /* services object */ },
  "branch_id": "123",
  "custom_message": "Optional custom message"
}
```

#### 3. **Check Email Service Status**
```http
GET /email-service-status
```
**Purpose**: Verify email service configuration and account access

## Email Content Structure

### **Booking Created Email**
```
📧 Subject: 🆕 New Booking - [Branch Name]
📅 New Booking Notification
✅ Booking Details
   - Booking ID, Date, Time, Status
👤 Client Information
   - Name, Email, Phone, Address
🏢 Branch Information
   - Branch Name, Location, Contact
💼 Services Booked
   - Service list with prices
💰 Total Cost
📝 Notes (if any)
[View Booking Details Button]
```

### **Booking Updated Email**
```
📧 Subject: 🔄 Booking Updated - [Branch Name]
📝 Booking Update Notification
🔄 Update Summary
   - Booking ID, Updated time, Current status
👤 Client Information
🏢 Branch Information
💼 Services Booked
📝 Notes
[View Updated Booking Button]
```

### **Status Changed Email**
```
📧 Subject: 🔄 Status Changed - [Branch Name]
🔄 Status Change Notification
📊 Status Update
   - Previous Status → New Status
👤 Client Information
🏢 Branch Information
💼 Services Booked
📝 Notes
[View Booking Details Button]
```

## Configuration Options

### **Email Templates**
- Templates are defined in `email-service.js`
- Easy to customize colors, styling, and content
- Support for dynamic data injection

### **Notification Rules**
- Role-based filtering is automatic
- Branch-specific targeting is automatic
- No manual configuration required

### **Rate Limiting**
- Gmail API has built-in rate limits
- System handles API quotas gracefully
- Failed emails are logged for debugging

## Error Handling

### **Common Issues**
1. **Gmail API Not Enabled**
   - Error: "Gmail API not enabled"
   - Solution: Enable Gmail API in Google Cloud Console

2. **Invalid Credentials**
   - Error: "Authentication failed"
   - Solution: Verify service account credentials

3. **API Quota Exceeded**
   - Error: "Quota exceeded"
   - Solution: Wait for quota reset or upgrade plan

### **Fallback Behavior**
- If email sending fails, the main API operation continues
- Email errors are logged but don't break the booking process
- Failed email attempts are included in API responses

## Testing

### **1. Test Email Service**
```bash
curl "http://localhost:3000/api/bookings/test-email-service?branch_id=123"
```

### **2. Test with Sample Data**
```bash
curl -X POST "http://localhost:3000/api/bookings/send-email-notifications" \
  -H "Content-Type: application/json" \
  -d '{
    "notification_type": "booking_created",
    "booking_data": {
      "booking_id": "TEST-123",
      "date": "2024-01-15",
      "time": "14:00:00",
      "status": "scheduled"
    },
    "client_details": {
      "name": "Test Client",
      "email": "test@example.com"
    },
    "branch_details": {
      "name": "Test Branch"
    },
    "services_details": {
      "services": [],
      "totalCost": 0
    }
  }'
```

### **3. Check Service Status**
```bash
curl "http://localhost:3000/api/bookings/email-service-status"
```

## Monitoring and Debugging

### **Logs to Watch**
```javascript
// Email service initialization
console.log('Gmail API initialized successfully');

// Account discovery
console.log(`Found ${accounts.length} accounts to notify`);

// Email sending results
console.log(`Email notifications sent successfully:`, emailNotificationResult);

// Failed emails
console.error(`Failed to send email to ${email}:`, error);
```

### **Response Fields**
```javascript
{
  "email_notifications": {
    "success": true,
    "emails_sent": 5,
    "total_accounts": 5,
    "failed_emails": 0,
    "results_by_role": {
      "master_admin": { "total": 2, "successful": 2, "failed": 0 },
      "branch": { "total": 3, "successful": 3, "failed": 0 }
    }
  }
}
```

## Security Considerations

### **Email Content**
- No sensitive information in email content
- Booking IDs are used instead of internal IDs
- Client contact information is included for operational purposes

### **Access Control**
- Only authorized users receive notifications
- Branch-specific filtering prevents information leakage
- Role-based access ensures appropriate notification levels

### **API Security**
- Email service uses service account authentication
- No user credentials stored or transmitted
- Secure Gmail API integration

## Performance Optimization

### **Batch Processing**
- Multiple emails sent concurrently using Promise.all
- Efficient account filtering by role and branch
- Minimal database queries for account information

### **Caching**
- Service account authentication is cached
- Account information is fetched once per notification
- Gmail API client is reused for multiple emails

### **Error Recovery**
- Failed emails don't block successful ones
- Individual email failures are logged separately
- System continues operation even if some emails fail

## Troubleshooting

### **Email Not Received**
1. Check Gmail API is enabled
2. Verify service account has Gmail permissions
3. Check email service logs for errors
4. Verify account email addresses are correct

### **Service Not Initializing**
1. Check environment variables
2. Verify Google service account credentials
3. Ensure Gmail API is enabled
4. Check network connectivity to Google APIs

### **Partial Email Delivery**
1. Check Gmail API quotas
2. Review failed email logs
3. Verify recipient email addresses
4. Check for Gmail API rate limiting

## Support and Maintenance

### **Regular Checks**
- Monitor Gmail API quotas
- Check email delivery success rates
- Review failed email logs
- Verify service account permissions

### **Updates**
- Email templates can be updated without code changes
- New notification types can be added easily
- Role-based rules are configurable
- Branch filtering is automatic

### **Backup Plans**
- System continues operation if email fails
- Failed notifications are logged for manual review
- Alternative notification methods can be added
- Graceful degradation ensures system reliability

---

## Quick Start Checklist

- [ ] Enable Gmail API in Google Cloud Console
- [ ] Configure service account with Gmail permissions
- [ ] Set environment variables
- [ ] Install googleapis dependency
- [ ] Test email service with `/test-email-service`
- [ ] Verify automatic notifications in booking routes
- [ ] Monitor email delivery success rates
- [ ] Configure frontend URL for email links (optional)

The email notification system is now fully integrated and will automatically send professional notifications to all relevant users whenever booking events occur in your Michiko POS system. 