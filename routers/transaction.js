const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

// Import services
const transactionService = require('../services/transaction-service');
const commissionService = require('../services/commission-service');
const inventoryService = require('../services/inventory-service');
const availableItemsService = require('../services/available-items-service');

const router = express.Router();
const firestore = admin.firestore();

// Collections
const TRANSACTIONS_COLLECTION = 'transactions';
const INVENTORY_COLLECTION = 'inventory';
const COMMISSIONS_COLLECTION = 'commissions';
const DASHBOARD_COLLECTION = 'dashboard';
const USED_UNIT_VALUES_COLLECTION = 'used_unit_values';
const USED_QUANTITIES_COLLECTION = 'used_quantities';

// ==================== TRANSACTION RECORDS ====================

// Create transaction
router.post('/createTransaction', transactionService.createTransaction);

// Void transaction
router.put('/voidTransaction/:id', transactionService.voidTransaction);

// Get all transactions
router.get('/getAllTransactions', transactionService.getAllTransactions);

// Get transaction statistics (excluding voided transactions)
router.get('/transactionStats/:branchId', transactionService.getTransactionStats);

// Get voided transactions
router.put('/voidedTransactions/:branchId', transactionService.getVoidedTransactions);

// ==================== COMMISSIONS ROUTES ====================

// Get all commissions with filtering
router.get('/getAllCommissions', commissionService.getAllCommissions);

// Update commission status to paid
router.put('/updateCommissionStatusToPaid/:id', commissionService.updateCommissionStatusToPaid);

// Get commission statistics
router.get('/commissions/stats', commissionService.getCommissionStats);

// ==================== INVENTORY AND USED QUANTITIES ROUTES ====================

// Get used quantities for a specific branch
router.get('/used-quantities/:branchId', inventoryService.getUsedQuantities);

// Get used quantities summary for a specific branch
router.get('/used-quantities-summary/:branchId', inventoryService.getUsedQuantitiesSummary);

// Get used quantities for a specific item
router.get('/used-quantities-item/:itemId', inventoryService.getUsedQuantitiesForItem);

// Get used quantities for Excel export (aggregated by item_id and date_created)
router.get('/used-quantities-export/:branchId', inventoryService.getUsedQuantitiesForExport);

// Get inventory for Excel export
router.get('/inventory/export/:branchId', inventoryService.getInventoryForExport);

// ==================== AVAILABLE ITEMS ROUTES ====================

// Get available services for transactions
router.get('/available-services/:branchId', availableItemsService.getAvailableServices);

// Get available services products for transactions
router.get('/available-services-products/:branchId', availableItemsService.getAvailableServicesProducts);

// Get available OTC products for transactions
router.get('/available-otc-products/:branchId', availableItemsService.getAvailableOtcProducts);

// Get all available items for transactions (combined)
router.get('/available-items/:branchId', availableItemsService.getAllAvailableItems);

// Get services data based on branch and service IDs
router.get('/clientSelectedServices/:branchId', availableItemsService.getClientSelectedServices);

// Get specific services by IDs within a branch
router.post('/services-by-ids/:branchId', availableItemsService.getServicesByIds);

// Get item details by ID and type
router.get('/item-details/:itemId', availableItemsService.getItemDetails);

// Get item name by ID and type
router.get('/item-name/:itemId', availableItemsService.getItemName);

module.exports = router;
