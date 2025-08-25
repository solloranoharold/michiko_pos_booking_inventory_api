// Environment variables loaded centrally in config/env.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const admin = require('../firebaseAdmin');

const firestore = admin.firestore();
const ACCOUNTS_COLLECTION = 'accounts';

// Helper to get current date in ISO format
function getCurrentDate() {
  return new Date().toISOString();
}

router.get('/', (req, res) => {
  res.send('Hello Accounts');
});

// CREATE account
router.post('/insertAccount', async (req, res) => {
  try {
    const { email, role, branch_id = null, position, commission_rate } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if position is required for staff role
    if (role === 'staff' && !position) {
      return res.status(400).json({ error: 'Position is required for staff role' });
    }
    
    // Check if commission_rate is required for staff role
    if (role === 'staff' && commission_rate === undefined) {
      return res.status(400).json({ error: 'Commission rate is required for staff role' });
    }
    
    // Validate commission_rate is a number between 0 and 100 for staff
    if (role === 'staff' && (isNaN(commission_rate) || commission_rate < 0 || commission_rate > 100)) {
      return res.status(400).json({ error: 'Commission rate must be a number between 0 and 100 for staff role' });
    }
    
    // Check if account already exists
    const snapshot = await firestore.collection(ACCOUNTS_COLLECTION).where('email', '==', email).get();
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Account already exists' });
    }
    
    const id = uuidv4();
    const account = {
      id,
      email,
      status: 'active',
      role: role || 'staff',
      doc_type: 'ACCOUNTS',
      date_created: getCurrentDate(),
      branch_id: branch_id,
      name:'',
      position: position || '',
      commission_rate: role === 'staff' ? commission_rate : null,
      commisions:[],
      total_commisions:0,
      government_ids:[],
      signIn: null,
      signOut: null,
      isCalendarShared: false,
    };
    // Use email as document ID for easy retrieval
    await firestore.collection(ACCOUNTS_COLLECTION).doc(email).set(account);
    res.status(201).json(account);
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// READ all accounts
router.get('/getAllAccounts', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let searchField = 'email';
    let orderField = 'date_created';
    let queryRef = firestore.collection(ACCOUNTS_COLLECTION);

    // Apply search filter (range on email)
    if (search) {
      queryRef = queryRef
        .where(searchField, '>=', search)
        .where(searchField, '<', search + '\uf8ff')
    } 

    // Apply status filter (equality only)
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
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

    // Fetch data
    const snapshot = await queryRef.get();
    const accounts = snapshot.docs.map(doc => doc.data());

    // For total count, use a separate query without pagination
    let countQuery = firestore.collection(ACCOUNTS_COLLECTION);
    if(branch_id){
      countQuery = countQuery.where('branch_id', '==', branch_id);
    }

    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    return res.status(200).json({ data: accounts, page, totalPages, totalCount });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// READ all accounts without pagination (filtered by branch and active status)
router.get('/getAllAccountsNoPagination/:branch_id', async (req, res) => {
  try {
    const { branch_id = '' } = req.params;
    let queryRef = firestore.collection(ACCOUNTS_COLLECTION);

    // Apply branch filter if provided
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }

    // Always filter for active accounts only
    queryRef = queryRef.where('status', '==', 'active');

    // Fetch all data without pagination
    const snapshot = await queryRef.get();
    const accounts = snapshot.docs.map(doc => doc.data());

    return res.status(200).json({ data: accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// READ accounts with positions per branch_id
router.get('/getAccountsWithPositions/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    let queryRef = firestore.collection(ACCOUNTS_COLLECTION);

    // Apply branch filter
    queryRef = queryRef.where('branch_id', '==', branch_id);
    
    // Filter for active accounts only
    queryRef = queryRef.where('status', '==', 'active');

    // Filter for Senior and Junior positions only
    queryRef = queryRef.where('position', 'in', ['Senior', 'Junior']);

    // Fetch all data
    const snapshot = await queryRef.get();
    const accounts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        email: data.email,
        name: data.name,
        position: data.position,
        role: data.role,
        commission_rate: data.commission_rate,
        status: data.status
      };
    });

    

    return res.status(200).json({ 
      data: accounts,
      totalAccounts: accounts.length
    });
  } catch (error) {
    console.error('Error fetching accounts with positions:', error);
    res.status(500).json({ error: 'Failed to fetch accounts with positions' });
  }
});

// READ single account by email
router.get('/getAccountByEmail/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const docRef = firestore.collection(ACCOUNTS_COLLECTION).doc(email);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const accountData = docSnap.data();
    if (accountData.status !== 'active') {
      return res.status(404).json({ error: 'Account is not active' });
    }
    return res.status(200).json({ data: accountData });
  } catch (error) {
    console.error('Error fetching account:', error);
    return res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// UPDATE account by email
router.put('/updateAccount/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { status, role, branch_id = null, name, government_ids, position, commission_rate = 0, isCalendarShared } = req.body;
    
    // Check if position is required for staff role
    if (role === 'staff' && !position) {
      return res.status(400).json({ error: 'Position is required for staff role' });
    }
    
    // Check if commission_rate is required for staff role
    if (role === 'staff' && commission_rate === undefined) {
      return res.status(400).json({ error: 'Commission rate is required for staff role' });
    }
    
    // Validate commission_rate is a number between 0 and 100 for staff
    if (role === 'staff' && (isNaN(commission_rate) || commission_rate < 0 || commission_rate > 100)) {
      return res.status(400).json({ error: 'Commission rate must be a number between 0 and 100 for staff role' });
    }
    
    const docRef = firestore.collection(ACCOUNTS_COLLECTION).doc(email);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (role !== undefined) updateData.role = role;
    if (branch_id !== undefined) updateData.branch_id = branch_id;
    if (name !== undefined) updateData.name = name;
    if (government_ids !== undefined) updateData.government_ids = government_ids;
    if (position !== undefined) updateData.position = position;
    if (commission_rate !== undefined) updateData.commission_rate = role === 'staff' ? commission_rate : null;
    if (isCalendarShared !== undefined) updateData.isCalendarShared = isCalendarShared;
    else updateData.isCalendarShared = false;
    await docRef.update(updateData);
    // Get updated account
    const updatedSnap = await docRef.get();
    res.json(updatedSnap.data());
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE account by email
router.delete('/deleteAccount/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const docRef = firestore.collection(ACCOUNTS_COLLECTION).doc(email);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Account not found' });
    }
    await docRef.delete();
    res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});


module.exports = router; 