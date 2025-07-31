const express = require('express');
const admin = require('../firebaseAdmin');

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
    const { fullname, contactNo, address, email, status, updated_by } = req.body;
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
    const { fullname, contactNo, address, status, updated_by } = req.body;
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
    const updateData = { fullname, contactNo, address, status, dateUpdated, updated_by, doc_type: 'CLIENTS' };
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

module.exports = router; 