# Booking Calendar API Setup

This document explains how to set up Google Calendar API integration for the booking system.

## Environment Variables Required

Add the following environment variables to your `.env` file:

```env
# Google Calendar API Credentials
GOOGLE_SERVICE_ACCOUNT_TYPE=service_account
GOOGLE_PROJECT_ID=your-google-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
GOOGLE_CLIENT_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com

# Google Calendar ID (optional - defaults to 'primary')
GOOGLE_CALENDAR_ID=primary
```

## Setup Steps

### 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable Google Calendar API
1. In the Google Cloud Console, go to APIs & Services > Library
2. Search for "Google Calendar API"
3. Click on it and enable the API

### 3. Create Service Account
1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details
4. Grant appropriate roles (Calendar Editor or Owner)
5. Create and download the JSON key file

### 4. Extract Credentials
From the downloaded JSON file, extract the following values for your environment variables:
- `type` → `GOOGLE_SERVICE_ACCOUNT_TYPE`
- `project_id` → `GOOGLE_PROJECT_ID`
- `private_key_id` → `GOOGLE_PRIVATE_KEY_ID`
- `private_key` → `GOOGLE_PRIVATE_KEY`
- `client_email` → `GOOGLE_CLIENT_EMAIL`
- `client_id` → `GOOGLE_CLIENT_ID`
- `auth_uri` → `GOOGLE_AUTH_URI`
- `token_uri` → `GOOGLE_TOKEN_URI`
- `auth_provider_x509_cert_url` → `GOOGLE_AUTH_PROVIDER_CERT_URL`
- `client_x509_cert_url` → `GOOGLE_CLIENT_CERT_URL`

### 5. Calendar Access
1. If using a specific calendar (not primary), get the Calendar ID from Google Calendar settings
2. Share the calendar with your service account email address
3. Grant "Make changes to events" permission

## API Endpoints

### Create Booking
```http
POST /api/bookings/createBooking
Content-Type: application/json
Authorization: Bearer your-token

{
  "clientEmail": "client@example.com",
  "title": "Haircut Appointment",
  "description": "Hair styling appointment",
  "startDateTime": "2024-01-15T10:00:00Z",
  "endDateTime": "2024-01-15T11:00:00Z",
  "timeZone": "America/New_York",
  "serviceId": "SV000001",
  "staffEmail": "stylist@salon.com",
  "notes": "Client prefers Bob cut",
  "status": "confirmed",
  "updated_by": "admin@salon.com"
}
```

### Get All Bookings
```http
GET /api/bookings/getBookings
Authorization: Bearer your-token
```

### Get Booking by ID
```http
GET /api/bookings/getBooking/{id}
Authorization: Bearer your-token
```

### Update Booking
```http
PUT /api/bookings/updateBooking/{id}
Content-Type: application/json
Authorization: Bearer your-token

{
  "title": "Updated Appointment",
  "startDateTime": "2024-01-15T14:00:00Z",
  "endDateTime": "2024-01-15T15:00:00Z",
  "updated_by": "admin@salon.com"
}
```

### Delete Booking
```http
DELETE /api/bookings/deleteBooking/{id}
Authorization: Bearer your-token
```

### Get Bookings by Client
```http
GET /api/bookings/getBookingsByClient/{email}
Authorization: Bearer your-token
```

### Get Bookings by Date Range
```http
GET /api/bookings/getBookingsByDateRange?startDate=2024-01-15T00:00:00Z&endDate=2024-01-15T23:59:59Z
Authorization: Bearer your-token
```

### Update Booking Status
```http
PATCH /api/bookings/updateBookingStatus/{id}
Content-Type: application/json
Authorization: Bearer your-token

{
  "status": "completed",
  "updated_by": "admin@salon.com"
}
```

## Booking Data Structure

The booking document in Firestore contains:

```json
{
  "bookingId": "BK000001",
  "clientEmail": "client@example.com",
  "title": "Haircut Appointment",
  "description": "Hair styling appointment",
  "startDateTime": "2024-01-15T10:00:00Z",
  "endDateTime": "2024-01-15T11:00:00Z",
  "timeZone": "America/New_York",
  "serviceId": "SV000001",
  "staffEmail": "stylist@salon.com",
  "notes": "Client prefers Bob cut",
  "status": "confirmed",
  "calendarEventId": "google-calendar-event-id",
  "calendarEventLink": "https://calendar.google.com/event?eid=...",
  "created_at": "2024-01-10T08:00:00Z",
  "updated_at": "2024-01-10T08:00:00Z",
  "updated_by": "admin@salon.com"
}
```

## Status Values

- `confirmed` - Booking is confirmed
- `pending` - Booking is pending confirmation
- `cancelled` - Booking was cancelled
- `completed` - Service was completed
- `no-show` - Client didn't show up

## Error Handling

The API handles various error scenarios:
- Invalid date formats
- Missing required fields
- Calendar API errors
- Firestore connection issues
- Authentication failures

All errors return appropriate HTTP status codes and descriptive error messages.

## Testing

You can test the API using tools like Postman or curl. Make sure to:
1. Set up all required environment variables
2. Verify your service account has Calendar API access
3. Use proper authentication headers
4. Test with valid date formats (ISO 8601)

## Troubleshooting

### Common Issues

1. **Calendar API not enabled**: Enable Google Calendar API in Google Cloud Console
2. **Service account permissions**: Ensure service account has calendar access
3. **Private key format**: Make sure private key includes proper line breaks
4. **Calendar access**: Share calendar with service account email
5. **Date format**: Use ISO 8601 format for all datetime fields 