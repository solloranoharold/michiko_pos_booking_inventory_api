const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');

const router = express.Router();
const firestore = admin.firestore();
const PAYMENT_METHODS_COLLECTION = 'payment_methods';

// Helper to get current date string
function now() {
  return new Date().toISOString();
}

// CREATE a new payment method
router.post('/insertPaymentMethod', async (req, res) => {
  try {
    const { name, branch_id } = req.body;
    if (!name || !branch_id) {
      return res.status(400).json({ error: 'Missing required fields: name and branch_id are required' });
    }

    // Check if a payment method with the same name already exists in the same branch
    const snapshot = await firestore.collection(PAYMENT_METHODS_COLLECTION)
      .where('name', '==', name)
      .where('branch_id', '==', branch_id)
      .get();
    
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Payment method with this name already exists in this branch' });
    }

    const id = uuidv4();
    const date_created = now();
    const paymentMethodData = {
      id,
      name,
      branch_id,
      date_created,
      doc_type: 'PAYMENT_METHOD'
    };

    await firestore.collection(PAYMENT_METHODS_COLLECTION).doc(id).set(paymentMethodData);
    return res.status(200).json({ data: paymentMethodData });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// GET all payment methods with pagination and search
// Query parameters:
//   - pageSize: number of items per page (default 10)
//   - page: page number (1-based)
//   - search: prefix to search in name (case-sensitive, Firestore limitation)
//   - branch_id: filter by branch id (exact match)
router.get('/getAllPaymentMethods', async (req, res) => {
  console.log('getAllPaymentMethods');
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let queryRef = firestore.collection(PAYMENT_METHODS_COLLECTION);

    // Add branch_id filter if provided
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }

    // For search, add range filter and orderBy on the search field
    if (search) {
      queryRef = queryRef
        .where('name', '>=', search)
        .where('name', '<', search + '\uf8ff')
        .orderBy('name')
        .orderBy('date_created', 'desc');
    } else {
      queryRef = queryRef.orderBy('date_created', 'desc');
    }

    // Get total count (on the same query, but without pagination)
    let countQuery = firestore.collection(PAYMENT_METHODS_COLLECTION);
    if (branch_id) {
      countQuery = countQuery.where('branch_id', '==', branch_id);
    }
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
    const paymentMethods = snapshot.docs.map(doc => doc.data());

    return res.status(200).json({ data: paymentMethods, page, totalPages, totalCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// READ a payment method by id
router.get('/getPaymentMethodById/:id', async (req, res) => {
  try {
    const paymentMethodRef = firestore.collection(PAYMENT_METHODS_COLLECTION).doc(req.params.id);
    const paymentMethodSnap = await paymentMethodRef.get();
    if (!paymentMethodSnap.exists) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    res.json(paymentMethodSnap.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a payment method by id
router.put('/updatePaymentMethod/:id', async (req, res) => {
  try {
    const paymentMethodRef = firestore.collection(PAYMENT_METHODS_COLLECTION).doc(req.params.id);
    const paymentMethodSnap = await paymentMethodRef.get();
    if (!paymentMethodSnap.exists) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    const { name, branch_id } = req.body;
    const prevData = paymentMethodSnap.data();

    // Check if the new name already exists in the same branch (excluding current payment method)
    if (name && name !== prevData.name) {
      const snapshot = await firestore.collection(PAYMENT_METHODS_COLLECTION)
        .where('name', '==', name)
        .where('branch_id', '==', branch_id || prevData.branch_id)
        .get();
      
      const existingPaymentMethods = snapshot.docs.filter(doc => doc.id !== req.params.id);
      if (existingPaymentMethods.length > 0) {
        return res.status(409).json({ error: 'Payment method with this name already exists in this branch' });
      }
    }

    const updateData = {
      name: name || prevData.name,
      branch_id: branch_id || prevData.branch_id,
      doc_type: 'PAYMENT_METHOD'
    };

    await paymentMethodRef.update(updateData);
    res.json({ ...prevData, ...updateData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a payment method by id
router.delete('/deletePaymentMethod/:id', async (req, res) => {
  try {
    const paymentMethodRef = firestore.collection(PAYMENT_METHODS_COLLECTION).doc(req.params.id);
    const paymentMethodSnap = await paymentMethodRef.get();
    if (!paymentMethodSnap.exists) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    await paymentMethodRef.delete();
    res.json({ message: 'Payment method deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET payment methods by branch_id (without pagination)
router.get('/getPaymentMethodsByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    const snapshot = await firestore.collection(PAYMENT_METHODS_COLLECTION)
      .where('branch_id', '==', branch_id)
      .orderBy('date_created', 'desc')
      .get();
    
    const paymentMethods = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: paymentMethods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
