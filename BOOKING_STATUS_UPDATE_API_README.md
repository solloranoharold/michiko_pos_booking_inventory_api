# Booking Status Update API

This document describes the new API endpoint for updating booking status without authorization, designed for client actions from email links.

## Endpoint

```
PUT /updateBookingStatus/:booking_id
```

## Description

This endpoint allows clients to update their booking status directly from email links without requiring authentication. It's designed to work with the Accept/Decline buttons in booking confirmation emails.

## Features

- **No Authorization Required**: Can be called directly from email links
- **Status Validation**: Ensures only valid status values are accepted
- **Calendar Integration**: Updates Google Calendar events with new status
- **Email Notifications**: Sends appropriate notification emails based on status
- **Audit Trail**: Tracks status changes with timestamps

## Request

### URL Parameters
- `booking_id` (string, required): The unique identifier of the booking

### Request Body
```json
{
  "status": "confirmed",
  "notes": "Optional additional notes"
}
```

### Status Values
- `scheduled` - Initial booking status
- `confirmed` - Client has confirmed the booking
- `pending` - Awaiting confirmation
- `cancelled` - Booking has been cancelled
- `completed` - Service has been completed
- `no-show` - Client didn't show up
- `rescheduled` - Booking has been rescheduled

## Response

### Success Response (200)
```json
{
  "message": "Booking status updated successfully from pending to confirmed",
  "booking": {
    "id": "booking_123",
    "booking_id": "BK001",
    "client_id": "client_456",
    "branch_id": "branch_789",
    "date": "2024-01-15",
    "time": "14:00:00",
    "status": "confirmed",
    "notes": "Client confirmed via email",
    "updated_at": "2024-01-15 10:30:00",
    "previous_status": "pending",
    "background_color": "#E8F5E8"
  },
  "calendar_update": {
    "success": true,
    "calendar_event_id": "event_123",
    "calendar_event_link": "https://calendar.google.com/...",
    "updated_at": "2024-01-15 10:30:00",
    "previous_status": "pending",
    "new_status": "confirmed"
  },
  "email_sent": true,
  "email_details": {
    "success": true,
    "messageId": "msg_123",
    "recipient": "client@example.com"
  }
}
```

### Error Responses

#### 400 Bad Request - Missing Status
```json
{
  "error": "status is required in request body"
}
```

#### 400 Bad Request - Invalid Status
```json
{
  "error": "Invalid status value",
  "valid_statuses": ["scheduled", "confirmed", "pending", "cancelled", "completed", "no-show", "rescheduled"],
  "received_status": "invalid_status"
}
```

#### 404 Not Found
```json
{
  "error": "Booking not found"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to update booking status"
}
```

## Email Integration

### Status-Based Email Types
- **confirmed** → Confirmation email
- **cancelled** → Cancellation email  
- **completed** → Completion email
- **rescheduled** → Reschedule notification
- **other statuses** → General update email

### Email Content
All emails include:
- Updated booking details
- Calendar event information (if available)
- Previous and new status
- Branch and service information
- Action buttons with calendar event context

## Calendar Integration

### What Gets Updated
- Event description with new status
- Event color based on status
- Extended properties with status history
- Event summary and details

### Calendar Event Properties
- `bookingStatus`: Current booking status
- `previousStatus`: Previous status before update
- `lastUpdated`: Timestamp of last update

## Usage Examples

### Frontend Integration
```javascript
// Update booking status when client clicks Accept button
const updateStatus = async (bookingId, status) => {
  try {
    const response = await fetch(`/api/updateBookingStatus/${bookingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('Status updated:', result.message);
      // Handle success (e.g., show confirmation message)
    } else {
      console.error('Error:', result.error);
      // Handle error
    }
  } catch (error) {
    console.error('Network error:', error);
  }
};

// Usage
updateStatus('booking_123', 'confirmed');
```

### Email Link Integration
```html
<!-- Accept button in email -->
<a href="https://yourapp.com/booking/accept/123?calendar_event_id=event_456">
  ✅ Accept Booking
</a>

<!-- Decline button in email -->
<a href="https://yourapp.com/booking/decline/123?calendar_event_id=event_456">
  ❌ Decline Booking
</a>
```

## Security Considerations

### No Authentication Required
- This endpoint is designed for client use from email links
- Consider implementing rate limiting for production use
- Monitor for potential abuse patterns

### Input Validation
- Status values are strictly validated
- Booking ID format is validated
- Notes are sanitized before storage

### Audit Trail
- All status changes are logged with timestamps
- Previous status is preserved for reference
- Calendar events maintain update history

## Error Handling

### Graceful Degradation
- If calendar update fails, booking status still updates
- If email fails, status update still completes
- Partial failures are reported in response

### Logging
- All operations are logged for debugging
- Calendar API errors are captured
- Email service errors are tracked

## Testing

### Test Scenarios
1. **Valid Status Update**: Change from 'pending' to 'confirmed'
2. **Invalid Status**: Try to set invalid status value
3. **Non-existent Booking**: Update status for invalid booking ID
4. **Calendar Integration**: Verify calendar event updates
5. **Email Notifications**: Check email delivery for different statuses

### Test Data
Use the existing test endpoints:
- `/test-email-service` - Basic email testing
- `/test-calendar-email` - Calendar integration testing

## Dependencies

- **Google Calendar API**: For calendar event updates
- **Email Service**: For notification emails
- **Firestore**: For booking data storage
- **Moment.js**: For date/time handling

## Future Enhancements

- **Webhook Support**: Notify external systems of status changes
- **SMS Notifications**: Send status updates via SMS
- **Status Workflow**: Implement status transition rules
- **Bulk Updates**: Support updating multiple bookings at once
- **Status Templates**: Customizable email templates per status 