# Multi-Account Transaction System

This document explains how to use the updated transaction system that supports multiple accounts with individual commissions for each transaction.

## Overview

The transaction system now supports multiple accounts per transaction, where each account can have its own commission rate and commission amount calculated based on the transaction total.

## API Changes

### 1. Create Transaction

**Endpoint:** `POST /createTransaction`

**Request Body:**
```json
{
  "client_id": "client-uuid",
  "branch_id": "branch-uuid",
  "accounts": [
    {
      "account_id": "account-uuid-1"
    },
    {
      "account_id": "account-uuid-2",
      "commission_rate": 0.15
    }
  ],
  "items": [
    {
      "item_id": "service-uuid",
      "quantity": 1,
      "price": 100.00,
      "type": "service"
    },
    {
      "item_id": "product-uuid",
      "quantity": 2,
      "price": 50.00,
      "type": "otc_product"
    }
  ],
  "payment_method": "cash",
  "payment_status": "pending",
  "notes": "Optional transaction notes"
}
```

**Key Changes:**
- `account_id` is now replaced with `accounts` array
- Each account object contains `account_id` and optional `commission_rate`
- Commissions are completely optional - accounts without commission_rate won't generate commission records
- Multiple accounts can be included in a single transaction

**Response:**
```json
{
  "id": "transaction-uuid",
  "invoice_id": "INV-1234567890-123",
  "client_id": "client-uuid",
  "branch_id": "branch-uuid",
  "accounts": [
    {
      "account_id": "account-uuid-1"
    },
    {
      "account_id": "account-uuid-2",
      "commission_rate": 0.15,
      "commission_amount": 18.00
    }
  ],
  "items": [...],
  "subtotal": 200.00,
  "tax": 24.00,
  "total": 224.00,
  "payment_method": "cash",
  "payment_status": "pending",
  "date_created": "2024-01-01T00:00:00.000Z"
}
```

### 2. Get Transactions by Account

**Endpoint:** `GET /getTransactionsByAccount/:accountId`

**Query Parameters:**
- `pageSize` (default: 10)
- `page` (default: 1)
- `payment_status` (optional)
- `date_from` (optional)
- `date_to` (optional)

**Response:**
```json
{
  "data": [
    {
      "id": "transaction-uuid",
      "invoice_id": "INV-1234567890-123",
      "accounts": [...],
      "account_commission": {
        "account_id": "account-uuid-1",
        "commission_rate": 0.10,
        "commission_amount": 12.00
      },
      "total": 224.00,
      "payment_status": "completed",
      "date_created": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "totalPages": 5,
  "totalCount": 50
}
```

### 3. Get Accounts in Transaction

**Endpoint:** `GET /getTransactionAccounts/:transactionId`

**Response:**
```json
{
  "transaction_id": "transaction-uuid",
  "accounts": [
    {
      "account_id": "account-uuid-1",
      "commission_rate": 0.10,
      "commission_amount": 12.00
    },
    {
      "account_id": "account-uuid-2",
      "commission_rate": 0.15,
      "commission_amount": 18.00
    }
  ]
}
```

### 4. Get Transaction Commissions

**Endpoint:** `GET /getTransactionCommissions/:transactionId`

**Response:**
```json
{
  "transaction_id": "transaction-uuid",
  "commissions": [
    {
      "id": "commission-uuid-1",
      "account_id": "account-uuid-1",
      "transaction_id": "transaction-uuid",
      "amount": 12.00,
      "transaction_total": 224.00,
      "commission_rate": 0.10,
      "date_created": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "commission-uuid-2",
      "account_id": "account-uuid-2",
      "transaction_id": "transaction-uuid",
      "amount": 18.00,
      "transaction_total": 224.00,
      "commission_rate": 0.15,
      "date_created": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total_commission": 30.00,
  "commission_count": 2
}
```

### 5. Get Transaction Used Unit Values

**Endpoint:** `GET /getTransactionUsedUnitValues/:transactionId`

**Response:**
```json
{
  "transaction_id": "transaction-uuid",
  "used_unit_values": [
    {
      "id": "used-unit-value-uuid",
      "transaction_id": "transaction-uuid",
      "services_product_id": "services-product-uuid",
      "item_name": "Shampoo",
      "quantity": 2,
      "unit_value": 50.00,
      "used_unit_value": 100.00,
      "date_created": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total_used_unit_value": 100.00,
  "record_count": 1
}
```

### 6. Get Services Product Used Unit Values

**Endpoint:** `GET /getServicesProductUsedUnitValues/:servicesProductId`

**Query Parameters:**
- `pageSize` (default: 10)
- `page` (default: 1)
- `date_from` (optional)
- `date_to` (optional)

**Response:**
```json
{
  "services_product_id": "services-product-uuid",
  "data": [
    {
      "id": "used-unit-value-uuid",
      "transaction_id": "transaction-uuid",
      "services_product_id": "services-product-uuid",
      "item_name": "Shampoo",
      "quantity": 2,
      "unit_value": 50.00,
      "used_unit_value": 100.00,
      "date_created": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "totalPages": 1,
  "totalCount": 1,
  "total_used_unit_value": 100.00
}
```

### 7. Get All Used Unit Values

**Endpoint:** `GET /getAllUsedUnitValues`

**Query Parameters:**
- `pageSize` (default: 10)
- `page` (default: 1)
- `services_product_id` (optional)
- `date_from` (optional)
- `date_to` (optional)

**Response:**
```json
{
  "data": [
    {
      "id": "used-unit-value-uuid",
      "transaction_id": "transaction-uuid",
      "services_product_id": "services-product-uuid",
      "item_name": "Shampoo",
      "quantity": 2,
      "unit_value": 50.00,
      "used_unit_value": 100.00,
      "date_created": "2024-01-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "totalPages": 1,
  "totalCount": 1,
  "total_used_unit_value": 100.00
}
```

