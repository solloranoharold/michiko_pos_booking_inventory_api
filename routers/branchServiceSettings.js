const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const moment = require('moment');

const router = express.Router();
const firestore = admin.firestore();
const BRANCHES_SERVICE_SETTINGS_COLLECTION = 'branch_service_settings';

function now() {
    return new Date().toISOString();
  }

router.post('/insertBranchServiceSettings', async (req, res) => {
    try {
        const { branch_id, service_ids=[], show_price=true } = req.body;
        if (!branch_id || !service_ids.length) {
            return res.status(400).json({ error: 'Missing required fields' });
          }
          // Check if a branch with the same email already exists
          const snapshot = await firestore.collection(BRANCHES_SERVICE_SETTINGS_COLLECTION).where('branch_id', '==', branch_id).get();
          if (!snapshot.empty) {
            return res.status(409).json({ error: 'Branch service settings already exists' });
          }
          const id = uuidv4();
          const date_created = now();

          const branchServiceSettingsData = {
            id,
            branch_id,
            service_ids,
            show_price,
            date_created
          };
          await firestore.collection(BRANCHES_SERVICE_SETTINGS_COLLECTION).doc(id).set(branchServiceSettingsData);
          res.status(201).json({ message: 'Branch service settings inserted successfully' });
    } catch (error) {
        console.error('Error inserting branch service settings:', error);
        res.status(500).json({ error: 'Failed to insert branch service settings' });
    }
});
router.get('/getBranchServiceSettings/:branch_id', async (req, res) => {
    try {
        const { branch_id } = req.params;
        const snapshot = await firestore.collection(BRANCHES_SERVICE_SETTINGS_COLLECTION).where('branch_id', '==', branch_id).get();
        if (snapshot.empty) {
            return res.status(200).json({ data:[] });
        }
        console.log(snapshot.docs.map(doc => doc.data()))
        res.status(200).json({data:snapshot.docs.map(doc => doc.data())});
    } catch (error) {
        console.error('Error getting branch service settings:', error);
        res.status(500).json({ error: 'Failed to get branch service settings' });
    }
});

router.put('/updateBranchServiceSettings', async (req, res) => {
    try {
        const { id, branch_id, service_ids=[], show_price } = req.body;
        const snapshot = await firestore.collection(BRANCHES_SERVICE_SETTINGS_COLLECTION).doc(id).get();
        if (!snapshot.exists) {
            return res.status(404).json({ error: 'Branch service settings not found' });
        }
        const branchServiceSettingsData = snapshot.data();
        branchServiceSettingsData.id = snapshot.id;
        branchServiceSettingsData.branch_id = branch_id;
        branchServiceSettingsData.service_ids = service_ids;
        if (show_price !== undefined) {
            branchServiceSettingsData.show_price = show_price;
        }
        branchServiceSettingsData.updated_at = now();
        await firestore.collection(BRANCHES_SERVICE_SETTINGS_COLLECTION).doc(id).set(branchServiceSettingsData);
        res.status(200).json({ message: 'Branch service settings updated successfully' });
    } catch (error) {
        console.error('Error updating branch service settings:', error);
        res.status(500).json({ error: 'Failed to update branch service settings' });
    }
});
module.exports = router;