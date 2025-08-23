# Google Calendar Color System for Booking Statuses

This document explains how the booking system uses Google Calendar colors to visually distinguish different booking statuses and types.

## Overview

The system automatically assigns **full background colors** to Google Calendar events based on the booking status. This provides visual cues that make it easy to quickly identify the type and status of appointments at a glance. Unlike the default Google Calendar color dots, this system colors the entire event background for maximum visibility.

## Background Color Mapping

The system uses custom hex colors to provide full background coloring for calendar events. Here's how our system maps booking statuses to background colors:

### Primary Booking Statuses

| Status | Background Color | Color Name | Description | Use Case |
|--------|------------------|------------|-------------|----------|
| `scheduled` | #E3F2FD | Light Blue | Default for new bookings | New appointments that haven't been confirmed yet |
| `confirmed` | #E8F5E8 | Light Green | Confirmed appointments | Bookings that are confirmed and ready |
| `pending` | #FFF3E0 | Light Orange | Awaiting confirmation | Bookings waiting for staff confirmation |
| `cancelled` | #FFEBEE | Light Red | Cancelled appointments | Cancelled or voided bookings |
| `completed` | #F3E5F5 | Light Purple | Completed services | Finished appointments |
| `no-show` | #FAFAFA | Light Gray | Client didn't show up | Missed appointments |
| `rescheduled` | #E1F5FE | Light Cyan | Rescheduled appointments | Changed appointment times |

### Additional Statuses

| Status | Background Color | Color Name | Description | Use Case |
|--------|------------------|------------|-------------|----------|
| `in-progress` | #E0F2F1 | Light Teal | Service in progress | Currently happening appointments |
| `waiting` | #FCE4EC | Light Pink | Client waiting | Client arrived but waiting for service |
| `late` | #FFE0B2 | Light Red-Orange | Late arrival | Client arrived late |
| `early` | #E1F5FE | Light Blue | Early arrival | Client arrived early |
| `urgent` | #FFCDD2 | Light Red | Urgent/emergency | Priority appointments |
| `vip` | #F3E5F5 | Light Purple | VIP client | Special client appointments |
| `walk-in` | #FCE4EC | Light Pink | Walk-in appointments | Same-day bookings |
| `online` | #FFF3E0 | Light Orange | Online bookings | Bookings made through website/app |
| `phone` | #FFF3E0 | Light Yellow | Phone bookings | Bookings made over phone |

### Payment-Related Statuses

| Status | Background Color | Color Name | Description | Use Case |
|--------|------------------|------------|-------------|----------|
| `paid` | #E8F5E8 | Light Green | Payment completed | Fully paid appointments |
| `unpaid` | #FFF3E0 | Light Yellow | Payment pending | Unpaid appointments |
| `partial` | #FFF3E0 | Light Orange | Partial payment | Partially paid appointments |
| `refunded` | #FAFAFA | Light Gray | Refunded | Refunded appointments |

### Special Statuses

| Status | Background Color | Color Name | Description | Use Case |
|--------|------------------|------------|-------------|----------|
| `maintenance` | #FAFAFA | Light Gray | System maintenance | Calendar maintenance events |
| `holiday` | #E1F5FE | Light Blue | Holiday/closed | Business closure days |
| `training` | #E0F2F1 | Light Teal | Staff training | Staff development sessions |
| `meeting` | #E3F2FD | Light Blue | Staff meetings | Internal staff meetings |
| `break` | #FFE0B2 | Light Red-Orange | Break time | Staff break periods |

## Implementation Details

### Functions

The system provides several helper functions for managing calendar colors:

#### `getCalendarColorId(status)`
- **Purpose**: Maps booking status to Google Calendar color ID (for fallback compatibility)
- **Input**: Status string (case-insensitive)
- **Output**: Color ID string (1-11)
- **Default**: Returns '7' (Blue) for unknown statuses

#### `getCalendarColorName(colorId)`
- **Purpose**: Gets human-readable color name from color ID
- **Input**: Color ID string
- **Output**: Color name string
- **Use**: For logging and debugging

#### `getCustomBackgroundColor(status)`
- **Purpose**: Maps booking status to custom hex background color
- **Input**: Status string (case-insensitive)
- **Output**: Hex color string (e.g., '#E3F2FD')
- **Default**: Returns '#E3F2FD' (Light Blue) for unknown statuses

#### `getEnhancedCalendarEvent(eventData, status)`
- **Purpose**: Applies full background color coding and status information to calendar events
- **Input**: Base event data and status
- **Output**: Enhanced event with custom background color and status description
- **Features**: Automatically adds status, color information, and full background coloring to event description

### Usage Examples

#### Creating a New Booking
```javascript
const baseEvent = {
    summary: "Client Name - Service",
    description: "Appointment details...",
    start: { dateTime: "2024-01-15T10:00:00+08:00", timeZone: "Asia/Manila" },
    end: { dateTime: "2024-01-15T11:00:00+08:00", timeZone: "Asia/Manila" }
};

// Apply full background color coding based on status
const event = getEnhancedCalendarEvent(baseEvent, 'confirmed');
// Result: event.color = '#E8F5E8' (Light Green background)
```

