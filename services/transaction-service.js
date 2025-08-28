const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { getCurrentDate, generateInvoiceId, calculateCommission } = require('./helper-service');
const { saveCommission, removeCommissionsForTransaction } = require('./commission-service');
const { trackUsedQuantities, removeUsedQuantitiesForTransaction } = require('./inventory-service');

const firestore = admin.firestore();

// Collections
const TRANSACTIONS_COLLECTION = 'transactions';
const INVENTORY_COLLECTION = 'inventory';
const DASHBOARD_COLLECTION = 'dashboard';

// Create transaction
async function createTransaction(req, res) {
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
}

// Void transaction
async function voidTransaction(req, res) {
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
}

// Get all transactions
async function getAllTransactions(req, res) {
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
    if(branch_id){
      statusPaidQuery = statusPaidQuery.where('branch_id', '==', branch_id);
    }
    const statusPaidSnapshot = await statusPaidQuery.count().get();
    const totalCountPaid = statusPaidSnapshot.data().count;
    // Count total voided transactions
    let statusVoidQuery = firestore.collection(TRANSACTIONS_COLLECTION);
    statusVoidQuery = statusVoidQuery.where('payment_status', '==', 'void');
    if(branch_id){
      statusVoidQuery = statusVoidQuery.where('branch_id', '==', branch_id);
    }
    const statusVoidSnapshot = await statusVoidQuery.count().get();
    const totalCountVoid = statusVoidSnapshot.data().count;

    res.status(200).json({ data: newTransactions, page, totalPages, totalCount, totalCountPaid , totalCountVoid });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get transaction statistics (excluding voided transactions)
async function getTransactionStats(req, res) {
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
}

// Get voided transactions
async function getVoidedTransactions(req, res) {
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
}

// Helper functions that need to be imported
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

module.exports = {
  createTransaction,
  voidTransaction,
  getAllTransactions,
  getTransactionStats,
  getVoidedTransactions
};
