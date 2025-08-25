# Calendar Event Email Integration

This document explains how calendar event information is integrated into booking emails to enable frontend redirection with calendar event context.

## Overview

When a booking is created or updated with Google Calendar integration, the email sent to clients now includes:
- Calendar event ID
- Direct link to view the event in Google Calendar
- Action buttons (Accept/Decline) that include calendar event ID as query parameters

## Email Features

### 1. Calendar Event Section
Each email now displays a dedicated calendar event section when available:
```
📅 Calendar Event
Event ID: [calendar_event_id]
📱 View in Google Calendar
```

### 2. Enhanced Action Buttons
The Accept and Decline buttons now include calendar event ID as query parameters:
- **Accept URL**: `/booking/accept/{booking_id}?calendar_event_id={calendar_event_id}`
- **Decline URL**: `/booking/decline/{booking_id}?calendar_event_id={calendar_event_id}`

### 3. Styling
- Calendar section has a distinct purple theme (`#f3e5f5`)
- Event ID is displayed in a monospace font with special styling
- Google Calendar link is prominently displayed

## Implementation Details

### Email Service Updates
The `emailService.js` has been enhanced to:
- Extract `calendar_event_id` and `calendar_event_link` from booking data
- Include calendar information in both HTML and plain text emails
- Add calendar event ID to action button URLs
- Provide helper methods for calendar event information

### Data Flow
1. **Booking Creation**: When a booking is created, Google Calendar API creates an event
2. **Calendar Data**: The calendar event ID and link are stored in the booking record
3. **Email Generation**: Email templates include calendar information from the booking data
4. **Frontend Integration**: Action buttons include calendar event ID for context

### Frontend Usage
When clients click the Accept/Decline buttons, the frontend receives:
- `booking_id`: The unique booking identifier
- `calendar_event_id`: The Google Calendar event ID (optional)

This allows the frontend to:
- Display relevant calendar information
- Sync with Google Calendar if needed
- Provide better user experience with calendar context

## Testing

### Test Endpoints
1. **Basic Email Test**: `GET /test-email-service?test_email={email}`
2. **Calendar Email Test**: `GET /test-calendar-email?test_email={email}`

### Test Data
The calendar email test includes sample data with:
- Mock calendar event ID
- Sample Google Calendar link
- All necessary booking information

## Environment Variables

Ensure these environment variables are set:
- `FRONTEND_URL`: Base URL for frontend application
- `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS`: Email service credentials

## Example Email Structure

```html
<div class="calendar-info">
    <h3>📅 Calendar Event</h3>
    <p><strong>Event ID:</strong> <span class="calendar-event-id">abc123def456</span></p>
    <p><a href="https://calendar.google.com/event?eid=..." target="_blank">📱 View in Google Calendar</a></p>
</div>

<div class="action-buttons">
    <h3>Please confirm your booking:</h3>
    <a href="http://localhost:3000/booking/accept/123?calendar_event_id=abc123def456">
        ✅ Accept Booking
    </a>
    <a href="http://localhost:3000/booking/decline/123?calendar_event_id=abc123def456">
        ❌ Decline Booking
    </a>
</div>
```

## Benefits

1. **Seamless Integration**: Clients can easily access their calendar events
2. **Frontend Context**: Frontend receives calendar event information for better UX
3. **Professional Appearance**: Emails look more polished with calendar integration
4. **User Experience**: Clients can view and manage their appointments in Google Calendar
5. **Data Consistency**: Calendar event IDs are consistently passed through the system

## Troubleshooting

### Common Issues
1. **Calendar Event Not Showing**: Check if `calendar_event_id` exists in booking data
2. **Email Not Sending**: Verify email service configuration
3. **Calendar Links Broken**: Ensure Google Calendar API is properly configured

### Debug Steps
1. Use test endpoints to verify email functionality
2. Check booking data for calendar event information
3. Verify environment variables are set correctly
4. Test with sample calendar event data

## Future Enhancements

Potential improvements could include:
- Calendar event modification notifications
- Recurring appointment support
- Calendar sync status indicators
- Multiple calendar support (personal + business)
- Calendar event reminders and notifications 