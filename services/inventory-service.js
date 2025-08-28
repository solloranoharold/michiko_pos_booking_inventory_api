const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { getCurrentDate } = require('./helper-service');

const firestore = admin.firestore();

// Collections
const USED_QUANTITIES_COLLECTION = 'used_quantities';
const INVENTORY_COLLECTION = 'inventory';

// Track used quantities for products
async function trackUsedQuantities(transactionId, branchId, items, dateCreated) {
  try {
    const batch = firestore.batch();
    
    for (const item of items) {
      // Only track quantities for products (not services)
      if (item.type === 'otc_product' || item.type === 'services_product') {
        // Get item name from the appropriate collection based on type
        const itemName = await getItemNameById(item.item_id, item.type);

        const usedQuantityId = uuidv4();
        const usedQuantityData = {
          id: usedQuantityId,
          transaction_id: transactionId,
          branch_id: branchId,
          item_id: item.item_id,
          item_name: itemName,
          item_type: item.type,
          quantity_used: item.quantity,
          unit_price: item.price,
          total_value: item.item_total,
          change_type: 'decrease', // Transaction reduces inventory
          date_created: dateCreated,
          doc_type: 'USED_QUANTITIES'
        };

        // Add to batch
        const usedQuantityRef = firestore.collection(USED_QUANTITIES_COLLECTION).doc(usedQuantityId);
        batch.set(usedQuantityRef, usedQuantityData);
      }
    }

    // Execute batch
    await batch.commit();
    console.log(`Tracked used quantities for transaction ${transactionId}`);
  } catch (error) {
    console.error('Error tracking used quantities:', error);
    // Don't throw error to avoid breaking transaction creation
  }
}

