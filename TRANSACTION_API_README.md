# Transaction API Documentation

This document describes the comprehensive transaction management system for the Michiko POS Booking API.

## Overview

The transaction system provides:
- **Inventory Management** with Excel export functionality
- **Transaction Records** with automatic invoice generation
- **Dashboard Data** for each branch with period filtering
- **Commission Tracking** for each account

## Base URL
```
/api/transactions
```

## Collections

The system uses the following Firestore collections:
- `transactions` - Transaction records with invoice IDs
- `inventory` - Product inventory items
- `commissions` - Commission records for accounts
- `dashboard` - Dashboard data for each branch

---

## 🏪 Inventory Management

### Create Inventory Item
**POST** `/inventory/insertItem`

Creates a new inventory item.

**Request Body:**
```json
{
  "name": "Product Name",
  "description": "Product description",
  "category": "electronics",
  "price": 100.00,
  "cost": 80.00,
  "quantity": 50,
  "min_stock": 10,
  "branch_id": "branch123",
  "supplier": "Supplier Name",
  "sku": "SKU123456"
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Product Name",
  "description": "Product description",
  "category": "electronics",
  "price": 100.00,
  "cost": 80.00,
  "quantity": 50,
  "min_stock": 10,
  "branch_id": "branch123",
  "supplier": "Supplier Name",
  "sku": "SKU123456",
  "status": "active",
  "date_created": "2024-01-01T00:00:00.000Z",
  "date_updated": "2024-01-01T00:00:00.000Z",
  "doc_type": "INVENTORY"
}
```

### Get All Inventory Items
**GET** `/inventory/getAllItems`

Retrieves inventory items with pagination, search, and filtering.

**Query Parameters:**
- `pageSize` (default: 10) - Number of items per page
- `page` (default: 1) - Page number
- `search` - Search by item name
- `branch_id` - Filter by branch
- `category` - Filter by category

**Response:**
```json
{
  "data": [...],
  "page": 1,
  "totalPages": 5,
  "totalCount": 50
}
```

### Update Inventory Quantity
**PUT** `/inventory/updateQuantity/:itemId`

Updates the quantity of an inventory item.

**Request Body:**
```json
{
  "quantity": 10,
  "operation": "add" // "add", "subtract", or "set"
}
```

### Get Low Stock Items
**GET** `/inventory/lowStock/:branchId`

Retrieves items that are at or below minimum stock level.

### Export Inventory to Excel
**GET** `/inventory/export/:branchId`

Exports inventory data in a format suitable for Excel import.

