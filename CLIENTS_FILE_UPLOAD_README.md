# Clients File Upload API

This document describes the file upload functionality for bulk inserting clients into the system.

## Overview

The API supports uploading Excel (.xlsx, .xls) and CSV files to bulk insert clients. The system automatically checks for duplicates and skips existing clients based on the email address. Status is not required and defaults to 'active' if not provided.

## Endpoints

### 1. Download Template
**GET** `/clients/downloadTemplate`

Downloads a sample CSV template file that users can use as a reference for the correct format.

**Response:** CSV file download

### 2. Upload Clients File
**POST** `/clients/uploadClients`

Uploads an Excel or CSV file to bulk insert clients.

**Content-Type:** `multipart/form-data`

**Parameters:**
- `file` (required): The Excel or CSV file to upload
- `updated_by` (required): The user ID who is performing the upload. Can be provided as:
  - Query parameter: `?updated_by=user123`
  - Form field: `updated_by=user123`
  - Query parameters take priority over form fields

**File Requirements:**
- Supported formats: `.xlsx`, `.xls`, `.csv`
- Maximum file size: 5MB
- Required columns: `fullname`, `contactNo`, `address`, `email`
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
      "message": "Client created successfully"
    },
    {
      "row": 3,
      "status": "skipped",
      "message": "Client with this email already exists"
    },
    {
      "row": 4,
      "status": "error",
      "message": "Invalid email format"
    }
  ]
}
```

## File Format

### CSV Format
```csv
fullname,contactNo,address,email,status
John Doe,09123456789,123 Main Street,Quezon City,john.doe@email.com,active
Jane Smith,09234567890,456 Oak Avenue,Makati City,jane.smith@email.com,active
Mike Johnson,09345678901,789 Pine Road,Manila,mike.johnson@email.com,active
```

### Excel Format
The Excel file should have the same column structure as the CSV format.

## Validation Rules

1. **Required Fields:** All clients must have `fullname`, `contactNo`, `address`, and `email`
2. **Email Validation:** Email must be in valid format
3. **Duplicate Check:** Clients with the same email will be skipped
4. **Status:** If not provided, defaults to 'active'
5. **Contact Number:** Must be provided but no specific format validation
6. **Address:** Must be provided but no specific format validation

## Error Handling

The API provides detailed feedback for each row processed:

- **inserted**: Client was successfully created
- **skipped**: Client was skipped due to duplicate email
- **error**: Client had validation errors (missing fields, invalid email, etc.)

## Example Usage

### Using cURL
```bash
# Download template
curl -X GET http://localhost:3000/clients/downloadTemplate -o clients_template.csv

# Upload file (using query parameter)
curl -X POST "http://localhost:3000/clients/uploadClients?updated_by=user123" \
  -F "file=@clients.csv"

# Upload file (using form field)
curl -X POST http://localhost:3000/clients/uploadClients \
  -F "file=@clients.csv" \
  -F "updated_by=user123"
```

### Using JavaScript/Fetch
```javascript
// Download template
fetch('/clients/downloadTemplate')
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clients_template.csv';
    a.click();
  });

// Upload file (using query parameter)
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('/clients/uploadClients?updated_by=user123', {
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
formData2.append('updated_by', 'user123');

fetch('/clients/uploadClients', {
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
- Each client gets a unique client ID (CL000001, CL000002, etc.)
- The `dateCreated` and `dateUpdated` fields are automatically set to the current timestamp
- The `doc_type` field is automatically set to 'CLIENTS'
- Status field is optional and defaults to 'active' if not provided
- Email addresses are used as the unique identifier for duplicate checking 