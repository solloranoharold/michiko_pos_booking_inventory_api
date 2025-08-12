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

router.get('/', (req, res) => {
  res.send('Hello Clients');
});

// Create a new client (email as primary key)
router.post('/insertClient', async (req, res) => {
  try {
    const { fullname, contactNo, address, email, status, updated_by, notes, social_media } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!updated_by) {
      return res.status(400).json({ error: 'Updated by field is required' });
    }
    
    // Generate unique client ID
    const clientId = await generateClientId();
    
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(clientId);
    const clientSnap = await clientRef.get();
    if (clientSnap.exists) {
      return res.status(409).json({ error: 'Client with this email already exists' });
    }
    
    
    const dateCreated = new Date().toISOString();
    const dateUpdated = new Date().toISOString();
    const clientData = { 
      clientId, 
      fullname, 
      contactNo, 
      address, 
      email, 
      dateCreated, 
      dateUpdated, 
      status, 
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
        .where(searchField, '>=', search)
        .where(searchField, '<', search + '\uf8ff');
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
        .where(searchField, '>=', search)
        .where(searchField, '<', search + '\uf8ff');
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
    const clientRef = firestore.collection(CLIENTS_COLLECTION).doc(req.params.email);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ id: clientSnap.id, ...clientSnap.data() });
  } catch (error) {
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
      fullname, 
      contactNo, 
      address, 
      status, 
      dateUpdated, 
      updated_by, 
      notes: notes !== undefined ? notes : prevData.notes,
      social_media: social_media !== undefined ? social_media : prevData.social_media,
      doc_type: 'CLIENTS' 
    };
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

// Upload Excel/CSV file to insert clients
router.post('/uploadClients', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get updated_by from query parameters or form body (query params take priority)
    const updated_by = req.query.updated_by || req.body.updated_by;
    if (!updated_by) {
      return res.status(400).json({ 
        error: 'updated_by is required. Provide it as a query parameter (?updated_by=xxx) or in the form body' 
      });
    }

    const fileBuffer = req.file.buffer;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    let clients = [];

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
      clients = results;
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      // Parse Excel file from buffer
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      clients = xlsx.utils.sheet_to_json(worksheet);
    } else {
      return res.status(400).json({ error: 'Unsupported file format' });
    }

    if (clients.length === 0) {
      return res.status(400).json({ error: 'No data found in the uploaded file' });
    }

    // Validate required columns
    const requiredColumns = ['fullname', 'contactNo', 'address', 'email'];
    const firstRow = clients[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      });
    }

    // Get existing clients for duplicate checking
    const clientsRef = admin.firestore().collection(CLIENTS_COLLECTION);
    const existingClientsSnapshot = await clientsRef.get();
    
    const existingEmails = new Set();
    existingClientsSnapshot.docs.forEach(doc => {
      const client = doc.data();
      existingEmails.add(client.email.toLowerCase().trim());
    });

    const results = {
      inserted: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process clients in batches for better performance
    const batchSize = 50; // Process 50 clients at a time
    const batches = [];
    
    for (let i = 0; i < clients.length; i += batchSize) {
      batches.push(clients.slice(i, i + batchSize));
    }

    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const batchPromises = batch.map(async (row, batchItemIndex) => {
        const globalIndex = batchIndex * batchSize + batchItemIndex;
        const rowNumber = globalIndex + 2; // +2 because Excel/CSV is 1-indexed and we have headers

        try {
          // Validate required fields
          if (!row.fullname || !row.contactNo || !row.address || !row.email) {
            return {
              row: rowNumber,
              status: 'error',
              message: 'Missing required fields'
            };
          }

          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.email.trim())) {
            return {
              row: rowNumber,
              status: 'error',
              message: 'Invalid email format'
            };
          }

          // Check for duplicates
          const email = row.email.toLowerCase().trim();
          if (existingEmails.has(email)) {
            return {
              row: rowNumber,
              status: 'skipped',
              message: 'Client with this email already exists'
            };
          }

          // Generate unique client ID
          const clientId = await generateClientId();
          
          // Create client data
          const dateCreated = new Date().toISOString();
          const dateUpdated = new Date().toISOString();
          
          const clientData = {
            clientId,
            fullname: row.fullname.trim(),
            contactNo: row.contactNo.trim(),
            address: row.address.trim(),
            email: email,
            dateCreated,
            dateUpdated,
            status: row.status ? row.status.trim() : 'active', // Default to 'active' if not provided
            updated_by,
            doc_type: 'CLIENTS'
          };

          // Insert client
          await clientsRef.doc(clientId).set(clientData);
          
          // Add to existing emails set to prevent duplicates within the same upload
          existingEmails.add(email);
          
          return {
            row: rowNumber,
            status: 'inserted',
            message: 'Client created successfully'
          };

        } catch (error) {
          return {
            row: rowNumber,
            status: 'error',
            message: error.message
          };
        }
      });

      // Wait for all clients in this batch to complete
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
        totalRows: clients.length,
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
      notes: updatedNotes,
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