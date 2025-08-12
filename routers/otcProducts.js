const express = require('express');
const router = express.Router();
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const path = require('path');
const ExcelJS = require('exceljs');

const COLLECTION = 'otcProducts';
const USED_QUANTITIES_COLLECTION = 'used_quantities';

// Helper function to track used quantities
async function trackUsedQuantities(productId, productName, branchId, oldQuantity, newQuantity, reason = 'manual_update') {
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
        item_type: 'otc_product',
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
      console.log(`Tracked quantity change for product ${productId}: ${quantityDifference > 0 ? 'decreased' : 'increased'} by ${Math.abs(quantityDifference)} units`);
    }
  } catch (error) {
    console.error('Error tracking used quantities:', error);
    // Don't throw error to avoid breaking the main update operation
  }
}

router.get('/', (req, res) => {
  res.send('Hello OTC Products');
});

// Create a new OTC product
router.post('/insertProduct', async (req, res) => {
    console.log(req.body);
  try {
    const { name, price, retail_price, quantity, min_quantity, branch_id, status, brand, category } = req.body;
    // Validate required fields
    if (!name || !price || !retail_price || !quantity || !branch_id || !min_quantity || !brand || !category) {
      return res.status(400).json({ error: 'Name, price, retail_price, min_quantity, quantity, branch_id, brand, and category are required' });
    }

    // Validate data types
    if (typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }
    
    if (typeof retail_price !== 'number' || retail_price <= 0) {
      return res.status(400).json({ error: 'Retail price must be a positive number' });
    }
    
    if (typeof min_quantity !== 'number' || min_quantity < 0) {
      return res.status(400).json({ error: 'Min quantity must be a non-negative number' });
    }
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a non-negative number' });
    }

    const id = uuidv4();
    const date_created = new Date().toISOString();
    const data = { id, name, price, retail_price, quantity, branch_id, date_created, min_quantity, status, brand, category };
    await admin.firestore().collection(COLLECTION).doc(id).set(data);
    res.status(201).json({ message: 'OTC product created', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all OTC products
router.get('/getAllProducts', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '' , min_quantity = null, category = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let searchField = 'name';
    let queryRef = admin.firestore().collection(COLLECTION);

    // Apply all filters that are present (search, branch_id, category)
    if (search) {
      queryRef = queryRef
        .where(searchField, '>=', search)
        .where(searchField, '<', search + '\uf8ff');
    }
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    if (category) {
      queryRef = queryRef.where('category', '==', category);
    }
    console.log(min_quantity ,'min_quantity');
    if (min_quantity !== null && min_quantity !== undefined) {
      if (parseInt(min_quantity) ===-1) {
        // in-stock: quantity > 0
        queryRef = queryRef.where('quantity', '>', 0);
      } else if (parseInt(min_quantity) === 0) {
        // out-of-stock: quantity = 0
        queryRef = queryRef.where('quantity', '==', 0);
      } else {
        // low-stock: quantity <= min_quantity (where min_quantity > 0)
        queryRef = queryRef.where('quantity', '<=', parseInt(min_quantity));
      }
    }

    // Pagination using startAfter
    if (page > 1) {
      const prevSnapshot = await queryRef.limit(pageSize * (page - 1)).get();
      const docs = prevSnapshot.docs;
      if (docs.length > 0) {
        const lastVisible = docs[docs.length - 1];
        queryRef = queryRef.startAfter(lastVisible);
      }
    }
    queryRef = queryRef.limit(pageSize);

    // Fetch data
    const snapshot = await queryRef.get();
    const products = snapshot.docs.map(doc => doc.data());

    // For total count, use a separate query without pagination
    let countQuery = admin.firestore().collection(COLLECTION);
    // Apply all filters that are present (search, branch_id, category) in the same order as above
    if (search) {
      countQuery = countQuery
        .where(searchField, '>=', search)
        .where(searchField, '<', search + '\uf8ff');
    }
    if (branch_id) {
      countQuery = countQuery.where('branch_id', '==', branch_id);
    }
    if (category) {
      countQuery = countQuery.where('category', '==', category);
    }
    if (min_quantity !== null && min_quantity !== undefined) {
      if (min_quantity >= -1) {
        // in-stock: quantity > 0
        countQuery = countQuery.where('quantity', '>', 0);
      } else if (min_quantity === 0) {
        // out-of-stock: quantity = 0
        countQuery = countQuery.where('quantity', '==', 0);
      } else {
        // low-stock: quantity <= min_quantity (where min_quantity > 0)
        countQuery = countQuery.where('quantity', '<=', min_quantity);
      }
    }
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    return res.status(200).json({ data: products, page, totalPages, totalCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// Get OTC products by branch_id
router.get('/getProductsByBranch/:branch_id', async (req, res) => {
  try {
    const snapshot = await admin.firestore().collection(COLLECTION).where('branch_id', '==', req.params.branch_id).get();
    const products = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get OTC products by category
router.get('/getProductsByCategory/:category', async (req, res) => {
  try {
    const { branch_id } = req.query;
    let queryRef = admin.firestore().collection(COLLECTION).where('category', '==', req.params.category);
    
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    
    const snapshot = await queryRef.get();
    const products = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all unique categories for a branch
router.get('/getCategories/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    if (!branch_id) {
      return res.status(400).json({ error: 'Branch ID is required' });
    }

    const snapshot = await admin.firestore()
      .collection(COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ data: [] });
    }

    // Extract unique categories
    const categories = new Set();
    snapshot.docs.forEach(doc => {
      const product = doc.data();
      if (product.category) {
        categories.add(product.category);
      }
    });

    const uniqueCategories = Array.from(categories).sort();
    return res.status(200).json({ data: uniqueCategories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get OTC categories for a branch (from categories collection)
router.get('/getOTCCategories/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    if (!branch_id) {
      return res.status(400).json({ error: 'Branch ID is required' });
    }

    // Fetch categories from the categories collection with type 'otc'
    const snapshot = await admin.firestore()
      .collection('categories')
      .where('branch_id', '==', branch_id)
      .where('type', '==', 'otc')
      .orderBy('name')
      .get();

    if (snapshot.empty) {
      return res.status(200).json({ data: [] });
    }

    const categories = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single OTC product by ID
router.get('/getProduct/:id', async (req, res) => {
  try {
    const doc = await admin.firestore().collection(COLLECTION).doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an OTC product by ID
router.put('/updateProduct/:id', async (req, res) => {
  try {
    const { name, price, retail_price, quantity, branch_id, status, min_quantity, brand, category } = req.body;
    
    // Get the current product data to compare quantities
    const currentProductDoc = await admin.firestore().collection(COLLECTION).doc(req.params.id).get();
    if (!currentProductDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const currentProduct = currentProductDoc.data();
    const oldQuantity = currentProduct.quantity || 0;
    const newQuantity = quantity !== undefined ? quantity : oldQuantity;
    
    const updateData = { name, price, retail_price, quantity, branch_id, status, min_quantity, brand, category };
    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    
    // Update the product
    await admin.firestore().collection(COLLECTION).doc(req.params.id).update(updateData);
    
    // Track quantity changes if quantity was modified
    if (newQuantity !== oldQuantity) {
      await trackUsedQuantities(
        req.params.id,
        currentProduct.name,
        currentProduct.branch_id,
        oldQuantity,
        newQuantity,
        'quantity_update'
      );
    }
    
    res.json({ message: 'OTC product updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an OTC product by ID
router.delete('/deleteProduct/:id', async (req, res) => {
  try {
    await admin.firestore().collection(COLLECTION).doc(req.params.id).delete();
    res.json({ message: 'OTC product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all OTC products by branch ID
router.delete('/deleteAllProductsByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    if (!branch_id) {
      return res.status(400).json({ error: 'Branch ID is required' });
    }

    // Get all products for the specified branch
    const snapshot = await admin.firestore()
      .collection(COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ 
        message: 'No OTC products found for this branch',
        deleted_count: 0
      });
    }

    // Delete all products in batches (Firestore batch limit is 500)
    const batchSize = 500;
    const products = snapshot.docs;
    let deletedCount = 0;

    for (let i = 0; i < products.length; i += batchSize) {
      const batch = admin.firestore().batch();
      const batchDocs = products.slice(i, i + batchSize);
      
      batchDocs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      deletedCount += batchDocs.length;
    }

    res.json({ 
      message: `Successfully deleted ${deletedCount} OTC products from branch ${branch_id}`,
      deleted_count: deletedCount,
      branch_id: branch_id
    });

  } catch (error) {
    console.error('Error deleting products by branch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update used quantities for an OTC product
router.post('/updateUsedQuantity/:id', async (req, res) => {
  try {
    const { quantity_used, reason = 'manual_usage' } = req.body;
    
    if (!quantity_used || quantity_used <= 0) {
      return res.status(400).json({ error: 'quantity_used must be a positive number' });
    }

    // Get the current product data
    const currentProductDoc = await admin.firestore().collection(COLLECTION).doc(req.params.id).get();
    if (!currentProductDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const currentProduct = currentProductDoc.data();
    const currentQuantity = currentProduct.quantity || 0;
    
    // Check if there's enough quantity to use
    if (currentQuantity < quantity_used) {
      return res.status(400).json({ 
        error: `Insufficient quantity. Available: ${currentQuantity}, Requested: ${quantity_used}` 
      });
    }
    
    // Calculate new quantity
    const newQuantity = currentQuantity - quantity_used;
    
    // Update the product quantity
    await admin.firestore().collection(COLLECTION).doc(req.params.id).update({
      quantity: newQuantity
    });
    
    // Track the used quantity
    await trackUsedQuantities(
      req.params.id,
      currentProduct.name,
      currentProduct.branch_id,
      currentQuantity,
      newQuantity,
      reason
    );
    
    res.json({ 
      message: 'Used quantity updated successfully',
      old_quantity: currentQuantity,
      new_quantity: newQuantity,
      quantity_used: quantity_used
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get used quantities for a specific OTC product
router.get('/getUsedQuantities/:id', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, date_from = '', date_to = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    let queryRef = admin.firestore().collection(USED_QUANTITIES_COLLECTION)
      .where('item_id', '==', req.params.id)
      .where('item_type', '==', 'otc_product');

    // Filter by date range if provided
    if (date_from) {
      queryRef = queryRef.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = new Date(date_to);
      nextDay.setDate(nextDay.getDate() + 1);
      queryRef = queryRef.where('date_created', '<', nextDay.toISOString());
    }

    // Pagination
    if (page > 1) {
      const prevSnapshot = await queryRef.limit(pageSize * (page - 1)).get();
      const docs = prevSnapshot.docs;
      if (docs.length > 0) {
        const lastVisible = docs[docs.length - 1];
        queryRef = queryRef.startAfter(lastVisible);
      }
    }
    queryRef = queryRef.limit(pageSize);

    const snapshot = await queryRef.get();
    const usedQuantities = snapshot.docs.map(doc => doc.data());

    // Count total
    let countQuery = admin.firestore().collection(USED_QUANTITIES_COLLECTION)
      .where('item_id', '==', req.params.id)
      .where('item_type', '==', 'otc_product');
    
    // Apply same date filtering to count query
    if (date_from) {
      countQuery = countQuery.where('date_created', '>=', date_from);
    }
    if (date_to) {
      const nextDay = new Date(date_to);
      nextDay.setDate(nextDay.getDate() + 1);
      countQuery = countQuery.where('date_created', '<', nextDay.toISOString());
    }
    
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    res.status(200).json({ 
      data: usedQuantities, 
      page, 
      totalPages, 
      totalCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configure multer for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv' // .csv alternative
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Download OTC products template
router.get('/downloadTemplate', (req, res) => {
  try {
    const fs = require('fs');
    const templatePath = path.join(__dirname, '../sample_otc_products_template.csv');
    
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template file not found' });
    }

    // Set proper headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="otc_products_template.csv"');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // Read and send the file
    const fileStream = fs.createReadStream(templatePath);
    fileStream.pipe(res);
    
    // Handle stream errors
    fileStream.on('error', (error) => {
      console.error('Error reading template file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading template file' });
      }
    });
    
  } catch (error) {
    console.error('Error downloading template:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Download Excel template with dropdown validation
router.get('/downloadExcelTemplate', async (req, res) => {
  try {
    const { branch_id } = req.query;
    
    if (!branch_id) {
      return res.status(400).json({ 
        error: 'branch_id is required as a query parameter (?branch_id=xxx)' 
      });
    }

    console.log('Generating Excel template with dropdowns...');
    
    // Fetch OTC categories for the branch
    let otcCategories = [];
    try {
      const categoriesSnapshot = await admin.firestore()
        .collection('categories')
        .where('branch_id', '==', branch_id)
        .where('type', '==', 'otc')
        .get();
      
      if (!categoriesSnapshot.empty) {
        otcCategories = categoriesSnapshot.docs.map(doc => doc.data().name);
      }
      
      // If no OTC categories found, add some default ones
      if (otcCategories.length === 0) {
        otcCategories = ['Personal Care', 'Health & Wellness', 'First Aid', 'Vitamins', 'Pain Relief', 'Dental Care'];
      }
    } catch (categoryError) {
      console.warn('Could not fetch categories, using defaults:', categoryError.message);
      otcCategories = ['Personal Care', 'Health & Wellness', 'First Aid', 'Vitamins', 'Pain Relief', 'Dental Care'];
    }
    
    // Create Excel file with dropdown validation
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Michiko POS System';
    workbook.lastModifiedBy = 'Michiko POS System';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    const worksheet = workbook.addWorksheet('OTC Products Template');
    
    // Define headers for OTC products
    const headers = ['name', 'price', 'retail_price', 'quantity', 'min_quantity', 'brand', 'category', 'status'];
    
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
      15.50,
      18.00,
      100,
      10,
      'Sample Brand',
      otcCategories[0] || 'Sample Category',
      'active'
    ]);
    
    // Style the sample row
    sampleRow.font = { italic: true, size: 11 };
    sampleRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F3FF' }
    };
    
    // Set column widths
    worksheet.getColumn('A').width = 25; // name
    worksheet.getColumn('B').width = 12; // price
    worksheet.getColumn('C').width = 12; // retail_price
    worksheet.getColumn('D').width = 12; // quantity
    worksheet.getColumn('E').width = 12; // min_quantity
    worksheet.getColumn('F').width = 20; // brand
    worksheet.getColumn('G').width = 20; // category
    worksheet.getColumn('H').width = 12; // status
    
    // Add data validation for category column (dropdown)
    const categoryList = otcCategories.join(',');
    worksheet.dataValidations.add('G2:G1000', {
      type: 'list',
      allowBlank: false,
      formulae: [`"${categoryList}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please select from the dropdown list of available categories'
    });
    
    // Add data validation for status column (dropdown)
    worksheet.dataValidations.add('H2:H1000', {
      type: 'list',
      allowBlank: false,
      formulae: ['"active,inactive"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Please select from the dropdown list: active or inactive'
    });
    
    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });
    
    // Add instructions sheet
    const instructionsSheet = workbook.addWorksheet('Instructions');
    instructionsSheet.addRow(['OTC Products Template - Instructions']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['1. Fill in the product details in the first sheet']);
    instructionsSheet.addRow(['2. Use the dropdown lists for category and status columns']);
    instructionsSheet.addRow(['3. Ensure all required fields are filled']);
    instructionsSheet.addRow(['4. Save as Excel file for upload (CSV will lose dropdowns)']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Field Descriptions:']);
    instructionsSheet.addRow(['- name: Product name (required)']);
    instructionsSheet.addRow(['- price: Cost price (required, positive number)']);
    instructionsSheet.addRow(['- retail_price: Selling price (required, positive number)']);
    instructionsSheet.addRow(['- quantity: Available quantity (required, non-negative number)']);
    instructionsSheet.addRow(['- min_quantity: Minimum stock level (required, non-negative number)']);
    instructionsSheet.addRow(['- brand: Product brand (required)']);
    instructionsSheet.addRow(['- category: Product category (required, use dropdown)']);
    instructionsSheet.addRow(['- status: Product status (required, use dropdown)']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Available Categories:']);
    otcCategories.forEach(category => {
      instructionsSheet.addRow([`  • ${category}`]);
    });
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Available Status: active, inactive']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['⚠️  IMPORTANT: Save as Excel (.xlsx) to preserve dropdowns!']);
    instructionsSheet.addRow(['   Saving as CSV will remove all dropdown validation.']);
    
    // Set response headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="otc_products_template_${branch_id}.xlsx"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Write to response using buffer to ensure proper Excel generation
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
      console.log('Excel file sent successfully with category dropdowns');
    } catch (writeError) {
      console.error('Error writing Excel buffer:', writeError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate Excel file' });
      }
    }
    
  } catch (error) {
    console.error('Error creating Excel template:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Download CSV template (simplified version)
router.get('/downloadCSVTemplate', async (req, res) => {
  try {
    const { branch_id } = req.query;
    
    if (!branch_id) {
      return res.status(400).json({ 
        error: 'branch_id is required as a query parameter (?branch_id=xxx)' 
      });
    }

    // Create CSV content with headers and sample data
    const csvHeaders = 'name,price,retail_price,quantity,min_quantity,brand,category,status';
    const csvSample = 'Sample Product,15.50,18.00,100,10,Sample Brand,Sample Category,active';
    
    // Create the CSV content
    const csvContent = csvHeaders + '\n' + csvSample;

    // Set proper headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="otc_products_template_${branch_id}.csv"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // Send the CSV content
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error creating CSV template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload Excel/CSV file to insert OTC products
router.post('/uploadProducts', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get branch_id from query parameters or form body (query params take priority)
    const branch_id = req.query.branch_id || req.body.branch_id;
    if (!branch_id) {
      return res.status(400).json({ 
        error: 'branch_id is required. Provide it as a query parameter (?branch_id=xxx) or in the form body' 
      });
    }

    const fileBuffer = req.file.buffer;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let products = [];

    // Parse file based on extension
    if (fileExtension === '.csv') {
      // Parse CSV file from buffer
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
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    if (products.length === 0) {
      return res.status(400).json({ error: 'No data found in the uploaded file' });
    }

    // Validate required columns
    const requiredColumns = ['name', 'price', 'retail_price', 'quantity', 'min_quantity', 'brand', 'category'];
    const firstRow = products[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      });
    }

    // Get existing products for duplicate checking
    const productsRef = admin.firestore().collection(COLLECTION);
    const existingProductsSnapshot = await productsRef
      .where('branch_id', '==', branch_id)
      .get();
    
    const existingProducts = new Set();
    existingProductsSnapshot.docs.forEach(doc => {
      const product = doc.data();
      existingProducts.add(product.name.toLowerCase().trim());
    });

    const results = {
      inserted: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process products in batches for better performance
    const batchSize = 50; // Process 50 products at a time
    const batches = [];
    
    for (let i = 0; i < products.length; i += batchSize) {
      batches.push(products.slice(i, i + batchSize));
    }

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchPromises = batch.map(async (row, batchItemIndex) => {
        const globalIndex = batchIndex * batchSize + batchItemIndex;
        const rowNumber = globalIndex + 2; // +2 because Excel/CSV is 1-indexed and we have headers

        try {
          // Validate required fields
          if (!row.name || !row.price || !row.retail_price || !row.quantity || !row.min_quantity || !row.brand || !row.category) {
            return {
              row: rowNumber,
              status: 'error',
              message: 'Missing required fields (name, price, retail_price, quantity, min_quantity, brand, category)'
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

          // Validate retail_price
          const retail_price = parseFloat(row.retail_price);
          if (isNaN(retail_price) || retail_price <= 0) {
            return {
              row: rowNumber,
              status: 'error',
              message: 'Invalid retail_price - must be a positive number'
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

          // Validate min_quantity
          const min_quantity = parseInt(row.min_quantity);
          if (isNaN(min_quantity) || min_quantity < 0) {
            return {
              row: rowNumber,
              status: 'error',
              message: 'Invalid min_quantity - must be a non-negative number'
            };
          }

          // Check for duplicates
          const productName = row.name.toLowerCase().trim();
          if (existingProducts.has(productName)) {
            return {
              row: rowNumber,
              status: 'skipped',
              message: 'Product with this name already exists'
            };
          }

          // Create product data
          const productId = uuidv4();
          const dateCreated = new Date().toISOString();
          
          const productData = {
            id: productId,
            name: row.name.trim(),
            price: price,
            retail_price: retail_price,
            quantity: quantity,
            min_quantity: min_quantity,
            brand: row.brand.trim(),
            category: row.category.trim(),
            status: row.status || 'active',
            branch_id: branch_id,
            date_created: dateCreated
          };

          // Insert product
          await productsRef.doc(productId).set(productData);
          
          // Add to existing products set to prevent duplicates within the same upload
          existingProducts.add(productName);
          
          return {
            row: rowNumber,
            status: 'inserted',
            message: 'Product created successfully'
          };

        } catch (error) {
          return {
            row: rowNumber,
            status: 'error',
            message: error.message
          };
        }
      });

      // Wait for all products in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      
      // Process batch results
      batchResults.forEach(result => {
        results.details.push(result);
        if (result.status === 'inserted') {
          results.inserted++;
        } else if (result.status === 'skipped') {
          results.skipped++;
        } else if (result.status === 'error') {
          results.errors++;
        }
      });
    }

    res.status(200).json({
      message: 'File processing completed',
      summary: {
        totalRows: products.length,
        inserted: results.inserted,
        skipped: results.skipped,
        errors: results.errors
      },
      details: results.details
    });

  } catch (error) {
    console.error('Error processing uploaded file:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
