const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');
const ExcelJS = require('exceljs');

const COLLECTION = 'services_products';
const USED_QUANTITIES_COLLECTION = 'used_quantities';

// Helper function to track used quantities
async function trackUsedQuantities(productId, productName, branchId, oldQuantity, newQuantity, reason = 'quantity_update') {
  try {
    const quantityDifference = oldQuantity - newQuantity;
    
    // Track all quantity changes (both increases and decreases)
    if (quantityDifference !== 0) {
      const usedQuantityId = uuidv4();
      const usedQuantityData = {
        id: usedQuantityId,
        transaction_id: null, // No transaction ID for manual updates
        branch_id: branchId,
        item_id: productId,
        item_name: productName,
        item_type: 'services_product',
        quantity_used: quantityDifference > 0 ? quantityDifference : 0, // Positive for decreases
        quantity_added: quantityDifference < 0 ? Math.abs(quantityDifference) : 0, // Positive for increases
        unit_price: 0, // Not applicable for manual updates
        total_value: 0, // Not applicable for manual updates
        date_created: new Date().toISOString(),
        doc_type: 'USED_QUANTITIES',
        update_reason: reason,
        change_type: quantityDifference > 0 ? 'decrease' : 'increase',
        old_quantity: oldQuantity,
        new_quantity: newQuantity
      };

      await admin.firestore().collection(USED_QUANTITIES_COLLECTION).doc(usedQuantityId).set(usedQuantityData);
      console.log(`Tracked quantity change for service product ${productId}: ${quantityDifference > 0 ? 'decreased' : 'increased'} by ${Math.abs(quantityDifference)} units`);
    }
  } catch (error) {
    console.error('Error tracking used quantities:', error);
    // Don't throw error to avoid breaking the main update operation
  }
}

// Helper function to get category ID by name and branch
async function getCategoryId(categoryName, branch_id) {
  const categoryRef = admin.firestore().collection('categories');
  const categorySnapshot = await categoryRef.where('name', '==', categoryName).where('branch_id', '==', branch_id).get();
  if(categorySnapshot.empty){
    return null;
  }
  return categorySnapshot.docs[0].id;
}

