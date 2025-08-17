
const admin = require('../firebaseAdmin');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const moment = require('moment');

const router = express.Router();
const firestore = admin.firestore();
const BOOKINGS_COLLECTION = 'bookings';

// CREATE - Create a new booking
router.post('/createBooking', async (req, res) => { 
    try {
        const { client_id, branch_id, date, time, service_ids = [], status = 'scheduled' } = req.body;
        
        // Validate required fields
        if (!client_id || !branch_id || !date || !time) {
            return res.status(400).json({ 
                error: 'Missing required fields: client_id, branch_id, date, time are required' 
            });
        }

        const booking_id = uuidv4();
        const created_at = admin.firestore.FieldValue.serverTimestamp();
        const updated_at = admin.firestore.FieldValue.serverTimestamp();

        const bookingData = {
            booking_id,
            client_id,
            branch_id,
            date,
            time,
            service_ids,
            status,
            created_at,
            updated_at
        };

        await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).set(bookingData);

        res.status(201).json({ 
            message: 'Booking created successfully', 
            booking_id,
            booking: bookingData 
        });

    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

// READ - Get all bookings
router.get('/getBookings', async (req, res) => {
    try {
        const { limit = 50, offset = 0, status, client_id, branch_id, date } = req.query;
        
        let query = firestore.collection(BOOKINGS_COLLECTION);
        
        // Apply filters if provided
        if (status) {
            query = query.where('status', '==', status);
        }
        if (client_id) {
            query = query.where('client_id', '==', client_id);
        }
        if (branch_id) {
            query = query.where('branch_id', '==', branch_id);
        }
        if (date) {
            query = query.where('date', '==', date);
        }

        // Apply pagination
        query = query.orderBy('created_at', 'desc')
                    .limit(parseInt(limit))
                    .offset(parseInt(offset));

        const snapshot = await query.get();
        const bookings = [];

        snapshot.forEach(doc => {
            bookings.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({ 
            bookings,
            count: bookings.length,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// READ - Get booking by ID
router.get('/getBooking/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;

        const doc = await firestore.collection(BOOKINGS_COLLECTION).doc(booking_id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.status(200).json({ 
            booking: {
                id: doc.id,
                ...doc.data()
            }
        });

    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ error: 'Failed to fetch booking' });
    }
});

// UPDATE - Update a booking
router.put('/updateBooking/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;
        const { client_id, branch_id, date, time, service_ids, status } = req.body;

        // Check if booking exists
        const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(booking_id);
        const doc = await bookingRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Prepare update data (only include fields that are provided)
        const updateData = {
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        };

        if (client_id !== undefined) updateData.client_id = client_id;
        if (branch_id !== undefined) updateData.branch_id = branch_id;
        if (date !== undefined) updateData.date = date;
        if (time !== undefined) updateData.time = time;
        if (service_ids !== undefined) updateData.service_ids = service_ids;
        if (status !== undefined) updateData.status = status;

        await bookingRef.update(updateData);

        // Get updated booking
        const updatedDoc = await bookingRef.get();

        res.status(200).json({ 
            message: 'Booking updated successfully',
            booking: {
                id: updatedDoc.id,
                ...updatedDoc.data()
            }
        });

    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ error: 'Failed to update booking' });
    }
});

// DELETE - Delete a booking
router.delete('/deleteBooking/:booking_id', async (req, res) => {
    try {
        const { booking_id } = req.params;

        // Check if booking exists
        const bookingRef = firestore.collection(BOOKINGS_COLLECTION).doc(booking_id);
        const doc = await bookingRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        await bookingRef.delete();

        res.status(200).json({ 
            message: 'Booking deleted successfully',
            booking_id 
        });

    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

// ADDITIONAL - Get bookings by date range
router.get('/getBookingsByDateRange', async (req, res) => {
    try {
        const { start_date, end_date, branch_id, status } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ 
                error: 'start_date and end_date are required' 
            });
        }

        let query = firestore.collection(BOOKINGS_COLLECTION)
                            .where('date', '>=', start_date)
                            .where('date', '<=', end_date);

        if (branch_id) {
            query = query.where('branch_id', '==', branch_id);
        }
        if (status) {
            query = query.where('status', '==', status);
        }

        query = query.orderBy('date').orderBy('time');

        const snapshot = await query.get();
        const bookings = [];

        snapshot.forEach(doc => {
            bookings.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.status(200).json({ 
            bookings,
            count: bookings.length,
            date_range: { start_date, end_date }
        });

    } catch (error) {
        console.error('Error fetching bookings by date range:', error);
        res.status(500).json({ error: 'Failed to fetch bookings by date range' });
    }
});

module.exports = router; 