// Remove used quantities for transaction
async function removeUsedQuantitiesForTransaction(transactionId) {
  try {
    const usedQuantitiesRef = firestore.collection(USED_QUANTITIES_COLLECTION);
    const snapshot = await usedQuantitiesRef.where('transaction_id', '==', transactionId).get();
    if(snapshot.empty){
      return;
    }
    const batch = firestore.batch();

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Removed used quantities for transaction ${transactionId}`);
  } catch (error) {
    console.error('Error removing used quantities for transaction:', error);
  }
}

// Get used quantities for a specific branch
async function getUsedQuantities(req, res) {
  try {
    const { branchId } = req.params;
    let { pageSize = 10, page = 1, item_type = '', date_from = '', date_to = '', search = '' } = req.query;
    console.log(req.query)
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    let queryRef = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('branch_id', '==', branchId);

    // Filter by item type if provided
    if (item_type) {
      queryRef = queryRef.where('item_type', '==', item_type);
    }

    if (search) {
      queryRef = queryRef.where('item_name', '==', search);
    }

    // Filter by date range if provided
    if (date_from) {
      queryRef = queryRef.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      queryRef = queryRef.where('date_created', '<', nextDay);
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

    const snapshot = await queryRef.get();
    let usedQuantities = snapshot.docs.map(doc => doc.data());

    // Fetch actual item names for each record
    let arrData = [];
    for (const record of usedQuantities) {
      let index = -1 , itemData=null
      try {
        if(record.item_type === 'services_product'){
          itemData = await getServiceProductDataById(record.item_id);
          index = arrData.findIndex(item => item.id === record.item_id);
        }else if(record.item_type === 'otc_product'){
          itemData = await getOtcProductDataById(record.item_id);
          index = arrData.findIndex(item => item.id === record.item_id);
        }
        record.category = itemData?.category || null;
        record.branch_name = await getBranchNameById(record.branch_id);
        if(index === -1){
          arrData.push({
            id: record.item_id,
            name: itemData.name,
            stocks: itemData.quantity,
            min_quantity: itemData.min_quantity,
            category: itemData?.category || null,
            item_type: record.item_type,
            branch_name: await getBranchNameById(record.branch_id),
            usages:[ record ],
            total_used: record.quantity_used,
            last_used: record.date_created,
          });
        }else{
          arrData[index].total_used += record.quantity_used;
          arrData[index].usages.push(record);
          // Find the latest date from all usages
          const latestDate = arrData[index].usages.reduce((latest, usage) => {
            return usage.date_created > latest ? usage.date_created : latest;
          }, arrData[index].usages[0].date_created);
          arrData[index].last_used = moment(latestDate).format('YYYY-MM-DD HH:mm:ss');
        }
      } catch (error) {
        console.error(`Error fetching item name for ${record.item_id}:`, error);
        // Keep the existing item_name if fetch fails
      }
    }

    // Count total
    let countQuery = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('branch_id', '==', branchId);
    
    if (item_type) {
      countQuery = countQuery.where('item_type', '==', item_type);
    }
    if(search){
      countQuery = countQuery.where('item_name', '==', search);
    }
    
    // Apply same date filtering to count query
    if (date_from) {
      countQuery = countQuery.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      countQuery = countQuery.where('date_created', '<', nextDay);
    }
    
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    // get total quantity used
    let totalQuantityUsed = 0;
    let totalOtcQuantityUsed = 0;
    let totalServicesQuantityUsed = 0;
    let lowOTCStockCount = 0;
    let lowServicesStockCount = 0;

    let quantityUsedQuery = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('branch_id', '==', branchId);
    const quantity_used_snapshot = await quantityUsedQuery.get();
    let used_quantity_data = quantity_used_snapshot.docs.map(doc => doc.data());
    
    // Track unique item IDs to avoid counting duplicates
    const uniqueOtcItems = new Set();
    const uniqueServicesItems = new Set();
    
    for(const record of used_quantity_data){
      totalQuantityUsed += record.quantity_used;
      if(record.item_type === 'otc_product'){
        uniqueOtcItems.add(record.item_id);
      }else if(record.item_type === 'services_product'){
        uniqueServicesItems.add(record.item_id);
      }
    }
    
    // Count unique items instead of individual records
    totalOtcQuantityUsed = uniqueOtcItems.size;
    totalServicesQuantityUsed = uniqueServicesItems.size;

    let otcStocksQuery = firestore.collection('services_products')
      .where('branch_id', '==', branchId)
      .where('quantity', '<=', 'min_quantity');
    const otc_stocks_snapshot = await otcStocksQuery.get();
    let otc_stocks = otc_stocks_snapshot.docs.map(doc => doc.data());
    for(const record of otc_stocks){
      lowOTCStockCount += 1;
    }

    let servicesStocksQuery = firestore.collection('services_products')
      .where('branch_id', '==', branchId)
      .where('quantity', '<=', 'min_quantity');
    const services_stocks_snapshot = await servicesStocksQuery.get();
    let services_stocks = services_stocks_snapshot.docs.map(doc => doc.data());
    for(const record of services_stocks){
      lowServicesStockCount += 1;
    }

    res.status(200).json({ 
      data: arrData, 
      page, 
      totalPages, 
      totalCount,
      totalQuantityUsed,
      totalOtcQuantityUsed,
      totalServicesQuantityUsed,
      lowOTCStockCount,
      lowServicesStockCount,
      branch_id: branchId
    });
  } catch (error) {
    console.error('Error fetching used quantities:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get used quantities summary for a specific branch
async function getUsedQuantitiesSummary(req, res) {
  try {
    const { branchId } = req.params;
    const { date_from = '', date_to = '' } = req.query;

    let queryRef = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('branch_id', '==', branchId);

    // Filter by date range if provided
    if (date_from) {
      queryRef = queryRef.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      queryRef = queryRef.where('date_created', '<', nextDay);
    }

    const snapshot = await queryRef.get();
    let usedQuantities = snapshot.docs.map(doc => doc.data());

    // Fetch actual item names for each record
    for (const record of usedQuantities) {
      try {
        const actualItemName = await getItemNameById(record.item_id, record.item_type);
        record.item_name = actualItemName;
      } catch (error) {
        console.error(`Error fetching item name for ${record.item_id}:`, error);
        // Keep the existing item_name if fetch fails
      }
    }

    // Calculate summary statistics
    const summary = {
      total_records: usedQuantities.length,
      total_quantity_used: 0,
      total_value: 0,
      item_type_breakdown: {},
      top_items: {},
      average_quantity_per_record: 0,
      average_value_per_record: 0
    };

    // Group by item type and calculate totals
    for (const record of usedQuantities) {
      summary.total_quantity_used += record.quantity_used || 0;
      summary.total_value += record.total_value || 0;

      // Item type breakdown
      const type = record.item_type || 'unknown';
      if (!summary.item_type_breakdown[type]) {
        summary.item_type_breakdown[type] = {
          count: 0,
          total_quantity: 0,
          total_value: 0
        };
      }
      summary.item_type_breakdown[type].count++;
      summary.item_type_breakdown[type].total_quantity += record.quantity_used || 0;
      summary.item_type_breakdown[type].total_value += record.total_value || 0;

      // Top items by quantity - fetch actual item name
      const itemKey = record.item_id;
      if (!summary.top_items[itemKey]) {
        // Fetch the actual item name from the appropriate collection
        let actualItemName = record.item_name || 'Unknown Item';
        try {
          actualItemName = await getItemNameById(record.item_id, record.item_type);
        } catch (error) {
          console.error(`Error fetching item name for ${record.item_id}:`, error);
        }

        summary.top_items[itemKey] = {
          item_id: record.item_id,
          item_name: actualItemName,
          item_type: record.item_type,
          total_quantity: 0,
          total_value: 0,
          usage_count: 0
        };
      }
      summary.top_items[itemKey].total_quantity += record.quantity_used || 0;
      summary.top_items[itemKey].total_value += record.total_value || 0;
      summary.top_items[itemKey].usage_count++;
    }

    // Calculate averages
    if (summary.total_records > 0) {
      summary.average_quantity_per_record = parseFloat((summary.total_quantity_used / summary.total_records).toFixed(2));
      summary.average_value_per_record = parseFloat((summary.total_value / summary.total_records).toFixed(2));
    }

    // Convert top_items object to array and sort by total quantity
    const topItemsArray = Object.values(summary.top_items)
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, 10); // Top 10 items

    summary.top_items = topItemsArray;

    res.status(200).json({
      branch_id: branchId,
      date_range: { from: date_from, to: date_to },
      summary
    });
  } catch (error) {
    console.error('Error fetching used quantities summary:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get used quantities for a specific item
async function getUsedQuantitiesForItem(req, res) {
  try {
    const { itemId } = req.params;
    let { pageSize = 10, page = 1, branch_id = '', date_from = '', date_to = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    let queryRef = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('item_id', '==', itemId);

    // Filter by branch if provided
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }

    // Filter by date range if provided
    if (date_from) {
      queryRef = queryRef.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      queryRef = queryRef.where('date_created', '<', nextDay);
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

    const snapshot = await queryRef.get();
    let usedQuantities = snapshot.docs.map(doc => doc.data());

    // Fetch actual item names for each record
    for (const record of usedQuantities) {
      try {
        const actualItemName = await getItemNameById(record.item_id, record.item_type);
        record.item_name = actualItemName;
      } catch (error) {
        console.error(`Error fetching item name for ${record.item_id}:`, error);
        // Keep the existing item_name if fetch fails
      }
    }

    // Count total
    let countQuery = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('item_id', '==', itemId);
    
    if (branch_id) {
      countQuery = countQuery.where('branch_id', '==', branch_id);
    }
    
    // Apply same date filtering to count query
    if (date_from) {
      countQuery = countQuery.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      countQuery = countQuery.where('date_created', '<', nextDay);
    }
    
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    res.status(200).json({ 
      data: usedQuantities, 
      page, 
      totalPages, 
      totalCount,
      item_id: itemId
    });
  } catch (error) {
    console.error('Error fetching used quantities for item:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get used quantities for Excel export (aggregated by item_id and date_created)
async function getUsedQuantitiesForExport(req, res) {
  try {
    const { branchId } = req.params;
    const { date_from = '', date_to = '' } = req.query;

    let queryRef = firestore.collection(USED_QUANTITIES_COLLECTION)
      .where('branch_id', '==', branchId);

    // Filter by date range if provided
    if (date_from) {
      queryRef = queryRef.where('date_created', '>=', date_from);
    }
    if (date_to) {
      // Add one day to include the entire date_to day
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      queryRef = queryRef.where('date_created', '<', nextDay);
    }

    const snapshot = await queryRef.get();
    let usedQuantities = snapshot.docs.map(doc => doc.data());

    // Aggregate data by item_id and date_created
    const aggregatedData = {};

    for (const record of usedQuantities) {
      // For services_product, use only the date part (disregard time)
      // For other types, use the full date_created
      let aggregationKey;
      let displayDate;
      
      if (record.item_type === 'services_product') {
        // Extract only the date part (YYYY-MM-DD) for services products
        const dateOnly = record.date_created.split(' ')[0];
        aggregationKey = `${record.item_id}_${dateOnly}`;
        displayDate = dateOnly;
      } else {
        // Use full date_created for other product types
        aggregationKey = `${record.item_id}_${record.date_created}`;
        displayDate = record.date_created;
      }
      
      if (!aggregatedData[aggregationKey]) {
        aggregatedData[aggregationKey] = {
          date: displayDate,
          item_id: record.item_id,
          item_name: record.item_name,
          category: '',
          quantity: 0,
          quantity_used: 0,
          quantity_added: 0,
          status: '',
          item_type: record.item_type
        };
      }
      
      // Add quantity_used and quantity_added
      aggregatedData[aggregationKey].quantity_used += record.quantity_used || 0;
      aggregatedData[aggregationKey].quantity_added += record.quantity_added || 0;
    }

    // Fetch additional item details and organize by type
    const servicesProducts = [];
    const otcProducts = [];

    for (const key in aggregatedData) {
      const record = aggregatedData[key];
      
      try {
        let itemData = null;
        
        if (record.item_type === 'services_product') {
          itemData = await getServiceProductDataById(record.item_id);
          if (itemData) {
            record.category = itemData.category || '';
            record.quantity = itemData.quantity || 0;
            record.status = (itemData.quantity <= itemData.min_quantity) ? 'Low Stock' : 'In Stock';
            servicesProducts.push(record);
          }
        } else if (record.item_type === 'otc_product') {
          itemData = await getOtcProductDataById(record.item_id);
          if (itemData) {
            record.category = itemData.category || '';
            record.quantity = itemData.quantity || 0;
            record.status = (itemData.quantity <= itemData.min_quantity) ? 'Low Stock' : 'In Stock';
            otcProducts.push(record);
          }
        }
      } catch (error) {
        console.error(`Error fetching item details for ${record.item_id}:`, error);
        // Keep the record with default values
        if (record.item_type === 'services_product') {
          servicesProducts.push(record);
        } else if (record.item_type === 'otc_product') {
          otcProducts.push(record);
        }
      }
    }

    // Sort by date and item name
    const sortByDateAndName = (a, b) => {
      if (a.date !== b.date) {
        return new Date(a.date) - new Date(b.date);
      }
      return (a.item_name || '').localeCompare(b.item_name || '');
    };

    servicesProducts.sort(sortByDateAndName);
    otcProducts.sort(sortByDateAndName);

    // Format data for Excel export
    const formatForExcel = (records) => {
      return records.map(record => ({
        'Date': record.date,
        'Item ID': record.item_id,
        'Item Name': record.item_name,
        'Category': record.category,
        'Quantity': record.quantity,
        'Quantity Used': record.quantity_used,
        'Quantity Added': record.quantity_added > 0 ? record.quantity_added : 'N/A',
        'Status': record.status
      }));
    };

    const exportData = {
      branch_id: branchId,
      date_range: { from: date_from, to: date_to },
      export_date: getCurrentDate(),
      services_products: {
        page_name: 'Service Products',
        total_records: servicesProducts.length,
        data: formatForExcel(servicesProducts)
      },
      otc_products: {
        page_name: 'OTC Products',
        total_records: otcProducts.length,
        data: formatForExcel(otcProducts)
      },
      summary: {
        total_services_products: servicesProducts.length,
        total_otc_products: otcProducts.length,
        total_records: servicesProducts.length + otcProducts.length
      }
    };

    res.status(200).json(exportData);
  } catch (error) {
    console.error('Error exporting used quantities:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get inventory for Excel export
async function getInventoryForExport(req, res) {
  try {
    const { branchId } = req.params;
    const snapshot = await firestore.collection(INVENTORY_COLLECTION)
      .where('branch_id', '==', branchId)
      .get();

    const inventory = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        'Item ID': data.id,
        'Name': data.name,
        'Description': data.description,
        'Category': data.category,
        'Price': data.price,
        'Cost': data.cost,
        'Quantity': data.quantity,
        'Min Stock': data.min_stock,
        'SKU': data.sku,
        'Supplier': data.supplier,
        'Status': data.quantity <= data.min_stock ? 'Low Stock' : 'In Stock',
        'Date Created': data.date_created,
        'Date Updated': data.date_updated
      };
    });

    res.json({
      branch_id: branchId,
      export_date: getCurrentDate(),
      total_items: inventory.length,
      data: inventory
    });
  } catch (error) {
    console.error('Error exporting inventory:', error);
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

async function getServiceProductDataById(itemId) {
  const itemDoc = await firestore.collection('services_products').doc(itemId).get();
  if (itemDoc.exists) {
    const itemData = itemDoc.data();
    return itemData;
  }
  return null;
}

async function getOtcProductDataById(itemId) {
  const itemDoc = await firestore.collection('otcProducts').doc(itemId).get();
  if (itemDoc.exists) {
    const itemData = itemDoc.data();
    return itemData;
  }
  return null;
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
  trackUsedQuantities,
  removeUsedQuantitiesForTransaction,
  getUsedQuantities,
  getUsedQuantitiesSummary,
  getUsedQuantitiesForItem,
  getUsedQuantitiesForExport,
  getInventoryForExport
};
