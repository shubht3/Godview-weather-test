import axios from 'axios';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';

dotenv.config();

// Initialize cache with TTL of 30 minutes
const weatherCache = new NodeCache({ stdTTL: 1800 });

/**
 * Weather Service
 * Handles fetching and normalizing data from various weather APIs
 */
class WeatherService {
  constructor() {
    this.openWeatherMapKey = process.env.OPENWEATHERMAP_API_KEY;
    this.noaaApiKey = process.env.NOAA_API_KEY;
    this.nasaFirmsApiKey = process.env.NASA_FIRMS_API_KEY;
  }

  /**
   * Get current weather for a location
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} - Normalized weather data
   */
  async getCurrentWeather(lat, lon) {
    const cacheKey = `current_weather_${lat}_${lon}`;
    
    // Check cache first
    const cachedData = weatherCache.get(cacheKey);
    if (cachedData) {
      console.log(`WeatherService: Using cached data for lat=${lat}, lon=${lon}`);
      return cachedData;
    }
    
    try {
      console.log(`WeatherService: Fetching real weather data for lat=${lat}, lon=${lon}`);
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.openWeatherMapKey}&units=metric`
      );
      
      // Normalize the data
      const normalizedData = this.normalizeOpenWeatherData(response.data);
      
      // Cache the result
      weatherCache.set(cacheKey, normalizedData);
      
      return normalizedData;
    } catch (error) {
      console.error('Error fetching current weather:', error.message);
      
      // Fallback to fake data when API fails (rate limits, network issues, etc.)
      console.warn('Using fallback weather data due to API error');
      return this.getFakeWeatherData(lat, lon);
    }
  }

  /**
   * Get fake weather data for testing purposes
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Object} - Fake weather data in normalized format
   */
  getFakeWeatherData(lat, lon) {
    console.log('WeatherService: Generating fake weather data');
    return {
      type: 'current_weather',
      location: {
        name: 'Test Location',
        country: 'Test Country',
        lat: lat,
        lon: lon
      },
      weather: {
        main: 'Clear',
        description: 'clear sky',
        icon: '01d',
        temperature: 25,
        feels_like: 26,
        humidity: 60,
        pressure: 1015,
        wind_speed: 5,
        wind_direction: 90,
        clouds: 20,
        visibility: 10000,
        rain: {
          '1h': 0
        }
      },
      timestamp: Date.now(),
      sunrise: Date.now() - 21600000, // 6 hours ago
      sunset: Date.now() + 21600000   // 6 hours from now
    };
  }

  /**
   * Get weather forecast for a location
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {Promise<Object>} - Normalized forecast data
   */
  async getWeatherForecast(lat, lon) {
    const cacheKey = `forecast_${lat}_${lon}`;
    
    // Check cache first
    const cachedData = weatherCache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }
    
    try {
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${this.openWeatherMapKey}&units=metric`
      );
      
      // Normalize the data
      const normalizedData = this.normalizeForecastData(response.data);
      
      // Cache the result
      weatherCache.set(cacheKey, normalizedData);
      