// Helper function to create Excel template with dropdown validation
async function createExcelTemplate(branch_id, categories) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Michiko POS System';
  workbook.lastModifiedBy = 'Michiko POS System';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  const worksheet = workbook.addWorksheet('Services Products Template');
  
  // Define headers
  const headers = ['name', 'category', 'unit', 'quantity', 'unit_value', 'min_quantity', 'price', 'brand', 'status'];
  
  // Add headers row
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, size: 12 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Add sample data row
  const sampleRow = worksheet.addRow([
    'Sample Product',
    categories[0] || 'Hair Care', // Use first available category or fallback
    'g',
    100,
    15.50,
    10,
    18.00,
    'Sample Brand',
    'active'
  ]);
  
  // Style the sample row
  sampleRow.font = { italic: true, size: 11 };
  sampleRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF0F8FF' }
  };
  
  // Add more sample rows with different categories
  if (categories.length > 1) {
    worksheet.addRow([
      'Hair Shampoo',
      categories[1] || 'Hair Care',
      'ml',
      50,
      12.75,
      5,
      15.00,
      'Professional Brand',
      'active'
    ]);
  }
  
  if (categories.length > 2) {
    worksheet.addRow([
      'Conditioner',
      categories[2] || 'Styling & Make Up',
      'l',
      45,
      14.25,
      5,
      17.50,
      'Professional Brand',
      'active'
    ]);
  }
  
  // Set column widths
  worksheet.getColumn('A').width = 25; // name
  worksheet.getColumn('B').width = 30; // category
  worksheet.getColumn('C').width = 15; // unit
  worksheet.getColumn('D').width = 15; // quantity
  worksheet.getColumn('E').width = 18; // unit_value
  worksheet.getColumn('F').width = 18; // min_quantity
  worksheet.getColumn('G').width = 15; // price
  worksheet.getColumn('H').width = 25; // brand
  worksheet.getColumn('I').width = 15; // status
  
  // Add data validation for category column (dropdown)
  if (categories.length > 0) {
    const categoryValidation = {
      type: 'list',
      allowBlank: false,
      formulae: [`"${categories.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please select a valid category from the dropdown list.',
      showDropDown: true,
      promptTitle: 'Select Category',
      prompt: 'Choose a category from the dropdown list'
    };
    worksheet.dataValidations.add('B2:B1000', categoryValidation);
  }
  
  // Add data validation for status column (dropdown)
  const statusValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"active,inactive"'],
    showErrorMessage: true,
    errorTitle: 'Invalid Status',
    error: 'Please select either "active" or "inactive".',
    showDropDown: true,
    promptTitle: 'Select Status',
    prompt: 'Choose either "active" or "inactive"'
  };
  worksheet.dataValidations.add('I2:I1000', statusValidation);
  
  // Add data validation for unit column (common units)
  const unitValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"g,ml,l"'],
    showErrorMessage: true,
    errorTitle: 'Invalid Unit',
    error: 'Please select a valid unit from the dropdown list.',
    showDropDown: true,
    promptTitle: 'Select Unit',
    prompt: 'Choose a unit from the dropdown list'
  };
  worksheet.dataValidations.add('C2:C1000', unitValidation);
  
  // Add number validation for numeric columns
  const quantityValidation = {
    type: 'whole',
    operator: 'greaterThanOrEqual',
    formulae: ['0'],
    showErrorMessage: true,
    errorTitle: 'Invalid Quantity',
    error: 'Quantity must be a non-negative whole number.',
    showInputMessage: true,
    promptTitle: 'Quantity Input',
    prompt: 'Enter a non-negative whole number'
  };
  worksheet.dataValidations.add('D2:D1000', quantityValidation);
  
  const unitValueValidation = {
    type: 'decimal',
    operator: 'greaterThan',
    formulae: ['0'],
    showErrorMessage: true,
    errorTitle: 'Invalid Unit Value',
    error: 'Unit value must be a positive number.',
    showInputMessage: true,
    promptTitle: 'Unit Value Input',
    prompt: 'Enter a positive number'
  };
  worksheet.dataValidations.add('E2:E1000', unitValueValidation);
  
  const minQuantityValidation = {
    type: 'whole',
    operator: 'greaterThanOrEqual',
    formulae: ['0'],
    showErrorMessage: true,
    errorTitle: 'Invalid Min Quantity',
    error: 'Minimum quantity must be a non-negative whole number.',
    showInputMessage: true,
    promptTitle: 'Min Quantity Input',
    prompt: 'Enter a non-negative whole number'
  };
  worksheet.dataValidations.add('F2:F1000', minQuantityValidation);
  
  const priceValidation = {
    type: 'decimal',
    operator: 'greaterThan',
    formulae: ['0'],
    showErrorMessage: true,
    errorTitle: 'Invalid Price',
    error: 'Price must be a positive number.',
    showInputMessage: true,
    promptTitle: 'Price Input',
    prompt: 'Enter a positive number'
  };
  worksheet.dataValidations.add('G2:G1000', priceValidation);
  
  // Add borders to all cells
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  });
  
  // Add instructions sheet
  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.addRow(['Services Products Template - Instructions']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['1. Fill in the product details in the first sheet']);
  instructionsSheet.addRow(['2. Use the dropdown lists for category, status, and unit columns']);
  instructionsSheet.addRow(['3. Ensure all required fields are filled']);
  instructionsSheet.addRow(['4. Save as Excel file (.xlsx) to preserve dropdowns']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['Available Categories:']);
  categories.forEach(category => {
    instructionsSheet.addRow([`- ${category}`]);
  });
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['Available Units: g, ml, l']);
  instructionsSheet.addRow(['Available Status: active, inactive']);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(['⚠️  IMPORTANT: Save as Excel (.xlsx) to preserve dropdowns!']);
  instructionsSheet.addRow(['   Saving as CSV will remove all dropdown validation.']);
  
  return workbook;
}

// Helper function to create CSV template
function createCSVTemplate(branch_id, categories) {
  const categoryList = categories.join('|'); // Pipe-separated for reference
  
  // Create CSV content with headers and sample data
  const csvHeaders = 'name,category,unit,quantity,unit_value,min_quantity,price,brand,status';
  const csvSample = 'Sample Product,' + categoryList + ',pcs,100,15.50,10,18.00,Sample Brand,active';
  
  // Create the CSV content
  return csvHeaders + '\n' + csvSample;
}

// Helper function to validate product data from file upload
function validateProductData(row, rowNumber) {
  // Validate required fields
  if (!row.name || !row.category || !row.unit || !row.quantity || !row.unit_value || !row.min_quantity || !row.price || !row.brand) {
    return {
      row: rowNumber,
      status: 'error',
      message: 'Missing required fields'
    };
  }

  // Validate price
  const price = parseFloat(row.price);
  if (isNaN(price) || price <= 0) {
    return {
      row: rowNumber,
      status: 'error',
      message: 'Invalid price - must be a positive number'
    };
  }

  // Validate quantity
  const quantity = parseInt(row.quantity);
  if (isNaN(quantity) || quantity < 0) {
    return {
      row: rowNumber,
      status: 'error',
      message: 'Invalid quantity - must be a non-negative number'
    };
  }

  // Validate unit_value
  const unit_value = parseFloat(row.unit_value);
  if (isNaN(unit_value) || unit_value <= 0) {
    return {
      row: rowNumber,
      status: 'error',
      message: 'Invalid unit_value - must be a positive number'
    };
  }

  // Validate min_quantity
  const min_quantity = parseInt(row.min_quantity);
  if (isNaN(min_quantity) || min_quantity < 0) {
    return {
      row: rowNumber,
      status: 'error',
      message: 'Invalid min_quantity - must be a non-negative number'
    };
  }

  return { status: 'valid', data: { price, quantity, unit_value, min_quantity } };
}

// Helper function to create product data object
function createProductData(row, productId, branch_id, categoryId, validatedData) {
  const dateCreated = new Date().toISOString();
  const total_value = parseFloat((validatedData.quantity * validatedData.unit_value).toFixed(2));
  
  return {
    id: productId,
    name: row.name.trim(),
    category: categoryId,
    unit: row.unit.trim(),
    quantity: validatedData.quantity,
    unit_value: validatedData.unit_value,
    total_value: total_value,
    min_quantity: validatedData.min_quantity,
    price: validatedData.price,
    brand: row.brand.trim(),
    status: row.status.trim() || 'active',
    branch_id: branch_id,
    date_created: dateCreated
  };
}

// Helper function to process file upload and parse data
async function parseUploadedFile(fileBuffer, fileExtension) {
  let products = [];

  if (fileExtension === '.csv') {
    // Parse CSV file from buffer
    const csv = require('csv-parser');
    const results = [];
    await new Promise((resolve, reject) => {
      const stream = require('stream');
      const readable = new stream.Readable();
      readable.push(fileBuffer);
      readable.push(null);
      
      readable
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve())
        .on('error', (error) => reject(error));
    });
    products = results;
  } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
    // Parse Excel file from buffer
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    products = xlsx.utils.sheet_to_json(worksheet);
  }

  return products;
}

module.exports = {
  trackUsedQuantities,
  getCategoryId,
  createExcelTemplate,
  createCSVTemplate,
  validateProductData,
  createProductData,
  parseUploadedFile,
  COLLECTION,
  USED_QUANTITIES_COLLECTION
};
