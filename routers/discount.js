const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');

const router = express.Router();
const firestore = admin.firestore();
const DISCOUNTS_COLLECTION = 'discounts';
const { convertToProperCase } = require('../services/helper-service');

// Helper to get current date string
function now() {
  return new Date().toISOString();
}

// CREATE a new discount
router.post('/insertDiscount', async (req, res) => {
  try {
    const { name, discount, branch_id, status = 'active' } = req.body;
    if (!name || !discount || !branch_id) {
      return res.status(400).json({ error: 'Missing required fields: name, discount, and branch_id are required' });
    }

    const discountValue = parseFloat(discount);
   

    // Validate status
    const validStatuses = ['active', 'inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status must be either "active" or "inactive"' });
    }

    // Check if a discount with the same name already exists in the same branch
    const snapshot = await firestore.collection(DISCOUNTS_COLLECTION)
      .where('name', '==', name)
      .where('branch_id', '==', branch_id)
      .get();
    
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Discount with this name already exists in this branch' });
    }

    const id = uuidv4();
    const date_created = now();
    const discountData = {
      id,
      name: convertToProperCase(name),
      discount: discountValue,
      branch_id,
      status,
      date_created,
      doc_type: 'DISCOUNT'
    };

    await firestore.collection(DISCOUNTS_COLLECTION).doc(id).set(discountData);
    return res.status(200).json({ data: discountData });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// GET all discounts with pagination and search
// Query parameters:
//   - pageSize: number of items per page (default 10)
//   - page: page number (1-based)
//   - search: prefix to search in name (case-sensitive, Firestore limitation)
//   - branch_id: filter by branch id (exact match)
//   - status: filter by status (exact match)
router.get('/getAllDiscounts', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = ''} = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let queryRef = firestore.collection(DISCOUNTS_COLLECTION);

    // Add branch_id filter if provided
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }

    // For search, add range filter and orderBy on the search field
    if (search) {
      queryRef = queryRef
        .where('name', '>=', convertToProperCase(search))
        .where('name', '<', convertToProperCase(search) + '\uf8ff')
        .orderBy('name')
        .orderBy('date_created', 'desc');
    } else {
      queryRef = queryRef.orderBy('date_created', 'desc');
    }

    // Get total count (on the same query, but without pagination)
    let countQuery = firestore.collection(DISCOUNTS_COLLECTION);
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
    const discounts = snapshot.docs.map(doc => doc.data());

    return res.status(200).json({ data: discounts, page, totalPages, totalCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// READ a discount by id
router.get('/getDiscountById/:id', async (req, res) => {
  try {
    const discountRef = firestore.collection(DISCOUNTS_COLLECTION).doc(req.params.id);
    const discountSnap = await discountRef.get();
    if (!discountSnap.exists) {
      return res.status(404).json({ error: 'Discount not found' });
    }
    res.json(discountSnap.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a discount by id
router.put('/updateDiscount/:id', async (req, res) => {
  try {
    const discountRef = firestore.collection(DISCOUNTS_COLLECTION).doc(req.params.id);
    const discountSnap = await discountRef.get();
    if (!discountSnap.exists) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    const { name, discount, branch_id, status } = req.body;
    const prevData = discountSnap.data();


    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ['active', 'inactive'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status must be either "active" or "inactive"' });
      }
    }

    // Check if the new name already exists in the same branch (excluding current discount)
    if (name && name !== prevData.name) {
      const snapshot = await firestore.collection(DISCOUNTS_COLLECTION)
        .where('name', '==', name)
        .where('branch_id', '==', branch_id || prevData.branch_id)
        .get();
      
      const existingDiscounts = snapshot.docs.filter(doc => doc.id !== req.params.id);
      if (existingDiscounts.length > 0) {
        return res.status(409).json({ error: 'Discount with this name already exists in this branch' });
      }
    }

    const updateData = {
      name: convertToProperCase(name) || prevData.name,
      discount: discount !== undefined ? parseFloat(discount) : prevData.discount,
      branch_id: branch_id || prevData.branch_id,
      status: status || prevData.status,
      doc_type: 'DISCOUNT'
    };

    await discountRef.update(updateData);
    res.json({ ...prevData, ...updateData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a discount by id
router.delete('/deleteDiscount/:id', async (req, res) => {
  try {
    const discountRef = firestore.collection(DISCOUNTS_COLLECTION).doc(req.params.id);
    const discountSnap = await discountRef.get();
    if (!discountSnap.exists) {
      return res.status(404).json({ error: 'Discount not found' });
    }
    await discountRef.delete();
    res.json({ message: 'Discount deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET discounts by branch_id (without pagination)
router.get('/getDiscountsByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { status = '' } = req.query;
    
    let queryRef = firestore.collection(DISCOUNTS_COLLECTION)
      .where('branch_id', '==', branch_id);
    
    // Add status filter if provided
    if (status) {
      queryRef = queryRef.where('status', '==', status);
    }
    
    const snapshot = await queryRef
      .orderBy('date_created', 'desc')
      .get();
    
    const discounts = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: discounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET active discounts by branch_id (convenience endpoint)
router.get('/getActiveDiscountsByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    const snapshot = await firestore.collection(DISCOUNTS_COLLECTION)
      .where('branch_id', '==', branch_id)
      .where('status', '==', 'active')
      .orderBy('date_created', 'desc')
      .get();
    
    const discounts = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: discounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
