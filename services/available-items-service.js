const admin = require('../firebaseAdmin');

const firestore = admin.firestore();

// Get available services for transactions
async function getAvailableServices(req, res) {
  try {
    const { branchId } = req.params;
    const snapshot = await firestore.collection('services')
      .where('branch_id', '==', branchId)
      .where('status', '==', 'active')
      .get();

    const services = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        price: data.price,
        type: 'service',
        collection: 'services'
      };
    });

    res.json(services);
  } catch (error) {
    console.error('Error fetching available services:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get available services products for transactions
async function getAvailableServicesProducts(req, res) {
  try {
    const { branchId } = req.params;
    const snapshot = await firestore.collection('services_products')
      .where('branch_id', '==', branchId)
      .where('status', '==', 'active')
      .get();

    const servicesProducts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        name: data.name,
        category: data.category,
        unit: data.unit,
        quantity: data.quantity,
        unit_value: data.unit_value,
        total_value: data.total_value,
        price: data.unit_value, // Use unit_value as price
        type: 'services_product',
        collection: 'services_products',
        available: data.quantity > 0
      };
    });

    res.json(servicesProducts);
  } catch (error) {
    console.error('Error fetching available services products:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get available OTC products for transactions
async function getAvailableOtcProducts(req, res) {
  try {
    const { branchId } = req.params;
    const snapshot = await firestore.collection('otcProducts')
      .where('branch_id', '==', branchId)
      .where('status', '==', 'active')
      .get();

    const otcProducts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        name: data.name,
        category: data.category,
        price: data.price,
        quantity: data.quantity,
        min_quantity: data.min_quantity,
        type: 'otc_product',
        collection: 'otcProducts',
        available: data.quantity > 0
      };
    });

    res.json(otcProducts);
  } catch (error) {
    console.error('Error fetching available OTC products:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get all available items for transactions (combined)
async function getAllAvailableItems(req, res) {
  try {
    const { branchId } = req.params;
    const { type = 'all' } = req.query; // 'all', 'services', 'services_products', 'otc_products'

    let allItems = [];

    if (type === 'all' || type === 'services') {
      const servicesSnapshot = await firestore.collection('services')
        .where('branch_id', '==', branchId)
        .where('status', '==', 'active')
        .get();

      const services = servicesSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          name: data.name,
          description: data.description,
          category: data.category,
          price: data.price,
          type: 'service',
          collection: 'services',
          available: true
        };
      });
      allItems = allItems.concat(services);
    }

    if (type === 'all' || type === 'services_products') {
      const servicesProductsSnapshot = await firestore.collection('services_products')
        .where('branch_id', '==', branchId)
        .where('status', '==', 'active')
        .get();

      const servicesProducts = servicesProductsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          name: data.name,
          category: data.category,
          unit: data.unit,
          quantity: data.quantity,
          unit_value: data.unit_value,
          total_value: data.total_value,
          price: data.unit_value,
          type: 'services_product',
          collection: 'services_products',
          available: data.quantity > 0
        };
      });
      allItems = allItems.concat(servicesProducts);
    }

    if (type === 'all' || type === 'otc_products') {
      const otcProductsSnapshot = await firestore.collection('otcProducts')
        .where('branch_id', '==', branchId)
        .where('status', '==', 'active')
        .get();

      const otcProducts = otcProductsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.id,
          name: data.name,
          category: data.category,
          price: data.price,
          quantity: data.quantity,
          min_quantity: data.min_quantity,
          type: 'otc_product',
          collection: 'otcProducts',
          available: data.quantity > 0
        };
      });
      allItems = allItems.concat(otcProducts);
    }

    res.json(allItems);
  } catch (error) {
    console.error('Error fetching available items:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get services data based on branch and service IDs
async function getClientSelectedServices(req, res) {
  try {
    const { branchId } = req.params;
    const { service_ids = [] } = req.query;
    console.log(service_ids ,'service_ids')
    if (!branchId) {
      return res.status(400).json({
        error: 'Branch ID is required'
      });
    }

    let queryRef = firestore.collection('services')
      .where('branch_id', '==', branchId)
      .where('status', '==', 'active');

    const snapshot = await queryRef.get();
    let services = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        price: data.price,
        duration: data.duration,
        status: data.status,
        type: 'services',
        collection: 'services'
      };
    });

    // If service_ids are provided, filter to only those services
    if (service_ids && Array.isArray(service_ids) && service_ids.length > 0) {
      services = services.filter(service => service_ids.includes(service.id));
    }
    console.log(services.length ,'services' , service_ids.length)
    // Get branch name
    const branchName = await getBranchNameById(branchId);

    res.status(200).json({
      branch_id: branchId,
      branch_name: branchName,
      total_services: services.length,  
      services: services
    });
  } catch (error) {
    console.error('Error fetching services by branch:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get specific services by IDs within a branch
async function getServicesByIds(req, res) {
  try {
    const { branchId } = req.params;
    const { service_ids = [] } = req.body;

    if (!branchId) {
      return res.status(400).json({
        error: 'Branch ID is required'
      });
    }

    if (!service_ids || !Array.isArray(service_ids) || service_ids.length === 0) {
      return res.status(400).json({
        error: 'Service IDs array is required'
      });
    }

    // Fetch services by IDs and filter by branch
    const services = [];
    for (const serviceId of service_ids) {
      try {
        const serviceDoc = await firestore.collection('services').doc(serviceId).get();
        if (serviceDoc.exists) {
          const serviceData = serviceDoc.data();
          // Only include services that belong to the specified branch and are active
          if (serviceData.branch_id === branchId && serviceData.status === 'active') {
            services.push({
              id: serviceData.id,
              name: serviceData.name,
              description: serviceData.description,
              category: serviceData.category,
              price: serviceData.price,
              duration: serviceData.duration,
              status: serviceData.status,
              type: 'service',
              collection: 'services'
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching service ${serviceId}:`, error);
        // Continue with other services
      }
    }

    // Get branch name
    const branchName = await getBranchNameById(branchId);

    res.status(200).json({
      branch_id: branchId,
      branch_name: branchName,
      requested_service_ids: service_ids,
      found_services: services.length,
      services: services
    });
  } catch (error) {
    console.error('Error fetching services by IDs:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get item details by ID and type
async function getItemDetails(req, res) {
  try {
    const { itemId } = req.params;
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        error: 'Item type is required. Use query parameter "type" with value: otc_product, services_product, or service'
      });
    }

    let collectionName;
    if (type === 'otc_product') {
      collectionName = 'otcProducts';
    } else if (type === 'services_product') {
      collectionName = 'services_products';
    } else if (type === 'service') {
      collectionName = 'services';
    } else {
      return res.status(400).json({
        error: 'Invalid item type. Must be: otc_product, services_product, or service'
      });
    }

    const itemDoc = await firestore.collection(collectionName).doc(itemId).get();
    
    if (!itemDoc.exists) {
      return res.status(404).json({
        error: 'Item not found',
        item_id: itemId,
        type: type
      });
    }

    const itemData = itemDoc.data();
    
    res.status(200).json({
      item_id: itemId,
      type: type,
      data: itemData
    });
  } catch (error) {
    console.error('Error fetching item details:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get item name by ID and type
async function getItemName(req, res) {
  try {
    const { itemId } = req.params;
    const { type } = req.query;

    if (!type) {
      return res.status(400).json({
        error: 'Item type is required. Use query parameter "type" with value: otc_product, services_product, or service'
      });
    }

    const itemName = await getItemNameById(itemId, type);
    
    res.status(200).json({
      item_id: itemId,
      type: type,
      name: itemName
    });
  } catch (error) {
    console.error('Error fetching item name:', error);
    res.status(500).json({ error: error.message });
  }
}

// Helper functions
async function getItemNameById(itemId, itemType) {
  try {
    let collectionName;
    if (itemType === 'otc_product') {
      collectionName = 'otcProducts';
    } else if (itemType === 'services_product') {
      collectionName = 'services_products';
    } else if (itemType === 'service') {
      collectionName = 'services';
    } else {
      return 'Unknown Item';
    }
    
    const itemDoc = await firestore.collection(collectionName).doc(itemId).get();
    if (itemDoc.exists) {
      const itemData = itemDoc.data();
      return itemData.name || 'Unknown Item';
    }
    return 'Unknown Item';
  } catch (error) {
    console.error(`Error fetching item name for ${itemId}:`, error);
    return 'Unknown Item';
  }
}

async function getBranchNameById(branchId) {
  const branchDoc = await firestore.collection('branches').doc(branchId).get();
  if (branchDoc.exists) {
    const branchData = branchDoc.data();
    return branchData.name || 'Unknown Branch';
  }
  return 'Unknown Branch';
}

module.exports = {
  getAvailableServices,
  getAvailableServicesProducts,
  getAvailableOtcProducts,
  getAllAvailableItems,
  getClientSelectedServices,
  getServicesByIds,
  getItemDetails,
  getItemName
};
