# Michiko POS Booking API

A Node.js API for CRUD operations on clients and accounts using Firestore.

## Firestore Collections

### 1. `accounts` Collection
Stores user account information for staff and administrators.

**Document Structure:**
```json
{
  "email": "user@example.com",
  "status": "active",
  "position": "staff",
  "doc_type": "ACCOUNTS",
  "date_created": "2024-01-01T00:00:00.000Z",
  "signIn": null,
  "signOut": null
}
```

**API Endpoints:**
- `POST /accounts/insertAccount` - Create a new account
- `GET /accounts/getAllAccounts` - Get all accounts
- `GET /accounts/getAccountByEmail/:email` - Get account by email
- `PUT /accounts/updateAccount/:email` - Update account by email
- `DELETE /accounts/deleteAccount/:email` - Delete account by email

### 2. `clients` Collection
Stores customer/client information.

**Document Structure:**
```json
{
  "fullname": "John Doe",
  "contactNo": "+1234567890",
  "address": "123 Main St",
  "email": "john@example.com",
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "status": "active",
  "doc_type": "CLIENTS"
}
```

**API Endpoints:**
- `POST /clients/insertClient` - Create a new client
- `GET /clients/getAllClients` - Get all clients
- `GET /clients/getEmailClient/:email` - Get client by email
- `PUT /clients/updateClient/:email` - Update client by email
- `DELETE /clients/deleteClient/:email` - Delete client by email

## Suggested Additional Collections

### 3. `bookings` Collection (Recommended)
For storing booking/appointment information with Google Calendar integration and color-coded statuses.

**Features:**
- **Google Calendar Integration**: Automatic calendar event creation and updates
- **Color-Coded Statuses**: Visual distinction of booking statuses in calendar
- **Branch-Specific Calendars**: Dedicated calendars for each branch
- **Real-time Updates**: Calendar events update automatically when booking status changes

**Calendar Background Color System:**
The system automatically assigns **full background colors** to calendar events based on booking status:

| Status | Background Color | Description |
|--------|------------------|-------------|
| `scheduled` | Light Blue | New appointments |
| `confirmed` | Light Green | Confirmed appointments |
| `pending` | Light Orange | Awaiting confirmation |
| `cancelled` | Light Red | Cancelled appointments |
| `completed` | Light Purple | Completed services |
| `no-show` | Light Gray | Missed appointments |
| `rescheduled` | Light Cyan | Changed appointments |

**Document Structure:**

**Document Structure:**
```json
{
  "bookingId": "unique_booking_id",
  "clientEmail": "client@example.com",
  "staffEmail": "staff@example.com",
  "serviceType": "haircut",
  "bookingDate": "2024-01-15",
  "bookingTime": "14:00",
  "duration": 60,
  "status": "confirmed",
  "price": 50.00,
  "notes": "Special requests",
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "doc_type": "BOOKINGS"
}
```

### 4. `services` Collection (Recommended)
For storing available services and their pricing.

**Document Structure:**
```json
{
  "serviceId": "unique_service_id",
  "serviceName": "Haircut",
  "description": "Professional haircut service",
  "duration": 60,
  "price": 50.00,
  "category": "hair",
  "status": "active",
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "doc_type": "SERVICES"
}
```

### 5. `transactions` Collection (Recommended)
For storing payment and transaction history.

**Document Structure:**
```json
{
  "transactionId": "unique_transaction_id",
  "bookingId": "booking_reference",
  "clientEmail": "client@example.com",
  "amount": 50.00,
  "paymentMethod": "cash",
  "status": "completed",
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "doc_type": "TRANSACTIONS"
}
```

## Service Products API

### Create Service Product
- Endpoint: `POST /insertServiceProduct`
- Body:
  - `name` (string)
  - `category` (string)
  - `unit` (string)
  - `unit_value` (number): Value for the selected unit
  - `quantity` (number)
  - `total_value` (number)
  - `status` (string)
  - `branch_id` (string)

### Update Service Product
- Endpoint: `PUT /updateServiceProduct/:id`
- Body: (any of the above fields)

### Get All Service Products
- Endpoint: `GET /getAllServicesProducts`
- Query Params: `pageSize`, `page`, `search`, `branch_id`, `category`
- Returns: List of service products, each including `unit_value` if present

### Get Service Product by ID
- Endpoint: `GET /getServiceProduct/:id`
- Returns: Service product object, including `unit_value` if present

### Delete Service Product
- Endpoint: `DELETE /deleteServiceProduct/:id`

## Testing Calendar Color System

The system includes a comprehensive test endpoint to verify the calendar color functionality:

### Test Calendar Colors
```bash
# Test with default status (scheduled)
GET /api/bookings/test-calendar-colors

# Test with specific status
GET /api/bookings/test-calendar-colors?status=confirmed

# Test with different statuses
GET /api/bookings/test-calendar-colors?status=cancelled
GET /api/bookings/test-calendar-colors?status=completed
```

### Test Calendar Setup
```bash
# Test calendar setup for a specific branch
GET /api/bookings/test-calendar-setup?branch_name=Test Branch
```

### Background Color System Features
- **25+ Status Types**: Comprehensive coverage of booking scenarios
- **Full Background Colors**: Entire event backgrounds are colored (not just small dots)
- **Automatic Color Assignment**: Background colors are automatically applied based on status
- **Enhanced Event Descriptions**: Status and color information added to event descriptions
- **Fallback Handling**: Unknown statuses default to light blue background
- **Real-time Updates**: Calendar background colors update when booking status changes

For detailed information about the calendar color system, see [CALENDAR_COLOR_SYSTEM.md](./CALENDAR_COLOR_SYSTEM.md).

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Ensure Firebase configuration is set up in `firebase-config.js`

3. Start the server:
```bash
npm start
```

4. For development with auto-restart:
```bash
npm run dev
```

## Environment Variables

- `PORT` - Server port (default: 3000)

## Firebase Configuration

Make sure your `firebase-config.js` contains the necessary Firebase project configuration:

```javascript
const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id",
    measurementId: "your-measurement-id"
};
```

## Security Rules

Make sure to set up appropriate Firestore security rules for your collections to control access and data validation. 