## Data Structure Changes

### Transaction Document (With Commissions)
```json
{
  "id": "transaction-uuid",
  "invoice_id": "INV-1234567890-123",
  "client_id": "client-uuid",
  "branch_id": "branch-uuid",
  "accounts": [
    {
      "account_id": "account-uuid-1"
    },
    {
      "account_id": "account-uuid-2",
      "commission_rate": 0.15,
      "commission_amount": 18.00
    }
  ],
  "items": [...],
  "subtotal": 200.00,
  "tax": 24.00,
  "total": 224.00,
  "payment_method": "cash",
  "payment_status": "pending",
  "date_created": "2024-01-01T00:00:00.000Z",
  "doc_type": "TRANSACTIONS"
}
```

### Transaction Document (No Commissions)
```json
{
  "id": "transaction-uuid",
  "invoice_id": "INV-1234567890-123",
  "client_id": "client-uuid",
  "branch_id": "branch-uuid",
  "accounts": [
    {
      "account_id": "account-uuid-1"
    },
    {
      "account_id": "account-uuid-2"
    }
  ],
  "items": [...],
  "subtotal": 200.00,
  "tax": 24.00,
  "total": 224.00,
  "payment_method": "cash",
  "payment_status": "pending",
  "date_created": "2024-01-01T00:00:00.000Z",
  "doc_type": "TRANSACTIONS"
}
```

### Commission Document
```json
{
  "id": "commission-uuid",
  "account_id": "account-uuid",
  "transaction_id": "transaction-uuid",
  "amount": 12.00,
  "transaction_total": 224.00,
  "commission_rate": 0.10,
  "date_created": "2024-01-01T00:00:00.000Z",
  "doc_type": "COMMISSIONS"
}
```

### Used Unit Values Document
```json
{
  "id": "used-unit-value-uuid",
  "transaction_id": "transaction-uuid",
  "services_product_id": "services-product-uuid",
  "item_name": "Shampoo",
  "quantity": 2,
  "unit_value": 50.00,
  "used_unit_value": 100.00,
  "date_created": "2024-01-01T00:00:00.000Z",
  "doc_type": "USED_UNIT_VALUES"
}
```

## Commission Calculation

- Commissions are completely optional
- Only accounts with a `commission_rate` will generate commission records
- Commission calculation: `transaction_total * commission_rate`
- Commission amounts are stored with 2 decimal places
- Each account with a commission rate gets its own commission record in the COMMISSIONS_COLLECTION

## Used Unit Values Tracking

- Automatically tracks used unit values for `services_product` items in transactions
- Used unit value calculation: `quantity * unit_value`
- Each services_product usage creates a record in the USED_UNIT_VALUES_COLLECTION
- Helps track consumption history and inventory management for services products

## Migration Notes

### For Existing Transactions
- Existing transactions with single `account_id` will continue to work
- New transactions must use the `accounts` array format
- The system maintains backward compatibility for reading existing transactions

### For Frontend Applications
- Update transaction creation forms to support multiple account selection
- Display commission breakdown for each account in transaction details
- Update commission reports to show individual account commissions

## Example Usage

### Creating a Transaction with Multiple Accounts (No Commissions)
```javascript
const transactionData = {
  client_id: "client-123",
  branch_id: "branch-456",
  accounts: [
    { account_id: "account-1" },
    { account_id: "account-2" }
  ],
  items: [
    {
      item_id: "service-1",
      quantity: 1,
      price: 100.00,
      type: "service"
    }
  ],
  payment_method: "cash",
  payment_status: "pending"
};
```

### Creating a Transaction with Mixed Commission Settings
```javascript
const transactionData = {
  client_id: "client-123",
  branch_id: "branch-456",
  accounts: [
    { account_id: "account-1" }, // No commission
    { account_id: "account-2", commission_rate: 0.15 } // With commission
  ],
  items: [
    {
      item_id: "service-1",
      quantity: 1,
      price: 100.00,
      type: "service"
    }
  ],
  payment_method: "cash",
  payment_status: "pending"
};

const response = await fetch('/createTransaction', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(transactionData)
});
```

### Getting Account-Specific Transactions
```javascript
const response = await fetch('/getTransactionsByAccount/account-1?page=1&pageSize=10');
const data = await response.json();
console.log('Account transactions:', data.data);
```

### Getting Transaction Commissions
```javascript
const response = await fetch('/getTransactionCommissions/transaction-123');
const data = await response.json();
console.log('Total commission:', data.total_commission);
console.log('Commission breakdown:', data.commissions);
```

### Getting Used Unit Values for a Transaction
```javascript
const response = await fetch('/getTransactionUsedUnitValues/transaction-123');
const data = await response.json();
console.log('Total used unit value:', data.total_used_unit_value);
console.log('Used unit values:', data.used_unit_values);
```

### Getting Used Unit Values for a Services Product
```javascript
const response = await fetch('/getServicesProductUsedUnitValues/services-product-123?date_from=2024-01-01&date_to=2024-01-31');
const data = await response.json();
console.log('Total used unit value:', data.total_used_unit_value);
console.log('Usage history:', data.data);
```

### Getting All Used Unit Values
```javascript
const response = await fetch('/getAllUsedUnitValues?services_product_id=services-product-123&page=1&pageSize=20');
const data = await response.json();
console.log('All used unit values:', data.data);
```

## Error Handling

The system includes comprehensive error handling for:
- Missing required fields
- Invalid account structure
- Commission calculation errors
- Database operation failures

All errors return appropriate HTTP status codes and error messages for debugging. 