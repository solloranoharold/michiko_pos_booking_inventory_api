# Google Calendar Integration Setup

This document explains how to set up Google Calendar integration for the booking system.

## Required Environment Variables

Add these environment variables to your `.env` file:

```env
# Google Calendar API Credentials (JSON string)
GOOGLE_CALENDAR_CREDENTIALS={"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

# Google Calendar ID (usually your email address or a specific calendar ID)
GOOGLE_CALENDAR_ID=your-email@gmail.com
```

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API

### 2. Create Service Account

1. In Google Cloud Console, go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Give it a name (e.g., "booking-calendar-bot")
4. Grant "Calendar API Admin" role
5. Create and download the JSON key file

### 3. Share Calendar with Service Account

1. Open Google Calendar
2. Find your calendar in the left sidebar
3. Click the three dots next to it
4. Select "Settings and sharing"
5. Under "Share with specific people", add your service account email
6. Grant "Make changes to events" permission

### 4. Configure Environment

1. Copy the contents of the downloaded JSON key file
2. Add it to your `.env` file as `GOOGLE_CALENDAR_CREDENTIALS`
3. Set `GOOGLE_CALENDAR_ID` to your calendar ID

## Features

The calendar integration includes:

- **Automatic Event Creation**: Creates calendar events for each booking
- **Smart Duration Calculation**: Calculates event duration based on service duration
- **Color Coding**: Different colors for different service types
- **Reminders**: Email and popup reminders (1 day and 1 hour before)
- **Location**: Branch address or name
- **Attendees**: Client email and name
- **Extended Properties**: Links calendar events to booking records

## Service Color Mapping

- **Default**: Blue (1)
- **Hair Services**: Red (2)
- **Nail Services**: Green (3)
- **Facial Services**: Yellow (4)

## Error Handling

- If calendar creation fails, the booking still gets created
- Errors are logged but don't prevent the booking process
- Graceful fallback when credentials are missing

## Rate Limiting

The system includes built-in rate limiting to respect Google Calendar API quotas:
- Maximum 100 requests per second
- Maximum 10,000 requests per 100 seconds
- Automatic retry with exponential backoff
- Configurable delays between requests 