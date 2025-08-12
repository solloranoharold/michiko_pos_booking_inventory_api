const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const ExcelJS = require('exceljs');

const router = express.Router();
const firestore = admin.firestore();
const EXPENSES_COLLECTION = 'expenses';

// Helper to get current date string
function now() {
  return new Date().toISOString();
}

// CREATE - Add new expense
router.post('/insertExpense', async (req, res) => {
  try {
    const { branch_id, category, amount, name } = req.body;

    // Validate required fields
    if (!branch_id || !category || !amount || !name) {
      return res.status(400).json({ 
        error: 'Missing required fields: branch_id, category, amount, name' 
      });
    }

    // Validate amount is a positive number
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be a positive number' 
      });
    }

    // Check if branch exists
    const branchDoc = await firestore.collection('branches').doc(branch_id).get();
    if (!branchDoc.exists) {
      return res.status(404).json({ 
        error: 'Branch not found' 
      });
    }

    const id = uuidv4();
    const date_created = now();

    const expenseData = {
      id,
      branch_id,
      category,
      amount: numericAmount,
      name,
      date_created,
      doc_type: 'EXPENSE',
      status: 'active'
    };

    await firestore.collection(EXPENSES_COLLECTION).doc(id).set(expenseData);

    return res.status(201).json({ 
      message: 'Expense created successfully',
      data: expenseData 
    });

  } catch (error) {
    console.error('Error creating expense:', error);
    return res.status(500).json({ error: error.message });
  }
});

// READ - Get all expenses with pagination and filtering
router.get('/getAllExpenses', async (req, res) => {
  try {
    let { 
      pageSize = 10, 
      page = 1, 
      branch_id = '', 
      search = ''
    } = req.query;
    console.log(req.query)
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    let queryRef = firestore.collection(EXPENSES_COLLECTION);

    // Apply filters
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    if(search){
      queryRef = queryRef.where('name', '==', search);
    }
    


    // Get total count
    const countSnapshot = await queryRef.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Apply pagination
    if (page > 1) {
      const prevSnapshot = await queryRef.limit(pageSize * (page - 1)).get();
      const docs = prevSnapshot.docs;
      if (docs.length > 0) {
        const lastVisible = docs[docs.length - 1];
        queryRef = queryRef.startAfter(lastVisible);
      }
    }

    const snapshot = await queryRef.limit(pageSize).get();
    const expenses = [];

    for (const doc of snapshot.docs) {
      const expenseData = doc.data();
      
      // Get branch name if available
      try {
        const branchDoc = await firestore.collection('branches').doc(expenseData.branch_id).get();
        if (branchDoc.exists) {
          expenseData.branch_name = branchDoc.data().name || 'Unknown Branch';
        } else {
          expenseData.branch_name = 'Unknown Branch';
        }
      } catch (error) {
        expenseData.branch_name = 'Unknown Branch';
      }

      // Get category name if available
      try {
        const categoryDoc = await firestore.collection('categories').doc(expenseData.category).get();
        if (categoryDoc.exists) {
          expenseData.category_name = categoryDoc.data().name || 'Unknown Category';
        } else {
          expenseData.category_name = 'Unknown Category';
        }
      } catch (error) {
        expenseData.category_name = 'Unknown Category';
      }

      expenses.push(expenseData);
    }

    return res.status(200).json({
      data: expenses,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        page_size: pageSize
      }
    });

  } catch (error) {
    console.error('Error fetching expenses:', error);
    return res.status(500).json({ error: error.message });
  }
});

// READ - Get expense by ID
router.get('/getExpense/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    const expenseDoc = await firestore.collection(EXPENSES_COLLECTION).doc(id).get();

    if (!expenseDoc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expenseData = expenseDoc.data();

    // Get branch name if available
    try {
      const branchDoc = await firestore.collection('branches').doc(expenseData.branch_id).get();
      if (branchDoc.exists) {
        expenseData.branch_name = branchDoc.data().name || 'Unknown Branch';
      } else {
        expenseData.branch_name = 'Unknown Branch';
      }
    } catch (error) {
      expenseData.branch_name = 'Unknown Branch';
    }

    // Get category name if available
    try {
      const categoryDoc = await firestore.collection('categories').doc(expenseData.category).get();
      if (categoryDoc.exists) {
        expenseData.category_name = categoryDoc.data().name || 'Unknown Category';
      } else {
        expenseData.category_name = 'Unknown Category';
      }
    } catch (error) {
      expenseData.category_name = 'Unknown Category';
    }

    return res.status(200).json({ data: expenseData });

  } catch (error) {
    console.error('Error fetching expense:', error);
    return res.status(500).json({ error: error.message });
  }
});

