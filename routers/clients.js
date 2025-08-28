const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const firestore = admin.firestore();
const CLIENTS_COLLECTION = 'clients';

// Configuration constants for large uploads
const UPLOAD_CONFIG = {
  // Batch processing settings
  FIRESTORE_BATCH_LIMIT: 500, // Firestore's maximum batch size
  DEFAULT_BATCH_SIZE: 200,     // Default batch size for regular uploads
  LARGE_BATCH_SIZE: 300,       // Batch size for large uploads (10k+ records)
  
  // Timing settings
  BATCH_DELAY_MS: 50,          // Delay between batches (regular uploads)
  LARGE_BATCH_DELAY_MS: 25,    // Delay between batches (large uploads)
  
  // Retry settings
  MAX_RETRIES: 3,              // Maximum retry attempts for failed batches
  RETRY_BACKOFF_BASE: 2000,    // Base delay for retry backoff (2 seconds)
  
  // Memory management
  MAX_MEMORY_USAGE_MB: 100,    // Maximum memory usage before forcing garbage collection
  PROGRESS_UPDATE_INTERVAL: 100 // Update progress every N records
};

// Progress tracking for large uploads
const uploadProgress = new Map();

// Function to generate unique client ID
async function generateClientId() {
  try {
    const snapshot = await firestore.collection(CLIENTS_COLLECTION)
      .orderBy('clientId', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return 'CL000001';
    }
    
    const lastClient = snapshot.docs[0].data();
    const lastClientId = lastClient.clientId || 'CL0000';
    const lastNumber = parseInt(lastClientId.substring(2));
    const nextNumber = lastNumber + 1;
    
    return `CL${nextNumber.toString().padStart(6, '0')}`;
  } catch (error) {
    console.error('Error generating client ID:', error);
    throw new Error('Failed to generate client ID');
  }
}

// Function to generate multiple client IDs for batch processing
async function generateClientIdsBatch(count) {
  try {
    const snapshot = await firestore.collection(CLIENTS_COLLECTION)
      .orderBy('clientId', 'desc')
      .limit(1)
      .get();
    
    let startNumber = 1;
    if (!snapshot.empty) {
      const lastClient = snapshot.docs[0].data();
      const lastClientId = lastClient.clientId || 'CL0000';
      const lastNumber = parseInt(lastClientId.substring(2));
      startNumber = lastNumber + 1;
    }
    
    const clientIds = [];
    for (let i = 0; i < count; i++) {
      const nextNumber = startNumber + i;
      clientIds.push(`CL${nextNumber.toString().padStart(6, '0')}`);
    }
    
    return clientIds;
  } catch (error) {
    console.error('Error generating client IDs batch:', error);
    throw new Error('Failed to generate client IDs batch');
  }
}

