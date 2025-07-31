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
For storing booking/appointment information.

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