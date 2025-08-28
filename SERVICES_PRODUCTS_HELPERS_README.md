# Services Products Helper Functions

This document describes the helper functions extracted from the `servicesProducts.js` router to improve code organization and maintainability.

## File Location
`services/servicesProducts-helpers.js`

## Exported Functions

### 1. `trackUsedQuantities(productId, productName, branchId, oldQuantity, newQuantity, reason)`
Tracks quantity changes for service products in the used quantities collection.

**Parameters:**
- `productId` (string): The ID of the service product
- `productName` (string): The name of the service product
- `branchId` (string): The branch ID
- `oldQuantity` (number): The previous quantity
- `newQuantity` (number): The new quantity
- `reason` (string, optional): Reason for the quantity change (default: 'quantity_update')

**Returns:** Promise<void>

**Description:** This function automatically tracks all quantity changes (both increases and decreases) and stores them in the `used_quantities` collection for audit purposes.

---

### 2. `getCategoryId(categoryName, branch_id)`
Retrieves the category ID by name and branch.

**Parameters:**
- `categoryName` (string): The name of the category
- `branch_id` (string): The branch ID

**Returns:** Promise<string|null> - The category ID or null if not found

**Description:** Queries the categories collection to find a category with the specified name and branch ID.

---

### 3. `createExcelTemplate(branch_id, categories)`
Creates an Excel template with dropdown validation for services products.

**Parameters:**
- `branch_id` (string): The branch ID
- `categories` (array): Array of category names

**Returns:** Promise<ExcelJS.Workbook> - The created Excel workbook

**Description:** Generates a comprehensive Excel template with:
- Headers and sample data
- Dropdown validation for categories, status, and units
- Data validation for numeric fields
- Instructions sheet with available options
- Proper formatting and styling

---

### 4. `createCSVTemplate(branch_id, categories)`
Creates a CSV template for services products.

**Parameters:**
- `branch_id` (string): The branch ID
- `categories` (array): Array of category names

**Returns:** string - The CSV content

**Description:** Generates a simple CSV template with headers and sample data row.

---

### 5. `validateProductData(row, rowNumber)`
Validates product data from file uploads.

**Parameters:**
- `row` (object): The row data from the uploaded file
- `rowNumber` (number): The row number for error reporting

**Returns:** object - Validation result with status and data or error message

**Description:** Performs comprehensive validation of:
- Required fields presence
- Price validation (positive number)
- Quantity validation (non-negative integer)
- Unit value validation (positive number)
- Minimum quantity validation (non-negative integer)

---

### 6. `createProductData(row, productId, branch_id, categoryId, validatedData)`
Creates a product data object for database insertion.

**Parameters:**
- `row` (object): The row data from the uploaded file
- `productId` (string): The generated product ID
- `branch_id` (string): The branch ID
- `categoryId` (string): The category ID
- `validatedData` (object): The validated data from `validateProductData`

**Returns:** object - The complete product data object

**Description:** Constructs a properly formatted product object with all required fields, calculated values, and proper data types.

---

### 7. `parseUploadedFile(fileBuffer, fileExtension)`
Parses uploaded Excel or CSV files.

**Parameters:**
- `fileBuffer` (Buffer): The file buffer from multer
- `fileExtension` (string): The file extension (.csv, .xlsx, .xls)

**Returns:** Promise<array> - Array of parsed product objects

**Description:** Handles both CSV and Excel file parsing, converting them to JavaScript objects for processing.

---

## Constants

### `COLLECTION`
The Firestore collection name for services products: `'services_products'`

### `USED_QUANTITIES_COLLECTION`
The Firestore collection name for tracking used quantities: `'used_quantities'`

---

## Usage Example

```javascript
const {
  trackUsedQuantities,
  getCategoryId,
  createExcelTemplate,
  validateProductData,
  createProductData
} = require('../services/servicesProducts-helpers');

// Track quantity changes
await trackUsedQuantities('product123', 'Shampoo', 'branch1', 100, 95, 'usage');

// Get category ID
const categoryId = await getCategoryId('Hair Care', 'branch1');

// Create Excel template
const workbook = await createExcelTemplate('branch1', ['Hair Care', 'Styling']);

// Validate product data
const validation = validateProductData(rowData, 1);
if (validation.status === 'valid') {
  const productData = createProductData(rowData, 'id123', 'branch1', categoryId, validation.data);
}
```

---

## Benefits of This Refactoring

1. **Code Reusability**: Helper functions can be used across different parts of the application
2. **Maintainability**: Logic is centralized and easier to update
3. **Testability**: Individual functions can be unit tested independently
4. **Readability**: Router code is cleaner and focuses on HTTP handling
5. **Separation of Concerns**: Business logic is separated from HTTP routing logic

---

## Dependencies

The helper functions require the following packages:
- `firebase-admin` - For Firestore operations
- `uuid` - For generating unique IDs
- `xlsx` - For Excel file parsing
- `exceljs` - For Excel file generation
- `csv-parser` - For CSV file parsing (required dynamically)
- `stream` - Node.js built-in module (required dynamically)
