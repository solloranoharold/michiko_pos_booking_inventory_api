const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

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
      doc_type: 'EXPENSE'
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

// DELETE - Delete expense
router.delete('/deleteExpense/:id', async (req, res) => {
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

    await firestore.collection(EXPENSES_COLLECTION).doc(id).delete();

    return res.status(200).json({
      message: 'Expense deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting expense:', error);
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
      .where('branch_id', '==', branch_id);

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

    let queryRef = firestore.collection(EXPENSES_COLLECTION);

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

module.exports = router;
