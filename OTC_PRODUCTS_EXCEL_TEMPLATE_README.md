# OTC Products Excel Template System

This document describes the OTC products Excel template system for the Michiko POS Booking API, which allows bulk import of OTC products with **real Excel dropdown validation** and professional formatting.

## Overview

The OTC products Excel template system provides:
- **🎯 Real Excel Dropdowns** with data validation using ExcelJS library
- **📊 Dynamic Template Generation** with professional formatting
- **📁 Multiple Format Support** (Excel .xlsx with dropdowns, CSV fallback)
- **✅ Comprehensive Data Validation** with error messages
- **🔄 Excel/CSV Support** for bulk data import
- **🚫 Duplicate Prevention** within the same branch
- **📋 Detailed Error Reporting** with row-by-row details

## API Endpoints

### Base URL
```
/api/otcProducts
```

---

## 📥 Template Download

### 🎯 Download Excel Template (Recommended)
**GET** `/downloadExcelTemplate?branch_id={branch_id}`

Downloads an Excel (.xlsx) file with **real dropdown validation** for status and professional formatting.

**Query Parameters:**
- `branch_id` (required) - The branch ID for the template

**Features:**
- ✅ **Real dropdown lists** for status column
- ✅ **Data validation** with error messages
- ✅ **Professional formatting** with borders and styling
- ✅ **Instructions sheet** with field descriptions
- ✅ **Sample data rows** for reference
- ✅ **Column width optimization**
- ✅ **Excel-only format** with proper MIME types

**Response:**
- Excel file (.xlsx) with dropdown validation
- Filename: `otc_products_template_{branch_id}.xlsx`

**Example:**
```
GET /api/otcProducts/downloadExcelTemplate?branch_id=branch123
```

### 📄 Download CSV Template (Reference Only)
**GET** `/downloadCSVTemplate?branch_id={branch_id}`

Downloads a CSV template with headers and sample data (for reference only).

**⚠️  Note:** This is for reference only. The Excel template provides better validation and formatting.

**Query Parameters:**
- `branch_id` (required) - The branch ID for the template

**Response:**
- CSV file with headers and sample data
- Filename: `otc_products_template_{branch_id}.csv`

### 📄 Download Legacy Template (CSV)
**GET** `/downloadTemplate`

Downloads the original CSV template file (legacy endpoint).

**Response:**
- CSV file from static template
- Filename: `otc_products_template.csv`

---

## 📊 Template Structure

### Excel Template Features

#### 1. **Main Sheet: OTC Products Template**
- **Headers:** name, price, retail_price, quantity, min_quantity, brand, status
- **Sample Data:** Pre-filled example row
- **Professional Formatting:** Borders, colors, and optimized column widths

#### 2. **Status Column (Column G)**
- Predefined options: active, inactive
- Dropdown validation with error messages
- Ensures consistency in status values

#### 3. **Instructions Sheet**
- Step-by-step usage instructions
- Field descriptions and requirements
- Available options and validation rules
- Important notes about Excel vs CSV

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

#### 1. Download Excel Template (Recommended)
```javascript
// Download Excel template with dropdowns for specific branch
const downloadExcelTemplate = async (branchId) => {
  try {
    const response = await fetch(`/api/otcProducts/downloadExcelTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otc_products_template_${branchId}.xlsx`;
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

#### 2. Download CSV Template (Reference)
```javascript
// Download CSV template for reference
const downloadCSVTemplate = async (branchId) => {
  try {
    const response = await fetch(`/api/otcProducts/downloadCSVTemplate?branch_id=${branchId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `otc_products_template_${branchId}.csv`;
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

#### 3. Upload File
```javascript
// Upload OTC products file
const uploadOTCProducts = async (file, branchId) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`/api/otcProducts/uploadProducts?branch_id=${branchId}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Upload result:', result);
    
    return result;
    
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};
```

---

## 📋 Template Fields

### Required Fields
| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `name` | string | Product name | Required, non-empty |
| `price` | number | Cost price | Required, positive number |
| `retail_price` | number | Selling price | Required, positive number |
| `quantity` | number | Available quantity | Required, non-negative number |
| `min_quantity` | number | Minimum stock level | Required, non-negative number |
| `brand` | string | Product brand | Required, non-empty |
| `status` | string | Product status | Required, dropdown: active/inactive |

### Field Descriptions
- **name**: The name of the OTC product (e.g., "Paracetamol 500mg")
- **price**: The cost price of the product (e.g., 15.50)
- **retail_price**: The selling price to customers (e.g., 18.00)
- **quantity**: Current available stock quantity (e.g., 100)
- **min_quantity**: Minimum stock level before reorder (e.g., 10)
- **brand**: Product brand or manufacturer (e.g., "Generic")
- **status**: Product availability status (active/inactive)

---

## 🔧 Technical Details

### Dependencies
- **ExcelJS:** Professional Excel file generation
- **Express:** Web framework for API endpoints
- **Multer:** File upload handling

### File Formats Supported
- **Excel (.xlsx):** Full featured with dropdowns and validation
- **Excel (.xls):** Legacy Excel format
- **CSV:** Simple text format (loses dropdowns)

### File Size Limits
- **Maximum Size:** 5MB
- **Recommended:** Under 2MB for optimal performance

---

## 🚨 Troubleshooting

### Common Issues

#### 1. **Template Downloads as CSV Instead of Excel**
- Ensure you're calling `/downloadExcelTemplate` endpoint
- Check that ExcelJS is properly installed
- Verify response headers contain Excel MIME type

#### 2. **Dropdown Validation Not Working**
- Save file as Excel (.xlsx) format
- Avoid saving as CSV (removes validation)
- Check that Excel application supports data validation

#### 3. **File Upload Errors**
- Verify file size is under 5MB
- Ensure all required fields are filled
- Check that numeric fields contain valid numbers
- Verify branch_id is provided

### Error Messages
- **Missing branch_id:** "branch_id is required as a query parameter"
- **File too large:** "File size exceeds 5MB limit"
- **Invalid format:** "Only Excel (.xlsx, .xls) and CSV files are allowed"
- **Missing fields:** "Missing required columns: [field_names]"

---

## 📚 Related Documentation

- [Services Products Excel Template](../SERVICES_PRODUCTS_FILE_UPLOAD_README.md)
- [File Upload System Overview](../README.md)
- [API Endpoints Reference](../README.md)

---

## 🔄 Version History

- **v1.0.0** - Initial Excel template implementation
- Added ExcelJS integration
- Added dropdown validation for status
- Added professional formatting and instructions
- Added CSV template endpoint for reference 