router.get('/', (req, res) => {
  res.send('Hello Clients');
});
router.post('/registerClientPublic', async (req, res) => {
  try {
    const { fullname, contactNo, address, email, status, updated_by, notes, social_media } = req.body;
    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!updated_by) {
      return res.status(400).json({ error: 'Updated by field is required' });
    }
    
    // Check if client with same email or fullname already exists
    const existingClient = await firestore.collection(CLIENTS_COLLECTION)
      .where('email', '==', email)
      .get();
    
    if (!existingClient.empty) {
      return res.status(409).json({ error: 'Client with this email already exists' });
    }
    
    const existingName = await firestore.collection(CLIENTS_COLLECTION)
      .where('fullname', '==', fullname)
      .get();
    
    if (!existingName.empty) {
      return res.status(409).json({ error: 'Client with this full name already exists' });
    }
    
    // Generate unique client ID
    const clientId = await generateClientId();
    
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
    const clientSnap = await clientRef.get();
    if (clientSnap.exists) {
      return res.status(409).json({ error: 'Client with this ID already exists' });
    }
    
    const dateCreated = new Date().toISOString();
    const dateUpdated = new Date().toISOString();
    const clientData = { 
      clientId, 
      fullname: convertToProperCase(fullname), 
      contactNo, 
      address, 
      email, 
      dateCreated, 
      dateUpdated, 
      status:'active', 
      notes: notes || [],
      social_media: social_media || {},
      doc_type: 'CLIENTS' 
    };


    console.log(clientData , 'clientData')
    await clientRef.set(clientData);
    // res.status(201).json({ id: clientId, ...clientData });
    return res.status(200).json({ message: 'Client registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Create a new client (email as primary key)
router.post('/insertClient', async (req, res) => {
  try {
    const { fullname, contactNo, address, email, status, updated_by, notes, social_media } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!fullname) {
      return res.status(400).json({ error: 'Full name is required' });
    }
    if (!updated_by) {
      return res.status(400).json({ error: 'Updated by field is required' });
    }
    
    // Check if client with same email or fullname already exists
    const existingClient = await firestore.collection(CLIENTS_COLLECTION)
      .where('email', '==', email)
      .get();
    
    if (!existingClient.empty) {
      return res.status(409).json({ error: 'Client with this email already exists' });
    }
    
    const existingName = await firestore.collection(CLIENTS_COLLECTION)
      .where('fullname', '==', fullname)
      .get();
    
    if (!existingName.empty) {
      return res.status(409).json({ error: 'Client with this full name already exists' });
    }
    
    // Generate unique client ID
    const clientId = await generateClientId();
    
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
    
    const dateCreated = new Date().toISOString();
    const dateUpdated = new Date().toISOString();
    const clientData = { 
      clientId, 
      fullname: convertToProperCase(fullname), 
      contactNo, 
      address, 
      email, 
      dateCreated, 
      dateUpdated, 
      status:'active', 
      updated_by, 
      notes: notes || [],
      social_media: social_media || {},
      doc_type: 'CLIENTS' 
    };
    
    await clientRef.set(clientData);
    res.status(201).json({ id: email, ...clientData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
//create a function to convert search to ProperCase 
function convertToProperCase(search) {
  return search.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Get all clients
router.get('/getAllClients', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', status = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let searchField = 'fullname';
    let queryRef = firestore.collection(CLIENTS_COLLECTION);

    // Apply search filter if present
    if (search) {
      queryRef = queryRef
        .where(searchField, '>=', convertToProperCase(search))
        .where(searchField, '<', convertToProperCase(search) + '\uf8ff');
    }

    // Apply status filter if present
    if (status) {
      queryRef = queryRef.where('status', '==', status);
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
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // For total count, use a separate query without pagination
    let countQuery = firestore.collection(CLIENTS_COLLECTION);
    // Apply search filter in the same order as above
    if (search) {
      countQuery = countQuery
        .where(searchField, '>=', convertToProperCase(search))
        .where(searchField, '<', convertToProperCase(search) + '\uf8ff');
    }
    // Apply status filter in the same order as above
    if (status) {
      countQuery = countQuery.where('status', '==', status);
    }
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    return res.status(200).json({ data: clients, page, totalPages, totalCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

router.get('/getClients', async (req, res) => {
  try {
    const snapshot = await firestore.collection(CLIENTS_COLLECTION).where('status', '==', 'active').get();
    const clients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json({ data: clients });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})
// Get a single client by email
router.get('/getEmailClient/:email', async (req, res) => {
  try {
    const email = req.params.email;
    console.log('Searching for client with email:', email);
    
    // Query by email field instead of using email as document ID
    const querySnapshot = await firestore.collection(CLIENTS_COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();
    
    if (querySnapshot.empty) {
      console.log('No client found with email:', email);
      return res.status(200).json({ data: [] });
    }
    
    const clientDoc = querySnapshot.docs[0];
    const clientData = clientDoc.data();
    clientData.role = 'client';
    
    console.log('Client found:', clientData.clientId);
    return res.status(200).json({ data: [clientData] });
  } catch (error) {
    console.error('Error fetching client by email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a client by email
router.put('/updateClient/:email', async (req, res) => {
  try {
    const { fullname, contactNo, address, status, updated_by, notes, social_media } = req.body;
    if (!updated_by) {
      return res.status(400).json({ error: 'Updated by field is required' });
    }
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(req.params.email);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }
    // Preserve doc_type and dateCreated
    const prevData = clientSnap.data();
    const dateUpdated = new Date().toISOString();
    const updateData = { 
      fullname: convertToProperCase(fullname), 
      contactNo, 
      address, 
      status, 
      dateUpdated, 
      updated_by, 
      notes: notes !== undefined ? notes : "",
      social_media: social_media !== undefined ? social_media : prevData.social_media,
      doc_type: 'CLIENTS' 
    };
    console.log(updateData , 'updateData')
    await clientRef.update(updateData);
    res.json({ id: req.params.email, ...prevData, ...updateData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a client by email
router.delete('/deleteClient/:email', async (req, res) => {
  try {
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(req.params.email);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }
    await clientRef.delete();
    res.json({ message: 'Client deleted' });
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

// Configure multer for image uploads
const imageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit per image
  }
});

// Download clients template
router.get('/downloadTemplate', (req, res) => {
  try {
    const fs = require('fs');
    const templatePath = path.join(__dirname, '../sample_clients_template.csv');
    
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template file not found' });
    }

    // Set proper headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="clients_template.csv"');
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

// Download Excel template for clients
router.get('/downloadExcelTemplate', (req, res) => {
  try {
    // Define the template headers and sample data
    const headers = ['fullname', 'contactNo', 'address', 'email', 'status'];
    const sampleData = [
      {
        fullname: 'John Doe',
        contactNo: '+1234567890',
        address: '123 Main St, City, State 12345',
        email: 'john.doe@example.com',
        status: 'active'
      },
      {
        fullname: 'Jane Smith',
        contactNo: '+0987654321',
        address: '456 Oak Ave, Town, State 67890',
        email: 'jane.smith@example.com',
        status: 'active'
      }
    ];

    // Create Excel workbook
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(sampleData, { header: headers });
    
    // Set column widths for better readability
    const colWidths = [
      { wch: 20 }, // fullname
      { wch: 15 }, // contactNo
      { wch: 35 }, // address
      { wch: 25 }, // email
      { wch: 15 }  // status (increased width for dropdown)
    ];
    worksheet['!cols'] = colWidths;

    // Add data validation for status field (dropdown)
    const statusOptions = ['active', 'inactive', 'pending', 'suspended'];
    const statusRange = `E2:E${sampleData.length + 1}`; // Column E (status column)
    
    // Add data validation to the worksheet
    worksheet['!dataValidation'] = {
      [statusRange]: {
        type: 'list',
        formula1: `"${statusOptions.join(',')}"`,
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: 'Invalid Status',
        error: 'Please select a valid status from the dropdown list.',
        showInputMessage: true,
        inputTitle: 'Status Selection',
        input: 'Select a status from the dropdown list.'
      }
    };

    // Add worksheet to workbook
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Clients Template');

    // Generate Excel buffer
    const excelBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set proper headers for Excel file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="clients_template.xlsx"');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send the Excel file
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('Error generating Excel template:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Intelligent upload function that automatically optimizes based on dataset size
router.post('/uploadClients', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let clients = [];

    console.log(`🔍 Starting file processing...`);
    console.log(`📁 File: ${req.file.originalname}, Size: ${(fileBuffer.length / 1024).toFixed(2)}KB, Type: ${fileExtension}`);

    // Parse file based on extension
    if (fileExtension === '.csv') {
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
      clients = results;
      console.log(`📊 CSV parsed: ${clients.length} rows`);
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      clients = xlsx.utils.sheet_to_json(worksheet);
      console.log(`📊 Excel parsed: ${clients.length} rows from sheet '${sheetName}'`);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    if (clients.length === 0) {
      return res.status(400).json({ error: 'No data found in the uploaded file' });
    }

    // Log first few rows for debugging
    console.log(`🔍 Sample data (first 3 rows):`, clients.slice(0, 3));

    // Validate required columns
    const requiredColumns = ['fullname', 'contactNo', 'address', 'email'];
    const firstRow = clients[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    console.log(`🔍 Column validation:`, {
      foundColumns: Object.keys(firstRow),
      requiredColumns: requiredColumns,
      missingColumns: missingColumns
    });
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      });
    }

    // Intelligent configuration based on dataset size
    const isLargeDataset = clients.length > 1000;
    const processingBatchSize = Math.min(
      UPLOAD_CONFIG.FIRESTORE_BATCH_LIMIT, 
      isLargeDataset ? UPLOAD_CONFIG.LARGE_BATCH_SIZE : UPLOAD_CONFIG.DEFAULT_BATCH_SIZE
    );
    const batchDelay = isLargeDataset ? UPLOAD_CONFIG.LARGE_BATCH_DELAY_MS : UPLOAD_CONFIG.BATCH_DELAY_MS;
    
    console.log(`🚀 Processing ${clients.length} clients with ${isLargeDataset ? 'large dataset' : 'standard'} optimization...`);
    console.log(`⚙️ Configuration: Batch size: ${processingBatchSize}, Delay: ${batchDelay}ms`);

    // Pre-generate all client IDs to avoid conflicts
    console.log(`🆔 Pre-generating ${clients.length} client IDs...`);
    const allClientIds = await generateClientIdsBatch(clients.length);
    console.log(`✅ Generated IDs: ${allClientIds.slice(0, 5).join(', ')}...`);

    const results = {
      inserted: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Create a Set to track emails within the current upload to prevent duplicates within the same file
    const currentUploadEmails = new Set();
    
    // Process clients in batches using Firestore batch writes
    for (let batchStartIndex = 0; batchStartIndex < clients.length; batchStartIndex += processingBatchSize) {
      const batchEndIndex = Math.min(batchStartIndex + processingBatchSize, clients.length);
      const currentBatch = clients.slice(batchStartIndex, batchEndIndex);
      const currentBatchNumber = Math.floor(batchStartIndex / processingBatchSize) + 1;
      const totalBatches = Math.ceil(clients.length / processingBatchSize);
      
      console.log(`\n📦 Processing batch ${currentBatchNumber}/${totalBatches} (rows ${batchStartIndex + 1}-${batchEndIndex})...`);
      
      // Create Firestore batch
      const firestoreBatch = firestore.batch();
      const batchResults = [];
      let validClientsInBatch = 0;
      
      // Process each client in the current batch
      for (let i = 0; i < currentBatch.length; i++) {
        const row = currentBatch[i];
        const globalIndex = batchStartIndex + i;
        const rowNumber = globalIndex + 2; // +2 because Excel/CSV is 1-indexed and we have headers
        const clientId = allClientIds[globalIndex];

        try {
          // Debug row data with space analysis
          if (i < 3) { // Log first 3 rows of each batch for debugging
            console.log(`🔍 Row ${rowNumber} data:`, {
              fullname: `"${row.fullname}" (length: ${row.fullname ? row.fullname.length : 0})`,
              contactNo: `"${row.contactNo}" (length: ${row.contactNo ? row.contactNo.length : 0})`,
              address: `"${row.address}" (length: ${row.address ? row.address.length : 0})`,
              email: `"${row.email}" (length: ${row.email ? row.email.length : 0})`,
              status: `"${row.status}" (length: ${row.status ? row.status.length : 0})`
            });
            
            // Show hidden characters and spaces
            if (row.email) {
              console.log(`🔍 Email analysis for row ${rowNumber}:`);
              console.log(`  Raw: "${row.email}"`);
              console.log(`  Length: ${row.email.length}`);
              console.log(`  Char codes: [${Array.from(row.email).map(c => c.charCodeAt(0)).join(', ')}]`);
              console.log(`  Trimmed: "${row.email.trim()}"`);
              console.log(`  Trimmed length: ${row.email.trim().length}`);
            }
          }

          // Clean and validate all fields with comprehensive space handling
          const cleanFullname = row.fullname ? row.fullname.trim().replace(/\s+/g, ' ') : '';
          const cleanContactNo = row.contactNo ? row.contactNo : '';
          const cleanAddress = row.address ? row.address.trim().replace(/\s+/g, ' ') : '';
          const cleanEmail = row.email ? row.email.trim().replace(/\s+/g, '') : ''; // Remove ALL spaces from email
          const cleanStatus = row.status ? row.status.trim() : 'active';

          // Validate required fields after cleaning
          if (!cleanFullname || !cleanContactNo || !cleanAddress || !cleanEmail) {
            const missingFields = [];
            if (!cleanFullname) missingFields.push('fullname');
            if (!cleanContactNo) missingFields.push('contactNo');
            if (!cleanAddress) missingFields.push('address');
            if (!cleanEmail) missingFields.push('email');
            
            console.log(`❌ Row ${rowNumber}: Missing fields after cleaning: ${missingFields.join(', ')}`);
            console.log(`  Original: fullname="${row.fullname}", contactNo="${row.contactNo}", address="${row.address}", email="${row.email}"`);
            console.log(`  Cleaned: fullname="${cleanFullname}", contactNo="${cleanContactNo}", address="${cleanAddress}", email="${cleanEmail}"`);
            
            batchResults.push({
              row: rowNumber,
              status: 'error',
              message: `Missing required fields after cleaning: ${missingFields.join(', ')}`
            });
            continue;
          }

          // Validate email format after cleaning
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(cleanEmail)) {
            console.log(`❌ Row ${rowNumber}: Invalid email format after cleaning`);
            console.log(`  Original: "${row.email}"`);
            console.log(`  Cleaned: "${cleanEmail}"`);
            console.log(`  Regex test: ${emailRegex.test(cleanEmail)}`);
            
            batchResults.push({
              row: rowNumber,
              status: 'error',
              message: `Invalid email format: "${cleanEmail}" (original: "${row.email}")`
            });
            continue;
          }

          const finalEmail = cleanEmail.toLowerCase();
          
          // Check for duplicates within the current upload first (fastest)
          if (currentUploadEmails.has(finalEmail)) {
            console.log(`⚠️ Row ${rowNumber}: Duplicate email within upload: "${finalEmail}"`);
            batchResults.push({
              row: rowNumber,
              status: 'skipped',
              message: 'Duplicate email within the same upload file'
            });
            continue;
          }
          
          // Check for duplicates in database (only if not already in current upload)
          console.log(`🔍 Row ${rowNumber}: Checking database for duplicate email: "${finalEmail}"`);
          const duplicateCheck = await firestore
            .collection(CLIENTS_COLLECTION)
            .where('email', '==', finalEmail)
            .limit(1)
            .get();
          
          if (!duplicateCheck.empty) {
            console.log(`⚠️ Row ${rowNumber}: Email already exists in database: "${finalEmail}"`);
            batchResults.push({
              row: rowNumber,
              status: 'skipped',
              message: 'Client with this email already exists in database'
            });
            continue;
          }
          
          // Create client data with cleaned values
          const dateCreated = new Date().toISOString();
          const dateUpdated = new Date().toISOString();
          
          const clientData = {
            clientId,
            fullname: convertToProperCase(cleanFullname),
            contactNo: cleanContactNo,
            address: cleanAddress,
            email: finalEmail,
            dateCreated,
            dateUpdated,
            status: cleanStatus,
            doc_type: 'CLIENTS'
          };

          // Add to Firestore batch
          const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
          firestoreBatch.set(clientRef, clientData);
          validClientsInBatch++;
          
          // Add to current upload emails set to prevent duplicates within the same upload
          currentUploadEmails.add(finalEmail);
          
          console.log(`✅ Row ${rowNumber}: Client prepared for insertion - ID: ${clientId}, Email: "${finalEmail}"`);
          
          batchResults.push({
            row: rowNumber,
            status: 'inserted',
            message: 'Client created successfully',
            clientId: clientId
          });

        } catch (error) {
          console.error(`💥 Row ${rowNumber}: Unexpected error:`, error);
          batchResults.push({
            row: rowNumber,
            status: 'error',
            message: error.message
          });
        }
      }
      
      console.log(`📊 Batch ${currentBatchNumber} summary: ${validClientsInBatch} valid clients ready for insertion`);
      
      // Commit the Firestore batch with retry mechanism
      if (validClientsInBatch > 0) {
        let retryCount = 0;
        const maxRetries = UPLOAD_CONFIG.MAX_RETRIES;
        let batchCommitted = false;
        
        console.log(`💾 Committing batch ${currentBatchNumber} with ${validClientsInBatch} clients...`);
        
        while (!batchCommitted && retryCount < maxRetries) {
          try {
            await firestoreBatch.commit();
            batchCommitted = true;
            console.log(`✅ Firestore batch ${currentBatchNumber} committed successfully (${validClientsInBatch} clients)`);
          } catch (batchError) {
            retryCount++;
            console.error(`❌ Firestore batch ${currentBatchNumber} failed (attempt ${retryCount}/${maxRetries}):`, batchError.message);
            
            if (retryCount >= maxRetries) {
              // Mark all valid clients in this batch as errors
              batchResults.forEach(result => {
                if (result.status === 'inserted') {
                  result.status = 'error';
                  result.message = `Firestore batch write failed after ${maxRetries} attempts: ${batchError.message}`;
                }
              });
              console.error(`💥 Batch ${currentBatchNumber} failed permanently after ${maxRetries} attempts`);
            } else {
              // Wait before retry with exponential backoff
              const waitTime = Math.pow(2, retryCount) * (UPLOAD_CONFIG.RETRY_BACKOFF_BASE / 1000);
              console.log(`⏳ Waiting ${waitTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
      } else {
        console.log(`⚠️ Batch ${currentBatchNumber}: No valid clients to commit`);
      }
      
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
      
      const insertedCount = batchResults.filter(r => r.status === 'inserted').length;
      const skippedCount = batchResults.filter(r => r.status === 'skipped').length;
      const errorCount = batchResults.filter(r => r.status === 'error').length;
      
      console.log(`📈 Completed batch ${currentBatchNumber}/${totalBatches}: ${insertedCount} inserted, ${skippedCount} skipped, ${errorCount} errors`);
      console.log(`📊 Running totals: ${results.inserted} inserted, ${results.skipped} skipped, ${results.errors} errors`);
      
      // Add a small delay between batches to avoid overwhelming Firestore
      if (currentBatchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    // Final response with comprehensive summary
    const response = {
      message: 'File processing completed',
      timestamp: new Date().toISOString(),
      optimization: {
        datasetSize: clients.length,
        approach: isLargeDataset ? 'large_dataset_optimized' : 'standard_optimized',
        batchSize: processingBatchSize,
        batchDelay: batchDelay
      },
      summary: {
        totalRows: clients.length,
        inserted: results.inserted,
        skipped: results.skipped,
        errors: results.errors,
        successRate: `${((results.inserted / clients.length) * 100).toFixed(2)}%`
      },
      performance: {
        totalBatches: Math.ceil(clients.length / processingBatchSize),
        avgItemsPerBatch: (clients.length / Math.ceil(clients.length / processingBatchSize)).toFixed(2),
        estimatedProcessingTime: `${((clients.length / processingBatchSize) * batchDelay / 1000).toFixed(2)}s`
      },
      details: results.details
    };
    
    console.log(`\n🎉 Upload completed: ${results.inserted}/${clients.length} clients successfully processed (${response.summary.successRate})`);
    console.log(`📊 Used ${isLargeDataset ? 'large dataset' : 'standard'} optimization with ${processingBatchSize} batch size`);
    console.log(`📋 Final results: ${results.inserted} inserted, ${results.skipped} skipped, ${results.errors} errors`);
    
    res.status(200).json(response);

  } catch (error) {
    console.error('💥 Error processing uploaded file:', error);
    
    // Provide detailed error information for debugging
    const errorResponse = {
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };
    
    res.status(500).json(errorResponse);
  }
});

// Test endpoint to debug upload issues
router.post('/testUpload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('🧪 TEST UPLOAD - Starting debug...');
    console.log('📁 File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer.length
    });

    const fileBuffer = req.file.buffer;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let clients = [];

    // Parse file based on extension
    if (fileExtension === '.csv') {
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
      clients = results;
      console.log('📊 CSV parsed successfully:', clients.length, 'rows');
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      clients = xlsx.utils.sheet_to_json(worksheet);
      console.log('📊 Excel parsed successfully:', clients.length, 'rows from sheet:', sheetName);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    if (clients.length === 0) {
      return res.status(400).json({ error: 'No data found in the uploaded file' });
    }

    // Log detailed information about the data
    console.log('🔍 First row data:', clients[0]);
    console.log('🔍 All column names:', Object.keys(clients[0]));
    console.log('🔍 Sample rows (first 3):', clients.slice(0, 3));

    // Validate required columns
    const requiredColumns = ['fullname', 'contactNo', 'address', 'email'];
    const firstRow = clients[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    console.log('🔍 Column validation:', {
      foundColumns: Object.keys(firstRow),
      requiredColumns: requiredColumns,
      missingColumns: missingColumns,
      hasAllRequired: missingColumns.length === 0
    });

    // Test a few rows for validation
    const validationResults = [];
    for (let i = 0; i < Math.min(5, clients.length); i++) {
      const row = clients[i];
      const rowNumber = i + 2; // +2 because Excel/CSV is 1-indexed and we have headers
      
      // Clean the data the same way as the main upload function
      const cleanFullname = row.fullname ? row.fullname.trim().replace(/\s+/g, ' ') : '';
      const cleanContactNo = row.contactNo ? row.contactNo.trim() : '';
      const cleanAddress = row.address ? row.address.trim().replace(/\s+/g, ' ') : '';
      const cleanEmail = row.email ? row.email.trim().replace(/\s+/g, '') : ''; // Remove ALL spaces from email
      const cleanStatus = row.status ? row.status.trim() : 'active';
      
      const validation = {
        row: rowNumber,
        originalData: {
          fullname: `"${row.fullname}" (length: ${row.fullname ? row.fullname.length : 0})`,
          contactNo: `"${row.contactNo}" (length: ${row.contactNo ? row.contactNo.length : 0})`,
          address: `"${row.address}" (length: ${row.address ? row.address.length : 0})`,
          email: `"${row.email}" (length: ${row.email ? row.email.length : 0})`,
          status: `"${row.status}" (length: ${row.status ? row.status.length : 0})`
        },
        cleanedData: {
          fullname: `"${cleanFullname}" (length: ${cleanFullname.length})`,
          contactNo: `"${cleanContactNo}" (length: ${cleanContactNo.length})`,
          address: `"${cleanAddress}" (length: ${cleanAddress.length})`,
          email: `"${cleanEmail}" (length: ${cleanEmail.length})`,
          status: `"${cleanStatus}" (length: ${cleanStatus.length})`
        },
        issues: []
      };

      // Check required fields after cleaning
      if (!cleanFullname) validation.issues.push('Missing fullname after cleaning');
      if (!cleanContactNo) validation.issues.push('Missing contactNo after cleaning');
      if (!cleanAddress) validation.issues.push('Missing address after cleaning');
      if (!cleanEmail) validation.issues.push('Missing email after cleaning');

      // Check email format after cleaning
      if (cleanEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
          validation.issues.push(`Invalid email format after cleaning: "${cleanEmail}"`);
        }
      }

      // Show email analysis for debugging
      if (row.email) {
        validation.emailAnalysis = {
          raw: `"${row.email}"`,
          length: row.email.length,
          charCodes: Array.from(row.email).map(c => c.charCodeAt(0)),
          trimmed: `"${row.email.trim()}"`,
          trimmedLength: row.email.trim().length,
          spacesRemoved: `"${cleanEmail}"`,
          spacesRemovedLength: cleanEmail.length
        };
      }

      validationResults.push(validation);
    }

    // Test Firestore connection
    let firestoreTest = 'Not tested';
    try {
      const testQuery = await firestore.collection(CLIENTS_COLLECTION).limit(1).get();
      firestoreTest = `Connected successfully. Collection has ${testQuery.size} documents.`;
    } catch (error) {
      firestoreTest = `Connection failed: ${error.message}`;
    }

    const response = {
      message: 'Test upload completed',
      timestamp: new Date().toISOString(),
      fileInfo: {
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size,
        extension: fileExtension
      },
      dataInfo: {
        totalRows: clients.length,
        columns: Object.keys(clients[0]),
        missingRequiredColumns: missingColumns,
        hasAllRequired: missingColumns.length === 0
      },
      validationResults: validationResults,
      firestoreTest: firestoreTest,
      sampleData: clients.slice(0, 3)
    };

    console.log('🧪 TEST UPLOAD - Debug complete');
    res.status(200).json(response);

  } catch (error) {
    console.error('🧪 TEST UPLOAD - Error:', error);
    res.status(500).json({ 
      error: error.message, 
      timestamp: new Date().toISOString(),
      stack: error.stack
    });
  }
});

// Progress tracking endpoint for large uploads
router.get('/uploadProgress/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;
    const progress = uploadProgress.get(uploadId);
    
    if (!progress) {
      return res.status(404).json({ error: 'Upload progress not found' });
    }
    
    res.status(200).json(progress);
  } catch (error) {
    console.error('Error getting upload progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clean up completed upload progress (run periodically)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
  
  for (const [uploadId, progress] of uploadProgress.entries()) {
    if (progress.completed && (now - progress.lastUpdated) > oneHour) {
      uploadProgress.delete(uploadId);
      console.log(`Cleaned up completed upload progress: ${uploadId}`);
    }
  }
}, 30 * 60 * 1000); // Clean up every 30 minutes

// Update client notes with image uploads
router.post('/updateClientNotes/:clientId', imageUpload.array('images', 10), async (req, res) => {
  try {
    const { clientId } = req.params;
    const { note, updated_by ,branch_id } = req.body;
    
    // Validate required fields
    if (!note  || !updated_by) {
      return res.status(400).json({ 
        error: 'note, and updated_by are required' 
      });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        error: 'At least one image is required' 
      });
    }

    // Get client reference
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
    const clientSnap = await clientRef.get();
    
    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Generate date string for folder structure
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    // Create local folder path
    const fs = require('fs');
    const localFolderPath = path.join(__dirname, '../images/client_notes', clientId, branch_id, dateString);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(localFolderPath)) {
      fs.mkdirSync(localFolderPath, { recursive: true });
    }
    
    // Save images locally
    const imagePaths = [];
    
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const fileName = `image${i + 1}_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
      const localFilePath = path.join(localFolderPath, fileName);
      
      try {
        // Save file to local directory
        fs.writeFileSync(localFilePath, file.buffer);
        
        // Store relative path for database
        const relativePath = `client_notes/${clientId}/${branch_id}/${dateString}/${fileName}`;
        imagePaths.push(relativePath);
        
        console.log(`Image saved locally: ${localFilePath}`);
      } catch (saveError) {
        console.error(`Error saving image ${fileName}:`, saveError);
        return res.status(500).json({ 
          error: `Failed to save image ${fileName}: ${saveError.message}` 
        });
      }
    }

    // Get current client data
    const currentData = clientSnap.data();
    const currentNotes = currentData.notes || [];
    
    // Create new note entry
    const newNote = {
      img_path: imagePaths,
      note: note.trim(),
      created_at: now.toISOString(),
      created_by: updated_by,
      branch_id: branch_id
    };
    
    // Add new note to existing notes array
    const updatedNotes = [...currentNotes, newNote];
    
    // Update client document
    const updateData = {
      notes: updatedNotes,
      dateUpdated: now.toISOString(),
      updated_by: updated_by
    };
    
    await clientRef.update(updateData);
    
    res.status(200).json({
      message: 'Notes updated successfully',
      note: newNote,
      totalNotes: updatedNotes.length
    });

  } catch (error) {
    console.error('Error updating client notes:', error);
    res.status(500).json({ error: error.message });
  }
});





// Update specific note from client notes array by index
router.put('/updateClientNote/:clientId/:noteIndex', imageUpload.array('images', 10), async (req, res) => {
  try {
    const { clientId, noteIndex } = req.params;
    const { note, updated_by, branch_id, existing_images } = req.body;
    
    // Validate required fields
    if (!note || !updated_by || !branch_id) {
      return res.status(400).json({ 
        error: 'note, updated_by, and branch_id are required' 
      });
    }

    // Parse existing_images if provided
    let existingImagesToKeep = [];
    if (existing_images) {
      try {
        existingImagesToKeep = JSON.parse(existing_images).map(img => img.name);
        if (!Array.isArray(existingImagesToKeep)) {
          return res.status(400).json({ 
            error: 'existing_images must be an array' 
          });
        }
      } catch (parseError) {
        return res.status(400).json({ 
          error: 'Invalid existing_images format' 
        });
      }
    }
    
    // Validate noteIndex is a number
    const index = parseInt(noteIndex);
    if (isNaN(index) || index < 0) {
      return res.status(400).json({ 
        error: 'noteIndex must be a valid non-negative number' 
      });
    }

    // Get client reference
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
    const clientSnap = await clientRef.get();
    
    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get current client data
    const currentData = clientSnap.data();
    const currentNotes = currentData.notes || [];
    
    // Check if note index exists
    if (index >= currentNotes.length) {
      return res.status(404).json({ 
        error: `Note at index ${index} not found. Total notes: ${currentNotes.length}` 
      });
    }
    
    // Get the note to be updated
    const noteToUpdate = currentNotes[index];
    const finalImagePaths = [];
    
    // Handle existing images from the note
    if (noteToUpdate.img_path && Array.isArray(noteToUpdate.img_path)) {
      const fs = require('fs');
      const path = require('path');
      
      console.log(`Processing ${noteToUpdate.img_path.length} existing images, ${existingImagesToKeep.length} images to preserve`);
      
      for (const imagePath of noteToUpdate.img_path) {
        // Check if this image should be kept (exists in existing_images)
        if (existingImagesToKeep.includes(imagePath)) {
          finalImagePaths.push(imagePath);
          console.log(`Preserving existing image: ${imagePath}`);
        } else {
          // Delete the image file if it's not in the keep list
          try {
            const fullImagePath = path.join(__dirname, '../images', imagePath);
            if (fs.existsSync(fullImagePath)) {
              fs.unlinkSync(fullImagePath);
              console.log(`Deleted old image file: ${fullImagePath}`);
            }
          } catch (deleteError) {
            console.error(`Error deleting old image file ${imagePath}:`, deleteError);
            // Continue with other files even if one fails
          }
        }
      }
    }
    
    // Handle new image uploads if provided
    if (req.files && req.files.length > 0) {
      // Generate date string for folder structure (use original note creation date)
      const originalDate = new Date(noteToUpdate.created_at);
      const dateString = originalDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Create local folder path (use new branch_id and original date)
      const fs = require('fs');
      const localFolderPath = path.join(__dirname, '../images/client_notes', clientId, branch_id, dateString);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(localFolderPath)) {
        fs.mkdirSync(localFolderPath, { recursive: true });
      }
      
      // Save new images locally and add to final paths
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const fileName = `image${i + 1}_${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
        const localFilePath = path.join(localFolderPath, fileName);
        
        try {
          // Save file to local directory
          fs.writeFileSync(localFilePath, file.buffer);
          
          // Store relative path for database
          const relativePath = `client_notes/${clientId}/${branch_id}/${dateString}/${fileName}`;
          finalImagePaths.push(relativePath);
          
          console.log(`New image saved locally: ${localFilePath}`);
        } catch (saveError) {
          console.error(`Error saving new image ${fileName}:`, saveError);
          return res.status(500).json({ 
            error: `Failed to save new image ${fileName}: ${saveError.message}` 
          });
        }
      }
    }
    
    console.log(`Final image paths: ${finalImagePaths.length} total (${finalImagePaths.join(', ')})`);
    
    // Create updated note entry
    const updatedNote = {
      ...noteToUpdate, // Keep all original fields
      img_path: finalImagePaths,
      note: note.trim(),
      branch_id: branch_id, // Update with new branch_id
      updated_at: new Date().toISOString(),
      updated_by: updated_by
    };
    
    // Update the note in the array
    const updatedNotes = [...currentNotes];
    updatedNotes[index] = updatedNote;
    
    // Update client document
    const updateData = {
      notes: updatedNotes || [],
      dateUpdated: new Date().toISOString(),
      updated_by: updated_by
    };
    
    await clientRef.update(updateData);
    
    res.status(200).json({
      message: 'Note updated successfully',
      updatedNote: updatedNote,
      totalNotes: updatedNotes.length
    });

  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete specific note from client notes array by index
router.delete('/deleteClientNote/:clientId/:noteIndex', async (req, res) => {
  try {
    const { clientId, noteIndex } = req.params;
    
    // Validate noteIndex is a number
    const index = parseInt(noteIndex);
    if (isNaN(index) || index < 0) {
      return res.status(400).json({ 
        error: 'noteIndex must be a valid non-negative number' 
      });
    }

    // Get client reference
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
    const clientSnap = await clientRef.get();
    
    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Get current client data
    const currentData = clientSnap.data();
    const currentNotes = currentData.notes || [];
    
    // Check if note index exists
    if (index >= currentNotes.length) {
      return res.status(404).json({ 
        error: `Note at index ${index} not found. Total notes: ${currentNotes.length}` 
      });
    }
    
    // Get the note to be deleted for cleanup
    const noteToDelete = currentNotes[index];
    
    // Delete associated image files from local storage
    if (noteToDelete.img_path && Array.isArray(noteToDelete.img_path)) {
      const fs = require('fs');
      const path = require('path');
      
      for (const imagePath of noteToDelete.img_path) {
        try {
          // Construct full local file path
          const fullImagePath = path.join(__dirname, '../images', imagePath);
          
          // Check if file exists before attempting to delete
          if (fs.existsSync(fullImagePath)) {
            fs.unlinkSync(fullImagePath);
            console.log(`Deleted image file: ${fullImagePath}`);
          } else {
            console.log(`Image file not found: ${fullImagePath}`);
          }
        } catch (deleteError) {
          console.error(`Error deleting image file ${imagePath}:`, deleteError);
          // Continue with other files even if one fails
        }
      }
      
      // Try to remove empty directories (optional cleanup)
      try {
        if (noteToDelete.branch_id && noteToDelete.created_at) {
          const dateString = noteToDelete.created_at.split('T')[0];
          const dirPath = path.join(__dirname, '../images/client_notes', clientId, noteToDelete.branch_id, dateString);
          
          // Check if directory is empty and remove it
          if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length === 0) {
            fs.rmdirSync(dirPath);
            console.log(`Removed empty directory: ${dirPath}`);
          }
        }
      } catch (dirError) {
        console.error('Error cleaning up empty directories:', dirError);
        // Directory cleanup is optional, don't fail the main operation
      }
    }
    
    // Remove the note from the array
    const updatedNotes = currentNotes.filter((_, i) => i !== index);
    
    // Update client document
    const updateData = {
      notes: updatedNotes
    };
    
    await clientRef.update(updateData);
    
    res.status(200).json({
      message: 'Note deleted successfully',
      deletedNote: noteToDelete,
      totalNotes: updatedNotes.length
    });

  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});




module.exports = router; 