const express = require('express');
const router = express.Router();
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'otcProducts';

router.get('/', (req, res) => {
  res.send('Hello OTC Products');
});

// Create a new OTC product
router.post('/insertProduct', async (req, res) => {
    console.log(req.body);
  try {
    const { name, price, quantity,min_quantity, branch_id, category ,status  } = req.body;
    // Validate required fields
    if (!name || !price || !quantity || !branch_id || !min_quantity || !category) {
      return res.status(400).json({ error: 'Name, price,min_quantity, quantity, and branch_id are required' });
    }

    // Validate data types
    if (typeof price !== 'number' || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }
    
    if (typeof min_quantity !== 'number' || min_quantity < 0) {
      return res.status(400).json({ error: 'Min quantity must be a non-negative number' });
    }
    if (typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'Quantity must be a non-negative number' });
    }

    const id = uuidv4();
    const date_created = new Date().toISOString();
    const data = { id, name, price, quantity, branch_id, category, date_created, min_quantity ,status};
    await admin.firestore().collection(COLLECTION).doc(id).set(data);
    res.status(201).json({ message: 'OTC product created', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all OTC products
router.get('/getAllProducts', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '', category = '' , min_quantity = null } = req.query;
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
    const { name, price, quantity, branch_id, category ,status , min_quantity } = req.body;
    const updateData = { name, price, quantity, branch_id, category ,status , min_quantity };
    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    await admin.firestore().collection(COLLECTION).doc(req.params.id).update(updateData);
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

module.exports = router;
