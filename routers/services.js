const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const path = require('path');
const ExcelJS = require('exceljs');

const router = express.Router();
const SERVICES_COLLECTION = 'services';

router.get('/', (req, res) => {
  res.send('Services API is running');
});

// Create a new service
router.post('/insertService', async (req, res) => {
  try {
    const { name, description, category, price, status, branch_id } = req.body;
    
    // Validate required fields
    if (!name || !description || !category || !price || !branch_id) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: name, description, category, price, and branch_id' 
      });
    }

    // Validate price is a number
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    // Generate unique ID
    const serviceId = uuidv4();
    const dateCreated = new Date().toISOString();
    
    const serviceData = {
      id: serviceId,
      name,
      description,
      category,
      price: parseFloat(price),
      status: status || 'active',
      branch_id,
      date_created: dateCreated,
      doc_type: 'SERVICES'
    };

    // Check if service with same name exists in the same branch
    const servicesRef = admin.firestore().collection(SERVICES_COLLECTION);
    const existingService = await servicesRef
      .where('name', '==', name)
      .where('branch_id', '==', branch_id)
      .get();

    if (!existingService.empty) {
      return res.status(409).json({ 
        error: 'Service with this name already exists in this branch' 
      });
    }

    await servicesRef.doc(serviceId).set(serviceData);
    res.status(201).json(serviceData);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all services with pagination, search, and filtering