#### Updating Booking Status
```javascript
// When status changes from 'scheduled' to 'completed'
const updatedEvent = getEnhancedCalendarEvent(baseEvent, 'completed');
// Result: updatedEvent.color = '#F3E5F5' (Light Purple background)
```

## Color Customization

### Adding New Statuses

To add a new status with a custom background color:

1. **Add to custom background colors** in `getCustomBackgroundColor()`:
```javascript
const customColors = {
    // ... existing mappings ...
    'new-status': '#FCE4EC',    // Light Pink background
};
```

2. **Add to color ID mapping** in `getCalendarColorId()` (for fallback):
```javascript
const colorMapping = {
    // ... existing mappings ...
    'new-status': '4',    // Pink dot
};
```

3. **Add to color names** in `getCalendarColorName()`:
```javascript
const colorNames = {
    // ... existing names ...
    '4': 'Pink',
};
```

### Custom Color IDs

Google Calendar supports custom colors beyond the default 11. To use custom colors:

1. **Create custom color** in Google Calendar settings
2. **Get the custom color ID** from the calendar
3. **Map your status** to the custom color ID

## Best Practices

### Background Color Selection Guidelines

1. **Consistency**: Use the same background color for similar statuses across the system
2. **Accessibility**: Ensure sufficient contrast between text and background colors
3. **Intuition**: Use intuitive colors (e.g., light red for cancelled, light green for confirmed)
4. **Visibility**: Use light, pastel colors that don't interfere with text readability
5. **Professional**: Choose colors that maintain a professional appearance

### Status Naming

1. **Lowercase**: All statuses are normalized to lowercase
2. **Hyphenated**: Use hyphens for multi-word statuses (e.g., 'in-progress')
3. **Descriptive**: Use clear, descriptive status names
4. **Consistent**: Maintain consistent naming conventions

### Error Handling

1. **Unknown Statuses**: Default to blue (ID: 7) for unknown statuses
2. **Invalid Input**: Handle null/undefined status gracefully
3. **Logging**: Log color assignments for debugging purposes

## Testing

### Test Different Statuses

Test the color system with various status values:

```bash
# Test endpoint
GET /api/bookings/test-calendar-setup?branch_name=Test Branch

# Create test bookings with different statuses
POST /api/bookings/createBookingperBranch
{
  "status": "confirmed",
  "client_id": "test-client",
  "branch_id": "test-branch",
  "date": "2024-01-15",
  "time": "10:00:00"
}
```

### Verify Calendar Colors

1. **Check Google Calendar**: Verify events appear with correct colors
2. **Status Changes**: Update booking status and verify color changes
3. **Multiple Statuses**: Create bookings with different statuses to see color variety

## Troubleshooting

### Common Issues

1. **Background Colors Not Appearing**: Check if Google Calendar API is properly configured
2. **Wrong Background Colors**: Verify status values match the custom color mapping
3. **Color Format Errors**: Ensure hex colors are in valid format (#RRGGBB)
4. **Fallback Behavior**: System falls back to colorId dots if custom colors fail

### Debug Information

The system logs color assignments and provides color information in event descriptions:

```
📅 Status: CONFIRMED
🎨 Color: Green (ID: 10)
🌈 Background: #E8F5E8
```

### Fallback Behavior

- **Unknown Status**: Defaults to light blue background (#E3F2FD) and blue dot (ID: 7)
- **Invalid Status**: Normalizes to lowercase and trims whitespace
- **Missing Status**: Uses 'scheduled' as default
- **Color Fallback**: If custom background colors fail, falls back to Google Calendar colorId dots

## Future Enhancements

### Potential Improvements

1. **Custom Color Palette**: Support for custom background color schemes
2. **Branch-Specific Colors**: Different background color schemes per branch
3. **Seasonal Colors**: Dynamic background colors based on seasons or holidays
4. **Color Themes**: Multiple background color themes for different user preferences
5. **Accessibility Modes**: High-contrast background color schemes for accessibility
6. **Gradient Backgrounds**: Support for gradient background colors
7. **Dark Mode**: Dark theme background color variants

### Integration Opportunities

1. **Mobile App**: Consistent background color coding across platforms
2. **Dashboard**: Background color-coded status indicators in admin dashboard
3. **Reports**: Background color-coded status breakdowns in reports
4. **Notifications**: Background color-coded email/SMS notifications
5. **Print Materials**: Background color-coded printed schedules
6. **External Calendars**: Background color synchronization with external calendar systems

## Conclusion

The calendar background color system provides an intuitive and visually appealing way to manage booking statuses. By using full background colors instead of small colored dots, users can quickly identify and manage appointments based on their status and type. The system maintains fallback compatibility with Google Calendar's default color system while providing enhanced visual distinction through custom background colors.

For questions or customization requests, refer to the main API documentation or contact the development team. 