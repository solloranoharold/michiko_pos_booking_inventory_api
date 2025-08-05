const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

const router = express.Router();
const firestore = admin.firestore();

// Collections
const TRANSACTIONS_COLLECTION = 'transactions';
const INVENTORY_COLLECTION = 'inventory';
const COMMISSIONS_COLLECTION = 'commissions';
const DASHBOARD_COLLECTION = 'dashboard';
const USED_UNIT_VALUES_COLLECTION = 'used_unit_values';
const USED_QUANTITIES_COLLECTION = 'used_quantities';

// Helper functions
function getCurrentDate() {
  return moment().format('YYYY-MM-DD HH:mm:ss');
}

function generateInvoiceId() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `INV-${timestamp}-${random}`;
}

function calculateCommission(amount, commissionRate = 0.10) {
  return parseFloat((amount * commissionRate).toFixed(2));
}
async function getClientNameById(clientId) {
  const clientDoc = await firestore.collection('clients').doc(clientId).get();
  if (clientDoc.exists) {
    const clientData = clientDoc.data();
    return clientData.fullname || clientData.email;
  }
  console.log('wala clienmt')
  return 'Unknown Client';
}
async function getBranchNameById(branchId) {
  const branchDoc = await firestore.collection('branches').doc(branchId).get();
  if (branchDoc.exists) {
    const branchData = branchDoc.data();
    return branchData.name || 'Unknown Branch';
  }
  return 'Unknown Branch';
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


// ==================== TRANSACTION RECORDS ====================

// Create transaction
router.post('/createTransaction', async (req, res) => {
  try {
    const {
      client_id,
      branch_id,
      accounts, // Array of {account_email, commission_rate, commissionAmount}
      items, // Array of {item_id, quantity, price, type: 'service'|'services_product'|'otc_product'}
      payment_method,
      payment_status = 'paid',
      additionals=[],
      notes = '',
      reference_no = '',
      discount = 0, // Discount amount (defaults to 0)
      total_commission = 0, // Total commission amount (optional)
      net_amount = 0, // Net amount after commissions (optional)
      total_amount = 0 // Total amount before commissions (optional)
    } = req.body;

    if (!client_id || !branch_id || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: client_id, branch_id, items'
      });
    }

    // Validate accounts array if provided
    if (accounts && !Array.isArray(accounts)) {
      return res.status(400).json({
        error: 'Accounts must be an array'
      });
    }

    // Ensure accounts is an array (default to empty if not provided)
    const accountsArray = accounts || [];

    // Validate reference_no is required when payment method is not cash
    if (payment_method && payment_method.toLowerCase() !== 'cash' && !reference_no) {
      return res.status(400).json({
        error: 'Reference number is required when payment method is not cash'
      });
    }

    // Validate discount (optional field)
    if (discount !== undefined && discount !== null) {
      if (typeof discount !== 'number' || discount < 0) {
        return res.status(400).json({
          error: 'Discount must be a non-negative number'
        });
      }
    }



    const transactionId = uuidv4();
    const invoiceId = generateInvoiceId();
    const dateCreated = getCurrentDate();

    // Calculate totals and prepare inventory updates
    let subtotal = 0;
    let totalQuantity = 0;
    const processedItems = [];
    const inventoryUpdates = [];

    // Process additional amounts if provided
    let additionalTotal = 0;
    if (additionals && Array.isArray(additionals) && additionals.length > 0) {
      additionalTotal = additionals.reduce((sum, additional) => {
        if (additional.amount && typeof additional.amount === 'number' && additional.amount >= 0) {
          return sum + additional.amount;
        }
        return sum;
      }, 0);
    }

    for (const item of items) {
      // Validate required fields for each item
      if (!item.item_id || !item.type) {
        throw new Error('Each item must have item_id and type');
      }

      // Validate quantity for products
      if (item.type === 'otc_product') {
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          throw new Error(`Invalid quantity for item ${item.item_id}. Quantity must be a positive number.`);
        }
      }
      
      // Validate usageQuantity for services_products
      if (item.type === 'services_product') {
        if (typeof item.quantity !== 'number' || item.quantity <= 0) {
          throw new Error(`Invalid usageQuantity for services_product ${item.item_id}. UsageQuantity must be a positive number.`);
        }
      }

      // Validate price
      if (typeof item.price !== 'number' ) {
        throw new Error(`Invalid price for item ${item.item_id}. Price must be a non-negative number.`);
      }


      let itemTotal=0;
      // Calculate itemTotal based on type
      if (item.type === 'service') {
        // For services, use price directly (no quantity multiplication)
        itemTotal = parseFloat(item.price.toFixed(2));
      } else if (item.type === 'otc_product') {
        // For otc_products, multiply quantity by price
        itemTotal = parseFloat(item.quantity * item.price);
      } else if (item.type === 'services_product') {
        // For services_products, multiply quantity by price
        itemTotal = parseFloat(item.quantity * item.price);
      }
      
      subtotal += itemTotal;
      
      // Only add to totalQuantity for inventory items (services don't have quantity)
      if (item.type === 'otc_product') {
        totalQuantity += item.quantity;
      }
      if(item.type==='service'){
        totalQuantity += 1;
      }

      // Prepare inventory updates and processed items based on item type
      if (item.type === 'services_product') {
        const itemDoc = await firestore.collection('services_products').doc(item.item_id).get();
        if (itemDoc.exists) {
          const itemData = itemDoc.data();
          let new_total_value = parseFloat(itemData.total_value) - parseFloat(item.quantity);
          let new_quantity = parseFloat(new_total_value) / parseFloat(itemData.unit_value);
          inventoryUpdates.push({
            collection: 'services_products',
            docId: item.item_id,
            updates: {
              quantity: isNaN(new_quantity) ? 0 : new_quantity,
              total_value: new_total_value,
              date_updated: getCurrentDate()
            }
          });
        }
       
        
        processedItems.push({
          ...item,
          item_total: itemTotal,
          used_unit_value: item.quantity
        });
      } else if (item.type === 'otc_product') {
        const itemDoc = await firestore.collection('otcProducts').doc(item.item_id).get();
        if (itemDoc.exists) {
          const itemData = itemDoc.data();
          const new_quantity = parseInt(itemData.quantity) - parseInt(item.quantity);
          inventoryUpdates.push({
            collection: 'otcProducts',
            docId: item.item_id,
            updates: {
              quantity: isNaN(new_quantity) ? 0 : new_quantity,
              date_updated: getCurrentDate()
            }
          });
        }
       
        
        processedItems.push({
          ...item,
          item_total: itemTotal
        });
      } else {
        // For services, just add to processed items
        processedItems.push({
          ...item,
          item_total: itemTotal
        });
      }
    }

    const subtotalAmount = parseFloat((subtotal + additionalTotal).toFixed(2));
    
    // Validate discount doesn't exceed subtotal
    if (discount !== undefined && discount !== null && discount > subtotalAmount) {
      return res.status(400).json({
        error: 'Discount cannot exceed the subtotal amount'
      });
    }
    
    // Apply discount if provided (discount is treated as amount, not percentage)
    const discountAmount = parseFloat(discount || 0);
    const total = parseFloat((subtotalAmount - discountAmount).toFixed(2));

    // Process commissions for each account
    let accountCommissions = [];
    
    if (accountsArray.length > 0) {
      accountCommissions = accountsArray.map(account => {
        // Validate that account_email exists
        if (!account.account_email) {
          throw new Error('Account email is required for each account in the accounts array');
        }
        
        const accountData = {
          account_email: account.account_email
        };
        
        // Add commission_rate if provided
        if (account.commission_rate !== undefined && account.commission_rate !== null) {
          if (typeof account.commission_rate !== 'number' || account.commission_rate < 0) {
            throw new Error(`Invalid commission_rate for account ${account.account_email}. Commission rate must be a non-negative number.`);
          }
          accountData.commission_rate = account.commission_rate;
        }
        
        // Add commissionAmount if provided
        if (account.commissionAmount !== undefined && account.commissionAmount !== null) {
          if (typeof account.commissionAmount !== 'number' || account.commissionAmount < 0) {
            throw new Error(`Invalid commissionAmount for account ${account.account_email}. Commission amount must be a non-negative number.`);
          }
          accountData.commission_amount = account.commissionAmount;
        }
        
        return accountData;
      });
    }
    
    // Use provided amounts directly
    const totalCommissionAmount = total_commission || 0;
    const finalTotal = total_amount || total;
    const finalNetSales = net_amount || (finalTotal - totalCommissionAmount);

    // Use provided amounts directly
    const total_sales_overall = parseFloat(finalTotal.toFixed(2));
    const net_sales = parseFloat(finalNetSales.toFixed(2));

    const transactionData = {
      id: transactionId,
      invoice_id: invoiceId,
      client_id,
      branch_id,
      accounts: accountCommissions, // Store all accounts with their commissions
      items: processedItems,
      additionals: additionals || [], // Store the additionals array
      subtotal: subtotalAmount,
      discount: discountAmount,
      total: finalTotal,
      total_sales_overall,
      net_sales,
      total_commission_amount: totalCommissionAmount,
      total_quantity: totalQuantity,
      payment_method,
      payment_status,
      notes,
      percentDiscount: subtotalAmount > 0 ? parseFloat(((discountAmount / subtotalAmount) * 100).toFixed(2)) : 0,
      reference_no: payment_method && payment_method.toLowerCase() !== 'cash' ? reference_no : null,
      date_created: dateCreated,
      date_updated: dateCreated,
      doc_type: 'TRANSACTIONS'
    };

    // Use batch write to save transaction and update inventory simultaneously
    const batch = firestore.batch();

    // Add transaction to batch
    const transactionRef = firestore.collection(TRANSACTIONS_COLLECTION).doc(transactionId);
    batch.set(transactionRef, transactionData);

    // Add inventory updates to batch
    inventoryUpdates.forEach(update => {
      const docRef = firestore.collection(update.collection).doc(update.docId);
      batch.update(docRef, update.updates);
    });

    // Execute all operations in a single batch
    await batch.commit();

    // Update dashboard data and commissions (these can be done separately as they're not critical for transaction integrity)
    // Only update dashboard if transaction is not void
    if (payment_status !== 'void') {
      
      // Save commissions for accounts that have commission rates
      for (const accountCommission of accountCommissions) {
        if (accountCommission.commission_amount !== undefined) {
          await saveCommission(
            accountCommission.account_email, 
            transactionId, 
            accountCommission.commission_amount, 
            total,
            accountCommission.commission_rate,
            total_sales_overall,
            net_sales,
            branch_id
          );
        }
      }
      
      // Track used quantities for products
      await trackUsedQuantities(transactionId, branch_id, processedItems, dateCreated);
    }

    res.status(201).json(transactionData);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Void transaction
router.put('/voidTransaction/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { void_reason = '' } = req.body;

    // Get the transaction
    const transactionRef = firestore.collection(TRANSACTIONS_COLLECTION).doc(id);
    const transactionDoc = await transactionRef.get();

    if (!transactionDoc.exists) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transactionData = transactionDoc.data();

    // Check if transaction is already void
    if (transactionData.payment_status === 'void') {
      return res.status(400).json({ error: 'Transaction is already voided' });
    }

    // Prepare inventory restoration updates
    const inventoryRestoreUpdates = [];
    
    for (const item of transactionData.items) {
      if (item.type === 'services_product') {
        const itemDoc = await firestore.collection('services_products').doc(item.item_id).get();
        if (itemDoc.exists) {
          const itemData = itemDoc.data();
          let new_total_value = parseFloat(itemData.total_value) + parseFloat(item.quantity);
          let new_quantity = parseFloat(new_total_value) / parseFloat(itemData.unit_value);
          inventoryRestoreUpdates.push({
            collection: 'services_products',
            docId: item.item_id,
            updates: {
              quantity: new_quantity < 0 ? 0 : new_quantity,
              total_value: new_total_value,
              date_updated: getCurrentDate()
            }
          });
        }
      } else if (item.type === 'otc_product') {
        inventoryRestoreUpdates.push({
          collection: 'otcProducts',
          docId: item.item_id,
          updates: {
            quantity: admin.firestore.FieldValue.increment(item.quantity),
            date_updated: getCurrentDate()
          }
        });
      }
    }

    // Use batch write to update transaction and restore inventory
    const batch = firestore.batch();

    // Update transaction status to void
    batch.update(transactionRef, {
      payment_status: 'void',
      void_reason,
      date_updated: getCurrentDate()
    });

    // Restore inventory
    inventoryRestoreUpdates.forEach(update => {
      const docRef = firestore.collection(update.collection).doc(update.docId);
      batch.update(docRef, update.updates);
    });

    // Execute all operations in a single batch
    await batch.commit();

    // Remove commissions for voided transaction
    await removeCommissionsForTransaction(id);
    
    // Remove used quantities for voided transaction
    await removeUsedQuantitiesForTransaction(id);

    res.status(200).json({ 
      message: 'Transaction voided successfully',
      transaction_id: id,
      void_reason
    });
  } catch (error) {
    console.error('Error voiding transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all transactions
router.get('/getAllTransactions', async (req, res) => {
  try {
    let { pageSize = 10, page = 1,search = '', branch_id = '', payment_status = '', date_from = '', date_to = '',client_id = '' } = req.query;
    console.log(req.query)
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    let queryRef = firestore.collection(TRANSACTIONS_COLLECTION);

    if(search){
      queryRef = queryRef.where('invoice_id', '==', search);
    }
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    if (payment_status) {
      queryRef = queryRef.where('payment_status', '==', payment_status);
    }
    if (client_id) {
      queryRef = queryRef.where('client_id', '==', client_id);
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
    let transactions = snapshot.docs.map(doc => doc.data())
    
    // Use Promise.all to wait for all async operations to complete
    let newTransactions = await Promise.all(transactions.map(async(transaction) => {
      transaction.client_name = await getClientNameById(transaction.client_id);
      transaction.branch_name = await getBranchNameById(transaction.branch_id);
      
      // Add item names to each item in the items array
      if (transaction.items && Array.isArray(transaction.items)) {
        transaction.items = await Promise.all(transaction.items.map(async(item) => {
          const itemName = await getItemNameById(item.item_id, item.type);
          return {
            ...item,
            item_name: itemName
          };
        }));
      }
      
      return transaction;
    }));

    

    // Count total
    let countQuery = firestore.collection(TRANSACTIONS_COLLECTION);
    if (branch_id) {
      countQuery = countQuery.where('branch_id', '==', branch_id);
    }
    if (payment_status) {
      countQuery = countQuery.where('payment_status', '==', payment_status);
    }
    if (client_id) {
      countQuery = countQuery.where('client_id', '==', client_id);
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

    // Count total paid transactions
    let statusPaidQuery = firestore.collection(TRANSACTIONS_COLLECTION);
    statusPaidQuery = statusPaidQuery.where('payment_status', '==', 'paid');
    const statusPaidSnapshot = await statusPaidQuery.count().get();
    const totalCountPaid = statusPaidSnapshot.data().count;
    // Count total voided transactions
    let statusVoidQuery = firestore.collection(TRANSACTIONS_COLLECTION);
    statusVoidQuery = statusVoidQuery.where('payment_status', '==', 'void');
    const statusVoidSnapshot = await statusVoidQuery.count().get();
    const totalCountVoid = statusVoidSnapshot.data().count;

    res.status(200).json({ data: newTransactions, page, totalPages, totalCount, totalCountPaid , totalCountVoid });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transaction statistics (excluding voided transactions)
router.get('/transactionStats/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    const { date_from = '', date_to = '' } = req.query;

    let queryRef = firestore.collection(TRANSACTIONS_COLLECTION)
      .where('branch_id', '==', branchId)
      .where('payment_status', '!=', 'void'); // Exclude voided transactions

    const snapshot = await queryRef.get();
    let transactions = snapshot.docs.map(doc => doc.data());

    // Filter by date range if provided
    if (date_from || date_to) {
      transactions = transactions.filter(transaction => {
        const transactionDate = moment(transaction.date_created);
        if (date_from && date_to) {
          return transactionDate.isBetween(date_from, date_to, 'day', '[]');
        } else if (date_from) {
          return transactionDate.isSameOrAfter(date_from, 'day');
        } else if (date_to) {
          return transactionDate.isSameOrBefore(date_to, 'day');
        }
        return true;
      });
    }

    // Calculate statistics
    const stats = {
      total_transactions: transactions.length,
      total_revenue: 0,
      total_tax: 0,
      total_subtotal: 0,
      average_transaction_value: 0,
      payment_status_breakdown: {},
      item_type_breakdown: {}
    };

    transactions.forEach(transaction => {
      stats.total_revenue += transaction.total || 0;
      stats.total_tax += transaction.tax || 0;
      stats.total_subtotal += transaction.subtotal || 0;

      // Payment status breakdown
      const status = transaction.payment_status || 'unknown';
      stats.payment_status_breakdown[status] = (stats.payment_status_breakdown[status] || 0) + 1;

      // Item type breakdown
      transaction.items.forEach(item => {
        const type = item.type || 'unknown';
        stats.item_type_breakdown[type] = (stats.item_type_breakdown[type] || 0) + 1;
      });
    });

    if (stats.total_transactions > 0) {
      stats.average_transaction_value = parseFloat((stats.total_revenue / stats.total_transactions).toFixed(2));
    }

    res.status(200).json({
      branch_id: branchId,
      date_range: { from: date_from, to: date_to },
      stats
    });
  } catch (error) {
    console.error('Error fetching transaction statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get voided transactions
router.get('/voidedTransactions/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    let { pageSize = 10, page = 1, date_from = '', date_to = '' } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    let queryRef = firestore.collection(TRANSACTIONS_COLLECTION)
      .where('branch_id', '==', branchId)
      .where('payment_status', '==', 'void');

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
    let transactions = snapshot.docs.map(doc => doc.data());

    // Filter by date range if provided
    if (date_from || date_to) {
      transactions = transactions.filter(transaction => {
        const transactionDate = moment(transaction.date_created);
        if (date_from && date_to) {
          return transactionDate.isBetween(date_from, date_to, 'day', '[]');
        } else if (date_from) {
          return transactionDate.isSameOrAfter(date_from, 'day');
        } else if (date_to) {
          return transactionDate.isSameOrBefore(date_to, 'day');
        }
        return true;
      });
    }

    // Count total voided transactions
    let countQuery = firestore.collection(TRANSACTIONS_COLLECTION)
      .where('branch_id', '==', branchId)
      .where('payment_status', '==', 'void');
    
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    res.status(200).json({ 
      data: transactions, 
      page, 
      totalPages, 
      totalCount,
      branch_id: branchId
    });
  } catch (error) {
    console.error('Error fetching voided transactions:', error);
    res.status(500).json({ error: error.message });
  }
});



// ==================== HELPER FUNCTIONS ====================



async function updateDashboardDataOnVoid(branchId, amount) {
  try {
    const dashboardRef = firestore.collection(DASHBOARD_COLLECTION).doc(branchId);
    const dashboardDoc = await dashboardRef.get();

    if (dashboardDoc.exists) {
      const currentData = dashboardDoc.data();
      await dashboardRef.update({
        total_revenue: currentData.total_revenue - amount,
        transaction_count: currentData.transaction_count - 1,
        last_transaction_date: null, // Clear last transaction date when voided
        date_updated: getCurrentDate()
      });
    }
  } catch (error) {
    console.error('Error updating dashboard data on void:', error);
  }
}

async function saveCommission(accountId, transactionId, amount, transactionTotal, commissionRate = 0.10, totalSalesOverall, netSales , branch_id) {
  try {
    const commissionId = uuidv4();
    const commissionData = {
      id: commissionId,
      account_id: accountId,
      transaction_id: transactionId,
      amount,
      transaction_total: transactionTotal,
      commission_rate: commissionRate,
      total_sales_overall: totalSalesOverall,
      net_sales: netSales,
      status: 'pending',
      date_created: getCurrentDate(),
      branch_id: branch_id,
      doc_type: 'COMMISSIONS'
    };

    await firestore.collection(COMMISSIONS_COLLECTION).doc(commissionId).set(commissionData);

    // Update account total commissions
    const accountRef = firestore.collection('accounts').doc(accountId);
    const accountDoc = await accountRef.get();
    
    if (accountDoc.exists) {
      const accountData = accountDoc.data();
      const currentCommissions = accountData.commisions || [];
      const newCommission = {
        id: commissionId,
        amount,
        transaction_id: transactionId,
        date: getCurrentDate()
      };

      await accountRef.update({
        commisions: [...currentCommissions, newCommission],
        total_commisions: (accountData.total_commisions || 0) + amount
      });
    }
  } catch (error) {
    console.error('Error saving commission:', error);
  }
}

async function removeCommissionsForTransaction(transactionId) {
  try {
    const commissionsRef = firestore.collection(COMMISSIONS_COLLECTION);
    const snapshot = await commissionsRef.where('transaction_id', '==', transactionId).get();
    if(snapshot.empty){
      return;
    }
    const batch = firestore.batch();

    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    // Update account total commissions
    const accountsRef = firestore.collection('accounts');
    const accountsSnapshot = await accountsRef.get();

    for (const accountDoc of accountsSnapshot.docs) {
      const accountData = accountDoc.data();
      const currentCommissions = accountData.commisions || [];
      const updatedCommissions = currentCommissions.filter(
        (commission) => commission.transaction_id !== transactionId
      );
      await accountDoc.ref.update({
        commisions: updatedCommissions,
        total_commisions: (accountData.total_commisions || 0) - (accountData.commisions || []).reduce((sum, c) => sum + c.amount, 0)
      });
    }
  } catch (error) {
    console.error('Error removing commissions for transaction:', error);
  }
}

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


// ==================== GET AVAILABLE ITEMS FOR TRANSACTIONS ====================

// Get available services for transactions
router.get('/available-services/:branchId', async (req, res) => {
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
});

// Get available services products for transactions
router.get('/available-services-products/:branchId', async (req, res) => {
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
});

// Get available OTC products for transactions
router.get('/available-otc-products/:branchId', async (req, res) => {
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
});

// Get all available items for transactions (combined)
router.get('/available-items/:branchId', async (req, res) => {
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
});

// ==================== EXPORT INVENTORY TO EXCEL ====================

// Get inventory for Excel export
router.get('/inventory/export/:branchId', async (req, res) => {
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
});

// Get used quantities for a specific branch
router.get('/used-quantities/:branchId', async (req, res) => {
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
        record.category = itemData.category;
        record.branch_name = await getBranchNameById(record.branch_id);
        if(index === -1){
          arrData.push({
            id: record.item_id,
            name: itemData.name,
            stocks: itemData.quantity,
            min_quantity: itemData.min_quantity,
            category: itemData.category,
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
        // console.log(arrData);
        // const actualItemName = await getItemNameById(record.item_id, record.item_type);
        // record.item_name = actualItemName;
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
});

// Get used quantities summary for a specific branch
router.get('/used-quantities-summary/:branchId', async (req, res) => {
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
});

// Get used quantities for a specific item
router.get('/used-quantities-item/:itemId', async (req, res) => {
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
});

// Get item details by ID and type
router.get('/item-details/:itemId', async (req, res) => {
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
});

// Get item name by ID and type
router.get('/item-name/:itemId', async (req, res) => {
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
});

// Get used quantities for Excel export (aggregated by item_id and date_created)
router.get('/used-quantities-export/:branchId', async (req, res) => {
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
});

// ==================== COMMISSIONS ROUTES ====================

// Get all commissions with filtering
router.get('/getAllCommissions', async (req, res) => {
  try {
    let { 
      pageSize = 10, 
      page = 1, 
      account_id = '', 
      branch_id = '',
      date_from = '', 
      date_to = '',
      status = '',
      search = ''
    } = req.query;
    console.log(req.query)
    pageSize = parseInt(pageSize);

    let queryRef = firestore.collection(COMMISSIONS_COLLECTION);

    // Apply filters
    if(branch_id){
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    if (account_id) {
      queryRef = queryRef.where('account_id', '==', account_id);
    }

    if (status) {
      queryRef = queryRef.where('status', '==', status);
    }

    if (search) {
      queryRef = queryRef.where('account_id', '==', search);
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
    let commissions = snapshot.docs.map(doc => doc.data());

    // Enhance commission data with additional information
    let enhancedCommissions = await Promise.all(commissions.map(async (commission) => {
      try {
        // Get account details
        const accountDoc = await firestore.collection('accounts')
          .doc(commission.account_id)
          .get();
        
        if (accountDoc.exists) {
          const accountData = accountDoc.data();
          const branch_name = await getBranchNameById(accountData.branch_id);
          commission.account_details = {
            email: accountData.email,
            fullname: accountData.fullname,
            role: accountData.role,
            branch_name: branch_name
          };
        }

        return commission;
      } catch (error) {
        console.error(`Error enhancing commission data for ${commission.id}:`, error);
        return commission;
      }
    }));

    // Count total
    let countQuery = firestore.collection(COMMISSIONS_COLLECTION);
    
    if (account_id) {
      countQuery = countQuery.where('account_id', '==', account_id);
    }
    
    if (status) {
      countQuery = countQuery.where('status', '==', status);
    }

    if (search) {
      countQuery = countQuery.where('transaction_id', '==', search);
    }
    
    // Apply same date filtering to count query
    if (date_from) {
      countQuery = countQuery.where('date_created', '>=', date_from);
    }
    if (date_to) {
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      countQuery = countQuery.where('date_created', '<', nextDay);
    }
    
    const countSnapshot = await countQuery.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    // get All without pagination 
    let queryRefAll = firestore.collection(COMMISSIONS_COLLECTION);
    const snapshotAll = await queryRefAll.get();
    const commissionsAll = snapshotAll.docs.map(doc => doc.data());
    const totalCommissionAmountAll = commissionsAll.reduce((sum, commission) => sum + (commission.amount || 0), 0);
    const averageCommissionAmountAll = commissionsAll.length > 0 ? totalCommissionAmountAll / commissionsAll.length : 0;
    const userTotal = commissionsAll.length


    res.status(200).json({
      data: enhancedCommissions,
      page,
      totalPages,
      totalCount,
      totalCommissionAmount: parseFloat(totalCommissionAmountAll.toFixed(2)),
      averageCommissionAmount: parseFloat(averageCommissionAmountAll.toFixed(2)),
      userTotal: userTotal  
    });
  } catch (error) {
    console.error('Error fetching commissions:', error);
    res.status(500).json({ error: error.message });
  }
});
//  update commission status to paid
router.put('/updateCommissionStatusToPaid/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const commissionRef = firestore.collection(COMMISSIONS_COLLECTION).doc(req.params.id);
    await commissionRef.update({
      status: status
    });
    res.status(200).json({ message: 'Commission status updated to paid' });
  } catch (error) {
    console.error('Error updating commission status:', error);
  }
});
// Get commission statistics
router.get('/commissions/stats', async (req, res) => {
  try {
    const { account_id = '', date_from = '', date_to = '' } = req.query;

    let queryRef = firestore.collection(COMMISSIONS_COLLECTION);

    // Apply filters
    if (account_id) {
      queryRef = queryRef.where('account_id', '==', account_id);
    }

    // Filter by date range if provided
    if (date_from) {
      queryRef = queryRef.where('date_created', '>=', date_from);
    }
    if (date_to) {
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      queryRef = queryRef.where('date_created', '<', nextDay);
    }

    const snapshot = await queryRef.get();
    const commissions = snapshot.docs.map(doc => doc.data());

    // Calculate statistics
    const stats = {
      total_commissions: commissions.length,
      total_amount: 0,
      average_commission: 0,
      status_breakdown: {},
      account_breakdown: {}
    };

    for (const commission of commissions) {
      stats.total_amount += commission.amount || 0;

      // Status breakdown
      const status = commission.status || 'unknown';
      stats.status_breakdown[status] = (stats.status_breakdown[status] || 0) + 1;

      // Account breakdown
      const accountId = commission.account_id || 'unknown';
      if (!stats.account_breakdown[accountId]) {
        stats.account_breakdown[accountId] = {
          total_commissions: 0,
          total_amount: 0
        };
      }
      stats.account_breakdown[accountId].total_commissions++;
      stats.account_breakdown[accountId].total_amount += commission.amount || 0;
    }

    if (stats.total_commissions > 0) {
      stats.average_commission = parseFloat((stats.total_amount / stats.total_commissions).toFixed(2));
    }

    stats.total_amount = parseFloat(stats.total_amount.toFixed(2));

    res.status(200).json({
      stats,
      filters: { account_id, date_from, date_to }
    });
  } catch (error) {
    console.error('Error fetching commission statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
