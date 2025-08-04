# Services File Upload API

This document describes the file upload functionality for bulk inserting services into the system.

## Overview

The API supports uploading Excel (.xlsx, .xls) and CSV files to bulk insert services. The system automatically checks for duplicates and skips existing services based on the service name within the same branch.

## Endpoints

### 1. Download Template
**GET** `/services/downloadTemplate`

Downloads a sample CSV template file that users can use as a reference for the correct format.

**Response:** CSV file download

### 2. Upload Services File
**POST** `/services/uploadServices`

Uploads an Excel or CSV file to bulk insert services.

**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (required): The Excel or CSV file to upload
- `branch_id` (required): The branch ID where services will be inserted. Can be provided as:
  - Query parameter: `?branch_id=branch123`
  - Form field: `branch_id=branch123`
  - Query parameters take priority over form fields

**File Requirements:**
- Supported formats: `.xlsx`, `.xls`, `.csv`
- Maximum file size: 5MB
- Required columns: `name`, `description`, `category`, `price`
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
      "message": "Service created successfully"
    },
    {
      "row": 3,
      "status": "skipped",
      "message": "Service with this name already exists"
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
name,description,category,price,status
Haircut,Basic haircut service,Hair Services,25.00,active
Hair Coloring,Professional hair coloring service,Hair Services,75.00,active
```

### Excel Format
The Excel file should have the same column structure as the CSV format.

## Validation Rules

1. **Required Fields:** All services must have `name`, `description`, `category`, and `price`
2. **Price Validation:** Price must be a positive number
3. **Duplicate Check:** Services with the same name in the same branch will be skipped
4. **Status:** If not provided, defaults to 'active'

## Error Handling

The API provides detailed feedback for each row processed:

- **inserted**: Service was successfully created
- **skipped**: Service was skipped due to duplicate name
- **error**: Service had validation errors (missing fields, invalid price, etc.)

## Example Usage

### Using cURL
```bash
# Download template
curl -X GET http://localhost:3000/services/downloadTemplate -o services_template.csv

# Upload file (using query parameter)
curl -X POST "http://localhost:3000/services/uploadServices?branch_id=branch123" \
  -F "file=@services.csv"

# Upload file (using form field)
curl -X POST http://localhost:3000/services/uploadServices \
  -F "file=@services.csv" \
  -F "branch_id=branch123"
```

### Using JavaScript/Fetch
```javascript
// Download template
fetch('/services/downloadTemplate')
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'services_template.csv';
    a.click();
  });

// Upload file (using query parameter)
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('/services/uploadServices?branch_id=branch123', {
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

fetch('/services/uploadServices', {
  method: 'POST',
  body: formData2
})
.then(response => response.json())
.then(data => {
  console.log('Upload results:', data);
});
```

## Notes

- Files are processed in memory and not saved to disk
- Duplicate checking is case-insensitive and trims whitespace
- Each service gets a unique UUID as its ID
- The `date_created` field is automatically set to the current timestamp 