**Response:**
```json
{
  "branch_id": "branch123",
  "export_date": "2024-01-01T00:00:00.000Z",
  "total_items": 50,
  "data": [
    {
      "Item ID": "uuid",
      "Name": "Product Name",
      "Description": "Description",
      "Category": "electronics",
      "Price": 100.00,
      "Cost": 80.00,
      "Quantity": 50,
      "Min Stock": 10,
      "SKU": "SKU123456",
      "Supplier": "Supplier Name",
      "Status": "In Stock",
      "Date Created": "2024-01-01T00:00:00.000Z",
      "Date Updated": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## 💰 Transaction Records

### Create Transaction
**POST** `/createTransaction`

Creates a new transaction with automatic invoice generation, inventory updates, and commission calculation.

**Request Body:**
```json
{
  "client_id": "client123",
  "branch_id": "branch123",
  "account_id": "account123",
  "items": [
    {
      "item_id": "service123",
      "quantity": 1,
      "price": 100.00,
      "type": "service" // "service", "services_product", or "otc_product"
    },
    {
      "item_id": "services_product123",
      "quantity": 2,
      "price": 50.00,
      "type": "services_product"
    },
    {
      "item_id": "otc_product123",
      "quantity": 3,
      "price": 25.00,
      "type": "otc_product"
    }
  ],
  "payment_method": "cash",
  "payment_status": "pending",
  "notes": "Customer notes"
}
```

**Response:**
```json
{
  "id": "transaction-uuid",
  "invoice_id": "INV-1704067200000-123",
  "client_id": "client123",
  "branch_id": "branch123",
  "account_id": "account123",
  "items": [
    {
      "item_id": "service123",
      "quantity": 1,
      "price": 100.00,
      "type": "service",
      "item_total": 100.00
    },
    {
      "item_id": "services_product123",
      "quantity": 2,
      "price": 50.00,
      "type": "services_product",
      "item_total": 100.00
    },
    {
      "item_id": "otc_product123",
      "quantity": 3,
      "price": 25.00,
      "type": "otc_product",
      "item_total": 75.00
    }
  ],
  "subtotal": 275.00,
  "tax": 33.00,
  "total": 308.00,
  "total_quantity": 6,
  "payment_method": "cash",
  "payment_status": "pending",
  "notes": "Customer notes",
  "date_created": "2024-01-01T00:00:00.000Z",
  "date_updated": "2024-01-01T00:00:00.000Z",
  "doc_type": "TRANSACTIONS"
}
```

### Get All Transactions
**GET** `/getAllTransactions`

Retrieves transactions with pagination and filtering.

**Query Parameters:**
- `pageSize` (default: 10) - Number of transactions per page
- `page` (default: 1) - Page number
- `branch_id` - Filter by branch
- `payment_status` - Filter by payment status
- `date_from` - Filter from date (YYYY-MM-DD)
- `date_to` - Filter to date (YYYY-MM-DD)

### Get Transaction by Invoice ID
**GET** `/getTransactionByInvoice/:invoiceId`

Retrieves a specific transaction using its invoice ID.

### Update Payment Status
**PUT** `/updatePaymentStatus/:transactionId`

Updates the payment status of a transaction.

**Request Body:**
```json
{
  "payment_status": "paid" // "pending", "paid", "cancelled"
}
```

---

## 🛍️ Available Items for Transactions

### Get Available Services
**GET** `/available-services/:branchId`

Retrieves all available services for a specific branch.

**Response:**
```json
[
  {
    "id": "service123",
    "name": "Hair Cut",
    "description": "Professional hair cutting service",
    "category": "hair",
    "price": 100.00,
    "type": "service",
    "collection": "services"
  }
]
```

### Get Available Services Products
**GET** `/available-services-products/:branchId`

Retrieves all available services products for a specific branch.

**Response:**
```json
[
  {
    "id": "services_product123",
    "name": "Shampoo",
    "category": "hair_care",
    "unit": "bottle",
    "quantity": 50,
    "unit_value": 25.00,
    "total_value": 1250.00,
    "price": 25.00,
    "type": "services_product",
    "collection": "services_products",
    "available": true
  }
]
```

### Get Available OTC Products
**GET** `/available-otc-products/:branchId`

Retrieves all available OTC products for a specific branch.

**Response:**
```json
[
  {
    "id": "otc_product123",
    "name": "Hair Brush",
    "category": "accessories",
    "price": 15.00,
    "quantity": 30,
    "min_quantity": 5,
    "type": "otc_product",
    "collection": "otcProducts",
    "available": true
  }
]
```

### Get All Available Items
**GET** `/available-items/:branchId`

Retrieves all available items (services, services products, and OTC products) for a specific branch.

**Query Parameters:**
- `type` (optional) - Filter by type: "all", "services", "services_products", "otc_products"

**Response:**
```json
[
  {
    "id": "service123",
    "name": "Hair Cut",
    "description": "Professional hair cutting service",
    "category": "hair",
    "price": 100.00,
    "type": "service",
    "collection": "services",
    "available": true
  },
  {
    "id": "services_product123",
    "name": "Shampoo",
    "category": "hair_care",
    "unit": "bottle",
    "quantity": 50,
    "unit_value": 25.00,
    "total_value": 1250.00,
    "price": 25.00,
    "type": "services_product",
    "collection": "services_products",
    "available": true
  },
  {
    "id": "otc_product123",
    "name": "Hair Brush",
    "category": "accessories",
    "price": 15.00,
    "quantity": 30,
    "min_quantity": 5,
    "type": "otc_product",
    "collection": "otcProducts",
    "available": true
  }
]
```

---

## 📊 Dashboard Data

### Get Dashboard Data for Branch
**GET** `/dashboard/:branchId`

Retrieves dashboard data for a specific branch with period filtering.

**Query Parameters:**
- `period` (default: "today") - Time period: "today", "week", "month", "year", "all"

**Response:**
```json
{
  "branch_id": "branch123",
  "total_revenue": 15000.00,
  "transaction_count": 150,
  "last_transaction_date": "2024-01-01T00:00:00.000Z",
  "period_total": 500.00,
  "period_transaction_count": 5,
  "date_created": "2024-01-01T00:00:00.000Z",
  "date_updated": "2024-01-01T00:00:00.000Z",
  "doc_type": "DASHBOARD"
}
```

---

## 💸 Commission Tracking

### Get Commissions for Account
**GET** `/commissions/:accountId`

Retrieves commission data for a specific account.

**Query Parameters:**
- `period` (default: "all") - Time period: "today", "week", "month", "year", "all"

**Response:**
```json
{
  "commissions": [
    {
      "id": "commission-uuid",
      "account_id": "account123",
      "transaction_id": "transaction123",
      "amount": 28.00,
      "transaction_total": 280.00,
      "commission_rate": 0.10,
      "date_created": "2024-01-01T00:00:00.000Z",
      "doc_type": "COMMISSIONS"
    }
  ],
  "total_commission": 1500.00,
  "commission_count": 50
}
```

---

## 🔧 Features

### Automatic Invoice Generation
- Each transaction gets a unique invoice ID in format: `INV-{timestamp}-{random}`
- Invoice IDs are used as transaction identifiers

### Three-Type Product System
- **Services** - Non-inventory items (hair cuts, treatments, etc.)
- **Services Products** - Inventory items with units and unit values (shampoo, conditioner, etc.)
- **OTC Products** - Over-the-counter products with price and quantity (accessories, tools, etc.)
- Automatic inventory updates for services products and OTC products
- Stock availability checking
- Low stock alerts for inventory items

### Commission System
- Automatic 10% commission calculation on transaction totals
- Commission tracking per account
- Period-based commission reporting
- Integration with account management

### Dashboard Analytics
- Real-time revenue tracking
- Transaction count monitoring
- Period-based filtering (today, week, month, year)
- Branch-specific data

### Payment Status Management
- Support for multiple payment statuses: pending, paid, cancelled
- Payment method tracking
- Status update functionality

---

## 📋 Data Models

### Transaction Model
```json
{
  "id": "uuid",
  "invoice_id": "INV-1704067200000-123",
  "client_id": "client123",
  "branch_id": "branch123",
  "account_id": "account123",
  "items": [
    {
      "item_id": "item123",
      "quantity": 2,
      "price": 100.00,
      "type": "product",
      "item_total": 200.00
    }
  ],
  "subtotal": 200.00,
  "tax": 24.00,
  "total": 224.00,
  "total_quantity": 2,
  "payment_method": "cash",
  "payment_status": "pending",
  "notes": "Customer notes",
  "date_created": "2024-01-01T00:00:00.000Z",
  "date_updated": "2024-01-01T00:00:00.000Z",
  "doc_type": "TRANSACTIONS"
}
```

### Inventory Model
```json
{
  "id": "uuid",
  "name": "Product Name",
  "description": "Product description",
  "category": "electronics",
  "price": 100.00,
  "cost": 80.00,
  "quantity": 50,
  "min_stock": 10,
  "branch_id": "branch123",
  "supplier": "Supplier Name",
  "sku": "SKU123456",
  "status": "active",
  "date_created": "2024-01-01T00:00:00.000Z",
  "date_updated": "2024-01-01T00:00:00.000Z",
  "doc_type": "INVENTORY"
}
```

### Commission Model
```json
{
  "id": "uuid",
  "account_id": "account123",
  "transaction_id": "transaction123",
  "amount": 28.00,
  "transaction_total": 280.00,
  "commission_rate": 0.10,
  "date_created": "2024-01-01T00:00:00.000Z",
  "doc_type": "COMMISSIONS"
}
```

### Dashboard Model
```json
{
  "branch_id": "branch123",
  "total_revenue": 15000.00,
  "transaction_count": 150,
  "last_transaction_date": "2024-01-01T00:00:00.000Z",
  "date_created": "2024-01-01T00:00:00.000Z",
  "date_updated": "2024-01-01T00:00:00.000Z",
  "doc_type": "DASHBOARD"
}
```

---

## 🚀 Usage Examples

### Creating a Complete Transaction Flow

1. **Get Available Items:**
```bash
# Get all available items for a branch
GET /api/transactions/available-items/branch123

