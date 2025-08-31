const admin = require('./firebaseAdmin');

/**
 * Script to update isCalendarShared field to false for all documents in accounts collection
 * This script will:
 * 1. Get all documents from the accounts collection
 * 2. Update the isCalendarShared field to false for each document
 * 3. Provide progress updates and summary
 */

async function updateIsCalendarShared() {
  try {
    console.log('🚀 Starting update of isCalendarShared field in accounts collection...');
    
    const db = admin.firestore();
    const accountsRef = db.collection('accounts');
    
    // Get all documents from accounts collection
    console.log('📋 Fetching all documents from accounts collection...');
    const snapshot = await accountsRef.get();
    
    if (snapshot.empty) {
      console.log('ℹ️  No documents found in accounts collection');
      return;
    }
    
    console.log(`📊 Found ${snapshot.size} documents to update`);
    
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Process documents in batches to avoid overwhelming Firestore
    const batchSize = 500; // Firestore batch limit
    const documents = snapshot.docs;
    
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = documents.slice(i, i + batchSize);
      
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(documents.length / batchSize)} (${batchDocs.length} documents)`);
      
      for (const doc of batchDocs) {
        const data = doc.data();
        
        // Check if document already has isCalendarShared field set to false
        if (data.isCalendarShared === false) {
          skippedCount++;
          continue;
        }
        
        // Update the isCalendarShared field to false
        batch.update(doc.ref, { isCalendarShared: false });
        successCount++;
      }
      
      // Commit the batch
      try {
        await batch.commit();
        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} committed successfully`);
      } catch (batchError) {
        console.error(`❌ Error committing batch ${Math.floor(i / batchSize) + 1}:`, batchError);
        errorCount += batchDocs.length;
        successCount -= batchDocs.length;
      }
      
      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Print summary
    console.log('\n📈 UPDATE SUMMARY:');
    console.log('==================');
    console.log(`✅ Successfully updated: ${successCount} documents`);
    console.log(`⏭️  Skipped (already false): ${skippedCount} documents`);
    console.log(`❌ Errors: ${errorCount} documents`);
    console.log(`📊 Total documents processed: ${documents.length}`);
    
    if (errorCount === 0) {
      console.log('\n🎉 All updates completed successfully!');
    } else {
      console.log('\n⚠️  Some updates failed. Check the error logs above.');
    }
    
  } catch (error) {
    console.error('💥 Fatal error during update:', error);
    process.exit(1);
  }
}

/**
 * Alternative function to update specific documents by ID
 * Useful if you want to update only certain accounts
 */
async function updateSpecificAccounts(accountIds) {
  try {
    console.log('🎯 Updating specific accounts by ID...');
    
    const db = admin.firestore();
    const batch = db.batch();
    
    for (const accountId of accountIds) {
      const accountRef = db.collection('accounts').doc(accountId);
      batch.update(accountRef, { isCalendarShared: false });
    }
    
    await batch.commit();
    console.log(`✅ Successfully updated ${accountIds.length} specific accounts`);
    
  } catch (error) {
    console.error('❌ Error updating specific accounts:', error);
    throw error;
  }
}

/**
 * Function to verify the update was successful
 */
async function verifyUpdate() {
  try {
    console.log('🔍 Verifying update results...');
    
    const db = admin.firestore();
    const accountsRef = db.collection('accounts');
    
    // Count documents with isCalendarShared = false
    const falseSnapshot = await accountsRef.where('isCalendarShared', '==', false).get();
    
    // Count documents with isCalendarShared = true
    const trueSnapshot = await accountsRef.where('isCalendarShared', '==', true).get();
    
    // Count documents without isCalendarShared field
    const allSnapshot = await accountsRef.get();
    let noFieldCount = 0;
    
    allSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!('isCalendarShared' in data)) {
        noFieldCount++;
      }
    });
    
    console.log('\n🔍 VERIFICATION RESULTS:');
    console.log('========================');
    console.log(`📊 Total documents: ${allSnapshot.size}`);
    console.log(`✅ isCalendarShared = false: ${falseSnapshot.size}`);
    console.log(`❌ isCalendarShared = true: ${trueSnapshot.size}`);
    console.log(`❓ No isCalendarShared field: ${noFieldCount}`);
    
  } catch (error) {
    console.error('❌ Error during verification:', error);
  }
}

// Main execution
async function main() {
  try {
    // Update all accounts
    await updateIsCalendarShared();
    
    // Verify the update
    await verifyUpdate();
    
    console.log('\n🏁 Script execution completed!');
    
  } catch (error) {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
  } finally {
    // Close the Firebase app
    try {
      await admin.app().delete();
      console.log('🔒 Firebase connection closed');
    } catch (error) {
      console.log('ℹ️  Firebase connection already closed');
    }
    
    process.exit(0);
  }
}

// Export functions for potential reuse
module.exports = {
  updateIsCalendarShared,
  updateSpecificAccounts,
  verifyUpdate
};

// Run the script if this file is executed directly
if (require.main === module) {
  main();
}
