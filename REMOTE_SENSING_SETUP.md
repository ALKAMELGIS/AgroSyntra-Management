# Remote Sensing Page Setup Guide

## ✅ Implementation Complete!

The Remote Sensing page has been created with a OneSoil-style interface. Here's what's been set up:

## 📦 What's Been Created

1. **Remote Sensing Page** (`src/pages/RemoteSensing.js`)
   - OneSoil-style interface with map and side panel
   - Field visualization with polygon boundaries
   - Environment indicators display
   - Vegetation indices visualization
   - Time range slider (ready for historical data)
   - Layer selection (True Color, False Color, NDVI, etc.)

2. **SentinelHub Service** (`src/utils/sentinelhubService.js`)
   - WMS integration for satellite imagery
   - Process API integration for custom indices
   - Support for multiple vegetation indices (NDVI, NDMI, NDRE, MSAVI, RECI, NDWI)
   - OAuth2 authentication handling

3. **Navigation**
   - Added "Remote Sensing" to the sidebar menu
   - Route configured at `/remote-sensing`

## 🔧 Step 1: Configure SentinelHub Credentials

You need to provide your SentinelHub credentials. Add them to your `.env` file:

### Option 1: WMS Configuration (Simpler - for basic satellite imagery)

```env
# Either provide the full WMS URL:
REACT_APP_SENTINELHUB_WMS_URL=https://services.sentinel-hub.com/ogc/wms/YOUR_INSTANCE_ID

# OR just the Instance ID (we'll construct the URL):
REACT_APP_SENTINELHUB_INSTANCE_ID=your_instance_id_here
```

### Option 2: Process API Configuration (More Features - for custom indices)

```env
# OAuth credentials for Process API:
REACT_APP_SENTINELHUB_CLIENT_ID=your_client_id_here
REACT_APP_SENTINELHUB_CLIENT_SECRET=your_client_secret_here
```

### Recommended: Use Both!

For full functionality, configure both WMS and Process API:

```env
# WMS (for quick satellite imagery display)
REACT_APP_SENTINELHUB_INSTANCE_ID=your_instance_id_here

# Process API (for custom vegetation indices)
REACT_APP_SENTINELHUB_CLIENT_ID=your_client_id_here
REACT_APP_SENTINELHUB_CLIENT_SECRET=your_client_secret_here
```

## 📋 Step 2: Get Your SentinelHub Credentials

### For WMS/Instance ID:
1. Log in to your SentinelHub account: https://www.sentinel-hub.com/
2. Go to your dashboard
3. Find your **Instance ID** or **WMS URL**
4. Copy it to your `.env` file

### For Process API (OAuth):
1. In SentinelHub dashboard, go to **OAuth clients**
2. Create a new OAuth client (if you don't have one)
3. Copy the **Client ID** and **Client Secret**
4. Add them to your `.env` file

## 🔄 Step 3: Restart Your Development Server

**IMPORTANT**: Environment variables are only loaded when the server starts!

1. Stop your current development server (press `Ctrl+C` in the terminal)
2. Start it again:
   ```bash
   npm start
   ```

## 🎯 Step 4: Access the Remote Sensing Page

1. Open your app in the browser
2. Click **"Remote Sensing"** in the sidebar menu
3. Select your **Country** and **Site**
4. You'll see your fields on the map!

## ✨ Features Available

### 1. **Satellite Imagery**
- Sentinel-2 satellite imagery (10m resolution)
- Multiple layer options:
  - True Color (natural color)
  - False Color (NIR composite)
  - NDVI (vegetation index)
  - NDMI, NDRE, MSAVI, RECI, NDWI

### 2. **Environment Indicators**
- **Temperature**: Current temperature at field location
- **Humidity**: Relative humidity percentage
- **Precipitation**: Rainfall in mm
- **Wind Speed**: Wind speed in m/s
- **Pressure**: Atmospheric pressure

### 3. **Vegetation Indices**
- **NDVI**: Normalized Difference Vegetation Index (plant health)
- **NDMI**: Normalized Difference Moisture Index (moisture content)
- **NDRE**: Normalized Difference Red Edge (chlorophyll)
- **MSAVI**: Modified Soil-Adjusted Vegetation Index
- **RECI**: Red Edge Chlorophyll Index
- **NDWI**: Normalized Difference Water Index

### 4. **Field Visualization**
- Field boundaries (polygons) displayed on map
- Color-coded by vegetation index values
- Click fields to see detailed information
- Productivity zones (ready for implementation)

### 5. **Time Range Slider**
- Select historical time periods
- View imagery from different dates
- Time-series analysis (ready for full implementation)

## 🗺️ Map Controls

- **Layer Selection**: Choose between True Color, False Color, or vegetation indices
- **Vegetation Index**: Select which index to visualize (NDVI, NDMI, etc.)
- **Field Boundaries**: Toggle field polygon display
- **Productivity Zones**: Toggle productivity zone visualization (when available)
- **Time Range**: Adjust slider to view different time periods

## 📊 Side Panel Features

- **Time Range Slider**: Select date range for historical imagery
- **Display Options**: Toggle field boundaries and productivity zones
- **Field Details**: When you click a field, see:
  - Environment indicators (temperature, humidity, precipitation, wind)
  - Vegetation indices values
  - Field information (name, crop, area)

## 🔄 Refresh Data

Click the **"Refresh"** button to:
- Fetch latest weather/environment data
- Update vegetation indices
- Get latest satellite imagery

## 📍 Field Requirements

For full functionality, fields need:
- **Polygon boundaries** (not just coordinates)
- Add polygon coordinates in **Master Data → Field Types & Names**
- Format: `[[lat1, lng1], [lat2, lng2], [lat3, lng3], ...]`

## 🐛 Troubleshooting

**"SentinelHub not configured" warning?**
- Check that you've added credentials to `.env` file
- Make sure you restarted the development server after adding credentials
- Verify the credentials are correct (no extra spaces)

**No satellite imagery showing?**
- Verify your WMS URL or Instance ID is correct
- Check that your SentinelHub account has active subscription
- Try a different layer (True Color, False Color)

**Vegetation indices not loading?**
- Make sure Process API credentials (Client ID/Secret) are configured
- Verify OAuth client is active in SentinelHub dashboard
- Check browser console for error messages

**Fields not showing?**
- Make sure fields have polygon boundaries (not just coordinates)
- Select the correct Country and Site
- Check that polygons are in correct format: `[[lat, lng], ...]`

## 🎉 Next Steps

Once you provide your SentinelHub credentials, we can:
1. Test the integration
2. Fine-tune the WMS layer configuration
3. Enhance time-series functionality
4. Add productivity zone calculations
5. Implement field comparison tools
6. Add export capabilities

## 📝 What You Need to Provide

Please provide (step by step as you mentioned):
1. **SentinelHub Instance ID** or **WMS URL**
2. **OAuth Client ID** (for Process API)
3. **OAuth Client Secret** (for Process API)

Once you provide these, I'll help you test and refine the integration!
