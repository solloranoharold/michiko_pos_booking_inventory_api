const express = require('express');
const router = express.Router();
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

const COLLECTION = 'services_products';

// Create a new service product
router.post('/insertServiceProduct', async (req, res) => {
  try {
    const { name, category, unit, quantity, total_value, status, branch_id, unit_value, min_quantity } = req.body;
    const id = uuidv4();
    const date_created = new Date().toISOString();
    const data = { id, name, category, unit, quantity, total_value, unit_value, min_quantity, date_created, status, branch_id };
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
    const { name, category, unit, quantity, total_value, status, branch_id, unit_value, min_quantity } = req.body;
    const updateData = { name, category, unit, quantity, total_value, status, branch_id, unit_value, min_quantity };
    // Remove undefined fields
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    await admin.firestore().collection(COLLECTION).doc(req.params.id).update(updateData);
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

module.exports = router; 