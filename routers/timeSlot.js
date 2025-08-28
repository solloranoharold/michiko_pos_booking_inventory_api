const express = require('express');
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const firestore = admin.firestore();
const TIME_BOOKING_COLLECTION = 'time_booking';

// Helper to get current date string
function now() {
  return new Date().toISOString();
}

// Validate time format (HH:MM AM/PM)
function isValidTimeFormat(time) {
  const timeRegex = /^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM|am|pm)$/;
  return timeRegex.test(time);
}

// Validate time slot object structure
function isValidTimeSlotObject(timeSlot) {
  return (
    timeSlot &&
    typeof timeSlot === 'object' &&
    typeof timeSlot.time === 'string' &&
    isValidTimeFormat(timeSlot.time) &&
    typeof timeSlot.slot === 'number' &&
    timeSlot.slot > 0 &&
    Number.isInteger(timeSlot.slot)
  );
}

router.get('/', (req, res) => {
  res.send('Time Slot API is running');
});

// CREATE a new time slot
router.post('/insertTimeSlot', async (req, res) => {
  try {
    const { branch_id, list_of_time } = req.body;
    
    // Validate required fields
    if (!branch_id || !list_of_time || !Array.isArray(list_of_time)) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: branch_id and list_of_time (array)' 
      });
    }

    // Validate list_of_time is not empty
    if (list_of_time.length === 0) {
      return res.status(400).json({ 
        error: 'list_of_time cannot be empty' 
      });
    }

    // Validate each time slot object in the array
    for (const timeSlot of list_of_time) {
      timeSlot.slot = parseInt(timeSlot.slot);
      if (!isValidTimeSlotObject(timeSlot)) {
        return res.status(400).json({ 
          error: `Invalid time slot format: ${JSON.stringify(timeSlot)}. Expected format: { time: "HH:MM AM/PM", slot: number } (e.g., { time: "12:00 AM", slot: 8 })` 
        });
      }
    }

    // Check if branch exists
    const branchRef = firestore.collection('branches').doc(branch_id);
    const branchSnap = await branchRef.get();
    if (!branchSnap.exists) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    // Check if time slot for this branch already exists
    const existingTimeSlot = await firestore.collection(TIME_BOOKING_COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();

    if (!existingTimeSlot.empty) {
      return res.status(409).json({ 
        error: 'Time slot for this branch already exists. Use update endpoint to modify.' 
      });
    }

    // Generate unique ID
    const timeSlotId = uuidv4();
    const dateCreated = now();
    
    // Remove duplicates based on time
    const uniqueTimeSlots = [];
    const seenTimes = new Set();
    
    for (const timeSlot of list_of_time) {
      if (!seenTimes.has(timeSlot.time)) {
        seenTimes.add(timeSlot.time);
        uniqueTimeSlots.push(timeSlot);
      }
    }
    
    const timeSlotData = {
      id: timeSlotId,
      branch_id,
      list_of_time: uniqueTimeSlots,
      date_created: dateCreated,
      date_updated: dateCreated,
      doc_type: 'TIME_BOOKING'
    };

    await firestore.collection(TIME_BOOKING_COLLECTION).doc(timeSlotId).set(timeSlotData);
    res.status(201).json(timeSlotData);
  } catch (error) {
    console.error('Error creating time slot:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all time slots with filtering
router.get('/getAllTimeSlots', async (req, res) => {
  try {
    let { branch_id = '' } = req.query;
    
    let queryRef = firestore.collection(TIME_BOOKING_COLLECTION);

    // Filter by branch_id if provided
    if (branch_id) {
      queryRef = queryRef.where('branch_id', '==', branch_id);
    }

    // Order by date_created
    queryRef = queryRef.orderBy('date_created', 'desc');

    const snapshot = await queryRef.get();
    const timeSlots = snapshot.docs.map(doc => doc.data());

    res.status(200).json({ 
      data: timeSlots
    });
  } catch (error) {
    console.error('Error fetching time slots:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET time slot by ID
router.get('/getTimeSlotById/:id', async (req, res) => {
  try {
    const timeSlotRef = firestore.collection(TIME_BOOKING_COLLECTION).doc(req.params.id);
    const timeSlotSnap = await timeSlotRef.get();
    
    if (!timeSlotSnap.exists) {
      return res.status(404).json({ error: 'Time slot not found' });
    }
    
    res.status(200).json(timeSlotSnap.data());
  } catch (error) {
    console.error('Error fetching time slot:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET time slot by branch ID
router.get('/getTimeSlotByBranch/:branch_id', async (req, res) => {
  try {
    const { branch_id } = req.params;
    
    const snapshot = await firestore.collection(TIME_BOOKING_COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'No time slots found for this branch' });
    }
    
    const timeSlot = snapshot.docs[0].data(); // Should only be one per branch
    res.status(200).json(timeSlot);
  } catch (error) {
    console.error('Error fetching time slot by branch:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE time slot by ID
router.put('/updateTimeSlot/:id', async (req, res) => {
  try {
    const timeSlotRef = firestore.collection(TIME_BOOKING_COLLECTION).doc(req.params.id);
    const timeSlotSnap = await timeSlotRef.get();
    
    if (!timeSlotSnap.exists) {
      return res.status(404).json({ error: 'Time slot not found' });
    }

    const { list_of_time } = req.body;
    
    // Validate list_of_time if provided
    if (list_of_time !== undefined) {
      if (!Array.isArray(list_of_time)) {
        return res.status(400).json({ 
          error: 'list_of_time must be an array' 
        });
      }

      if (list_of_time.length === 0) {
        return res.status(400).json({ 
          error: 'list_of_time cannot be empty' 
        });
      }

      // Validate each time slot object in the array
      for (const timeSlot of list_of_time) {
        timeSlot.slot = parseInt(timeSlot.slot);
        if (!isValidTimeSlotObject(timeSlot)) {
          return res.status(400).json({ 
            error: `Invalid time slot format: ${JSON.stringify(timeSlot)}. Expected format: { time: "HH:MM AM/PM", slot: number } (e.g., { time: "12:00 AM", slot: 8 })` 
          });
        }
      }
    }

    const prevData = timeSlotSnap.data();
    let updatedListOfTime = prevData.list_of_time;
    
    if (list_of_time) {
      // Remove duplicates based on time
      const uniqueTimeSlots = [];
      const seenTimes = new Set();
      
      for (const timeSlot of list_of_time) {
        if (!seenTimes.has(timeSlot.time)) {
          seenTimes.add(timeSlot.time);
          uniqueTimeSlots.push(timeSlot);
        }
      }
      
      updatedListOfTime = uniqueTimeSlots;
    }
    
    const updateData = {
      list_of_time: updatedListOfTime,
      date_updated: now()
    };

    await timeSlotRef.update(updateData);
    
    const updatedData = { ...prevData, ...updateData };
    res.status(200).json(updatedData);
  } catch (error) {
    console.error('Error updating time slot:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE time slot by ID
router.delete('/deleteTimeSlot/:id', async (req, res) => {
  try {
    const timeSlotRef = firestore.collection(TIME_BOOKING_COLLECTION).doc(req.params.id);
    const timeSlotSnap = await timeSlotRef.get();
    
    if (!timeSlotSnap.exists) {
      return res.status(404).json({ error: 'Time slot not found' });
    }
    
    await timeSlotRef.delete();
    res.status(200).json({ message: 'Time slot deleted successfully' });
  } catch (error) {
    console.error('Error deleting time slot:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET available time slots by branch and date (excluding booked times)
router.get('/getAvailableTimeSlots', async (req, res) => {
  try {
    const { branch_id, date } = req.query;
    
    // Validate required fields
    if (!branch_id || !date) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: branch_id and date' 
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Expected format: YYYY-MM-DD (e.g., "2024-01-15")' 
      });
    }

    // Get time slots for the branch
    const timeSlotSnapshot = await firestore.collection(TIME_BOOKING_COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();

    if (timeSlotSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No time slots found for this branch' 
      });
    }

    const timeSlotData = timeSlotSnapshot.docs[0].data();
    const allTimeSlots = timeSlotData.list_of_time;

    // Get booked time slots for the specific branch and date with status 'scheduled'
    const bookedSnapshot = await firestore.collection('bookings')
      .where('branch_id', '==', branch_id)
      .where('date', '==', date)
      .where('status', '==', 'scheduled')
      .get();

    // Count booked seats for each time slot
    const bookedSeatsByTime = {};
    bookedSnapshot.forEach(doc => {
      const bookingData = doc.data();
      if (bookingData.time) {
        if (!bookedSeatsByTime[bookingData.time]) {
          bookedSeatsByTime[bookingData.time] = 0;
        }
        // Assuming each booking takes 1 seat, adjust if different
        bookedSeatsByTime[bookingData.time] += 1;
      }
    });

    // Filter and calculate available slots for each time slot
    const availableTimeSlots = allTimeSlots.map(timeSlot => {
      const bookedSeats = bookedSeatsByTime[timeSlot.time] || 0;
      const totalSlots = timeSlot.slot || 0;
      const availableSlots = Math.max(0, totalSlots - bookedSeats);
      
      return {
        time: timeSlot.time,
        slot: totalSlots, // Total capacity for this time slot
        available_slots: availableSlots, // Available slots after subtracting booked
        booked_slots: bookedSeats, // Number of slots already booked
        is_available: availableSlots > 0 // Boolean flag for easy checking
      };
    }).filter(timeSlot => timeSlot.available_slots > 0); // Only show time slots with available seats

    // Return in the requested format
    const result = [{
      branch_id: branch_id,
      list_of_time: availableTimeSlots
    }];

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching available time slots:', error);
    res.status(500).json({ error: error.message });
  }
});
router.get('/getAvailableTimeSlotsClients', async (req, res) => {
  try {
    const { branch_id, date } = req.query;
    
    // Validate required fields
    if (!branch_id || !date) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: branch_id and date' 
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ 
        error: 'Invalid date format. Expected format: YYYY-MM-DD (e.g., "2024-01-15")' 
      });
    }

    // Get time slots for the branch
    const timeSlotSnapshot = await firestore.collection(TIME_BOOKING_COLLECTION)
      .where('branch_id', '==', branch_id)
      .get();

    if (timeSlotSnapshot.empty) {
      return res.status(404).json({ 
        error: 'No time slots found for this branch' 
      });
    }

    const timeSlotData = timeSlotSnapshot.docs[0].data();
    const allTimeSlots = timeSlotData.list_of_time;

    // Get booked time slots for the specific branch and date with status 'scheduled'
    const bookedSnapshot = await firestore.collection('bookings')
      .where('branch_id', '==', branch_id)
      .where('date', '==', date)
      .where('status', '==', 'scheduled')
      .get();

    // Count booked seats for each time slot
    const bookedSeatsByTime = {};
    bookedSnapshot.forEach(doc => {
      const bookingData = doc.data();
      if (bookingData.time) {
        if (!bookedSeatsByTime[bookingData.time]) {
          bookedSeatsByTime[bookingData.time] = 0;
        }
        // Assuming each booking takes 1 seat, adjust if different
        bookedSeatsByTime[bookingData.time] += 1;
      }
    });

    // Filter and calculate available slots for each time slot
    const availableTimeSlots = allTimeSlots.map(timeSlot => {
      const bookedSeats = bookedSeatsByTime[timeSlot.time] || 0;
      const totalSlots = timeSlot.slot || 0;
      const availableSlots = Math.max(0, totalSlots - bookedSeats);
      
      return {
        time: timeSlot.time,
        slot: totalSlots, // Total capacity for this time slot
        available_slots: availableSlots, // Available slots after subtracting booked
        booked_slots: bookedSeats, // Number of slots already booked
        is_available: availableSlots > 0 // Boolean flag for easy checking
      };
    }).filter(timeSlot => timeSlot.available_slots > 0); // Only show time slots with available seats

    // Return in the requested format
    const result = [{
      branch_id: branch_id,
      list_of_time: availableTimeSlots
    }];

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching available time slots:', error);
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
