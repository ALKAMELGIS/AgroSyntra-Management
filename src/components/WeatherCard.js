import React from 'react';
import { Card, CardContent, Typography, Box, Grid } from '@mui/material';
import { LocationOnOutlined as LocationOn, NavigationOutlined as Navigation } from '@mui/icons-material';

/**
 * WeatherCard Component
 * Displays weather data in a card format matching the reference design
 * 
 * @param {Object} props
 * @param {string} props.fieldName - Name of the field (e.g., "NH-01")
 * @param {number} props.latitude - Latitude coordinate
 * @param {number} props.longitude - Longitude coordinate
 * @param {Object} props.weatherData - Weather data object
 */
function WeatherCard({ fieldName, latitude, longitude, weatherData }) {
  if (!weatherData) {
    return (
      <Card sx={{ height: '100%', opacity: 0.6 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {fieldName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No weather data available
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Helper function to convert wind direction degrees to compass direction
  const getWindDirection = (degrees) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  };

  // Format wind direction
  const windDir = weatherData.windDirection !== null && weatherData.windDirection !== undefined
    ? `${Math.round(weatherData.windDirection)}° ${getWindDirection(weatherData.windDirection)}`
    : '--';

  // Format values
  const currentTemp = weatherData.avgTemp !== null && weatherData.avgTemp !== undefined
    ? `${weatherData.avgTemp.toFixed(1)} °C`
    : '-- °C';

  const feelsLike = weatherData.feelsLike !== null && weatherData.feelsLike !== undefined
    ? `${weatherData.feelsLike.toFixed(1)} °C`
    : '-- °C';

  const windSpeed = weatherData.windSpeed !== null && weatherData.windSpeed !== undefined
    ? `${weatherData.windSpeed.toFixed(1)} m/s`
    : '-- m/s';

  const humidity = weatherData.avgRH !== null && weatherData.avgRH !== undefined
    ? `${Math.round(weatherData.avgRH)} %`
    : '-- %';

  const clouds = weatherData.clouds !== null && weatherData.clouds !== undefined
    ? `${Math.round(weatherData.clouds)} %`
    : '-- %';

  const pressure = weatherData.pressure !== null && weatherData.pressure !== undefined
    ? `${Math.round(weatherData.pressure)} hPa`
    : '-- hPa';

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: 2,
        background: 'linear-gradient(135deg, rgba(255, 248, 220, 0.9) 0%, rgba(255, 250, 240, 0.9) 100%)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 6px 12px rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        {/* Header: Field Name and Coordinates */}
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              color: '#2c3e50',
              mb: 0.5,
              fontSize: '1.125rem',
            }}
          >
            {fieldName}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LocationOn sx={{ fontSize: 14, color: '#7f8c8d' }} />
            <Typography
              variant="caption"
              sx={{
                color: '#7f8c8d',
                fontSize: '0.75rem',
              }}
            >
              {latitude?.toFixed(2)}, {longitude?.toFixed(2)}
            </Typography>
          </Box>
        </Box>

        {/* Large Temperature Display */}
        <Box sx={{ mb: 2.5, textAlign: 'center' }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              color: '#2c3e50',
              fontSize: '2.5rem',
              lineHeight: 1.2,
            }}
          >
            {currentTemp}
          </Typography>
        </Box>

        {/* Weather Parameters - Two Column Layout */}
        <Grid container spacing={1.5}>
          {/* Feels like */}
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#34495e',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                }}
              >
                Feels like
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#2c3e50',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {feelsLike}
              </Typography>
            </Box>
          </Grid>

          {/* Wind speed */}
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#34495e',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                }}
              >
                Wind speed
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#2c3e50',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {windSpeed}
              </Typography>
            </Box>
          </Grid>

          {/* Wind Direction */}
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#34495e',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                }}
              >
                Wind Direction
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Navigation
                  sx={{
                    fontSize: 16,
                    color: '#3498db',
                    transform: weatherData.windDirection
                      ? `rotate(${weatherData.windDirection}deg)`
                      : 'none',
                  }}
                />
                <Typography
                  variant="body2"
                  sx={{
                    color: '#2c3e50',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  {windDir}
                </Typography>
              </Box>
            </Box>
          </Grid>

          {/* Humidity */}
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#34495e',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                }}
              >
                Humidity
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#2c3e50',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {humidity}
              </Typography>
            </Box>
          </Grid>

          {/* Clouds */}
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#34495e',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                }}
              >
                Clouds
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#2c3e50',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {clouds}
              </Typography>
            </Box>
          </Grid>

          {/* Pressure */}
          <Grid size={6}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography
                variant="body2"
                sx={{
                  color: '#34495e',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                }}
              >
                Pressure
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: '#2c3e50',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {pressure}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

export default WeatherCard;
