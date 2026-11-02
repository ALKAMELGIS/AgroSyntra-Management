# OpenWeatherMap API Integration - How It Works

## How You Get Exact Weather for Your Area

The OpenWeatherMap API provides **location-specific weather data** using GPS coordinates (latitude/longitude). Here's how it works:

### 1. **GPS Coordinates = Exact Location**
- Each field in your farm has a unique GPS coordinate (latitude/longitude)
- For example: Field GH-01 at `24.45°N, 54.38°E` is a specific point on Earth
- OpenWeatherMap uses these coordinates to fetch weather data from the nearest weather station or satellite data for that exact location

### 2. **Why This is Accurate**
- OpenWeatherMap has a network of weather stations worldwide
- They use interpolation and satellite data to provide weather for any GPS coordinate
- The API returns data for the **nearest available weather station** to your coordinates
- For agricultural areas, they often have weather stations within 10-50km, providing accurate local conditions

### 3. **How It Works in Your System**

```
Your Field (GH-01)
  ↓
Coordinates: 24.45°N, 54.38°E
  ↓
OpenWeatherMap API Request
  ↓
Nearest Weather Station Data
  ↓
Returns: Temperature, Humidity, Rainfall, etc.
  ↓
Stored in your system for efficiency calculations
```

### 4. **Setting Up Coordinates**

1. **Go to Master Data → Field Types & Names**
2. **Edit each field** and add:
   - **Latitude** (e.g., 24.45 for 24.45°N)
   - **Longitude** (e.g., 54.38 for 54.38°E)
3. **Save the field**

### 5. **Getting Your Coordinates**

You can find your field coordinates using:
- **Google Maps**: Right-click on your field location → Click coordinates → Copy
- **GPS Device**: Use a handheld GPS or smartphone GPS
- **Survey Data**: If you have farm survey maps with coordinates

### 6. **Example**

If your farm is in Riyadh, Saudi Arabia:
- **Field GH-01**: 24.7136°N, 46.6753°E
- **Field NH-02**: 24.7140°N, 46.6755°E (slightly different = different microclimate)

The API will fetch weather data specific to each coordinate, accounting for:
- Local temperature variations
- Microclimates (greenhouse vs open field)
- Elevation differences
- Proximity to water bodies

### 7. **API Setup**

1. **Get Free API Key**:
   - Visit: https://openweathermap.org/api
   - Sign up (free tier: 1,000 calls/day)
   - Copy your API key

2. **Configure**:
   - Create `.env` file in project root
   - Add: `REACT_APP_OPENWEATHER_API_KEY=your_key_here`
   - Restart development server

3. **Use**:
   - Go to **Weather Log** page
   - Select your site
   - Click **"Auto-fetch for All Fields"**
   - System fetches weather for each field using its coordinates

### 8. **Free Tier Limits**

- **1,000 API calls per day** (free tier)
- **60 calls per minute**
- For 10 fields, you can fetch weather 100 times per day
- More than enough for daily weather logging

### 9. **Accuracy**

- **Temperature**: ±1-2°C accuracy (excellent for agricultural use)
- **Humidity**: ±5% accuracy
- **Rainfall**: Accurate for daily totals
- **Wind**: Available but may vary more by location

### 10. **Why This is Better Than Manual Entry**

- **Automatic**: No manual data entry needed
- **Consistent**: Same time every day
- **Accurate**: Uses professional weather station data
- **Location-Specific**: Each field gets its own weather data
- **Historical**: Can fetch past weather (with paid tier)

## Troubleshooting

**Q: What if my area doesn't have a nearby weather station?**
A: OpenWeatherMap uses satellite data and interpolation to provide estimates. For most agricultural areas, accuracy is within 1-2°C.

**Q: Can I use this for historical weather?**
A: Free tier provides current weather only. Historical data requires a paid subscription (One Call API 3.0).

**Q: How often should I fetch weather?**
A: Once per day is sufficient. The system stores the data, so you can fetch in the morning and it will be used for all efficiency calculations.

**Q: What if coordinates are slightly wrong?**
A: Small errors (0.01° = ~1km) won't significantly affect weather data. The API uses the nearest station anyway.

## Next Steps

1. Add coordinates to your fields in Master Data
2. Get OpenWeatherMap API key
3. Configure `.env` file
4. Test auto-fetch on Weather Log page
5. Weather data will automatically be used in Efficiency Dashboard
