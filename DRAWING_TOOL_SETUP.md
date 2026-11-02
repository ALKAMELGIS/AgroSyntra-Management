# Field Drawing Tool Setup Guide

## ✅ Implementation Complete!

The field drawing functionality has been added to the Remote Sensing page, similar to OneSoil. You can now draw field boundaries directly on the map!

## 📦 Step 1: Install Required Package

**IMPORTANT**: You need to install the `leaflet-draw` package for the drawing tool to work.

Open your terminal in the project folder and run:

```bash
npm install leaflet-draw
```

This installs the Leaflet Draw plugin which provides polygon drawing functionality.

## 🔄 Step 2: Enable CSS Import

After installing the package, you need to uncomment the CSS import in `src/pages/RemoteSensing.js`:

1. Open `src/pages/RemoteSensing.js`
2. Find this line (around line 73-75):
   ```javascript
   // import 'leaflet-draw/dist/leaflet.draw.css';
   ```
3. Uncomment it to:
   ```javascript
   import 'leaflet-draw/dist/leaflet.draw.css';
   ```

## 🔄 Step 3: Restart Your Server

After installing the package and enabling the CSS:

1. Stop your development server (press `Ctrl+C`)
2. Start it again:
   ```bash
   npm start
   ```

## 🎯 How to Use the Drawing Tool

### Drawing a New Field:

1. **Navigate to Remote Sensing Page**:
   - Click **"Remote Sensing"** in the sidebar

2. **Select Location**:
   - Choose your **Country** and **Site** from the dropdowns

3. **Enable Drawing Mode**:
   - Click the **"Draw Field"** button in the header
   - The button will turn red and say "Cancel Drawing"
   - The map automatically switches to **Satellite** view (aerial imagery) for tracing boundaries

4. **Choose a base map** (top-right of map):
   - **Satellite** (default) — Esri aerial imagery, best for drawing field boundaries
   - **Light** — CARTO light street map
   - **OSM** — OpenStreetMap

5. **Draw the Polygon**:
   - A drawing toolbar will appear on the map
   - Click on the map to start drawing
   - Click multiple points to create your field boundary
   - Double-click or click the first point again to finish the polygon

6. **Assign Field Details**:
   - After drawing, a dialog will appear
   - **Select Field ID**: Choose from existing field IDs (NH1, GH1, Block1, etc.) - dropdown
   - **Field Type**: Select the field type (NetHouse, Greenhouse, Open Field)
   - **Current Crop**: Select the crop being grown
   - **Valve Count**: Enter the number of valves
   - Click **"Save Field"** to save the polygon to that field

7. **Done!**:
   - The polygon will be saved to the selected field
   - The field will now appear on the map with its boundary

### Editing an Existing Field:

1. **Click on a Field Polygon** on the map
2. A popup will appear with **"Edit"** and **"Delete"** buttons
3. Click **"Edit"** to modify the field's polygon or details
4. Update the information and click **"Update Field"**

### Deleting a Field Polygon:

1. **Click on a Field Polygon** on the map
2. Click **"Delete"** in the popup
3. Confirm the deletion
4. The polygon boundary will be removed (field data remains)

## ✨ Features

- ✅ **Draw polygons directly on the map** - Just like OneSoil!
- ✅ **Field ID dropdown** - Select from all existing field IDs
- ✅ **Complete field information** - Assign Field Type, Crop, Valve Count
- ✅ **Edit existing fields** - Update polygon boundaries or details
- ✅ **Delete polygons** - Remove field boundaries when needed
- ✅ **Auto-save to master data** - Integrated with your existing field management

## 📋 Field Assignment Dialog

When you draw a polygon, you'll see a dialog with:

- **Field ID** (Required): Dropdown of all existing field IDs
  - Shows: Field Name (Field Type) - Farm Area Name
  - Example: "NH-01 (NetHouse) - Tomato Area"
  
- **Field Type**: Select from available types
  - NetHouse
  - Greenhouse
  - Open Field

- **Current Crop**: Select from available crops
  - Tomato
  - Capsicum
  - Sweet Corn
  - Figs

- **Valve Count**: Number of valves for the field

## 🗺️ Map Integration

- **Satellite base map** loads by default (Esri World Imagery — no API key required)
- Drawn fields appear on the map with their boundaries
- Fields are color-coded based on vegetation indices (when available)
- Click on any field to see details and edit/delete options
- Fields are saved to the same master data structure as fields added via "Master Data → Field Types & Names"

## 🐛 Troubleshooting

### Drawing tool not appearing?
- Make sure you installed `leaflet-draw`: `npm install leaflet-draw`
- Check that you uncommented the CSS import
- Restart your development server
- Check browser console for errors

### "leaflet-draw is not installed" warning?
- Run: `npm install leaflet-draw`
- Restart your development server
- Clear browser cache and reload

### Can't select Field ID?
- Make sure you have fields created in "Master Data → Field Types & Names"
- The dropdown shows all fields from all sites
- Field IDs are the field names (NH-01, GH-01, etc.)

### Polygon not saving?
- Make sure you selected a Field ID (required)
- Check that you selected a Site before drawing
- Verify the field exists in your master data
- Check browser console for errors

### Drawing toolbar not showing?
- Make sure you clicked "Draw Field" button first
- The toolbar appears in the top-left corner of the map
- Try refreshing the page if it doesn't appear

## 🎉 Ready to Use!

Once you install the package and restart the server, you can start drawing fields on the map just like in OneSoil!

The drawn fields are automatically saved to your master data and will appear in:
- Remote Sensing page (with boundaries)
- Weather Map page
- All other pages that use field data

Enjoy drawing your field boundaries! 🗺️🌾
