const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');

const router = express.Router();
const firestore = admin.firestore();
const CATEGORIES_COLLECTION = 'categories';

const { convertToProperCase } = require('../services/helper-service');

// Helper to get current date string
function now() {
  return new Date().toISOString();
}

// CREATE a new category
router.post('/insertCategory', async (req, res) => {
  try {
    const { name, branch_id , type } = req.body;
    if (!name || !branch_id || !type) {
      return res.status(400).json({ error: 'Missing required fields: name and branch_id are required' });
    }

    // Check if a category with the same name already exists in the same branch
    const snapshot = await firestore.collection(CATEGORIES_COLLECTION)
      .where('name', '==', name)
      .where('type', '==', type)
      .where('branch_id', '==', branch_id)
      .get();
    
    if (!snapshot.empty) {
      return res.status(409).json({ error: 'Category with this name already exists in this branch' });
    }

    const id = uuidv4();
    const date_created = now();
    const categoryData = {
      id,
      name: convertToProperCase(name),
      branch_id,
      type,
      date_created,
      doc_type: 'CATEGORY'
    };

    await firestore.collection(CATEGORIES_COLLECTION).doc(id).set(categoryData);
    return res.status(200).json({ data: categoryData });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// GET all categories with pagination and search
// Query parameters:
//   - pageSize: number of items per page (default 10)
//   - page: page number (1-based)
//   - search: prefix to search in name (case-sensitive, Firestore limitation)
//   - branch_id: filter by branch id (exact match)
router.get('/getAllCategories', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let queryRef = firestore.collection(CATEGORIES_COLLECTION);

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
    let countQuery = firestore.collection(CATEGORIES_COLLECTION);
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
    const categories = snapshot.docs.map(doc => doc.data());

    return res.status(200).json({ data: categories, page, totalPages, totalCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

// READ a category by id
router.get('/getCategoryById/:id', async (req, res) => {
  try {
    const categoryRef = firestore.collection(CATEGORIES_COLLECTION).doc(req.params.id);
    const categorySnap = await categoryRef.get();
    if (!categorySnap.exists) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(categorySnap.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a category by id
router.put('/updateCategory/:id', async (req, res) => {
  try {
    const categoryRef = firestore.collection(CATEGORIES_COLLECTION).doc(req.params.id);
    const categorySnap = await categoryRef.get();
    if (!categorySnap.exists) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const { name, branch_id, type } = req.body;
    const prevData = categorySnap.data();

    // Check if the new name already exists in the same branch (excluding current category)
    if (name && name !== prevData.name) {
      const snapshot = await firestore.collection(CATEGORIES_COLLECTION)
        .where('name', '==', name)
        .where('branch_id', '==', branch_id || prevData.branch_id)
        .get();
      
      const existingCategories = snapshot.docs.filter(doc => doc.id !== req.params.id);
      if (existingCategories.length > 0) {
        return res.status(409).json({ error: 'Category with this name already exists in this branch' });
      }
    }

    const updateData = {
      name: convertToProperCase(name) || prevData.name,
      branch_id: branch_id || prevData.branch_id,
      type: type || prevData.type,
      doc_type: 'CATEGORY'
    };

    await categoryRef.update(updateData);
    res.json({ ...prevData, ...updateData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a category by id
router.delete('/deleteCategory/:id', async (req, res) => {
  try {
    const categoryRef = firestore.collection(CATEGORIES_COLLECTION).doc(req.params.id);
    const categorySnap = await categoryRef.get();
    if (!categorySnap.exists) {
      return res.status(404).json({ error: 'Category not found' });
    }
    await categoryRef.delete();
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET categories by branch_id (without pagination)
router.get('/getCategoriesByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    const { type } = req.query;
    
    let queryRef = firestore.collection(CATEGORIES_COLLECTION)
      .where('branch_id', '==', branch_id);
    
    // Add type filter only if type is provided in query params
    if (type) {
      queryRef = queryRef.where('type', '==', type);
    }
    
    const snapshot = await queryRef
      .orderBy('date_created', 'desc')
      .get();
    
    const categories = snapshot.docs.map(doc => doc.data());
    return res.status(200).json({ data: categories });
  } catch (error) {
    res.status(500).json({ error: error.message });
    throw error;
  }
});

module.exports = router;
