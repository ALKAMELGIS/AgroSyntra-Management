# Quick Start: Enable Weather Auto-Fetch for NH1

## ✅ Step 1: You've Already Done This!
- Added latitude and longitude to field NH1 ✓

## 📝 Step 2: Get OpenWeatherMap API Key (Free)

1. **Visit**: https://openweathermap.org/api
2. **Click**: "Sign Up" (top right)
3. **Fill in**:
   - Username
   - Email
   - Password
   - Accept terms
4. **Verify your email** (check inbox)
5. **Login** to your account
6. **Go to**: "API keys" tab (in your dashboard)
7. **Copy** the "Default" API key (it looks like: `abc123def456ghi789...`)

**Note**: Free tier gives you 1,000 API calls per day (more than enough!)

## 🔧 Step 3: Configure Your Project

1. **Create `.env` file** in your project root folder (same level as `package.json`)
   - If you're using Windows: Create a new file named `.env` (not `.env.txt`)
   - If you're using VS Code: Right-click in project root → New File → Name it `.env`

2. **Add this line** to the `.env` file:
   ```
   REACT_APP_OPENWEATHER_API_KEY=your_actual_api_key_here
   ```
   Replace `your_actual_api_key_here` with the API key you copied from Step 2.

   **Example**:
   ```
   REACT_APP_OPENWEATHER_API_KEY=abc123def456ghi789jkl012mno345pqr678
   ```

3. **Save** the `.env` file

## 🔄 Step 4: Restart Your Development Server

**IMPORTANT**: Environment variables are only loaded when the server starts!

1. **Stop** your current development server (press `Ctrl+C` in the terminal)
2. **Start** it again:
   ```bash
   npm start
   ```

## 🧪 Step 5: Test It!

1. **Open** your app in the browser
2. **Navigate to**: "Weather Log" (in the sidebar menu)
3. **Select**:
   - Your Country
   - Your Site (where NH1 is located)
   - Today's Date
4. **Look for**:
   - Green alert saying "API key configured" ✓
   - Card showing "Fields with Coordinates (1)" with NH1 listed
   - Buttons to "Fetch" or "Auto-fetch"
5. **Click**: "Fetch for First Field" or the "Fetch" button next to NH1
6. **Wait** a few seconds (API call in progress)
7. **See**: Form auto-filled with weather data for NH1's exact location!

## ✅ Success Indicators:

- ✅ Green "API key configured" message
- ✅ NH1 appears in "Fields with Coordinates" list
- ✅ Weather data auto-fills in the form
- ✅ Success message: "Weather data fetched successfully for NH1"

## 🐛 Troubleshooting:

**Problem**: "API key not configured"
- **Solution**: Make sure `.env` file is in project root (not in `src` folder)
- **Solution**: Make sure variable name is exactly: `REACT_APP_OPENWEATHER_API_KEY`
- **Solution**: Restart your development server after creating `.env`

**Problem**: "Invalid API key"
- **Solution**: Double-check you copied the entire API key (no spaces)
- **Solution**: Make sure you verified your email on OpenWeatherMap

**Problem**: "No fields with coordinates found"
- **Solution**: Make sure you selected the correct Site where NH1 is located
- **Solution**: Verify NH1 has both latitude AND longitude saved

**Problem**: "Rate limit exceeded"
- **Solution**: Free tier allows 1,000 calls/day. Wait a few minutes and try again.

## 🎯 Next Steps After Testing:

1. **Add coordinates** to your other fields (NH2, GH-01, etc.)
2. **Use "Auto-fetch for All Fields"** to get weather for all fields at once
3. **Weather data** will automatically be used in the Efficiency Dashboard!

## 📍 Finding Coordinates for Other Fields:

**Option 1: Google Maps**
1. Open Google Maps
2. Find your field location
3. Right-click on the exact spot
4. Click the coordinates (e.g., "24.7136, 46.6753")
5. Copy latitude (first number) and longitude (second number)

**Option 2: GPS Device**
- Use a handheld GPS or smartphone GPS app
- Note the coordinates at the field location

**Option 3: Survey Data**
- If you have farm survey maps, they may include coordinates

---

**That's it!** Once you complete these steps, you'll have automatic weather fetching working for NH1 and any other fields you add coordinates to.
