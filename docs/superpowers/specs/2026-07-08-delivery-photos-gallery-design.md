# Delivery Photo Gallery & Download — Design Spec

**Date:** 2026-07-08  
**Status:** Approved

## Overview

Add a "Fotos" tab to the Reports page (`/app/reports`, owner/supervisor only) that shows a photo gallery of all delivery evidence photos for the selected date range, with a per-customer filter and a ZIP download button.

## Requirements

- **Location:** New tab in `/app/reports` reusing its existing date-range filters
- **Photos included:** Delivered visits only (`status = 'delivered'`, `photo_url IS NOT NULL`)
- **Views:** Single gallery grouped by date, with a client-side customer filter
- **Gallery:** Thumbnail grid (4 cols desktop, 2 mobile), click to open lightbox
- **Download:** "Descargar ZIP" — client-side with `jszip`, filenames `{YYYY-MM-DD}_{Nombre-Cliente}.jpg`
- **Access:** Reuses existing `getPhotoViewUrls` (driver.functions.ts) for signed URLs

## Architecture

### New server function: `getDeliveryPhotos` (admin.functions.ts)

Input: `{ branch_id?, date_from, date_to, customer_id? }`  
Query: `deliveries` WHERE `photo_url IS NOT NULL` AND `status = 'delivered'`, date range filter, optional customer filter.  
Join: `customers(name)`.  
Returns: `{ delivery_id, delivery_date, customer_id, customer_name, photo_url }[]` (max 500)

### New component: `src/components/reports/delivery-photos-tab.tsx`

- Accepts `filters: Filters` (same type as other report tabs)
- Calls `getDeliveryPhotos` then `getPhotoViewUrls` for signed URLs
- Customer filter: dropdown populated from unique customers in results
- Photo grid with captions (customer name + date)
- Lightbox: full-screen overlay, close on click/Escape
- "Descargar ZIP" button with progress text: "Descargando 3 de 12…"

### Reports page changes

- Add `TabsTrigger value="photos"` and `TabsContent` for `<DeliveryPhotosTab>`

## Dependencies

- `jszip` (new, client-side)