      return normalizedData;
    } catch (error) {
      console.error('Error fetching weather forecast:', error.message);
      throw new Error('Failed to fetch weather forecast data');
    }
  }

  /**
   * Get hurricane data from NOAA
   * @returns {Promise<Array>} - Array of active hurricanes
   */
  async getHurricaneData() {
    const cacheKey = 'hurricane_data';
    
    // Check cache first
    const cachedData = weatherCache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }
    
    try {
      // NOAA API endpoint for active hurricanes
      const response = await axios.get(
        `https://www.nhc.noaa.gov/CurrentStorms.json`,
        {
          headers: this.noaaApiKey ? { 'token': this.noaaApiKey } : {}
        }
      );
      
      // Normalize the data
      const normalizedData = this.normalizeHurricaneData(response.data);
      
      // Cache the result
      weatherCache.set(cacheKey, normalizedData);
      
      return normalizedData;
    } catch (error) {
      console.error('Error fetching hurricane data:', error.message);
      throw new Error('Failed to fetch hurricane data');
    }
  }

  /**
   * Get wildfire data from NASA FIRMS
   * @param {number} days - Number of days to look back (1-10)
   * @returns {Promise<Array>} - Array of wildfire data
   */
  async getWildfireData(days = 1) {
    const cacheKey = `wildfire_data_${days}`;
    
    // Check cache first
    const cachedData = weatherCache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }
    
    try {
      // NASA FIRMS API for wildfire data
      const response = await axios.get(
        `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${this.nasaFirmsApiKey}/VIIRS_SNPP_NRT/USA/${days}`,
      );
      
      // Parse CSV response and normalize
      const normalizedData = this.normalizeWildfireData(response.data);
      
      // Cache the result
      weatherCache.set(cacheKey, normalizedData);
      
      return normalizedData;
    } catch (error) {
      console.error('Error fetching wildfire data:', error.message);
      throw new Error('Failed to fetch wildfire data');
    }
  }

  /**
   * Get natural disaster data from Earth Observatory
   * @returns {Promise<Array>} - Array of natural disasters
   */
  async getNaturalDisasterData() {
    const cacheKey = 'natural_disaster_data';
    
    // Check cache first
    const cachedData = weatherCache.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }
    
    try {
      // Earth Observatory events feed
      const response = await axios.get(
        'https://eonet.gsfc.nasa.gov/api/v3/events'
      );
      
      // Normalize the data
      const normalizedData = this.normalizeDisasterData(response.data);
      
      // Cache the result
      weatherCache.set(cacheKey, normalizedData);
      
      return normalizedData;
    } catch (error) {
      console.error('Error fetching natural disaster data:', error.message);
      throw new Error('Failed to fetch natural disaster data');
    }
  }

  /**
   * Get weather tile metadata for multi-scale visualization
   * @param {Object} params - Request parameters
   * @param {string} params.layerType - Type of weather layer (temperature, precipitation, wind, cloud)
   * @param {string} params.zoomCategory - Zoom category (GLOBAL, REGIONAL, LOCAL)
   * @param {Object} params.bounds - Map viewport bounds
   * @returns {Promise<Object>} - Tile metadata for requested layer
   */
  async getWeatherTileMetadata(params) {
    const { layerType, zoomCategory, bounds } = params;
    
    if (!layerType || !zoomCategory) {
      throw new Error('Layer type and zoom category are required');
    }
    
    // Create a cache key based on parameters
    const cacheKey = `tiles_${layerType}_${zoomCategory}_${bounds ? JSON.stringify(bounds) : 'global'}`;
    
    // Check cache first
    const cachedData = weatherCache.get(cacheKey);
    if (cachedData) {
      console.log(`WeatherService: Using cached tile metadata for ${layerType} at ${zoomCategory} zoom`);
      return cachedData;
    }
    
    try {
      console.log(`WeatherService: Generating tile metadata for ${layerType} at ${zoomCategory} zoom`);
      
      // Resolution configuration based on zoom category
      const resolutions = {
        GLOBAL: { 
          tileSize: 256,
          maxZoom: 3,
          minZoom: 0,
          resolution: 'low'
        },
        REGIONAL: { 
          tileSize: 256,
          maxZoom: 8,
          minZoom: 3,
          resolution: 'medium'
        },
        LOCAL: { 
          tileSize: 256,
          maxZoom: 22,
          minZoom: 8,
          resolution: 'high'
        }
      };
      
      // Layer-specific URLs and configurations
      const layerConfigs = {
        temperature: {
          GLOBAL: {
            url: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapKey}`,
            attribution: '© OpenWeatherMap'
          },
          REGIONAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true`,
            attribution: '© OpenWeatherMap'
          },
          LOCAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true&opacity=0.9`,
            attribution: '© OpenWeatherMap'
          }
        },
        precipitation: {
          GLOBAL: {
            url: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapKey}`,
            attribution: '© OpenWeatherMap'
          },
          REGIONAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true`,
            attribution: '© OpenWeatherMap'
          },
          LOCAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true&opacity=0.9`,
            attribution: '© OpenWeatherMap'
          }
        },
        wind: {
          GLOBAL: {
            url: `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapKey}`,
            attribution: '© OpenWeatherMap'
          },
          REGIONAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true`,
            attribution: '© OpenWeatherMap'
          },
          LOCAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true&opacity=0.9`,
            attribution: '© OpenWeatherMap'
          }
        },
        cloud: {
          GLOBAL: {
            url: `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapKey}`,
            attribution: '© OpenWeatherMap'
          },
          REGIONAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true`,
            attribution: '© OpenWeatherMap'
          },
          LOCAL: {
            url: `https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=${this.openWeatherMapKey}&fill_bound=true&opacity=0.9`,
            attribution: '© OpenWeatherMap'
          }
        }
      };
      
      // Get config for requested layer and zoom
      const config = layerConfigs[layerType]?.[zoomCategory];
      const resolution = resolutions[zoomCategory];
      
      if (!config || !resolution) {
        throw new Error(`Invalid layer type ${layerType} or zoom category ${zoomCategory}`);
      }
      
      // Calculate tile coverage if bounds are provided
      let tileCoverage = null;
      if (bounds) {
        // Convert bounds to tile coordinates at the appropriate zoom level
        const midZoom = Math.floor((resolution.minZoom + resolution.maxZoom) / 2);
        tileCoverage = this.calculateTileCoverage(bounds, midZoom);
      }
      
      // Create metadata response
      const metadata = {
        url: config.url,
        tileSize: resolution.tileSize,
        minZoom: resolution.minZoom,
        maxZoom: resolution.maxZoom,
        resolution: resolution.resolution,
        attribution: config.attribution,
        tileCoverage,
        timestamp: Date.now()
      };
      
      // Cache the result
      weatherCache.set(cacheKey, metadata, 600); // Cache for 10 minutes
      
      return metadata;
    } catch (error) {
      console.error(`Error generating tile metadata for ${layerType}:`, error.message);
      throw new Error(`Failed to generate tile metadata for ${layerType}`);
    }
  }
  
  /**
   * Calculate tile coverage for a given bounds and zoom level
   * @param {Object} bounds - Map bounds
   * @param {number} zoom - Zoom level
   * @returns {Object} - Tile coverage information
   */
  calculateTileCoverage(bounds, zoom) {
    // Convert bounds to tile coordinates
    const n = Math.pow(2, zoom);
    
    // Calculate tile coordinates
    const minX = Math.floor((bounds.west + 180) / 360 * n);
    const maxX = Math.floor((bounds.east + 180) / 360 * n);
    
    // Calculate tile coordinates for latitude
    // Using the Web Mercator projection formula
    const minLat = bounds.south * Math.PI / 180;
    const maxLat = bounds.north * Math.PI / 180;
    
    const minY = Math.floor((1 - Math.log(Math.tan(maxLat) + 1 / Math.cos(maxLat)) / Math.PI) / 2 * n);
    const maxY = Math.floor((1 - Math.log(Math.tan(minLat) + 1 / Math.cos(minLat)) / Math.PI) / 2 * n);
    
    // Calculate total number of tiles
    const tileCount = (maxX - minX + 1) * (maxY - minY + 1);
    
    return {
      minX,
      maxX,
      minY,
      maxY,
      zoom,
      tileCount
    };
  }

  /**
   * Normalize data from OpenWeatherMap
   * @param {Object} data - Raw API data
   * @returns {Object} - Normalized data
   */
  normalizeOpenWeatherData(data) {
    return {
      type: 'current_weather',
      location: {
        name: data.name,
        country: data.sys.country,
        lat: data.coord.lat,
        lon: data.coord.lon
      },
      weather: {
        main: data.weather[0].main,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        temperature: data.main.temp,
        feels_like: data.main.feels_like,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        wind_speed: data.wind.speed,
        wind_direction: data.wind.deg,
        clouds: data.clouds.all,
        visibility: data.visibility
      },
      timestamp: data.dt * 1000, // Convert to milliseconds
      sunrise: data.sys.sunrise * 1000,
      sunset: data.sys.sunset * 1000
    };
  }

  /**
   * Normalize forecast data
   * @param {Object} data - Raw API data
   * @returns {Object} - Normalized data
   */
  normalizeForecastData(data) {
    return {
      type: 'forecast',
      location: {
        name: data.city.name,
        country: data.city.country,
        lat: data.city.coord.lat,
        lon: data.city.coord.lon
      },
      forecast: data.list.map(item => ({
        timestamp: item.dt * 1000,
        temperature: item.main.temp,
        feels_like: item.main.feels_like,
        humidity: item.main.humidity,
        pressure: item.main.pressure,
        weather: {
          main: item.weather[0].main,
          description: item.weather[0].description,
          icon: item.weather[0].icon
        },
        wind_speed: item.wind.speed,
        wind_direction: item.wind.deg,
        clouds: item.clouds.all,
        pop: item.pop // Probability of precipitation
      }))
    };
  }

  /**
   * Normalize hurricane data
   * @param {Object} data - Raw API data
   * @returns {Array} - Normalized hurricane data
   */
  normalizeHurricaneData(data) {
    if (!data.activeStorms || !Array.isArray(data.activeStorms)) {
      return [];
    }
    
    return data.activeStorms.map(storm => ({
      type: 'hurricane',
      id: storm.id || `hurricane-${Date.now()}`,
      name: storm.name,
      category: storm.classification || 'Unknown',
      location: {
        lat: storm.lat,
        lon: storm.lon
      },
      movement: {
        direction: storm.movement.direction,
        speed: storm.movement.speed
      },
      pressure: storm.pressure,
      wind_speed: storm.windSpeed,
      path: storm.track.map(point => ({
        lat: point.lat,
        lon: point.lon,
        timestamp: new Date(point.time).getTime(),
        wind_speed: point.windSpeed
      })),
      forecast: storm.forecast.map(point => ({
        lat: point.lat,
        lon: point.lon,
        timestamp: new Date(point.time).getTime(),
        wind_speed: point.windSpeed,
        category: point.category
      }))
    }));
  }

  /**
   * Normalize wildfire data from CSV
   * @param {string} csvData - Raw CSV data
   * @returns {Array} - Normalized wildfire data
   */
  normalizeWildfireData(csvData) {
    // This is a simplified implementation - actual CSV parsing would be more robust
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    const latIndex = headers.indexOf('latitude');
    const lonIndex = headers.indexOf('longitude');
    const dateIndex = headers.indexOf('acq_date');
    const timeIndex = headers.indexOf('acq_time');
    const brightnessIndex = headers.indexOf('bright_ti4');
    const confidenceIndex = headers.indexOf('confidence');
    
    return lines.slice(1).filter(line => line.trim() !== '').map(line => {
      const values = line.split(',');
      
      return {
        type: 'wildfire',
        id: `fire-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        location: {
          lat: parseFloat(values[latIndex]),
          lon: parseFloat(values[lonIndex])
        },
        date: values[dateIndex],
        time: values[timeIndex],
        brightness: parseFloat(values[brightnessIndex]),
        confidence: values[confidenceIndex],
        timestamp: new Date(`${values[dateIndex]} ${values[timeIndex].substring(0, 2)}:${values[timeIndex].substring(2, 4)}`).getTime()
      };
    });
  }

  /**
   * Normalize disaster data
   * @param {Object} data - Raw API data
   * @returns {Array} - Normalized disaster data
   */
  normalizeDisasterData(data) {
    if (!data.events || !Array.isArray(data.events)) {
      return [];
    }
    
    return data.events.map(event => {
      const geometry = event.geometry && event.geometry.length > 0 ? event.geometry[0] : null;
      
      return {
        type: 'natural_disaster',
        id: event.id,
        title: event.title,
        description: event.description || '',
        category: event.categories[0].title,
        location: geometry ? {
          lat: geometry.coordinates[1], // EONET uses [lon, lat]
          lon: geometry.coordinates[0]
        } : null,
        timestamp: geometry ? new Date(geometry.date).getTime() : null,
        sources: event.sources.map(source => ({
          id: source.id,
          url: source.url
        }))
      };
    });
  }
}

export default new WeatherService(); 