// UPDATE - Update expense
router.put('/updateExpense/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { branch_id, category, amount, name } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    // Check if expense exists
    const expenseDoc = await firestore.collection(EXPENSES_COLLECTION).doc(id).get();
    if (!expenseDoc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const updateData = {};

    // Validate and add fields to update
    if (branch_id !== undefined) {
      // Check if new branch exists
      const branchDoc = await firestore.collection('branches').doc(branch_id).get();
      if (!branchDoc.exists) {
        return res.status(404).json({ error: 'Branch not found' });
      }
      updateData.branch_id = branch_id;
    }

    if (category !== undefined) {
      if (!category.trim()) {
        return res.status(400).json({ error: 'Category cannot be empty' });
      }
      updateData.category = category;
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      updateData.name = name;
    }

    if (amount !== undefined) {
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number' });
      }
      updateData.amount = numericAmount;
    }

    // Add update timestamp
    updateData.date_updated = now();

    await firestore.collection(EXPENSES_COLLECTION).doc(id).update(updateData);

    // Get updated expense data
    const updatedDoc = await firestore.collection(EXPENSES_COLLECTION).doc(id).get();
    const updatedData = updatedDoc.data();

    return res.status(200).json({
      message: 'Expense updated successfully',
      data: updatedData
    });

  } catch (error) {
    console.error('Error updating expense:', error);
    return res.status(500).json({ error: error.message });
  }
});

// DISABLE - Disable expense (soft delete)
router.put('/disableExpense/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    // Check if expense exists
    const expenseDoc = await firestore.collection(EXPENSES_COLLECTION).doc(id).get();
    if (!expenseDoc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Update expense status to disabled
    await firestore.collection(EXPENSES_COLLECTION).doc(id).update({
      status: 'disabled',
      date_updated: now()
    });

    return res.status(200).json({
      message: 'Expense disabled successfully'
    });

  } catch (error) {
    console.error('Error disabling expense:', error);
    return res.status(500).json({ error: error.message });
  }
});