router.get('/getAllServices', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '', category = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let searchField = 'name';
    let queryRef = admin.firestore().collection(SERVICES_COLLECTION);

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
    const services = snapshot.docs.map(doc => doc.data());

    // For total count, use a separate query without pagination
    let countQuery = admin.firestore().collection(SERVICES_COLLECTION);
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
    
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    return res.status(200).json({ data: services, page, totalPages, totalCount });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services by branch
router.get('/getServicesByBranch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    const snapshot = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .where('branch_id', '==', branchId)
      .get();
    
    const services = snapshot.docs.map(doc => doc.data());
    console.log(services.length ,'getServicesByBranch');
    return res.status(200).json({ data: services });
  } catch (error) {
    console.error('Error fetching services by branch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services by category
router.get('/getServicesByCategory/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const snapshot = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .where('category', '==', category)
      .get();
    
    const services = snapshot.docs.map(doc => doc.data());
    res.json(services);
  } catch (error) {
    console.error('Error fetching services by category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services by status
router.get('/getServicesByStatus/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const snapshot = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .where('status', '==', status)
      .get();
    
    const services = snapshot.docs.map(doc => doc.data());
    res.json(services);
  } catch (error) {
    console.error('Error fetching services by status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single service by ID
router.get('/getService/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const serviceDoc = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .doc(id)
      .get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(serviceDoc.data());
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a service by ID
router.put('/updateService/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, price, status, branch_id } = req.body;

    // Validate required fields
    if (!name || !description || !category || !price || !branch_id) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: name, description, category, price, and branch_id' 
      });
    }

    // Validate price is a number
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    const serviceRef = admin.firestore().collection(SERVICES_COLLECTION).doc(id);
    const serviceDoc = await serviceRef.get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check if service with same name exists in the same branch (excluding current service)
    const servicesRef = admin.firestore().collection(SERVICES_COLLECTION);
    const existingService = await servicesRef
      .where('name', '==', name)
      .where('branch_id', '==', branch_id)
      .get();

    const duplicateExists = existingService.docs.some(doc => doc.id !== id);
    if (duplicateExists) {
      return res.status(409).json({ 
        error: 'Service with this name already exists in this branch' 
      });
    }

    const updateData = {
      name,
      description,
      category,
      price: parseFloat(price),
      status: status || 'active',
      branch_id,
      doc_type: 'SERVICES'
    };

    await serviceRef.update(updateData);
    
    // Get updated document
    const updatedDoc = await serviceRef.get();
    res.json(updatedDoc.data());
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a service by ID
router.delete('/deleteService/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const serviceRef = admin.firestore().collection(SERVICES_COLLECTION).doc(id);
    const serviceDoc = await serviceRef.get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await serviceRef.delete();
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search services by name (partial match)
router.get('/searchServices/:searchTerm', async (req, res) => {
  try {
    const { searchTerm } = req.params;
    const snapshot = await admin.firestore().collection(SERVICES_COLLECTION).get();
    
    const services = snapshot.docs
      .map(doc => doc.data())
      .filter(service => 
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    res.json(services);
  } catch (error) {
    console.error('Error searching services:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services within price range
router.get('/getServicesByPriceRange', async (req, res) => {
  try {
    const { minPrice, maxPrice } = req.query;
    
    if (!minPrice || !maxPrice) {
      return res.status(400).json({ 
        error: 'Please provide both minPrice and maxPrice query parameters' 
      });
    }

    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);

    if (isNaN(min) || isNaN(max) || min < 0 || max < 0 || min > max) {
      return res.status(400).json({ 
        error: 'Invalid price range. minPrice and maxPrice must be positive numbers and minPrice <= maxPrice' 
      });
    }

    const snapshot = await admin.firestore().collection(SERVICES_COLLECTION).get();
    
    const services = snapshot.docs
      .map(doc => doc.data())
      .filter(service => service.price >= min && service.price <= max);
    
    res.json(services);
  } catch (error) {
    console.error('Error fetching services by price range:', error);
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
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'branch_id', maxCount: 1 }
]);

// Download services template
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

    console.log('Generating Excel template with dropdowns...');
    
    // Create Excel file with dropdown validation
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Michiko POS System';
    workbook.lastModifiedBy = 'Michiko POS System';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    const worksheet = workbook.addWorksheet('Services Template');
    
    // Define headers for services
    const headers = ['name', 'description', 'category', 'price', 'status'];
    
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
      'Sample Service',
      'Sample service description',
      categories[0] || 'Hair Services', // Use first available category or fallback
      25.00,
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
    worksheet.getColumn('B').width = 40; // description
    worksheet.getColumn('C').width = 20; // category
    worksheet.getColumn('D').width = 12; // price
    worksheet.getColumn('E').width = 12; // status
    
    // Add data validation for category column (dropdown)
    worksheet.dataValidations.add('C2:C1000', {
      type: 'list',
      allowBlank: false,
      formulae: [`"${categories.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please select a category from the dropdown list.',
      showInputMessage: true,
      inputTitle: 'Select Category',
      input: 'Choose a category from the dropdown list.'
    });
    
    // Add data validation for status column (dropdown)
    worksheet.dataValidations.add('E2:E1000', {
      type: 'list',
      allowBlank: false,
      formulae: ['"active,inactive"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Please select either "active" or "inactive".',
      showInputMessage: true,
      inputTitle: 'Select Status',
      input: 'Choose either "active" or "inactive".'
    });
    
    // Add data validation for price column (positive number)
    worksheet.dataValidations.add('D2:D1000', {
      type: 'decimal',
      operator: 'greaterThan',
      formulae: ['0'],
      showErrorMessage: true,
      errorTitle: 'Invalid Price',
      error: 'Price must be a positive number.',
      showInputMessage: true,
      inputTitle: 'Enter Price',
      input: 'Enter a positive number for the price.'
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
    instructionsSheet.addRow(['Services Template - Instructions']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['1. Fill in the service details in the first sheet']);
    instructionsSheet.addRow(['2. Use the dropdown lists for category and status columns']);
    instructionsSheet.addRow(['3. Ensure all required fields are filled']);
    instructionsSheet.addRow(['4. Save as Excel file for upload (CSV will lose dropdowns)']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Available Categories:']);
    categories.forEach(category => {
      instructionsSheet.addRow([`- ${category}`]);
    });
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Available Status: active, inactive']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['⚠️  IMPORTANT: Save as Excel (.xlsx) to preserve dropdowns!']);
    instructionsSheet.addRow(['   Saving as CSV will remove all dropdown validation.']);
    
    // Set response headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="services_template_${branch_id}.xlsx"`);
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
    
    // Fallback to static template if Excel generation fails
    try {
      const fs = require('fs');
      const templatePath = path.join(__dirname, '../sample_services_template.csv');
      
      if (fs.existsSync(templatePath)) {
        console.log('Falling back to static template due to error:', error.message);
        
        // Set proper headers for file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="services_template_fallback.csv"');
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
      .orderBy('name')
      .get();

    if (categoriesSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No categories found for this branch. Please create categories first.' 
      });
    }

    const categories = categoriesSnapshot.docs.map(doc => doc.data().name);

    console.log('Generating Excel template with dropdowns...');
    
    // Create Excel file with dropdown validation
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Michiko POS System';
    workbook.lastModifiedBy = 'Michiko POS System';
    workbook.created = new Date();
    workbook.modified = new Date();
    
    const worksheet = workbook.addWorksheet('Services Template');
    
    // Define headers for services
    const headers = ['name', 'description', 'category', 'price', 'status'];
    
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
      'Sample Service',
      'Sample service description',
      categories[0] || 'Hair Services', // Use first available category or fallback
      25.00,
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
    worksheet.getColumn('B').width = 40; // description
    worksheet.getColumn('C').width = 20; // category
    worksheet.getColumn('D').width = 12; // price
    worksheet.getColumn('E').width = 12; // status
    
    // Add data validation for category column (dropdown)
    worksheet.dataValidations.add('C2:C1000', {
      type: 'list',
      allowBlank: false,
      formulae: [`"${categories.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please select a category from the dropdown list.',
      showInputMessage: true,
      inputTitle: 'Select Category',
      input: 'Choose a category from the dropdown list.'
    });
    
    // Add data validation for status column (dropdown)
    worksheet.dataValidations.add('E2:E1000', {
      type: 'list',
      allowBlank: false,
      formulae: ['"active,inactive"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Please select either "active" or "inactive".',
      showInputMessage: true,
      inputTitle: 'Select Status',
      input: 'Choose either "active" or "inactive".'
    });
    
    // Add data validation for price column (positive number)
    worksheet.dataValidations.add('D2:D1000', {
      type: 'decimal',
      operator: 'greaterThan',
      formulae: ['0'],
      showErrorMessage: true,
      errorTitle: 'Invalid Price',
      error: 'Price must be a positive number.',
      showInputMessage: true,
      inputTitle: 'Enter Price',
      input: 'Enter a positive number for the price.'
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
    instructionsSheet.addRow(['Services Template - Instructions']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['1. Fill in the service details in the first sheet']);
    instructionsSheet.addRow(['2. Use the dropdown lists for category and status columns']);
    instructionsSheet.addRow(['3. Ensure all required fields are filled']);
    instructionsSheet.addRow(['4. Save as Excel file for upload (CSV will lose dropdowns)']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Available Categories:']);
    categories.forEach(category => {
      instructionsSheet.addRow([`- ${category}`]);
    });
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['Available Status: active, inactive']);
    instructionsSheet.addRow([]);
    instructionsSheet.addRow(['⚠️  IMPORTANT: Save as Excel (.xlsx) to preserve dropdowns!']);
    instructionsSheet.addRow(['   Saving as CSV will remove all dropdown validation.']);
    
    // Set response headers for Excel download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="services_template_${branch_id}.xlsx"`);
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
    const categoryList = categories.join('|'); // Pipe-separated for reference

    // Create CSV content with headers and sample data
    const csvHeaders = 'name,description,category,price,status';
    const csvSample = 'Sample Service,Sample service description,' + categoryList + ',25.00,active';
    
    // Create the CSV content
    const csvContent = csvHeaders + '\n' + csvSample;

    // Set proper headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="services_template_${branch_id}.csv"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // Send the CSV content
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error creating CSV template:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload Excel/CSV file to insert services
router.post('/uploadServices', upload, async (req, res) => {
  try {
    if (!req.files || !req.files.file || req.files.file.length === 0) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get branch_id from query parameters, form body, or form fields (query params take priority)
    let branch_id = req.query.branch_id;
    if (!branch_id && req.body && req.body.branch_id) {
      branch_id = req.body.branch_id;
    }
    if (!branch_id && req.files.branch_id && req.files.branch_id.length > 0) {
      branch_id = req.files.branch_id[0].buffer.toString();
    }
    
    if (!branch_id) {
      return res.status(400).json({ 
        error: 'branch_id is required. Provide it as a query parameter (?branch_id=xxx), in the form body, or as a form field' 
      });
    }


    const fileBuffer = req.files.file[0].buffer;
    const fileExtension = path.extname(req.files.file[0].originalname).toLowerCase();
    let services = [];

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
      services = results;
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      // Parse Excel file from buffer
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      services = xlsx.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    if (services.length === 0) {
      return res.status(400).json({ error: 'No data found in the uploaded file' });
    }

    // Validate required columns
    const requiredColumns = ['name', 'description', 'category', 'price'];
    const firstRow = services[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      });
    }

    // Get existing services for duplicate checking
    const servicesRef = admin.firestore().collection(SERVICES_COLLECTION);
    const existingServicesSnapshot = await servicesRef
      .where('branch_id', '==', branch_id)
      .get();
    
    const existingServices = new Set();
    existingServicesSnapshot.docs.forEach(doc => {
      const service = doc.data();
      existingServices.add(service.name.toLowerCase().trim());
    });

    const results = {
      inserted: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process services in batches for better performance
    const batchSize = 50; // Process 50 services at a time
    const batches = [];
    
    for (let i = 0; i < services.length; i += batchSize) {
      batches.push(services.slice(i, i + batchSize));
    }

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchPromises = batch.map(async (row, batchItemIndex) => {
        const globalIndex = batchIndex * batchSize + batchItemIndex;
        const rowNumber = globalIndex + 2; // +2 because Excel/CSV is 1-indexed and we have headers

        try {
          // Validate required fields
          if (!row.name || !row.description || !row.category || !row.price) {
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

          // Check for duplicates
          const serviceName = row.name.toLowerCase().trim();
          if (existingServices.has(serviceName)) {
            return {
              row: rowNumber,
              status: 'skipped',
              message: 'Service with this name already exists'
            };
          }

          // Create service data
          const serviceId = uuidv4();
          const dateCreated = new Date().toISOString();
          
          
          const serviceData = {
            id: serviceId,
            name: row.name.trim(),
            description: row.description.trim(),
            category: await getCategoryId(row.category, branch_id),
            price: price,
            status: row.status.trim() || 'active',
            branch_id: branch_id,
            date_created: dateCreated,
            doc_type: 'SERVICES'
          };

          // Insert service
          await servicesRef.doc(serviceId).set(serviceData);
          
          // Add to existing services set to prevent duplicates within the same upload
          existingServices.add(serviceName);
          
          return {
            row: rowNumber,
            status: 'inserted',
            message: 'Service created successfully'
          };

        } catch (error) {
          return {
            row: rowNumber,
            status: 'error',
            message: error.message
          };
        }
      });

      // Wait for all services in this batch to complete
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
        totalRows: services.length,
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

async function getCategoryId(categoryName, branch_id) {
  const categoryRef = admin.firestore().collection('categories');
  const categorySnapshot = await categoryRef.where('name', '==', categoryName).where('branch_id', '==', branch_id).get();
  if(categorySnapshot.empty){
    return null;
  }
  return categorySnapshot.docs[0].id;
}

module.exports = router;
