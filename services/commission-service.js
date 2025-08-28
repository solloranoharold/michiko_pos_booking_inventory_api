const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const { getCurrentDate } = require('./helper-service');

const firestore = admin.firestore();

// Collections
const COMMISSIONS_COLLECTION = 'commissions';

// Save commission
async function saveCommission(accountId, transactionId, amount, transactionTotal, commissionRate = 0.10, totalSalesOverall, netSales, branch_id) {
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

// Remove commissions for transaction
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

// Get all commissions with filtering
async function getAllCommissions(req, res) {
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
    
    // Apply same filters as the main query for consistency
    if(branch_id){
      queryRefAll = queryRefAll.where('branch_id', '==', branch_id);
    }
    if (account_id) {
      queryRefAll = queryRefAll.where('account_id', '==', account_id);
    }
    if (status) {
      queryRefAll = queryRefAll.where('status', '==', status);
    }
    if (search) {
      queryRefAll = queryRefAll.where('account_id', '==', search);
    }
    if (date_from) {
      queryRefAll = queryRefAll.where('date_created', '>=', date_from);
    }
    if (date_to) {
      const nextDay = moment(date_to).add(1, 'day').format('YYYY-MM-DD');
      queryRefAll = queryRefAll.where('date_created', '<', nextDay);
    }
    
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
}

// Update commission status to paid
async function updateCommissionStatusToPaid(req, res) {
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
}

// Get commission statistics
async function getCommissionStats(req, res) {
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
}

// Helper function
async function getBranchNameById(branchId) {
  const branchDoc = await firestore.collection('branches').doc(branchId).get();
  if (branchDoc.exists) {
    const branchData = branchDoc.data();
    return branchData.name || 'Unknown Branch';
  }
  return 'Unknown Branch';
}

module.exports = {
  saveCommission,
  removeCommissionsForTransaction,
  getAllCommissions,
  updateCommissionStatusToPaid,
  getCommissionStats
};