// RESTORE - Restore disabled expense
router.put('/restoreExpense/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Expense ID is required' });
    }

    // Check if expense exists
    const expenseDoc = await firestore.collection(EXPENSES_COLLECTION).doc(id).get();
    if (!expenseDoc.exists) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Update expense status to active
    await firestore.collection(EXPENSES_COLLECTION).doc(id).update({
      status: 'active',
      date_updated: now()
    });

    return res.status(200).json({
      message: 'Expense restored successfully'
    });

  } catch (error) {
    console.error('Error restoring expense:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET - Get expenses by branch
router.get('/getExpensesByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    let { pageSize = 10, page = 1, category = '' } = req.query;

    page = parseInt(page);
    pageSize = parseInt(pageSize);

    if (!branch_id) {
      return res.status(400).json({ error: 'Branch ID is required' });
    }

    // Check if branch exists
    const branchDoc = await firestore.collection('branches').doc(branch_id).get();
    if (!branchDoc.exists) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    let queryRef = firestore.collection(EXPENSES_COLLECTION)
      .where('branch_id', '==', branch_id)
      .where('status', '==', 'active');

    if (category) {
      queryRef = queryRef.where('category', '==', category);
    }

    queryRef = queryRef.orderBy('date_created', 'desc');

    // Get total count
    const countSnapshot = await queryRef.count().get();
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / pageSize);

    // Apply pagination
    if (page > 1) {
      const prevSnapshot = await queryRef.limit(pageSize * (page - 1)).get();
      const docs = prevSnapshot.docs;
      if (docs.length > 0) {
        const lastVisible = docs[docs.length - 1];
        queryRef = queryRef.startAfter(lastVisible);
      }
    }

    const snapshot = await queryRef.limit(pageSize).get();
    const expenses = snapshot.docs.map(doc => doc.data());

    return res.status(200).json({
      data: expenses,
      pagination: {
        current_page: page,
        total_pages: totalPages,
        total_count: totalCount,
        page_size: pageSize
      }
    });

  } catch (error) {
    console.error('Error fetching expenses by branch:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET - Get expense statistics
router.get('/getExpenseStats', async (req, res) => {
  try {
    const { branch_id = '', start_date = '', end_date = '' } = req.query;

    let queryRef = firestore.collection(EXPENSES_COLLECTION)
      .where('status', '==', 'active');

    // Apply filters
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }

    if (start_date) {
      const startDate = new Date(start_date);
      queryRef = queryRef.where('date_created', '>=', startDate.toISOString());
    }

    if (end_date) {
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      queryRef = queryRef.where('date_created', '<=', endDate.toISOString());
    }

    const snapshot = await queryRef.get();
    const expenses = snapshot.docs.map(doc => doc.data());

    // Calculate statistics
    const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const categoryStats = {};
    const branchStats = {};

    expenses.forEach(expense => {
      // Category statistics
      if (!categoryStats[expense.category]) {
        categoryStats[expense.category] = { count: 0, total: 0 };
      }
      categoryStats[expense.category].count++;
      categoryStats[expense.category].total += expense.amount;

      // Branch statistics
      if (!branchStats[expense.branch_id]) {
        branchStats[expense.branch_id] = { count: 0, total: 0 };
      }
      branchStats[expense.branch_id].count++;
      branchStats[expense.branch_id].total += expense.amount;
    });

    return res.status(200).json({
      data: {
        total_expenses: expenses.length,
        total_amount: totalAmount,
        average_amount: expenses.length > 0 ? totalAmount / expenses.length : 0,
        category_statistics: categoryStats,
        branch_statistics: branchStats
      }
    });

  } catch (error) {
    console.error('Error fetching expense statistics:', error);
    return res.status(500).json({ error: error.message });
  }
});

// DOWNLOAD - Download expenses as Excel file
router.get('/downloadExpensesExcel', async (req, res) => {
  try {
    let { 
      branch_id = '', 
      search = '',
      start_date = '',
      end_date = ''
    } = req.query;

    let queryRef = firestore.collection(EXPENSES_COLLECTION);

    // Apply filters
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }
    if (search) {
      queryRef = queryRef.where('name', '==', search);
    }
    if (start_date) {
      const startDate = new Date(start_date);
      queryRef = queryRef.where('date_created', '>=', startDate.toISOString());
    }
    if (end_date) {
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      queryRef = queryRef.where('date_created', '<=', endDate.toISOString());
    }

    // Get all expenses (no pagination for export)
    const snapshot = await queryRef.get();
    const expenses = [];

    for (const doc of snapshot.docs) {
      const expenseData = doc.data();
      
      // Get branch name if available
      try {
        const branchDoc = await firestore.collection('branches').doc(expenseData.branch_id).get();
        if (branchDoc.exists) {
          expenseData.branch_name = branchDoc.data().name || 'Unknown Branch';
        } else {
          expenseData.branch_name = 'Unknown Branch';
        }
      } catch (error) {
        expenseData.branch_name = 'Unknown Branch';
      }

      // Get category name if available
      try {
        const categoryDoc = await firestore.collection('categories').doc(expenseData.category).get();
        if (categoryDoc.exists) {
          expenseData.category_name = categoryDoc.data().name || 'Unknown Category';
        } else {
          expenseData.category_name = 'Unknown Category';
        }
      } catch (error) {
        expenseData.category_name = 'Unknown Category';
      }

      expenses.push(expenseData);
    }

    // Create Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expenses');

    // Define columns
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Branch Name', key: 'branch_name', width: 20 },
      { header: 'Category ID', key: 'category', width: 15 },
      { header: 'Category Name', key: 'category_name', width: 20 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Date Created', key: 'date_created', width: 20 },
      { header: 'Date Updated', key: 'date_updated', width: 20 }
    ];

    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    expenses.forEach(expense => {
      worksheet.addRow({
        id: expense.id,
        branch_name: expense.branch_name,
        category: expense.category,
        category_name: expense.category_name,
        name: expense.name,
        amount: expense.amount,
        status: expense.status,
        date_created: expense.date_created ? moment(expense.date_created).format('YYYY-MM-DD HH:mm:ss') : '',
        date_updated: expense.date_updated ? moment(expense.date_updated).format('YYYY-MM-DD HH:mm:ss') : ''
      });
    });

    // Format amount column as currency
    worksheet.getColumn('amount').numFmt = '#,##0.00';

    // Generate filename with timestamp
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `expenses_${timestamp}.xlsx`;

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send buffer as response
    res.send(buffer);

  } catch (error) {
    console.error('Error downloading expenses Excel:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
