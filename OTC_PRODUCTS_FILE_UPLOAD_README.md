# OTC Products File Upload API

This document describes the file upload functionality for bulk inserting OTC (Over-The-Counter) products into the system.

## Overview

The API supports uploading Excel (.xlsx, .xls) and CSV files to bulk insert OTC products. The system automatically checks for duplicates and skips existing products based on the product name within the same branch.

## Endpoints

### 1. Download Template
**GET** `/otcProducts/downloadTemplate`

Downloads a sample CSV template file that users can use as a reference for the correct format.

**Response:** CSV file download

### 2. Upload OTC Products File
**POST** `/otcProducts/uploadProducts`

Uploads an Excel or CSV file to bulk insert OTC products.

**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (required): The Excel or CSV file to upload
- `branch_id` (required): The branch ID where products will be inserted. Can be provided as:
  - Query parameter: `?branch_id=branch123`
  - Form field: `branch_id=branch123`
  - Query parameters take priority over form fields

**File Requirements:**
- Supported formats: `.xlsx`, `.xls`, `.csv`
- Maximum file size: 5MB
- Required columns: `name`, `price`, `retail_price`, `quantity`, `min_quantity`, `brand`
- Optional columns: `status` (defaults to 'active')

**Response:**
```json
{
  "message": "File processing completed",
  "summary": {
    "totalRows": 10,
    "inserted": 8,
    "skipped": 1,
    "errors": 1
  },
  "details": [
    {
      "row": 2,
      "status": "inserted",
      "message": "Product created successfully"
    },
    {
      "row": 3,
      "status": "skipped",
      "message": "Product with this name already exists"
    },
    {
      "row": 4,
      "status": "error",
      "message": "Invalid price - must be a positive number"
    }
  ]
}
```

## File Format

### CSV Format
```csv
name,price,retail_price,quantity,min_quantity,brand,status
Shampoo,15.50,18.00,100,10,Head & Shoulders,active
Conditioner,18.75,22.00,80,8,Pantene,active
```

### Excel Format
The Excel file should have the same column structure as the CSV format.

## Validation Rules

1. **Required Fields:** All products must have `name`, `price`, `retail_price`, `quantity`, `min_quantity`, and `brand`
2. **Price Validation:** Price must be a positive number
3. **Retail Price Validation:** Retail price must be a positive number
4. **Quantity Validation:** Quantity must be a non-negative number
5. **Min Quantity Validation:** Min quantity must be a non-negative number
6. **Duplicate Check:** Products with the same name in the same branch will be skipped
7. **Status:** If not provided, defaults to 'active'

## Error Handling

The API provides detailed feedback for each row processed:

- **inserted**: Product was successfully created
- **skipped**: Product was skipped due to duplicate name
- **error**: Product had validation errors (missing fields, invalid numbers, etc.)

## Example Usage

### Using cURL
```bash
# Download template
curl -X GET http://localhost:3000/otcProducts/downloadTemplate -o otc_products_template.csv

# Upload file (using query parameter)
curl -X POST "http://localhost:3000/otcProducts/uploadProducts?branch_id=branch123" \
  -F "file=@otc_products.csv"

# Upload file (using form field)
curl -X POST http://localhost:3000/otcProducts/uploadProducts \
  -F "file=@otc_products.csv" \
  -F "branch_id=branch123"
```

### Using JavaScript/Fetch
```javascript
// Download template
fetch('/otcProducts/downloadTemplate')
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'otc_products_template.csv';
    a.click();
  });

// Upload file (using query parameter)
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('/otcProducts/uploadProducts?branch_id=branch123', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('Upload results:', data);
});

// Upload file (using form field)
const formData2 = new FormData();
formData2.append('file', fileInput.files[0]);
formData2.append('branch_id', 'branch123');

fetch('/otcProducts/uploadProducts', {
  method: 'POST',
  body: formData2
})
.then(response => response.json())
.then(data => {
  console.log('Upload results:', data);
});
```

## Field Descriptions

- **name**: Product name (string, required)
- **price**: Product cost price (number, required, must be positive)
- **retail_price**: Product retail/selling price (number, required, must be positive)
- **quantity**: Current stock quantity (number, required, must be non-negative)
- **min_quantity**: Minimum stock level for alerts (number, required, must be non-negative)
- **brand**: Product brand (string, required)
- **status**: Product status (string, optional, defaults to 'active')

## Notes

- Files are processed in memory and not saved to disk
- Duplicate checking is case-insensitive and trims whitespace
- Each product gets a unique UUID as its ID
- The `date_created` field is automatically set to the current timestamp
- The `branch_id` field is automatically set from the request parameter 