# Get specific types
GET /api/transactions/available-services/branch123
GET /api/transactions/available-services-products/branch123
GET /api/transactions/available-otc-products/branch123
```

2. **Create Transaction with Three Types:**
```bash
POST /api/transactions/createTransaction
{
  "client_id": "client123",
  "branch_id": "branch123",
  "account_id": "account123",
  "items": [
    {
      "item_id": "service123",
      "quantity": 1,
      "price": 100.00,
      "type": "service"
    },
    {
      "item_id": "services_product123",
      "quantity": 2,
      "price": 25.00,
      "type": "services_product"
    },
    {
      "item_id": "otc_product123",
      "quantity": 1,
      "price": 15.00,
      "type": "otc_product"
    }
  ],
  "payment_method": "cash"
}
```

3. **Check Dashboard:**
```bash
GET /api/transactions/dashboard/branch123?period=today
```

4. **View Commissions:**
```bash
GET /api/transactions/commissions/account123?period=month
```

5. **Export Inventory:**
```bash
GET /api/transactions/inventory/export/branch123
```

---

## 🔒 Security

All endpoints require authentication via the `Authorization` header middleware as implemented in the existing system.

---

## 📝 Notes

- Tax is automatically calculated at 12% on subtotal
- Commission is automatically calculated at 10% on total transaction amount
- Inventory quantities are automatically reduced when products are sold
- All timestamps are in ISO format
- Invoice IDs are unique and auto-generated
- Dashboard data is automatically updated with each transaction 