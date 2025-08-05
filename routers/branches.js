const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const moment = require('moment');

const router = express.Router();
const firestore = admin.firestore();
const BRANCHES_COLLECTION = 'branches';

// Helper to get current date string
function now() {
  return new Date().toISOString();
}

function getSubscriptionType(date_created){
  const subscription_start_date = new Date(date_created);
  const subscription_end_date = new Date(subscription_start_date);
  subscription_end_date.setMonth(subscription_start_date.getMonth() + 1);
  return moment(subscription_end_date).format('YYYY-MM-DD HH:mm:ss');
}
// CREATE a new branch
router.post('/insertBranch', async (req, res) => {
  try {
    const { email, address, contactno ,name } = req.body;
    if (!email || !address || !contactno ||!name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Check if a branch with the same email already exists
    const snapshot = await firestore.collection(BRANCHES_COLLECTION).where('email', '==', email).get();
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Branch with this email already exists' });
    }
    const id = uuidv4();
    const date_created = now();
    const branchData = {
      id,
      email,
      name,
      address,
      contactno,
      doc_type: 'BRANCH',
      subscription_status: 'active',
      subscription_type: 'monthly',
      subscription_start_date: moment(date_created).format('YYYY-MM-DD HH:mm:ss'),
      subscription_end_date: getSubscriptionType(date_created),
      date_created,
      date_updated: date_created,
    };
    
    // Create the branch
    await firestore.collection(BRANCHES_COLLECTION).doc(id).set(branchData);
    
    // Create default categories for the branch
    const defaultCategories = [
      'Hair Care',
      'Add Ons', 
      'Styling & Make Up',
      'Hand & Foot Care'
    ];
    
    const categoryPromises = defaultCategories.map(categoryName => {
      const categoryId = uuidv4();
      const categoryData = {
        id: categoryId,
        name: categoryName,
        branch_id: id,
        date_created,
        doc_type: 'CATEGORY'
      };
      return firestore.collection('categories').doc(categoryId).set(categoryData);
    });
    
    // Create default payment methods for the branch
    const defaultPaymentMethods = [
      'Cash',
      'Gcash',
      'Paymaya'
    ];
    
    const paymentMethodPromises = defaultPaymentMethods.map(paymentMethodName => {
      const paymentMethodId = uuidv4();
      const paymentMethodData = {
        id: paymentMethodId,
        name: paymentMethodName,
        branch_id: id,
        date_created,
        doc_type: 'PAYMENT_METHOD'
      };
      return firestore.collection('payment_methods').doc(paymentMethodId).set(paymentMethodData);
    });
    
    // Wait for all categories and payment methods to be created
    await Promise.all([...categoryPromises, ...paymentMethodPromises]);
    
    return res.status(200).json({
      data: branchData,
      message: 'Branch created successfully with default categories and payment methods'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// GET /getAllBranches
// Query parameters:
//   - pageSize: number of items per page (default 10)
//   - page: page number (1-based)
//   - search: prefix to search in name (case-sensitive, Firestore limitation)
//   - id: filter by branch id (exact match)
router.get('/getAllBranches', async (req, res) => {
    try {
      let { pageSize = 10, page = 1, search = '' } = req.query;
      page = parseInt(page);
      pageSize = parseInt(pageSize);
      let searchField = 'name';
      let orderField = 'date_created';
      let queryRef = firestore.collection(BRANCHES_COLLECTION);
  
      // For search, add range filter and orderBy on the search field
      if (search) {
        queryRef = queryRef
          .where(searchField, '>=', search)
          .where(searchField, '<', search + '\uf8ff')
          .orderBy(searchField)
          .orderBy(orderField, 'desc');
      } else {
        queryRef = queryRef.orderBy(orderField, 'desc');
      }
  
      // Get total count (on the same query, but without pagination)
      let countQuery = firestore.collection(BRANCHES_COLLECTION);
      const countSnapshot = await countQuery.count().get();
      const totalCount = countSnapshot.data().count;
      const totalPages = Math.ceil(totalCount / pageSize);
  
      // Pagination
      let paginatedQuery = queryRef;
      if (page > 1) {
        const prevSnapshot = await paginatedQuery.limit(pageSize * (page - 1)).get();
        const docs = prevSnapshot.docs;
        if (docs.length > 0) {
          const lastVisible = docs[docs.length - 1];
          paginatedQuery = paginatedQuery.startAfter(lastVisible);
        }
      }
      paginatedQuery = paginatedQuery.limit(pageSize);
      const snapshot = await paginatedQuery.get();
      const branches = snapshot.docs.map(doc => doc.data());
  
      return res.status(200).json({ data: branches, page, totalPages, totalCount });
    } catch (error) {
      res.status(500).json({ error: error.message });
      throw error;
    }
  });

// READ a branch by id
router.get('/getBranchById/:id', async (req, res) => {
  try {
    const branchRef = firestore.collection(BRANCHES_COLLECTION).doc(req.params.id);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    res.json(branchSnap.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
    
  }
});

// UPDATE a branch by id
router.put('/updateBranch/:id', async (req, res) => {
  try {
    const branchRef = firestore.collection(BRANCHES_COLLECTION).doc(req.params.id);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    const { email, address, contactno ,name ,subscription_status,subscription_type,subscription_start_date,subscription_end_date } = req.body;
    const prevData = branchSnap.data();
    const updateData = {
      email: email || prevData.email,
      name: name || prevData.name,
      address: address || prevData.address,
      contactno: contactno || prevData.contactno,
      subscription_status: subscription_status || prevData.subscription_status,
      subscription_type: subscription_type || prevData.subscription_type,
      subscription_start_date: subscription_start_date || prevData.subscription_start_date,
      subscription_end_date: subscription_end_date || prevData.subscription_end_date,
      date_updated: now(),
      doc_type: 'BRANCH',
    };
    await branchRef.update(updateData);
    res.json({ ...prevData, ...updateData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a branch by id
router.delete('/deleteBranch/:id', async (req, res) => {
  try {
    const branchRef = firestore.collection(BRANCHES_COLLECTION).doc(req.params.id);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    await branchRef.delete();
    res.json({ message: 'Branch deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.get('/getBranchAll', async (req, res) => {
  try {
    const snapshot = await firestore.collection(BRANCHES_COLLECTION)
      .where('subscription_status', '==', 'active')
      .get();
    const branches = snapshot.docs.map(doc => doc.data());
    // res.json({ data: branches });
    return res.status(200).json({data:branches})
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})
module.exports = router; 