# Services Products File Upload System

This document describes the services products file upload system for the Michiko POS Booking API, which allows bulk import of services products with **real Excel dropdown validation** and dynamic category management.

## Overview

The services products file upload system provides:
- **🎯 Real Excel Dropdowns** with data validation using ExcelJS library
- **📊 Dynamic Template Generation** based on branch-specific categories
- **📁 Multiple Format Support** (Excel .xlsx with dropdowns, CSV fallback)
- **✅ Comprehensive Data Validation** with error messages
- **🔄 Excel/CSV Support** for bulk data import
- **🚫 Duplicate Prevention** within the same branch
- **📋 Detailed Error Reporting** with row-by-row details

## API Endpoints

### Base URL
```
/api/servicesProducts
```

---

## 📥 Template Download

### 🎯 Download Excel Template (Default)
**GET** `/downloadTemplate?branch_id={branch_id}`

Downloads an Excel (.xlsx) file with **real dropdown validation** for categories, units, and status. **This is now the default and only format.**

**Query Parameters:**
- `branch_id` (required) - The branch ID to get categories for

**Features:**
- ✅ **Real dropdown lists** for category, unit, and status columns
- ✅ **Data validation** with error messages
- ✅ **Professional formatting** with borders and styling
- ✅ **Instructions sheet** with available options
- ✅ **Sample data rows** for reference
- ✅ **Column width optimization**
- ✅ **Excel-only format** - no more CSV confusion!

**Response:**
- Excel file (.xlsx) with dropdown validation
- Filename: `services_products_template_{branch_id}.xlsx`

**Example:**
```
GET /api/servicesProducts/downloadTemplate?branch_id=branch123
```

### 🎯 Download Excel Template with Dropdowns (Alternative)
**GET** `/downloadExcelTemplate?branch_id={branch_id}`

Alternative endpoint that also downloads an Excel (.xlsx) file with **real dropdown validation**.

**Query Parameters:**
- `branch_id` (required) - The branch ID to get categories for

**Features:**
- Same as the main endpoint above
- Guaranteed Excel format
- Useful for explicit Excel downloads

**Response:**
- Excel file (.xlsx) with dropdown validation
- Filename: `services_products_template_{branch_id}.xlsx`

### 📄 Download CSV Template (Reference Only)
**GET** `/downloadCSVTemplate?branch_id={branch_id}`

Downloads a CSV template with categories as pipe-separated values (for reference only).

**⚠️  Note:** This is for reference only. The main template endpoint now generates Excel files by default.

**Query Parameters:**
- `branch_id` (required) - The branch ID to get categories for

**Response:**
- CSV file with headers and sample data
- Categories included as pipe-separated values for reference
- Filename: `services_products_template_{branch_id}.csv`

---

## 📊 Categories Management

### Get Categories by Branch
**GET** `/getCategoriesByBranch/{branch_id}`

Retrieves all categories for a specific branch.

**Path Parameters:**
- `branch_id` - The branch ID

**Response:**
```json
{
  "data": [
    {
      "id": "category-uuid",
      "name": "Hair Care"
    },
    {
      "id": "category-uuid",
      "name": "Styling & Make Up"
    }
  ],
  "message": "Categories retrieved successfully"
}
```

---

## 📤 File Upload

### Upload Services Products
**POST** `/uploadServicesProducts?branch_id={branch_id}`

Uploads an Excel or CSV file to bulk insert services products.

**Query Parameters:**
- `branch_id` (required) - The branch ID for the products

**Form Data:**
- `file` - Excel (.xlsx, .xls) or CSV file

**File Requirements:**
- **File Size:** Maximum 5MB
- **Supported Formats:** .xlsx, .xls, .csv
- **Required Columns:** name, category, unit, quantity, unit_value, min_quantity, price, brand
- **Optional Columns:** status

**CSV Template Structure:**
```csv
name,category,unit,quantity,unit_value,min_quantity,price,brand,status
Hair Shampoo,Hair Care,bottle,50,12.75,5,15.00,Professional Brand,active
Conditioner,Hair Care,bottle,45,14.25,5,17.50,Professional Brand,active
```

**Response:**
```json
{
  "message": "File processing completed",
  "summary": {
    "totalRows": 2,
    "inserted": 2,
    "skipped": 0,
    "errors": 0
  },
  "details": [
    {
      "row": 2,
      "status": "inserted",
      "message": "Service product created successfully"
    },
    {
      "row": 3,
      "status": "inserted",
      "message": "Service product created successfully"
    }
  ]
}
```

---

## 🔍 Data Validation

### Required Fields
- **name** - Product name (must be unique within the branch)
- **category** - Must match an existing category in the branch
- **unit** - Unit of measurement (e.g., pcs, bottle, tube)
- **quantity** - Initial stock quantity (non-negative integer)
- **unit_value** - Cost per unit (positive number)
- **min_quantity** - Minimum stock level (non-negative integer)
- **price** - Selling price (positive number)
- **brand** - Product brand name

### Validation Rules
1. **Category Validation:** Category must exist in the specified branch
2. **Duplicate Prevention:** Product names must be unique within the same branch
3. **Numeric Validation:** Quantity, unit_value, min_quantity, and price must be valid numbers
4. **Range Validation:** Quantity and min_quantity must be non-negative, prices must be positive

