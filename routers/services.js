const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const SERVICES_COLLECTION = 'services';

router.get('/', (req, res) => {
  res.send('Services API is running');
});

// Create a new service
router.post('/insertService', async (req, res) => {
  try {
    const { name, description, category, price, status, branch_id } = req.body;
    
    // Validate required fields
    if (!name || !description || !category || !price || !branch_id) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: name, description, category, price, and branch_id' 
      });
    }

    // Validate price is a number
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    // Generate unique ID
    const serviceId = uuidv4();
    const dateCreated = new Date().toISOString();
    
    const serviceData = {
      id: serviceId,
      name,
      description,
      category,
      price: parseFloat(price),
      status: status || 'active',
      branch_id,
      date_created: dateCreated,
      doc_type: 'SERVICES'
    };

    // Check if service with same name exists in the same branch
    const servicesRef = admin.firestore().collection(SERVICES_COLLECTION);
    const existingService = await servicesRef
      .where('name', '==', name)
      .where('branch_id', '==', branch_id)
      .get();

    if (!existingService.empty) {
      return res.status(409).json({ 
        error: 'Service with this name already exists in this branch' 
      });
    }

    await servicesRef.doc(serviceId).set(serviceData);
    res.status(201).json(serviceData);
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all services with pagination, search, and filtering
router.get('/getAllServices', async (req, res) => {
  try {
    let { pageSize = 10, page = 1, search = '', branch_id = '', category = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let searchField = 'name';
    let queryRef = admin.firestore().collection(SERVICES_COLLECTION);

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
    const services = snapshot.docs.map(doc => doc.data());

    // For total count, use a separate query without pagination
    let countQuery = admin.firestore().collection(SERVICES_COLLECTION);
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

    return res.status(200).json({ data: services, page, totalPages, totalCount });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services by branch
router.get('/getServicesByBranch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    const snapshot = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .where('branch_id', '==', branchId)
      .get();
    
    const services = snapshot.docs.map(doc => doc.data());
    console.log(services.length ,'getServicesByBranch');
    return res.status(200).json({ data: services });
  } catch (error) {
    console.error('Error fetching services by branch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services by category
router.get('/getServicesByCategory/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const snapshot = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .where('category', '==', category)
      .get();
    
    const services = snapshot.docs.map(doc => doc.data());
    res.json(services);
  } catch (error) {
    console.error('Error fetching services by category:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services by status
router.get('/getServicesByStatus/:status', async (req, res) => {
  try {
    const { status } = req.params;
    const snapshot = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .where('status', '==', status)
      .get();
    
    const services = snapshot.docs.map(doc => doc.data());
    res.json(services);
  } catch (error) {
    console.error('Error fetching services by status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single service by ID
router.get('/getService/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const serviceDoc = await admin.firestore()
      .collection(SERVICES_COLLECTION)
      .doc(id)
      .get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(serviceDoc.data());
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a service by ID
router.put('/updateService/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, category, price, status, branch_id } = req.body;

    // Validate required fields
    if (!name || !description || !category || !price || !branch_id) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: name, description, category, price, and branch_id' 
      });
    }

    // Validate price is a number
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    const serviceRef = admin.firestore().collection(SERVICES_COLLECTION).doc(id);
    const serviceDoc = await serviceRef.get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Check if service with same name exists in the same branch (excluding current service)
    const servicesRef = admin.firestore().collection(SERVICES_COLLECTION);
    const existingService = await servicesRef
      .where('name', '==', name)
      .where('branch_id', '==', branch_id)
      .get();

    const duplicateExists = existingService.docs.some(doc => doc.id !== id);
    if (duplicateExists) {
      return res.status(409).json({ 
        error: 'Service with this name already exists in this branch' 
      });
    }

    const updateData = {
      name,
      description,
      category,
      price: parseFloat(price),
      status: status || 'active',
      branch_id,
      doc_type: 'SERVICES'
    };

    await serviceRef.update(updateData);
    
    // Get updated document
    const updatedDoc = await serviceRef.get();
    res.json(updatedDoc.data());
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a service by ID
router.delete('/deleteService/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const serviceRef = admin.firestore().collection(SERVICES_COLLECTION).doc(id);
    const serviceDoc = await serviceRef.get();

    if (!serviceDoc.exists) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await serviceRef.delete();
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search services by name (partial match)
router.get('/searchServices/:searchTerm', async (req, res) => {
  try {
    const { searchTerm } = req.params;
    const snapshot = await admin.firestore().collection(SERVICES_COLLECTION).get();
    
    const services = snapshot.docs
      .map(doc => doc.data())
      .filter(service => 
        service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        service.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    res.json(services);
  } catch (error) {
    console.error('Error searching services:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get services within price range
router.get('/getServicesByPriceRange', async (req, res) => {
  try {
    const { minPrice, maxPrice } = req.query;
    
    if (!minPrice || !maxPrice) {
      return res.status(400).json({ 
        error: 'Please provide both minPrice and maxPrice query parameters' 
      });
    }

    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);

    if (isNaN(min) || isNaN(max) || min < 0 || max < 0 || min > max) {
      return res.status(400).json({ 
        error: 'Invalid price range. minPrice and maxPrice must be positive numbers and minPrice <= maxPrice' 
      });
    }

    const snapshot = await admin.firestore().collection(SERVICES_COLLECTION).get();
    
    const services = snapshot.docs
      .map(doc => doc.data())
      .filter(service => service.price >= min && service.price <= max);
    
    res.json(services);
  } catch (error) {
    console.error('Error fetching services by price range:', error);
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;
