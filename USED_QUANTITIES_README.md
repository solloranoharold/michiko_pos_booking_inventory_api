# Used Quantities Tracking System

This document describes the used quantities tracking system for the Michiko POS Booking API, which automatically tracks the consumption of OTC products and services products across all branches.

## Overview

The used quantities tracking system provides:
- **Automatic Tracking** of product consumption during transactions
- **Branch-specific Analytics** for inventory management
- **Detailed Reporting** with date range filtering
- **Item-level Usage History** for better inventory planning

## Collection Structure

### Used Quantities Collection (`used_quantities`)

Each document in the `used_quantities` collection represents a single usage record:

```json
{
  "id": "used-quantity-uuid",
  "transaction_id": "transaction-uuid",
  "branch_id": "branch-123",
  "item_id": "item-uuid",
  "item_name": "Product Name",
  "item_type": "otc_product|services_product",
  "quantity_used": 5,
  "unit_price": 10.00,
  "total_value": 50.00,
  "date_created": "2024-01-01T00:00:00.000Z",
  "doc_type": "USED_QUANTITIES"
}
```

## API Endpoints

### Base URL
```
/api/transactions
```

---

## 📊 Used Quantities Management

### Get Used Quantities for Branch
**GET** `/used-quantities/:branchId`

Retrieves used quantities records for a specific branch with pagination and filtering.

**Query Parameters:**
- `pageSize` (default: 10) - Number of records per page
- `page` (default: 1) - Page number
- `item_type` - Filter by item type (`otc_product` or `services_product`)
- `date_from` - Start date for filtering (YYYY-MM-DD)
- `date_to` - End date for filtering (YYYY-MM-DD)

**Response:**
```json
{
  "data": [
    {
      "id": "used-quantity-uuid",
      "transaction_id": "transaction-uuid",
      "branch_id": "branch-123",
      "item_id": "item-uuid",
      "item_name": "Product Name",
      "item_type": "otc_product",
      "quantity_used": 5,
      "unit_price": 10.00,
      "total_value": 50.00,
      "date_created": "2024-01-01T00:00:00.000Z",
      "doc_type": "USED_QUANTITIES"
    }
  ],
  "page": 1,
  "totalPages": 5,
  "totalCount": 50,
  "branch_id": "branch-123"
}
```

### Get Used Quantities Summary
**GET** `/used-quantities-summary/:branchId`

Retrieves summary statistics for used quantities in a specific branch.

**Query Parameters:**
- `date_from` - Start date for filtering (YYYY-MM-DD)
- `date_to` - End date for filtering (YYYY-MM-DD)

**Response:**
```json
{
  "branch_id": "branch-123",
  "date_range": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  },
  "summary": {
    "total_records": 150,
    "total_quantity_used": 750,
    "total_value": 15000.00,
    "item_type_breakdown": {
      "otc_product": {
        "count": 100,
        "total_quantity": 500,
        "total_value": 10000.00
      },
      "services_product": {
        "count": 50,
        "total_quantity": 250,
        "total_value": 5000.00
      }
    },
    "top_items": [
      {
        "item_id": "item-uuid",
        "item_name": "Most Used Product",
        "item_type": "otc_product",
        "total_quantity": 100,
        "total_value": 2000.00,
        "usage_count": 20
      }
    ],
    "average_quantity_per_record": 5.00,
    "average_value_per_record": 100.00
  }
}
```

### Get Used Quantities for Specific Item
**GET** `/used-quantities-item/:itemId`

Retrieves usage history for a specific item across all branches or filtered by branch.

**Query Parameters:**
- `pageSize` (default: 10) - Number of records per page
- `page` (default: 1) - Page number
- `branch_id` - Filter by specific branch
- `date_from` - Start date for filtering (YYYY-MM-DD)
- `date_to` - End date for filtering (YYYY-MM-DD)

**Response:**
```json
{
  "data": [
    {
      "id": "used-quantity-uuid",
      "transaction_id": "transaction-uuid",
      "branch_id": "branch-123",
      "item_id": "item-uuid",
      "item_name": "Product Name",
      "item_type": "otc_product",
      "quantity_used": 5,
      "unit_price": 10.00,
      "total_value": 50.00,
      "date_created": "2024-01-01T00:00:00.000Z",
      "doc_type": "USED_QUANTITIES"
    }
  ],
  "page": 1,
  "totalPages": 3,
  "totalCount": 25,
  "item_id": "item-uuid"
}
```

### Get Item Details by ID and Type
**GET** `/item-details/:itemId`

Retrieves complete item details from the appropriate collection based on item ID and type.

**Query Parameters:**
- `type` (required) - Item type: `otc_product`, `services_product`, or `service`