---

## 🎯 Excel Dropdown Features

### Real Dropdown Lists
The Excel template includes **actual dropdown validation** for:

#### 1. **Category Column (Column B)**
- Dropdown with all available categories for the branch
- Automatically populated from database
- Prevents invalid category entries

#### 2. **Unit Column (Column C)**
- Predefined units: pcs, bottle, tube, jar, piece, box, pack, set, roll, can
- Ensures consistency in unit naming

#### 3. **Status Column (Column I)**
- Options: active, inactive
- Standardizes status values

### Data Validation Features
- **Error Messages:** Custom error messages for invalid entries
- **Error Titles:** Descriptive error titles
- **Dropdown Arrows:** Visible dropdown arrows in Excel
- **Input Restrictions:** Prevents manual entry of invalid values

### Professional Formatting
- **Borders:** Clean borders around all cells
- **Header Styling:** Bold headers with gray background
- **Sample Row Styling:** Italic sample data with light blue background
- **Column Widths:** Optimized column widths for readability
- **Instructions Sheet:** Separate sheet with usage instructions

---

## 🚀 Usage Examples

### Frontend Integration

#### 1. Download Excel Template (Default)
```javascript
// Download Excel template with dropdowns for specific branch
const downloadExcelTemplate = async (branchId) => {
  try {
    const response = await fetch(`/api/servicesProducts/downloadTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services_products_template_${branchId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading template:', error);
    alert('Failed to download template. Please try again.');
  }
};
```

#### 2. Download Excel Template (Alternative Endpoint)
```javascript
// Download Excel template using alternative endpoint
const downloadExcelTemplateAlt = async (branchId) => {
  try {
    const response = await fetch(`/api/servicesProducts/downloadExcelTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services_products_template_${branchId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading template:', error);
    alert('Failed to download template. Please try again.');
  }
};
```

#### 3. Download CSV Template (Reference Only)
```javascript
// Download CSV template for reference
const downloadCSVTemplate = async (branchId) => {
  try {
    const response = await fetch(`/api/servicesProducts/downloadCSVTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `services_products_template_${branchId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error('Error downloading template:', error);
    alert('Failed to download template. Please try again.');
  }
};
```

#### 4. Get Categories for Frontend Dropdown
```javascript
// Get categories for frontend dropdown
const getCategories = async (branchId) => {
  const response = await fetch(`/api/servicesProducts/getCategoriesByBranch/${branchId}`);
  const data = await response.json();
  return data.data;
};
```

#### 5. Upload File
```javascript
// Upload services products file
const uploadFile = async (file, branchId) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`/api/servicesProducts/uploadServicesProducts?branch_id=${branchId}`, {
    method: 'POST',
    body: formData
  });
  
  return await response.json();
};
```

---

## 📋 Excel Template Instructions

### How to Use the Excel Template

1. **Download the Excel template** using `/downloadExcelTemplate?branch_id={branch_id}`
2. **Open in Excel** or compatible spreadsheet software
3. **Use dropdown arrows** in category, unit, and status columns
4. **Fill in product details** following the sample rows
5. **Save the file** (Excel format recommended to preserve dropdowns)
6. **Upload the file** using the upload endpoint

### Template Features
- **First Sheet:** Main template with dropdowns and sample data
- **Second Sheet:** Instructions with available options
- **Data Validation:** Automatic validation with error messages
- **Professional Layout:** Clean, easy-to-use interface

---

## ⚠️ Error Handling

### Common Errors
1. **Missing branch_id** - 400 Bad Request
2. **No categories found** - 404 Not Found
3. **Invalid file format** - 400 Bad Request
4. **Missing required columns** - 400 Bad Request
5. **Duplicate product names** - Products skipped with details
6. **Invalid data types** - Row-level error reporting

### Fallback Mechanism
- If dynamic template creation fails, the system falls back to the static template
- Static template provides generic sample data without branch-specific categories
- All errors are logged for debugging purposes

---

## 🔧 Technical Details

### File Processing
- **Batch Processing:** Files are processed in batches of 50 rows for optimal performance
- **Memory Management:** Uses memory storage for file processing
- **Stream Handling:** Proper error handling for file streams
- **Transaction Safety:** Each product insertion is atomic

### Excel Generation
- **Library:** ExcelJS for professional Excel file creation
- **Data Validation:** Real dropdown lists with error messages
- **Formatting:** Professional styling with borders and colors
- **Instructions:** Separate sheet with usage guidance

### Performance Considerations
- **Batch Size:** 50 products per batch (configurable)
- **File Size Limit:** 5MB maximum
- **Memory Usage:** Efficient buffer handling for large files
- **Database Operations:** Optimized Firestore queries

---

## 📝 Notes

- **Category Management:** Ensure categories exist before uploading products
- **Branch Isolation:** Products are automatically associated with the specified branch
- **Status Default:** If status is not provided, defaults to 'active'
- **Date Tracking:** All products include creation timestamps
- **Audit Trail:** Quantity changes are tracked in the used_quantities collection
- **Excel Compatibility:** Templates work with Excel, Google Sheets, and other spreadsheet software
- **Dropdown Persistence:** Dropdowns are preserved when saving as Excel format 