const express = require('express');
const router = express.Router();
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');

const { convertToProperCase } = require('../services/helper-service');

// Import helper functions
const {
  trackUsedQuantities,
  getCategoryId,
  createExcelTemplate,
  createCSVTemplate,
  validateProductData,
  createProductData,
  parseUploadedFile,
  COLLECTION,
  USED_QUANTITIES_COLLECTION
} = require('../services/servicesProducts-helpers');

// Create a new service product
router.post('/insertServiceProduct', async (req, res) => {
  try {
    const { name, category, unit, quantity, total_value, status, branch_id, unit_value, min_quantity, price, brand } = req.body;
    
    // Validation: Check if required fields exist
    if (!name || !branch_id) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['name', 'branch_id'],
        received: { name: !!name, branch_id: !!branch_id }
      });
    }
    
    // Validation: Check if branch exists in Firestore
    const servicesProducts = await admin.firestore().collection(COLLECTION)
    .where('branch_id', '==', branch_id)
    .where('name', '==', convertToProperCase(name))
    .where('category', '==', category)
    .get();
    if (servicesProducts.docs.length > 0) {
      return res.status(400).json({ 
        error: 'Service product already exists in this branch and category', 
        branch_id: branch_id 
      });
    }
    
    const id = uuidv4();
    const date_created = new Date().toISOString();
    const data = { id, name:convertToProperCase(name), category, unit, quantity, total_value, unit_value, min_quantity, price, brand, date_created, status, branch_id };
    await admin.firestore().collection(COLLECTION).doc(id).set(data);
    res.status(201).json({ message: 'Service product created', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all service products
router.get('/getAllServicesProducts', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '', category = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let searchField = 'name';
    let queryRef = admin.firestore().collection(COLLECTION);

    // Apply all filters that are present (search, branch_id, category)
    if (search) {
      queryRef = queryRef
        .where(searchField, '>=', convertToProperCase(search))
        .where(searchField, '<', convertToProperCase(search) + '\uf8ff');
    }
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    if (category) {
      queryRef = queryRef.where('category', '==', category);
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
        .where(searchField, '>=', convertToProperCase(search))
        .where(searchField, '<', convertToProperCase(search) + '\uf8ff');
    }
    if (branch_id) {
      countQuery = countQuery.where('branch_id', '==', branch_id);
    }
    if (category) {
      countQuery = countQuery.where('category', '==', category);
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

// Get all service products by branch_id
router.get('/getServicesProductsByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    const queryRef = admin.firestore().collection(COLLECTION).where('branch_id', '==', branch_id);

    // Fetch all data
    const snapshot = await queryRef.get();
    const products = snapshot.docs.map(doc => doc.data());

    return res.status(200).json({ 
      data: products, 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single service product by id
router.get('/getServiceProduct/:id', async (req, res) => {
  try {
    const doc = await admin.firestore().collection(COLLECTION).doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Service product not found' });
    }
    res.json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a service product by id
router.put('/updateServiceProduct/:id', async (req, res) => {
  try {
    const { name, category, unit, quantity, total_value, status, branch_id, unit_value, min_quantity, price, brand } = req.body;
    
    // Get the current product data to compare quantities
    const currentProductDoc = await admin.firestore().collection(COLLECTION).doc(req.params.id).get();
    if (!currentProductDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const currentProduct = currentProductDoc.data();
    const oldQuantity = currentProduct.quantity || 0;
    const newQuantity = quantity !== undefined ? quantity : oldQuantity;
    
    const updateData = { name:convertToProperCase(name), category, unit, quantity, total_value, status, branch_id, unit_value, min_quantity, price, brand };
    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    
    // Update the product
    await admin.firestore().collection(COLLECTION).doc(req.params.id).update(updateData);
    console.log(newQuantity , oldQuantity)
    console.log(newQuantity !== oldQuantity)
    // Track quantity changes if quantity was modified
    if (newQuantity !== oldQuantity) {
      await trackUsedQuantities(
        req.params.id,
        convertToProperCase(currentProduct.name),
        currentProduct.branch_id,
        oldQuantity,
        newQuantity,
        'quantity_update'
      );
    }
    
    res.json({ message: 'Service product updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a service product by id
router.delete('/deleteServiceProduct/:id', async (req, res) => {
  try {
    await admin.firestore().collection(COLLECTION).doc(req.params.id).delete();
    res.json({ message: 'Service product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all service products by branch_id
router.delete('/deleteAllServicesProductsByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    // Get all products for the specified branch
    const productsSnapshot = await admin.firestore()
      .collection(COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();
    
    if (productsSnapshot.empty) {
      return res.status(404).json({ 
        message: 'No service products found for this branch',
        deletedCount: 0
      });
    }
    
    // Delete all products in batches (Firestore batch operations are limited to 500 operations)
    const batchSize = 500;
    const products = productsSnapshot.docs;
    let totalDeleted = 0;
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = admin.firestore().batch();
      const batchProducts = products.slice(i, i + batchSize);
      
      batchProducts.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      totalDeleted += batchProducts.length;
    }
    
    res.json({ 
      message: `Successfully deleted ${totalDeleted} service products from branch ${branch_id}`,
      deletedCount: totalDeleted,
      branch_id: branch_id
    });
    
  } catch (error) {
    console.error('Error deleting service products by branch:', error);
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

// Download services products template
router.get('/downloadTemplate', async (req, res) => {
  try {
    const { branch_id } = req.query;
    
    console.log(`Template download requested - branch_id: ${branch_id}, generating Excel only`);
    
    if (!branch_id) {
      return res.status(400).json({ 
        error: 'branch_id is required as a query parameter (?branch_id=xxx)' 
      });
    }

    // Fetch categories for the specified branch
    const categoriesSnapshot = await admin.firestore()
      .collection('categories')
      .where('branch_id', '==', branch_id)
      .orderBy('name')
      .get();

    if (categoriesSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No categories found for this branch. Please create categories first.' 
      });
    }

    const categories = categoriesSnapshot.docs.map(doc => doc.data().name);

    console.log('Generating Excel template with dropdowns...');
    
    // Use helper function to create Excel template
    const workbook = await createExcelTemplate(branch_id, categories);
    
    // Set response headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="services_products_template_${branch_id}.xlsx"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    console.log('Excel template generated successfully, sending response...');
    
    // Write to response
    await workbook.xlsx.write(res);
    
  } catch (error) {
    console.error('Error creating Excel template:', error);
    
    // Fallback to static template if Excel generation fails
    try {
      const fs = require('fs');
      const templatePath = path.join(__dirname, '../sample_services_products_template.csv');
      
      if (fs.existsSync(templatePath)) {
        console.log('Falling back to static template due to error:', error.message);
        
        // Set proper headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="services_products_template_fallback.csv"');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        
        // Read and send the file
        const fileStream = fs.createReadStream(templatePath);
        fileStream.pipe(res);
        
        // Handle stream errors
        fileStream.on('error', (streamError) => {
          console.error('Error reading fallback template file:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error reading fallback template file' });
          }
        });
        return;
      }
    } catch (fallbackError) {
      console.error('Fallback template also failed:', fallbackError);
    }
    
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

    // Fetch categories for the specified branch
    const categoriesSnapshot = await admin.firestore()
      .collection('categories')
      .where('branch_id', '==', branch_id)
      .where('type', '==', 'service')
      .orderBy('name')
      .get();

    if (categoriesSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No categories found for this branch. Please create categories first.' 
      });
    }

    const categories = categoriesSnapshot.docs.map(doc => doc.data().name);

    // Use helper function to create Excel template
    const workbook = await createExcelTemplate(branch_id, categories);
    
    // Set response headers BEFORE writing to response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="services_products_template_${branch_id}.xlsx"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Write to response using buffer to ensure proper Excel generation
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      res.send(buffer);
      console.log('Excel file sent successfully');
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

    // Fetch categories for the specified branch
    const categoriesSnapshot = await admin.firestore()
      .collection('categories')
      .where('branch_id', '==', branch_id)
      .orderBy('name')
      .get();

    if (categoriesSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No categories found for this branch. Please create categories first.' 
      });
    }

    const categories = categoriesSnapshot.docs.map(doc => doc.data().name);

    // Use helper function to create CSV template
    const csvContent = createCSVTemplate(branch_id, categories);

    // Set proper headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="services_products_template_${branch_id}.csv"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // Send the CSV content
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error creating CSV template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint to verify Excel generation
router.get('/testExcel', async (req, res) => {
  try {
    console.log('Testing Excel generation...');
    
    // Create a simple Excel file
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Test');
    
    // Add some test data
    worksheet.addRow(['Test', 'Data']);
    worksheet.addRow(['Hello', 'World']);
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="test.xlsx"');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    console.log('Headers set, writing Excel file...');
    
    // Write to response
    await workbook.xlsx.write(res);
    
    console.log('Excel file sent successfully');
    
  } catch (error) {
    console.error('Error in test Excel generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get categories for a specific branch (for frontend dropdown)
router.get('/getCategoriesByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    const categoriesSnapshot = await admin.firestore()
      .collection('categories')
      .where('branch_id', '==', branch_id)
      .orderBy('name')
      .get();

    if (categoriesSnapshot.empty) {
      return res.status(200).json({ 
        data: [],
        message: 'No categories found for this branch'
      });
    }

    const categories = categoriesSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));

    res.status(200).json({ 
      data: categories,
      message: 'Categories retrieved successfully'
    });
    
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload Excel/CSV file to insert services products
router.post('/uploadServicesProducts', upload.single('file'), async (req, res) => {
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

    // Use helper function to parse uploaded file
    const products = await parseUploadedFile(fileBuffer, fileExtension);

    if (products.length === 0) {
      return res.status(400).json({ error: 'No data found in the uploaded file' });
    }

    // Validate required columns for services products
    const requiredColumns = ['name', 'category', 'unit', 'quantity', 'unit_value', 'min_quantity', 'price', 'brand'];
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
          // Use helper function to validate product data
          const validation = validateProductData(row, rowNumber);
          if (validation.status !== 'valid') {
            return validation;
          }

          // Check for duplicates
          const productName = row.name.toLowerCase().trim();
          if (existingProducts.has(productName)) {
            return {
              row: rowNumber,
              status: 'skipped',
              message: 'Service product with this name already exists'
            };
          }

          // Get category ID
          const categoryId = await getCategoryId(row.category, branch_id);
          if (!categoryId) {
            return {
              row: rowNumber,
              status: 'error',
              message: `Category '${row.category}' not found for this branch`
            };
          }

          // Create product data using helper function
          const productId = uuidv4();
          const productData = createProductData(row, productId, branch_id, categoryId, validation.data);

          // Insert product
          await productsRef.doc(productId).set(productData);
          
          // Add to existing products set to prevent duplicates within the same upload
          existingProducts.add(productName);
          
          return {
            row: rowNumber,
            status: 'inserted',
            message: 'Service product created successfully'
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

// Update used quantities for a service product
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
      convertToProperCase(currentProduct.name),
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

// Get used quantities for a specific service product
router.get('/getUsedQuantities/:id', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, date_from = '', date_to = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    let queryRef = admin.firestore().collection(USED_QUANTITIES_COLLECTION)
      .where('item_id', '==', req.params.id)
      .where('item_type', '==', 'services_product');

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
      .where('item_type', '==', 'services_product');
    
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
module.exports = router; 