**Response:**
```json
{
  "item_id": "item-uuid",
  "type": "otc_product",
  "data": {
    "id": "item-uuid",
    "name": "Product Name",
    "description": "Product description",
    "category": "electronics",
    "price": 100.00,
    "quantity": 50,
    "branch_id": "branch-123",
    "status": "active",
    "date_created": "2024-01-01T00:00:00.000Z",
    "date_updated": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Response (Item not found):**
```json
{
  "error": "Item not found",
  "item_id": "item-uuid",
  "type": "otc_product"
}
```

### Get Item Name by ID and Type
**GET** `/item-name/:itemId`

Retrieves just the item name from the appropriate collection based on item ID and type.

**Query Parameters:**
- `type` (required) - Item type: `otc_product`, `services_product`, or `service`

**Response:**
```json
{
  "item_id": "item-uuid",
  "type": "otc_product",
  "name": "Product Name"
}
```

**Error Response (Invalid type):**
```json
{
  "error": "Item type is required. Use query parameter \"type\" with value: otc_product, services_product, or service"
}
```

---

## 🔄 Automatic Integration

### Transaction Creation
When a transaction is created, the system automatically:
1. Tracks used quantities for all `otc_product` and `services_product` items
2. **Fetches actual item names** from the appropriate collections (`otcProducts`, `services_products`)
3. Creates individual records in the `used_quantities` collection with accurate item names
4. Links each record to the transaction and branch
5. Calculates total values based on quantity and unit price

### Transaction Voiding
When a transaction is voided, the system automatically:
1. Removes all associated used quantities records
2. Maintains data integrity by cleaning up consumption history
3. Prevents incorrect inventory analytics

### Real-time Item Name Fetching
All used quantities endpoints now fetch actual item names from their source collections:
- **Used Quantities List** - Each record shows the current item name from the collection
- **Used Quantities Summary** - Top items display accurate names from source collections
- **Used Quantities by Item** - Item history shows current names
- **Item Details/Name APIs** - Direct access to item information by ID and type

---

## 📈 Use Cases

### Inventory Management
- Track product consumption patterns
- Identify most/least used products
- Plan restocking based on usage history
- Monitor product performance across branches

### Financial Analysis
- Calculate product costs based on usage
- Analyze revenue per product type
- Track value of consumed inventory
- Generate consumption reports

### Branch Performance
- Compare usage patterns between branches
- Identify branch-specific product preferences
- Monitor inventory efficiency
- Plan branch-specific inventory

### Reporting
- Generate monthly/quarterly consumption reports
- Track seasonal usage patterns
- Identify trends in product usage
- Support decision-making for inventory planning

---

## 🔧 Technical Implementation

### Data Flow
1. **Transaction Creation** → Automatic tracking of used quantities
2. **Transaction Voiding** → Automatic removal of used quantities
3. **Reporting** → Query-based analytics with filtering options

### Performance Considerations
- Batch operations for multiple items
- Indexed queries for efficient filtering
- Pagination for large datasets
- Date range filtering for performance

### Error Handling
- Graceful error handling to prevent transaction failures
- Logging for debugging and monitoring
- Non-blocking operations for tracking functions

---

## 📋 Example Usage

### Creating a Transaction with Product Usage
```javascript
const transactionData = {
  client_id: "client-123",
  branch_id: "branch-456",
  items: [
    {
      item_id: "otc-product-1",
      quantity: 5,
      price: 10.00,
      type: "otc_product"
    },
    {
      item_id: "services-product-1",
      quantity: 2,
      price: 25.00,
      type: "services_product"
    }
  ],
  payment_method: "cash"
};

// This will automatically create used quantities records:
// - 5 units of otc-product-1
// - 2 units of services-product-1
```

### Retrieving Usage Summary
```javascript
// Get summary for last month
const summary = await fetch('/api/transactions/used-quantities-summary/branch-456?date_from=2024-01-01&date_to=2024-01-31');

// Get detailed records with pagination
const records = await fetch('/api/transactions/used-quantities/branch-456?page=1&pageSize=20&item_type=otc_product');
```

---

## 🚀 Benefits

1. **Automated Tracking** - No manual intervention required
2. **Comprehensive Analytics** - Detailed insights into product usage
3. **Branch-specific Data** - Isolated tracking per branch
4. **Historical Analysis** - Date range filtering for trend analysis
5. **Inventory Optimization** - Data-driven restocking decisions
6. **Cost Analysis** - Track value of consumed inventory
7. **Performance Monitoring** - Identify top-performing products
8. **Data Integrity** - Automatic cleanup on transaction voiding 