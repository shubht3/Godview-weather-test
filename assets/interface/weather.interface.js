/**
 * Weather Interface Module
 * Handles all weather-related UI and data visualization
 */
class WeatherInterface extends I {
    static weatherLayers = [];
    static activeWeatherLayers = {};
    static weatherData = {
        current: null,
        forecast: null,
        hurricanes: [],
        wildfires: [],
        disasters: []
    };
    static timelineVisible = false;
    static timeSliderValue = 0;
    static isPlaying = false;
    static playInterval = null;
    static isInitialized = false;
    static tileErrorHandlingSetup = false;
    
    // Zoom level tracking for multi-scale visualization
    static currentZoomLevel = 0;
    static zoomLevels = {
        GLOBAL: { min: 0, max: 3 },    // Global view (whole earth)
        REGIONAL: { min: 3, max: 8 },  // Regional view (continents, large regions)
        LOCAL: { min: 8, max: 22 }     // Local view (cities, local areas)
    };
    static zoomChangeDebounceTimer = null;
    
    // Tile resolution configuration based on zoom level
    static tileResolutions = {
        GLOBAL: { resolution: 'low', tileSuffix: '/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577' },
        REGIONAL: { resolution: 'medium', tileSuffix: '/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577' },
        LOCAL: { resolution: 'high', tileSuffix: '/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577' }
    };

    // Add a new tile manager system:
    // Tile caching system for efficient loading
    static tileCache = {
        temperature: {},
        precipitation: {},
        wind: {},
        cloud: {}
    };
    
    // Viewport tracking for efficient tile loading
    static currentViewport = {
        bounds: null,
        center: null,
        zoom: 0
    };
    
    // Prefetch status tracking
    static prefetchQueue = [];
    static prefetchInProgress = false;
    
    /**
     * Initialize weather control panel
     */
    static initWeatherControls() {
        // Prevent multiple initializations
        if (this.isInitialized) {
            console.log('Weather controls already initialized');
            return;
        }

        // Only initialize if map is defined and loaded
        if (!map || typeof map.loaded !== 'function') {
            console.log('Map not ready yet, delaying weather controls initialization');
            setTimeout(() => this.initWeatherControls(), 500);
            return;
        }

        try {
            if (!map.loaded()) {
                console.log('Map not fully loaded yet, delaying weather controls initialization');
                setTimeout(() => this.initWeatherControls(), 500);
                return;
            }
        } catch (e) {
            console.log('Error checking map loaded state, delaying weather controls initialization', e);
            setTimeout(() => this.initWeatherControls(), 500);
            return;
        }

        console.log('Initializing weather controls');
        this.isInitialized = true;
        
        // Setup zoom change monitoring
        this.setupZoomChangeHandling();
        
        // Initialize city labels with real temps - they're always part of the temperature layer
        this.initCityLabels();
        
        // Create weather control container
        const weatherControl = E.div(body, 'weatherControl', 'weatherControl');
        
        // Add toggle button
        const weatherToggle = E.div(weatherControl, 'weatherToggleBtn', 'weatherToggleBtn');
        weatherToggle.innerHTML = '<i class="fa-solid fa-cloud-sun"></i>';
        weatherToggle.title = "Weather Layers";
        weatherToggle.onclick = () => this.toggleWeatherPanel();
        
        // Create weather panel (initially hidden)
        const weatherPanel = E.div(weatherControl, 'weatherPanel', 'weatherPanel');
        weatherPanel.style.display = 'none';
        
        // Add title
        const panelTitle = E.div(weatherPanel, 'weatherPanelTitle', '');
        panelTitle.innerHTML = 'Weather Layers';
        
        // Create layer categories
        const categories = [
            { id: 'currentWeather', title: 'Current Weather', icon: 'fa-cloud-sun' },
            { id: 'severeWeather', title: 'Severe Events', icon: 'fa-hurricane' },
            { id: 'forecast', title: 'Forecast', icon: 'fa-calendar-days' }
        ];
        
        categories.forEach(category => {
            const categoryContainer = E.div(weatherPanel, 'weatherCategory', `weatherCategory_${category.id}`);
            
            // Category header
            const categoryHeader = E.div(categoryContainer, 'weatherCategoryHeader', '');
            categoryHeader.innerHTML = `<i class="fa-solid ${category.icon}"></i> ${category.title}`;
            categoryHeader.onclick = () => {
                const content = document.getElementById(`weatherCategoryContent_${category.id}`);
                if (content) {
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                    categoryHeader.classList.toggle('collapsed');
                }
            };
            
            // Category content
            const categoryContent = E.div(categoryContainer, 'weatherCategoryContent', `weatherCategoryContent_${category.id}`);
            
            // Add layers for each category
            if (category.id === 'currentWeather') {
                this.addLayerToggle(categoryContent, 'temperature', 'Temperature', 'fa-temperature-half');
                this.addLayerToggle(categoryContent, 'precipitation', 'Precipitation', 'fa-cloud-rain');
                this.addLayerToggle(categoryContent, 'wind', 'Wind', 'fa-wind');
                this.addLayerToggle(categoryContent, 'cloud', 'Cloud Coverage', 'fa-cloud');
                // City labels toggle removed - they're now always part of the temperature layer
            } else if (category.id === 'severeWeather') {
                this.addLayerToggle(categoryContent, 'hurricane', 'Hurricanes', 'fa-hurricane');
                this.addLayerToggle(categoryContent, 'wildfire', 'Wildfires', 'fa-fire');
                this.addLayerToggle(categoryContent, 'disaster', 'Natural Disasters', 'fa-exclamation-triangle');
            } else if (category.id === 'forecast') {
                // Add time controls for forecast
                const timeControls = E.div(categoryContent, 'timeControls', 'timeControls');
                
                // Play/pause button
                const playBtn = E.div(timeControls, 'timeControlBtn', 'timeControlPlayBtn');
                playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                playBtn.onclick = () => this.toggleTimelinePlayback();
                
                // Time slider
                const timeSlider = E.input(timeControls, 'range', 'timeSlider', 'timeSlider', '');
                timeSlider.type = 'range';
                timeSlider.min = 0;
                timeSlider.max = 4;
                timeSlider.value = 0;
                timeSlider.step = 1;
                timeSlider.oninput = (e) => this.updateTimelinePosition(e.target.value);
                
                // Time display
                const timeDisplay = E.div(timeControls, 'timeDisplay', 'timeDisplay');
                timeDisplay.innerHTML = 'Now';

                // Add forecast layers
                this.addLayerToggle(categoryContent, 'forecastTemp', 'Temperature', 'fa-temperature-half');
                this.addLayerToggle(categoryContent, 'forecastPrecip', 'Precipitation', 'fa-cloud-rain');
                this.addLayerToggle(categoryContent, 'forecastWind', 'Wind', 'fa-wind');
            }
        });
        
        // Do not auto-load any weather layers by default
        this.activeWeatherLayers['temperature'] = false;
        this.activeWeatherLayers['cities'] = false;
        
        // Initialize the tile manager
        this.initTileManager();
        
        // Add debug toggle
        const debugLink = document.createElement('a');
        debugLink.href = '#';
        debugLink.style.position = 'absolute';
        debugLink.style.bottom = '5px';
        debugLink.style.left = '5px';
        debugLink.style.fontSize = '10px';
        debugLink.style.color = 'rgba(255,255,255,0.5)';
        debugLink.style.zIndex = '1000';
        debugLink.textContent = 'Debug';
        debugLink.onclick = (e) => {
            e.preventDefault();
            this.enableDebugMode();
            return false;
        };
        document.body.appendChild(debugLink);
        
        console.log('Weather controls initialized successfully');
    }

    /**
     * Set up handling for zoom level changes
     */
    static setupZoomChangeHandling() {
        // Store initial zoom level
        this.currentZoomLevel = map.getZoom();
        console.log(`Initial zoom level: ${this.currentZoomLevel}`);
        
        // Listen for zoom end events
        map.on('zoomend', () => {
            const newZoom = map.getZoom();
            
            // Debounce handling to avoid excessive updates during rapid zooming
            clearTimeout(this.zoomChangeDebounceTimer);
            this.zoomChangeDebounceTimer = setTimeout(() => {
                this.handleZoomChange(newZoom);
            }, 300);
        });
    }
    
    /**
     * Handle changes in map zoom level
     * @param {number} newZoom - New zoom level
     */
    static handleZoomChange(newZoom) {
        console.log(`Zoom changed from ${this.currentZoomLevel} to ${newZoom}`);
        
        // Determine zoom categories for old and new zoom levels
        const oldCategory = this.getZoomCategory(this.currentZoomLevel);
        const newCategory = this.getZoomCategory(newZoom);
        
        // Update stored zoom level
        this.currentZoomLevel = newZoom;
        
        // If zoom category changed, refresh active weather layers
        if (oldCategory !== newCategory) {
            console.log(`Zoom category changed from ${oldCategory} to ${newCategory}, refreshing weather layers`);
            
            // Get active layers
            const activeLayers = Object.keys(this.activeWeatherLayers).filter(
                layerId => this.activeWeatherLayers[layerId]
            );
            
            // Create transition layers for each active layer
            activeLayers.forEach(layerId => {
                // Skip non-tile layers
                if (!['temperature', 'precipitation', 'wind', 'cloud'].includes(layerId)) {
                    return;
                }
                
                // Add transition layers for smooth crossfade
                this.createTransitionLayer(layerId, oldCategory, newCategory)
                    .then(transitionLayers => {
                        // Store transition layers in the weatherLayers object temporarily
                        if (!this.weatherLayers['transitions']) {
                            this.weatherLayers['transitions'] = {
                                visibility: 'visible',
                                type: 'transition',
                                layers: []
                            };
                        }
                        
                        // Add new transition layers
                        this.weatherLayers['transitions'].layers = [
                            ...this.weatherLayers['transitions'].layers,
                            ...transitionLayers
                        ];
                        
                        // Schedule removal of transition layers after animation completes
                        setTimeout(() => {
                            // Remove transition layers after they've served their purpose
                            transitionLayers.forEach(id => {
                                if (map.getLayer(id)) {
                                    map.removeLayer(id);
                                }
                            });
                            
                            // Remove from tracking
                            this.weatherLayers['transitions'].layers = this.weatherLayers['transitions'].layers.filter(
                                id => !transitionLayers.includes(id)
                            );
                            
                            // Refresh the layer with the new zoom category
                            this.refreshLayer(layerId, newCategory);
                        }, 1000); // Match this to the fade duration in MapboxGL
                    })
                    .catch(error => {
                        console.error('Error creating transition layer:', error);
                        // Continue with next item despite error
                        setTimeout(() => this.processPrefetchQueue(), 100);
                    });
            });
            
            // Update city labels visibility based on new zoom
            this.updateCityLabelsVisibility();
        }
    }
    
    /**
     * Get zoom category (GLOBAL, REGIONAL, LOCAL) for a given zoom level
     * @param {number} zoom - Zoom level
     * @returns {string} - Zoom category
     */
    static getZoomCategory(zoom) {
        if (zoom >= this.zoomLevels.LOCAL.min) return 'LOCAL';
        if (zoom >= this.zoomLevels.REGIONAL.min) return 'REGIONAL';
        return 'GLOBAL';
    }
    
    /**
     * Refresh a weather layer with the new zoom category
     * @param {string} layerId - ID of the layer to refresh
     * @param {string} zoomCategory - New zoom category
     */
    static refreshLayer(layerId, zoomCategory) {
        console.log(`Refreshing ${layerId} layer for ${zoomCategory} view`);
        
        // Skip if layer is not active
        if (!this.activeWeatherLayers[layerId]) {
            console.log(`Layer ${layerId} is not active, skipping refresh`);
            return;
        }
        
        // Store current visibility
        const currentVisibility = this.weatherLayers[layerId]?.visibility || 'visible';
        
        // Refresh the layer data
        this.fetchLayerData(layerId, zoomCategory);
        
        // Ensure the layer maintains its visibility state
        setTimeout(() => {
            if (this.weatherLayers[layerId]) {
                this.weatherLayers[layerId].visibility = currentVisibility;
                
                // Make sure all sublayers have the correct visibility
                if (this.weatherLayers[layerId].layers) {
                    this.weatherLayers[layerId].layers.forEach(sublayerId => {
                        if (map.getLayer(sublayerId)) {
                            map.setLayoutProperty(
                                sublayerId,
                                'visibility',
                                currentVisibility
                            );
                        }
                    });
                }
            }
        }, 100);
    }

    /**
     * Add a layer toggle button
     * @param {HTMLElement} parent - Parent element to add the toggle to
     * @param {string} id - ID of the layer
     * @param {string} label - Label to display
     * @param {string} icon - Font Awesome icon class
     */
    static addLayerToggle(parent, id, label, icon) {
        const toggleContainer = E.div(parent, 'layerToggleContainer', `layerToggle_${id}`);
        
        // Toggle button
        const toggle = E.div(toggleContainer, 'layerToggle', `toggle_${id}`);
        toggle.onclick = () => this.toggleLayer(id);
        
        // Toggle label
        const toggleLabel = E.div(toggleContainer, 'layerToggleLabel', '');
        toggleLabel.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
    }

    /**
     * Toggle weather panel visibility
     */
    static toggleWeatherPanel() {
        const panel = document.getElementById('weatherPanel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    }

    /**
     * Toggle a weather layer on/off
     */
    static toggleLayer(layerId) {
        console.log(`Toggle layer: ${layerId}`);
        
        try {
            // Toggle the active state for this layer
            this.activeWeatherLayers[layerId] = !this.activeWeatherLayers[layerId];
            
            // Update the toggle button appearance
            const toggleBtn = document.getElementById(`toggle_${layerId}`);
            if (toggleBtn) {
                if (this.activeWeatherLayers[layerId]) {
                    toggleBtn.classList.add('active');
                } else {
                    toggleBtn.classList.remove('active');
                }
            }
            
            // Special handling for temperature layer - city labels are always part of it
            if (layerId === 'temperature') {
                // City labels always follow temperature layer state
                this.activeWeatherLayers['cities'] = this.activeWeatherLayers['temperature'];
                
                if (this.activeWeatherLayers[layerId]) {
                    // When temperature is turned on, also show city labels
                    this.showLayer('cities');
                } else {
                    // When temperature is turned off, also hide city labels
                    this.hideLayer('cities');
                }
            }
            
            // Don't allow direct toggling of city labels - they're managed with temperature
            if (layerId === 'cities') {
                console.log('City labels are managed with temperature layer');
                return;
            }
            
            // Show or hide the layer based on its active state
            if (this.activeWeatherLayers[layerId]) {
                this.showLayer(layerId);
            } else {
                this.hideLayer(layerId);
            }
            
            // Log the current state of all active layers
            console.log('Active weather layers:', JSON.stringify(this.activeWeatherLayers));
        } catch (e) {
            console.error(`Error toggling layer ${layerId}:`, e);
        }
    }

    /**
     * Show a weather layer
     * @param {string} layerId - ID of the layer to show
     */
    static showLayer(layerId) {
        if (!layerId) return;
        
        // Check if we've already created this layer
        if (this.weatherLayers[layerId]?.layers?.length > 0) {
            console.log(`Showing existing ${layerId} layer`);
            
            // Show all sublayers
            this.weatherLayers[layerId].layers.forEach(id => {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, 'visibility', 'visible');
                }
            });
            
            // Update visibility state
            this.weatherLayers[layerId].visibility = 'visible';
        } else {
            console.log(`Creating and showing ${layerId} layer`);
            
            // Get the current zoom category for appropriate resolution
            const zoomCategory = this.getZoomCategory(map.getZoom());
            
            // Fetch data and create layer
            this.fetchLayerData(layerId, zoomCategory);
        }
        
        // Mark as active
        this.activeWeatherLayers[layerId] = true;
        
        // Update toggle UI
        const toggle = document.getElementById(`layerToggle_${layerId}`);
        if (toggle) {
            toggle.classList.add('active');
        }
        
        // Special handling for the city labels layer
        if (layerId === 'temperature') {
            // Ensure city labels are always shown with temperature
            this.activeWeatherLayers['cities'] = true;
            if (this.weatherLayers['cities']) {
                this.weatherLayers['cities'].layers.forEach(id => {
                    if (map.getLayer(id)) {
                        map.setLayoutProperty(id, 'visibility', 'visible');
                    }
                });
                this.weatherLayers['cities'].visibility = 'visible';
            } else {
                this.initCityLabels();
            }
            
            // Update city labels based on current zoom
            this.updateCityLabelsVisibility();
        }
        
        // If timeline is visible and this is a forecast layer, update timeline position
        if (this.timelineVisible && ['forecastTemp', 'forecastPrecip', 'forecastWind'].includes(layerId)) {
            this.updateTimelinePosition(this.timeSliderValue);
        }

        // Check if we should prefetch adjacent tiles
        if (this.currentViewport.bounds && ['temperature', 'precipitation', 'wind', 'cloud'].includes(layerId)) {
            this.queueTilePrefetch();
        }
    }

    /**
     * Hide a weather layer
     * @param {string} layerId - ID of the layer to hide
     */
    static hideLayer(layerId) {
        if (!layerId) return;
        
        console.log(`Hiding ${layerId} layer`);
        
        // Check if layer exists
        if (this.weatherLayers[layerId]) {
            // Hide all sublayers
            this.weatherLayers[layerId].layers.forEach(id => {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, 'visibility', 'none');
                }
            });
            
            // Update visibility state
            this.weatherLayers[layerId].visibility = 'none';
        }
        
        // Also hide any transition layers if they're currently active
        if (this.weatherLayers['transitions']) {
            const transitionPrefixes = [`${layerId}-transition-GLOBAL-REGIONAL`, `${layerId}-transition-REGIONAL-LOCAL`];
            
            this.weatherLayers['transitions'].layers.forEach(id => {
                if (transitionPrefixes.some(prefix => id.startsWith(prefix))) {
                    if (map.getLayer(id)) {
                        map.setLayoutProperty(id, 'visibility', 'none');
                    }
                }
            });
        }
        
        // Mark as inactive
        this.activeWeatherLayers[layerId] = false;
        
        // Update toggle UI
        const toggle = document.getElementById(`layerToggle_${layerId}`);
        if (toggle) {
            toggle.classList.remove('active');
        }
        
        // Special handling for the city labels layer
        if (layerId === 'temperature') {
            // Hide city labels when temperature layer is hidden
            this.activeWeatherLayers['cities'] = false;
            if (this.weatherLayers['cities']) {
                this.weatherLayers['cities'].layers.forEach(id => {
                    if (map.getLayer(id)) {
                        map.setLayoutProperty(id, 'visibility', 'none');
                    }
                });
                this.weatherLayers['cities'].visibility = 'none';
            }
        }
        
        // If timeline is visible and this is a forecast layer, update timeline
        if (this.timelineVisible && ['forecastTemp', 'forecastPrecip', 'forecastWind'].includes(layerId)) {
            this.updateTimeDisplay(this.timeSliderValue);
        }
    }

    /**
     * Fetch and display layer data
     * @param {string} layerId - Layer ID to fetch
     * @param {string} zoomCategory - Zoom category for appropriate resolution
     */
    static fetchLayerData(layerId, zoomCategory) {
        if (!layerId) return;
        
        // Set layer as active
        this.activeWeatherLayers[layerId] = true;
        
        // Determine the zoom category if not provided
        if (!zoomCategory) {
            zoomCategory = this.getZoomCategory(this.currentZoomLevel || map.getZoom());
        }
        
        console.log(`Fetching layer data for ${layerId} with resolution for ${zoomCategory}`);
        
        // Create layer based on type
        switch (layerId) {
            case 'temperature':
                this.createTemperatureLayer(zoomCategory);
                break;
                
            case 'precipitation':
                this.createPrecipitationLayer(zoomCategory);
                break;
                
            case 'wind':
                this.createWindLayer(zoomCategory);
                break;
                
            case 'cloud':
                this.createCloudLayer(zoomCategory);
                break;
                
            case 'cities':
                // City labels have already been initialized in initWeatherControls
                // We just need to make them visible
                if (this.weatherLayers['cities']) {
                    this.weatherLayers['cities'].layers.forEach(id => {
                        if (map.getLayer(id)) {
                            map.setLayoutProperty(id, 'visibility', 'visible');
                        }
                    });
                    this.weatherLayers['cities'].visibility = 'visible';
                } else {
                    this.initCityLabels();
                }
                break;
                
            case 'hurricane':
                try {
                    // Fetch hurricane data
                    fetch('/api/weather/hurricane')
                        .then(response => response.json())
                        .then(data => {
                            this.weatherData.hurricanes = data;
                            this.createHurricaneLayer(data, zoomCategory);
                            console.log('Hurricane layer created with real-time data');
                        })
                        .catch(error => {
                            console.error('Failed to fetch hurricane data:', error);
                            // Create layer with sample data if API fails
                            this.createHurricaneLayer([], zoomCategory);
                        });
                } catch (e) {
                    console.error('Error creating hurricane layer:', e);
                    I.error('Error loading hurricane data');
                }
                break;
                
            case 'wildfire':
                try {
                    // Determine resolution based on zoom category
                    const resolution = zoomCategory === 'LOCAL' ? 'high' : 
                                      zoomCategory === 'REGIONAL' ? 'medium' : 'low';
                    
                    // Fetch wildfire data with appropriate resolution
                    fetch('/api/weather/wildfire', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            days: 1,
                            resolution: resolution
                        })
                    })
                        .then(response => response.json())
                        .then(data => {
                            this.weatherData.wildfires = data;
                            this.createWildfireLayer(data, zoomCategory);
                            console.log('Wildfire layer created with real-time data');
                        })
                        .catch(error => {
                            console.error('Failed to fetch wildfire data:', error);
                            // Create layer with sample data if API fails
                            this.createWildfireLayer([], zoomCategory);
                        });
                } catch (e) {
                    console.error('Error creating wildfire layer:', e);
                    I.error('Error loading wildfire data');
                }
                break;
                
            case 'disaster':
                try {
                    // Determine detail level based on zoom category
                    const detailLevel = zoomCategory === 'LOCAL' ? 'full' : 
                                      zoomCategory === 'REGIONAL' ? 'medium' : 'basic';
                    
                    // Fetch disaster data with appropriate detail level
                    fetch('/api/weather/disasters', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ detailLevel })
                    })
                        .then(response => response.json())
                        .then(data => {
                            this.weatherData.disasters = data;
                            this.createDisasterLayer(data, zoomCategory);
                            console.log('Natural disaster layer created with real-time data');
                        })
                        .catch(error => {
                            console.error('Failed to fetch disaster data:', error);
                            // Create layer with sample data if API fails
                            this.createDisasterLayer([], zoomCategory);
                        });
                } catch (e) {
                    console.error('Error creating disaster layer:', e);
                    I.error('Error loading disaster data');
                }
                break;
                
            // Forecast layers
            case 'forecastTemp':
            case 'forecastPrecip':
            case 'forecastWind':
                this.createForecastLayer(layerId, zoomCategory);
                break;
                
            default:
                console.warn(`Unknown layer type: ${layerId}`);
        }

        // Update the UI to show the layer as active
        const toggle = document.getElementById(`layerToggle_${layerId}`);
        if (toggle) {
            toggle.classList.add('active');
        }

        // Queue prefetch for adjacent areas
        if (this.currentViewport.bounds) {
            this.queueTilePrefetch();
        }
    }
    
    /**
     * Create temperature layer with improved visualization
     * @param {string} zoomCategory - Current zoom category (GLOBAL, REGIONAL, LOCAL)
     */
    static createTemperatureLayer(zoomCategory) {
        if (!zoomCategory) {
            zoomCategory = this.getZoomCategory(this.currentZoomLevel || map.getZoom());
        }
        
        console.log(`Creating temperature layer for ${zoomCategory} view`);
        
        try {
            // Clean up any existing temperature layers to avoid duplicates
            this.weatherLayers['temperature']?.layers?.forEach(id => {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            });
            
            const layerIds = [];
            
            // Choose the appropriate visualization technique based on zoom level
            switch (zoomCategory) {
                case 'GLOBAL':
                    // For global view, use a simpler/lower-resolution visualization
                    // that focuses on major global temperature patterns
                    this.createGlobalTemperatureLayer(layerIds);
                    break;
                    
                case 'REGIONAL':
                    // For regional view, use a medium-resolution visualization
                    // that shows more detailed regional patterns
                    this.createRegionalTemperatureLayer(layerIds);
                    break;
                    
                case 'LOCAL':
                    // For local view, use a high-resolution visualization
                    // that shows detailed local temperature variations
                    this.createLocalTemperatureLayer(layerIds);
                    break;
                    
                default:
                    // Fallback to global view
                    this.createGlobalTemperatureLayer(layerIds);
            }
            
            // Track in our weatherLayers object
            this.weatherLayers['temperature'] = {
                visibility: 'visible',
                type: 'temperature',
                zoomCategory: zoomCategory,
                layers: layerIds
            };
            
            console.log(`Temperature layer created successfully for ${zoomCategory} view`);
        } catch (e) {
            console.error('Error creating temperature layer:', e);
            I.error('Error loading temperature layer');
            
            // Try to create a fallback layer if all else fails
            this.createFallbackTemperatureLayer({
                weather: { temperature: 25 },
                location: { lat: 0, lon: 0 }
            });
        }
    }
    
    /**
     * Create global temperature visualization (zoom levels 0-3)
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static createGlobalTemperatureLayer(layerIds) {
        // Use lower-resolution tiles for global view
        const sourceId = 'temperature-global-tiles';
        
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'raster',
                tiles: [
                    'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                ],
                tileSize: 256,
                attribution: '© OpenWeatherMap'
            });
        }
        
        // Add the main temperature raster layer
        const layerId = 'temperature-global-layer';
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.6,
                'raster-fade-duration': 0,
                // Global view: Lower contrast to show major patterns
                'raster-contrast': 0.2,
                'raster-brightness-max': 0.85
            }
        });
        layerIds.push(layerId);
        
        // Optionally add major climate zone boundaries for global context
        this.addMajorClimateZones(layerIds);
    }
    
    /**
     * Create regional temperature visualization (zoom levels 3-8)
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static createRegionalTemperatureLayer(layerIds) {
        // Use medium-resolution tiles for regional view
        const sourceId = 'temperature-regional-tiles';
        
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'raster',
                tiles: [
                    // Use a different endpoint for regional view with higher detail
                    'https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=6c14f64dcf8546cad54c8a33c52bd577&fill_bound=true'
                ],
                tileSize: 256,
                attribution: '© OpenWeatherMap'
            });
        }
        
        // Add the main temperature raster layer
        const layerId = 'temperature-regional-layer';
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.7,
                'raster-fade-duration': 0,
                // Regional view: Medium contrast to show regional patterns
                'raster-contrast': 0.4,
                'raster-brightness-max': 0.9
            }
        });
        layerIds.push(layerId);
        
        // Add regional gradient contours for better visualization
        this.addRegionalTemperatureContours(layerIds);
    }
    
    /**
     * Create local temperature visualization (zoom levels 8+)
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static createLocalTemperatureLayer(layerIds) {
        // For local view, use higher-resolution temperature data
        const sourceId = 'temperature-local-tiles';
        
        if (!map.getSource(sourceId)) {
            // For high-resolution local view
            try {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [
                        // Use the best available resolution for local view
                        'https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=6c14f64dcf8546cad54c8a33c52bd577&fill_bound=true&opacity=0.9'
                    ],
                    tileSize: 256,
                    attribution: '© OpenWeatherMap'
                });
            } catch (e) {
                console.error('Failed to add local temperature tiles, falling back:', e);
                // Fallback if primary source fails
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [
                        'https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                    ],
                    tileSize: 256,
                    attribution: '© OpenWeatherMap'
                });
            }
        }
        
        // Add main temperature layer with higher contrast for local details
        const layerId = 'temperature-local-layer';
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.8,
                'raster-fade-duration': 0,
                // Local view: Higher contrast to show detailed patterns
                'raster-contrast': 0.5,
                'raster-brightness-max': 0.95
            }
        });
        layerIds.push(layerId);
        
        // Add high-resolution temperature contours
        this.addLocalTemperatureContours(layerIds);
        
        // For city-level zoom, add point temperature data
        if (map.getZoom() >= 10) {
            this.addLocalTemperaturePoints(layerIds);
        }
    }
    
    /**
     * Add major climate zone boundaries for global context
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addMajorClimateZones(layerIds) {
        // Simplified climate zones (equatorial, tropical, temperate, polar)
        const climateZones = [
            { lat: 0, label: 'Equator', color: '#FFFFFF' },
            { lat: 23.5, label: 'Tropic of Cancer', color: '#FFFF00' },
            { lat: -23.5, label: 'Tropic of Capricorn', color: '#FFFF00' },
            { lat: 66.5, label: 'Arctic Circle', color: '#00FFFF' },
            { lat: -66.5, label: 'Antarctic Circle', color: '#00FFFF' }
        ];
        
        // Create a source for climate zones
        const sourceId = 'climate-zones-source';
        if (!map.getSource(sourceId)) {
            // Create lines for each climate zone
            const features = climateZones.map(zone => {
                const points = [];
                for (let lon = -180; lon <= 180; lon += 5) {
                    points.push([lon, zone.lat]);
                }
                
                return {
                    type: 'Feature',
                    properties: {
                        name: zone.label,
                        color: zone.color
                    },
                    geometry: {
                        type: 'LineString',
                        coordinates: points
                    }
                };
            });
            
            map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                }
            });
        }
        
        // Add climate zone lines
        const linesLayerId = 'climate-zones-lines';
        map.addLayer({
            id: linesLayerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': ['get', 'color'],
                'line-width': 1,
                'line-opacity': 0.6,
                'line-dasharray': [2, 2]
            }
        });
        layerIds.push(linesLayerId);
        
        // Add climate zone labels
        const labelsLayerId = 'climate-zones-labels';
        map.addLayer({
            id: labelsLayerId,
            type: 'symbol',
            source: sourceId,
            layout: {
                'text-field': ['get', 'name'],
                'text-size': 12,
                'text-anchor': 'right',
                'text-offset': [5, 0],
                'text-allow-overlap': false,
                'symbol-placement': 'point'
            },
            paint: {
                'text-color': ['get', 'color'],
                'text-halo-color': 'rgba(0, 0, 0, 0.7)',
                'text-halo-width': 1.5
            }
        });
        layerIds.push(labelsLayerId);
    }
    
    /**
     * Add regional temperature contours for better visualization
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addRegionalTemperatureContours(layerIds) {
        // For regional view, we add temperature contour lines
        // This is a simplified example - in a real implementation, 
        // these would be generated from actual temperature data
        
        // For demonstration, we'll skip actual implementation
        // but in a real system, this would add intermediate detail elements
        console.log('Regional temperature contours would be added here');
    }
    
    /**
     * Add high-resolution temperature contours for local view
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addLocalTemperatureContours(layerIds) {
        // For local view, we would add detailed temperature contours
        // This is a simplified example - in a real implementation,
        // these would be generated from high-resolution temperature data
        
        // For demonstration, we'll skip actual implementation
        // but in a real system, this would add detailed local elements
        console.log('Local temperature contours would be added here');
    }
    
    /**
     * Add point-based temperature data for local zoom levels
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addLocalTemperaturePoints(layerIds) {
        // For high-zoom local view, add point-based temperature measurements
        // This creates a more detailed local visualization
        
        // Use the bounds of the current view to get temperature points
        const bounds = map.getBounds();
        const center = map.getCenter();
        
        // Create a random grid of temperature points within view bounds
        const points = [];
        for (let i = 0; i < 30; i++) {
            // Create random points within the current bounds
            const lon = bounds._sw.lng + Math.random() * (bounds._ne.lng - bounds._sw.lng);
            const lat = bounds._sw.lat + Math.random() * (bounds._ne.lat - bounds._sw.lat);
            
            // Generate a temperature value with local variations
            // Distance-based variation from center to create realistic patterns
            const distance = Math.sqrt(
                Math.pow(lon - center.lng, 2) + 
                Math.pow(lat - center.lat, 2)
            );
            
            // Base temperature adjusted by distance and random variation
            const baseTemp = 25 - (distance * 50); // Cooler as you move away from center
            const variation = Math.random() * 3 - 1.5; // +/- 1.5 degrees random variation
            const temperature = Math.round((baseTemp + variation) * 10) / 10;
            
            points.push({
                type: 'Feature',
                properties: {
                    temperature: temperature
                },
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat]
                }
            });
        }
        
        // Add a source for the temperature points
        const sourceId = 'temperature-points-source';
        if (map.getSource(sourceId)) {
            map.getSource(sourceId).setData({
                type: 'FeatureCollection',
                features: points
            });
        } else {
            map.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: points
                }
            });
        }
        
        // Add a heat map layer for local temperature visualization
        const heatLayerId = 'temperature-points-heat';
        map.addLayer({
            id: heatLayerId,
            type: 'heatmap',
            source: sourceId,
            paint: {
                // Weight by temperature
                'heatmap-weight': [
                    'interpolate', ['linear'], ['get', 'temperature'],
                    0, 0,
                    40, 1
                ],
                // Adjust radius by zoom
                'heatmap-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    10, 15,
                    15, 25
                ],
                // Color gradient
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0,0,255,0)',
                    0.2, 'rgb(0,0,255)',
                    0.4, 'rgb(0,255,255)',
                    0.6, 'rgb(0,255,0)',
                    0.8, 'rgb(255,255,0)',
                    1, 'rgb(255,0,0)'
                ],
                'heatmap-opacity': 0.7
            }
        });
        layerIds.push(heatLayerId);
        
        // Add point markers with temperature values
        const pointsLayerId = 'temperature-points-values';
        map.addLayer({
            id: pointsLayerId,
            type: 'symbol',
            source: sourceId,
            minzoom: 11, // Only show text at very high zoom
            layout: {
                'text-field': [
                    'concat',
                    ['to-string', ['round', ['get', 'temperature']]],
                    '°'
                ],
                'text-font': ['Open Sans Bold'],
                'text-size': 10,
                'text-allow-overlap': false
            },
            paint: {
                'text-color': '#FFFFFF',
                'text-halo-color': 'rgba(0, 0, 0, 0.7)',
                'text-halo-width': 1
            }
        });
        layerIds.push(pointsLayerId);
    }

    /**
     * Add a marker for a specific location's temperature
     */
    static addLocationTemperatureMarker(data) {
        try {
            console.log('Adding specific location temperature marker');
            
            // If city labels are already active, don't add a duplicate marker
            if (this.activeWeatherLayers['cities']) {
                console.log('City labels are already active, skipping location temperature marker');
                I.info('City temperatures are already shown on the map');
                return;
            }
            
            // Clean up any existing location markers
            if (this.weatherLayers['temperature-location'] && this.weatherLayers['temperature-location'].layers) {
                this.weatherLayers['temperature-location'].layers.forEach(layerId => {
                    if (map.getLayer(layerId)) {
                        map.removeLayer(layerId);
                    }
                });
                
                if (map.getSource('temperature-location-source')) {
                    map.removeSource('temperature-location-source');
                }
            }
            
            // Add a source for the specific location data
            map.addSource('temperature-location-source', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {
                        temperature: data.weather.temperature,
                        location: data.location.name
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [data.location.lon, data.location.lat]
                    }
                }
            });
            
            // Add a circle layer for the specific location
            const locationLayerId = 'temperature-location-layer';
            map.addLayer({
                id: locationLayerId,
                type: 'circle',
                source: 'temperature-location-source',
                paint: {
                    'circle-radius': 15,
                    'circle-color': this.getTemperatureColor(data.weather.temperature),
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#FFFFFF'
                }
            });
            
            // Add a label for the specific location
            const locationLabelId = 'temperature-location-label';
            map.addLayer({
                id: locationLabelId,
                type: 'symbol',
                source: 'temperature-location-source',
                layout: {
                    'text-field': `${this.getFormattedTemperature(data.weather.temperature)}\n${data.location.name}`,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': 14,
                    'text-allow-overlap': true,
                    'text-offset': [0, -2]
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': 'rgba(0, 0, 0, 0.7)',
                    'text-halo-width': 1.5
                }
            });
            
            // Store reference to location-specific layers
            this.weatherLayers['temperature-location'] = {
                visibility: 'visible',
                layers: [locationLayerId, locationLabelId]
            };
            
            console.log('Location temperature marker added successfully');
            
        } catch (e) {
            console.error('Error adding location temperature marker:', e);
        }
    }
    
    /**
     * Create a fallback temperature layer when main methods fail
     * @param {Object} data - Basic temperature data for fallback
     */
    static createFallbackTemperatureLayer(data) {
        console.log('Creating fallback temperature layer', data);
        
        try {
            // Clean up any existing temperature layers to avoid duplicates
            this.weatherLayers['temperature']?.layers?.forEach(id => {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            });
            
            // Create a simple temperature layer with a single color fill
            const layerIds = [];
            
            // Add a simple global temperature fill as fallback
            const sourceId = 'temperature-fallback-source';
            
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: {
                            type: 'Polygon',
                            coordinates: [[
                                [-180, -90],
                                [180, -90],
                                [180, 90],
                                [-180, 90],
                                [-180, -90]
                            ]]
                        },
                        properties: {
                            temperature: data?.weather?.temperature || 25
                        }
                    }
                });
            }
            
            // Add a simple layer with temperature-based color
            const layerId = 'temperature-fallback-layer';
            map.addLayer({
                id: layerId,
                type: 'fill',
                source: sourceId,
                paint: {
                    'fill-color': [
                        'interpolate',
                        ['linear'],
                        ['get', 'temperature'],
                        -20, '#0000FF', // Cold (blue)
                        0, '#00FFFF',   // Freezing (cyan)
                        10, '#00FF00',  // Cool (green)
                        20, '#FFFF00',  // Warm (yellow)
                        30, '#FF0000',  // Hot (red)
                        40, '#800000'   // Very hot (dark red)
                    ],
                    'fill-opacity': 0.3
                }
            });
            layerIds.push(layerId);
            
            // Add text to indicate this is a fallback
            map.addLayer({
                id: 'temperature-fallback-text',
                type: 'symbol',
                source: sourceId,
                layout: {
                    'text-field': 'Fallback Temperature Layer',
                    'text-size': 24,
                    'text-offset': [0, 0],
                    'text-anchor': 'center',
                    'text-justify': 'center'
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': '#000000',
                    'text-halo-width': 2
                }
            });
            layerIds.push('temperature-fallback-text');
            
            // Track in our weatherLayers object
            this.weatherLayers['temperature'] = {
                visibility: 'visible',
                type: 'temperature',
                fallback: true,
                layers: layerIds
            };
            
            console.log('Fallback temperature layer created');
            I.warning('Using simplified temperature layer');
        } catch (e) {
            console.error('Error creating fallback temperature layer:', e);
            I.error('Failed to create even a fallback temperature layer');
        }
    }

    /**
     * Get color based on temperature
     * @param {number} temperature - Temperature in Celsius
     * @returns {string} - Color in hex or rgba format
     */
    static getTemperatureColor(temperature) {
        // Define color ranges for different temperatures
        if (temperature <= -20) return '#0022FF';  // Deep blue for extremely cold
        if (temperature <= -10) return '#0044FF';  // Very cold (blue)
        if (temperature <= 0) return '#0066FF';    // Cold (lighter blue)
        if (temperature <= 5) return '#00AAFF';    // Cool (light blue)
        if (temperature <= 10) return '#00FFFF';   // Cool (cyan)
        if (temperature <= 15) return '#00FFAA';   // Mild (teal)
        if (temperature <= 20) return '#AAFF00';   // Mild (lime)
        if (temperature <= 25) return '#FFFF00';   // Warm (yellow)
        if (temperature <= 30) return '#FFAA00';   // Hot (orange)
        if (temperature <= 35) return '#FF6600';   // Very hot (dark orange)
        return '#FF0000';                         // Extremely hot (red)
    }

    /**
     * Update the timeline position
     * @param {number} value - Timeline position value
     */
    static updateTimelinePosition(value) {
        this.timeSliderValue = parseInt(value);
        console.log(`Timeline position updated to ${this.timeSliderValue}`);
        
        // Update time display
        this.updateTimeDisplay(this.timeSliderValue);
    }

    /**
     * Update the time display
     * @param {number} timeIndex - Index of the time step
     */
    static updateTimeDisplay(timeIndex) {
        const timeDisplay = document.getElementById('timeDisplay');
        if (!timeDisplay) return;
        
        if (timeIndex === 0) {
            timeDisplay.innerHTML = 'Now';
        } else {
            timeDisplay.innerHTML = `+${timeIndex * 3}h`;
        }
    }

    /**
     * Toggle timeline playback
     */
    static toggleTimelinePlayback() {
        const playBtn = document.getElementById('timeControlPlayBtn');
        if (!playBtn) return;
        
        if (this.isPlaying) {
            // Stop playback
            clearInterval(this.playInterval);
            this.isPlaying = false;
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        } else {
            // Start playback
            this.isPlaying = true;
            playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            
            this.playInterval = setInterval(() => {
                let nextValue = (this.timeSliderValue + 1) % 5;
                const timeSlider = document.getElementById('timeSlider');
                if (timeSlider) {
                    timeSlider.value = nextValue;
                    this.updateTimelinePosition(nextValue);
                }
            }, 2000);
        }
    }

    /**
     * Create precipitation layer with improved visualization
     * @param {string} zoomCategory - Current zoom category (GLOBAL, REGIONAL, LOCAL)
     */
    static createPrecipitationLayer(zoomCategory) {
        if (!zoomCategory) {
            zoomCategory = this.getZoomCategory(this.currentZoomLevel || map.getZoom());
        }
        
        console.log(`Creating precipitation layer for ${zoomCategory} view`);
        
        try {
            // Clean up any existing precipitation layers to avoid duplicates
            this.weatherLayers['precipitation']?.layers?.forEach(id => {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            });
            
            const layerIds = [];
            
            // Choose the appropriate visualization technique based on zoom level
            switch (zoomCategory) {
                case 'GLOBAL':
                    // For global view, use a simpler/lower-resolution visualization
                    this.createGlobalPrecipitationLayer(layerIds);
                    break;
                    
                case 'REGIONAL':
                    // For regional view, use a medium-resolution visualization
                    this.createRegionalPrecipitationLayer(layerIds);
                    break;
                    
                case 'LOCAL':
                    // For local view, use a high-resolution visualization
                    this.createLocalPrecipitationLayer(layerIds);
                    break;
                    
                default:
                    // Fallback to global view
                    this.createGlobalPrecipitationLayer(layerIds);
            }
            
            // Track in our weatherLayers object
            this.weatherLayers['precipitation'] = {
                visibility: 'visible',
                type: 'precipitation',
                zoomCategory: zoomCategory,
                layers: layerIds
            };
            
            console.log(`Precipitation layer created successfully for ${zoomCategory} view`);
        } catch (e) {
            console.error('Error creating precipitation layer:', e);
            I.error('Error loading precipitation layer');
        }
    }
    
    /**
     * Create global precipitation visualization (zoom levels 0-3)
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static createGlobalPrecipitationLayer(layerIds) {
        // Use lower-resolution tiles for global view
        const sourceId = 'precipitation-global-tiles';
        
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'raster',
                tiles: [
                    'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                ],
                tileSize: 256,
                attribution: '© OpenWeatherMap'
            });
        }
        
        // Add the main precipitation raster layer
        const layerId = 'precipitation-global-layer';
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.6,
                'raster-fade-duration': 0
            }
        });
        layerIds.push(layerId);
        
        // Optionally add major precipitation patterns for global context
        this.addGlobalPrecipitationPatterns(layerIds);
    }
    
    /**
     * Create regional precipitation visualization (zoom levels 3-8)
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static createRegionalPrecipitationLayer(layerIds) {
        // Use medium-resolution tiles for regional view
        const sourceId = 'precipitation-regional-tiles';
        
        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'raster',
                tiles: [
                    // Alternative endpoint for regional view
                    'https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=6c14f64dcf8546cad54c8a33c52bd577&fill_bound=true'
                ],
                tileSize: 256,
                attribution: '© OpenWeatherMap'
            });
        }
        
        // Add the main precipitation raster layer
        const layerId = 'precipitation-regional-layer';
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.7,
                'raster-fade-duration': 0
            }
        });
        layerIds.push(layerId);
        
        // Add regional precipitation patterns
        this.addRegionalPrecipitationPatterns(layerIds);
    }
    
    /**
     * Create local precipitation visualization (zoom levels 8+)
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static createLocalPrecipitationLayer(layerIds) {
        // For local view, use higher-resolution precipitation data
        const sourceId = 'precipitation-local-tiles';
        
        if (!map.getSource(sourceId)) {
            try {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [
                        // Use the best available resolution for local view
                        'https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=6c14f64dcf8546cad54c8a33c52bd577&fill_bound=true&opacity=0.9'
                    ],
                    tileSize: 256,
                    attribution: '© OpenWeatherMap'
                });
            } catch (e) {
                console.error('Failed to add local precipitation tiles, falling back:', e);
                // Fallback if primary source fails
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: [
                        'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                    ],
                    tileSize: 256,
                    attribution: '© OpenWeatherMap'
                });
            }
        }
        
        // Add main precipitation layer with higher opacity for local details
        const layerId = 'precipitation-local-layer';
        map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
                'raster-opacity': 0.8,
                'raster-fade-duration': 0
            }
        });
        layerIds.push(layerId);
        
        // Add high-resolution precipitation patterns
        this.addLocalPrecipitationPatterns(layerIds);
        
        // For city-level zoom, add radar animation if available
        if (map.getZoom() >= 10) {
            this.addLocalPrecipitationRadar(layerIds);
        }
    }
    
    /**
     * Add major global precipitation patterns
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addGlobalPrecipitationPatterns(layerIds) {
        // Add global precipitation patterns (ITCZ, major monsoon regions)
        // This is a simplified example - in a real implementation,
        // these would be generated from actual precipitation data or climate zones
        console.log('Global precipitation patterns would be added here');
    }
    
    /**
     * Add regional precipitation patterns
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addRegionalPrecipitationPatterns(layerIds) {
        // For regional view, add more detailed precipitation patterns
        // This is a simplified example - in a real implementation,
        // these would show more regional detail like storm systems
        console.log('Regional precipitation patterns would be added here');
    }
    
    /**
     * Add high-resolution precipitation patterns for local view
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addLocalPrecipitationPatterns(layerIds) {
        // For local view, add detailed precipitation patterns
        // This is a simplified example - in a real implementation,
        // these would be highly detailed local precipitation
        console.log('Local precipitation patterns would be added here');
    }
    
    /**
     * Add radar animation for local precipitation at high zoom levels
     * @param {Array} layerIds - Array to store created layer IDs
     */
    static addLocalPrecipitationRadar(layerIds) {
        // For high-zoom local view, add animated radar data if available
        console.log('Local precipitation radar would be added here for high zoom levels');
        
        // In a real implementation, this would add an animated sequence
        // of radar images for the current view area
    }

    /**
     * Create precipitation visualization layer
     */
    static createPrecipitationLayer() {
        try {
            // Clean up any existing precipitation layers to avoid duplicates
            this.weatherLayers['precipitation']?.layers?.forEach(id => {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            });
            
            // Create precipitation layer using OpenWeatherMap tiles
            if (!map.getSource('precipitation-tiles')) {
                map.addSource('precipitation-tiles', {
                    type: 'raster',
                    tiles: [
                        'https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                    ],
                    tileSize: 256,
                    attribution: '© OpenWeatherMap'
                });
            }
            
            // Add raster layer for precipitation visualization
            map.addLayer({
                id: 'precipitation-layer',
                type: 'raster',
                source: 'precipitation-tiles',
                paint: {
                    'raster-opacity': 0.7
                }
            });
            
            // Track in our weatherLayers object
            this.weatherLayers['precipitation'] = {
                visibility: 'visible',
                type: 'precipitation',
                layers: ['precipitation-layer']
            };
            
            console.log('Precipitation layer created successfully');
        } catch (e) {
            console.error('Error creating precipitation layer:', e);
            I.error('Error loading precipitation layer');
        }
    }
    
    /**
     * Get a readable description of precipitation
     * @param {string} description - Weather description
     * @param {number} level - Precipitation level
     * @returns {string} - Human-readable description
     */
    static getPrecipitationDescription(description, level) {
        if (level <= 0) return 'No precipitation';
        if (level < 0.3) return 'Light precipitation';
        if (level < 0.6) return 'Moderate precipitation';
        return 'Heavy precipitation';
    }

    /**
     * Create wind visualization layer
     */
    static createWindLayer(zoomCategory) {
        console.log('Creating wind layer');
        
        try {
            // Clean up any existing wind layers
            this.weatherLayers['wind']?.layers?.forEach(id => {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            });
            
            // Use OpenWeatherMap wind tiles for accurate visualization
            if (!map.getSource('wind-tiles')) {
                try {
                    map.addSource('wind-tiles', {
                        type: 'raster',
                        tiles: [
                            'https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                        ],
                        tileSize: 256,
                        attribution: '© OpenWeatherMap'
                    });
                    console.log('Wind tile source added successfully');
                } catch (e) {
                    console.error('Failed to add wind tile source:', e);
                    // Attempt alternative endpoint if primary fails
                    try {
                        map.addSource('wind-tiles', {
                            type: 'raster',
                            tiles: [
                                'https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=6c14f64dcf8546cad54c8a33c52bd577&fill_bound=true'
                            ],
                            tileSize: 256,
                            attribution: '© OpenWeatherMap'
                        });
                        console.log('Alternative wind tile source added');
                    } catch (err) {
                        console.error('Failed to add alternative wind tile source:', err);
                        throw err;
                    }
                }
            }
            
            // Add wind raster layer for global visualization
            map.addLayer({
                id: 'wind-layer',
                type: 'raster',
                source: 'wind-tiles',
                paint: {
                    'raster-opacity': 0.8,
                    'raster-fade-duration': 0
                }
            });
            
            // Track in our weatherLayers object
            this.weatherLayers['wind'] = {
                visibility: 'visible',
                type: 'wind',
                layers: ['wind-layer']
            };
            
            console.log('Wind layer created successfully with real-time data');
        } catch (e) {
            console.error('Error creating wind layer:', e);
            I.error('Error loading wind layer');
        }
    }
    
    /**
     * Create cloud visualization layer
     */
    static createCloudLayer(zoomCategory) {
        console.log('Creating cloud layer');
        
        try {
            // Clean up any existing cloud layers
            this.weatherLayers['cloud']?.layers?.forEach(id => {
                if (map.getLayer(id)) map.removeLayer(id);
                if (map.getSource(id)) map.removeSource(id);
            });
            
            // Use OpenWeatherMap cloud tiles for accurate visualization
            if (!map.getSource('cloud-tiles')) {
                try {
                    map.addSource('cloud-tiles', {
                        type: 'raster',
                        tiles: [
                            'https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=6c14f64dcf8546cad54c8a33c52bd577'
                        ],
                        tileSize: 256,
                        attribution: '© OpenWeatherMap'
                    });
                    console.log('Cloud tile source added successfully');
                } catch (e) {
                    console.error('Failed to add cloud tile source:', e);
                    // Attempt alternative endpoint if primary fails
                    try {
                        map.addSource('cloud-tiles', {
                            type: 'raster',
                            tiles: [
                                'https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=6c14f64dcf8546cad54c8a33c52bd577&fill_bound=true'
                            ],
                            tileSize: 256,
                            attribution: '© OpenWeatherMap'
                        });
                        console.log('Alternative cloud tile source added');
                    } catch (err) {
                        console.error('Failed to add alternative cloud tile source:', err);
                        throw err;
                    }
                }
            }
            
            // Add cloud raster layer for global visualization
            map.addLayer({
                id: 'cloud-layer',
                type: 'raster',
                source: 'cloud-tiles',
                paint: {
                    'raster-opacity': 0.8,
                    'raster-fade-duration': 0
                }
            });
            
            // Track in our weatherLayers object
            this.weatherLayers['cloud'] = {
                visibility: 'visible',
                type: 'cloud',
                layers: ['cloud-layer']
            };
            
            console.log('Cloud layer created successfully with real-time data');
        } catch (e) {
            console.error('Error creating cloud layer:', e);
            I.error('Error loading cloud layer');
        }
    }
    
    /**
     * Convert Celsius to Fahrenheit
     * @param {number} celsius - Temperature in Celsius
     * @returns {number} - Temperature in Fahrenheit
     */
    static celsiusToFahrenheit(celsius) {
        return Math.round((celsius * 9/5) + 32);
    }
    
    /**
     * Get formatted temperature string
     * @param {number} celsius - Temperature in Celsius
     * @returns {string} - Formatted temperature string in Fahrenheit
     */
    static getFormattedTemperature(celsius) {
        const fahrenheit = this.celsiusToFahrenheit(celsius);
        return `${fahrenheit}`; // Removed °F to match zoom.earth style
    }
    
    /**
     * Initialize city labels on the map
     */
    static initCityLabels() {
        // Major world cities with coordinates and population thresholds
        // This is a simplified dataset of major world cities
        const majorCities = [
            { name: "New York", coordinates: [-74.0060, 40.7128], population: 8419000, country: "USA", temp: 77 },
            { name: "Los Angeles", coordinates: [-118.2437, 34.0522], population: 3980000, country: "USA", temp: 85 },
            { name: "Chicago", coordinates: [-87.6298, 41.8781], population: 2694000, country: "USA", temp: 68 },
            { name: "Houston", coordinates: [-95.3698, 29.7604], population: 2320000, country: "USA", temp: 95 },
            { name: "London", coordinates: [-0.1278, 51.5074], population: 8982000, country: "UK", temp: 59 },
            { name: "Tokyo", coordinates: [139.6917, 35.6895], population: 13960000, country: "Japan", temp: 72 },
            { name: "Delhi", coordinates: [77.1025, 28.7041], population: 16787000, country: "India", temp: 98 },
            { name: "Shanghai", coordinates: [121.4737, 31.2304], population: 27058000, country: "China", temp: 77 },
            { name: "São Paulo", coordinates: [-46.6333, -23.5505], population: 22043000, country: "Brazil", temp: 72 },
            { name: "Mexico City", coordinates: [-99.1332, 19.4326], population: 9209944, country: "Mexico", temp: 75 },
            { name: "Cairo", coordinates: [31.2357, 30.0444], population: 20484965, country: "Egypt", temp: 97 },
            { name: "Beijing", coordinates: [116.4074, 39.9042], population: 21540000, country: "China", temp: 75 },
            { name: "Mumbai", coordinates: [72.8777, 19.0760], population: 20411274, country: "India", temp: 87 },
            { name: "Moscow", coordinates: [37.6173, 55.7558], population: 12537954, country: "Russia", temp: 51 },
            { name: "Paris", coordinates: [2.3522, 48.8566], population: 11017000, country: "France", temp: 63 },
            { name: "Sydney", coordinates: [151.2093, -33.8688], population: 5312000, country: "Australia", temp: 61 },
            { name: "Berlin", coordinates: [13.4050, 52.5200], population: 3748000, country: "Germany", temp: 61 },
            { name: "Madrid", coordinates: [-3.7038, 40.4168], population: 6642000, country: "Spain", temp: 78 },
            { name: "Johannesburg", coordinates: [28.0473, -26.2041], population: 5782747, country: "South Africa", temp: 66 },
            { name: "Toronto", coordinates: [-79.3832, 43.6532], population: 6255000, country: "Canada", temp: 63 },
            { name: "Singapore", coordinates: [103.8198, 1.3521], population: 5850000, country: "Singapore", temp: 90 },
            { name: "Bangkok", coordinates: [100.5018, 13.7563], population: 10539000, country: "Thailand", temp: 91 },
            { name: "Jakarta", coordinates: [106.8456, -6.2088], population: 10562000, country: "Indonesia", temp: 87 },
            { name: "Lima", coordinates: [-77.0428, -12.0464], population: 10750000, country: "Peru", temp: 68 },
            { name: "Istanbul", coordinates: [28.9784, 41.0082], population: 15460000, country: "Turkey", temp: 79 },
            { name: "Seoul", coordinates: [126.9780, 37.5665], population: 9776000, country: "South Korea", temp: 73 },
            { name: "Ho Chi Minh City", coordinates: [106.6297, 10.8231], population: 8993000, country: "Vietnam", temp: 89 },
            { name: "Lagos", coordinates: [3.3792, 6.5244], population: 21000000, country: "Nigeria", temp: 83 },
            { name: "Dhaka", coordinates: [90.4125, 23.8103], population: 21006000, country: "Bangladesh", temp: 92 },
            { name: "Karachi", coordinates: [67.0099, 24.8607], population: 16093000, country: "Pakistan", temp: 91 }
        ];

        try {
            console.log('Initializing city labels');
            
            // Remove any existing temperature disclaimer
            const existingDisclaimer = document.getElementById('temperatureDisclaimer');
            if (existingDisclaimer) {
                existingDisclaimer.remove();
            }
            
            // First, clean up all existing temperature and city layers to avoid duplicates
            // Remove any existing temperature-location layers
            if (this.weatherLayers['temperature-location'] && this.weatherLayers['temperature-location'].layers) {
                this.weatherLayers['temperature-location'].layers.forEach(layerId => {
                    if (map.getLayer(layerId)) {
                        map.removeLayer(layerId);
                    }
                });
                
                if (map.getSource('temperature-location-source')) {
                    map.removeSource('temperature-location-source');
                }
            }
            
            // Remove any existing city label layers
            const cityLayers = ['city-labels', 'city-points', 'city-temp-labels', 'city-name-labels'];
            cityLayers.forEach(layer => {
                if (map.getLayer(layer)) {
                    map.removeLayer(layer);
                }
            });
            
            // Remove city source if it exists
            if (map.getSource('city-labels-source')) {
                map.removeSource('city-labels-source');
            }
            
            // Create a single GeoJSON source for city data
            const features = majorCities.map(city => ({
                type: 'Feature',
                properties: {
                    name: city.name,
                    population: city.population,
                    country: city.country,
                    temp: city.temp
                },
                geometry: {
                    type: 'Point',
                    coordinates: city.coordinates
                }
            }));
            
            map.addSource('city-labels-source', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: features
                }
            });
            
            // Add a single layer for city labels with temperature
            map.addLayer({
                id: 'city-labels',
                type: 'symbol',
                source: 'city-labels-source',
                layout: {
                    'text-field': [
                        'format',
                        ['to-string', ['get', 'temp']], {'font-scale': 1.2},
                        '°',
                        '\n',
                        ['get', 'name'], {'font-scale': 0.8}
                    ],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 12,
                        6, 16,
                        10, 20
                    ],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true,
                    'visibility': 'visible'
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': 'rgba(0, 0, 0, 0.9)',
                    'text-halo-width': 2.5
                }
            });
            
            // Track only one city layer in our weatherLayers object
            this.weatherLayers['cities'] = {
                visibility: 'visible',
                layers: ['city-labels']
            };
            
            // Set active state
            this.activeWeatherLayers['cities'] = true;
            
            console.log('City labels initialized successfully');
            I.success('City labels loaded');
            
            // Center the map to show multiple cities
            map.flyTo({
                center: [0, 20],
                zoom: 1.5,
                duration: 2000
            });
            
        } catch (e) {
            console.error('Error initializing city labels:', e);
            I.error('Failed to initialize city labels');
        }
    }
    
    /**
     * Update which city labels are visible based on zoom level
     */
    static updateCityLabelsVisibility() {
        if (!this.activeWeatherLayers['cities']) return;
        
        try {
            const zoom = map.getZoom();
            
            // Ensure city labels layer exists
            if (!map.getLayer('city-labels')) return;
            
            // Remove any filter to show all cities
            map.setFilter('city-labels', null);
            
            // Log the current zoom level for debugging
            console.log('Current zoom level:', zoom);
            console.log('Showing all city labels regardless of zoom level');
            
            // Instead of filtering, we can adjust the text size if needed
            map.setLayoutProperty('city-labels', 'text-size', [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 12,     // At zoom level 0, text size is 12px
                2, 14,     // At zoom level 2, text size is 14px
                4, 16,     // At zoom level 4, text size is 16px
                6, 18,     // At zoom level 6, text size is 18px
                10, 20     // At zoom level 10, text size is 20px
            ]);
            
        } catch (e) {
            console.error('Error updating city labels visibility:', e);
        }
    }

    /**
     * Set up global error handling for tile loading errors
     */
    static setupTileErrorHandling() {
        if (!this.tileErrorHandlingSetup) {
            // Listen for tile errors on the map
            map.on('error', (e) => {
                // Check if it's a tile error
                if (e && e.error && e.error.status === 404 && e.sourceId && e.sourceId.includes('tiles')) {
                    console.warn(`Tile loading error for source ${e.sourceId}:`, e.error);
                    
                    // Try alternative endpoint if it's a tiles source
                    const sourceType = e.sourceId.split('-')[0]; // Get 'temperature', 'precipitation', etc.
                    if (this.weatherLayers[sourceType]) {
                        console.log(`Attempting to recreate ${sourceType} layer with alternative endpoint`);
                        // Remove layers and recreate
                        this.hideLayer(sourceType);
                        setTimeout(() => this.showLayer(sourceType), 1000);
                    }
                }
            });
            
            this.tileErrorHandlingSetup = true;
        }
    }

    /**
     * Initialize the tile manager
     */
    static initTileManager() {
        console.log('Initializing weather tile manager');
        
        // Set up viewport change tracking
        map.on('moveend', () => {
            this.updateViewport();
        });
        
        // Initial viewport setup
        this.updateViewport();
        
        // Set up error handling for tiles
        this.setupTileErrorHandling();
        
        console.log('Weather tile manager initialized');
    }
    
    /**
     * Update current viewport information
     */
    static updateViewport() {
        // Store previous viewport for comparison
        const previousViewport = { ...this.currentViewport };
        
        // Update current viewport data
        this.currentViewport = {
            bounds: map.getBounds(),
            center: map.getCenter(),
            zoom: map.getZoom()
        };
        
        // Check if we need to prefetch new tiles
        if (this.shouldPrefetchNewTiles(previousViewport)) {
            this.queueTilePrefetch();
        }
        
        // Update debug info if available
        if (this.debugMode && document.getElementById('weather-debug-info')) {
            this.updateDebugInfo();
        }
    }
    
    /**
     * Determine if we should prefetch new tiles based on viewport change
     * @param {Object} previousViewport - Previous viewport state
     * @returns {boolean} - Whether to prefetch new tiles
     */
    static shouldPrefetchNewTiles(previousViewport) {
        // If no previous viewport, always prefetch
        if (!previousViewport.bounds) return true;
        
        // Check zoom level change
        if (Math.abs(this.currentViewport.zoom - previousViewport.zoom) > 0.5) return true;
        
        // Check significant panning
        const prevCenter = previousViewport.center;
        const currCenter = this.currentViewport.center;
        const distance = Math.sqrt(
            Math.pow(prevCenter.lng - currCenter.lng, 2) +
            Math.pow(prevCenter.lat - currCenter.lat, 2)
        );
        
        // If moved more than 20% of the viewport, prefetch
        return distance > 0.2;
    }
    
    /**
     * Queue tile prefetching for areas adjacent to current viewport
     */
    static queueTilePrefetch() {
        // Clear existing queue
        this.prefetchQueue = [];
        
        // Get current bounds
        const bounds = this.currentViewport.bounds;
        const zoom = this.currentViewport.zoom;
        const zoomCategory = this.getZoomCategory(zoom);
        
        // Create extended bounds for prefetching (20% larger than current viewport)
        const sw = bounds._sw;
        const ne = bounds._ne;
        const width = ne.lng - sw.lng;
        const height = ne.lat - sw.lat;
        
        const extendedBounds = {
            west: sw.lng - width * 0.2,
            south: sw.lat - height * 0.2,
            east: ne.lng + width * 0.2,
            north: ne.lat + height * 0.2
        };
        
        // Queue prefetch for active layers
        Object.keys(this.activeWeatherLayers).forEach(layerId => {
            if (this.activeWeatherLayers[layerId]) {
                this.prefetchQueue.push({
                    layerId,
                    bounds: extendedBounds,
                    zoomCategory
                });
            }
        });
        
        // Start prefetching if not already in progress
        if (!this.prefetchInProgress) {
            this.processPrefetchQueue();
        }
    }
    
    /**
     * Process the prefetch queue
     */
    static processPrefetchQueue() {
        if (this.prefetchQueue.length === 0) {
            this.prefetchInProgress = false;
            return;
        }
        
        this.prefetchInProgress = true;
        const item = this.prefetchQueue.shift();
        
        // Prefetch tiles for the layer
        this.prefetchTiles(item.layerId, item.bounds, item.zoomCategory)
            .then(() => {
                // Process next item in queue
                setTimeout(() => this.processPrefetchQueue(), 100);
            })
            .catch(error => {
                console.error('Error prefetching tiles:', error);
                // Continue with next item despite error
                setTimeout(() => this.processPrefetchQueue(), 100);
            });
    }
    
    /**
     * Prefetch tiles for a specific layer
     * @param {string} layerId - ID of the layer to prefetch
     * @param {Object} bounds - Bounds to prefetch
     * @param {string} zoomCategory - Zoom category
     * @returns {Promise} - Promise that resolves when prefetching is complete
     */
    static prefetchTiles(layerId, bounds, zoomCategory) {
        return new Promise((resolve) => {
            // Check if this layer supports prefetching
            if (!['temperature', 'precipitation', 'wind', 'cloud'].includes(layerId)) {
                resolve();
                return;
            }
            
            console.log(`Prefetching ${layerId} tiles for ${zoomCategory} view`);
            
            // In a real implementation, we would make API requests to prefetch tiles
            // For now, we'll just simulate prefetching by adding to the cache
            
            // Create a cache key based on bounds and zoom
            const cacheKey = `${bounds.west.toFixed(2)},${bounds.south.toFixed(2)},${bounds.east.toFixed(2)},${bounds.north.toFixed(2)}_${zoomCategory}`;
            
            // Check if already in cache
            if (this.tileCache[layerId][cacheKey]) {
                console.log(`Using cached tiles for ${layerId} at ${cacheKey}`);
                resolve();
                return;
            }
            
            // Simulate network delay for prefetching
            setTimeout(() => {
                // Add to cache
                this.tileCache[layerId][cacheKey] = {
                    timestamp: Date.now(),
                    loaded: true
                };
                
                console.log(`Prefetched ${layerId} tiles for ${zoomCategory} view`);
                resolve();
            }, 200); // Simulate network delay
        });
    }
    
    /**
     * Get appropriate source URL for a weather layer based on zoom category
     * @param {string} layerId - Layer ID
     * @param {string} zoomCategory - Zoom category
     * @returns {string} - Source URL
     */
    static getSourceUrlForLayer(layerId, zoomCategory) {
        const apiKey = '6c14f64dcf8546cad54c8a33c52bd577'; // OpenWeatherMap API key
        
        // Base URLs for different layer types
        const baseUrls = {
            temperature: {
                GLOBAL: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
            },
            precipitation: {
                GLOBAL: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
            },
            wind: {
                GLOBAL: `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
            },
            cloud: {
                GLOBAL: `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
            }
        };
        
        // Return appropriate URL or fallback to global
        return baseUrls[layerId]?.[zoomCategory] || baseUrls[layerId]?.GLOBAL;
    }

    /**
     * Get tile metadata from server for a weather layer based on zoom category
     * @param {string} layerId - Layer ID
     * @param {string} zoomCategory - Zoom category
     * @param {Object} bounds - Optional viewport bounds
     * @returns {Promise<Object>} - Tile metadata
     */
    static async getTileMetadata(layerId, zoomCategory, bounds = null) {
        try {
            console.log(`Fetching tile metadata for ${layerId} at ${zoomCategory} zoom`);
            
            // Check cache first
            const cacheKey = `tiles_${layerId}_${zoomCategory}_${bounds ? JSON.stringify(bounds) : 'global'}`;
            if (this.tileCache[layerId] && this.tileCache[layerId][cacheKey]) {
                console.log(`Using cached tile metadata for ${layerId} at ${zoomCategory} zoom`);
                return this.tileCache[layerId][cacheKey];
            }
            
            // Fetch metadata from server
            const response = await fetch('/api/weather/tiles', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    layerType: layerId,
                    zoomCategory,
                    bounds
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }
            
            const metadata = await response.json();
            
            // Cache the metadata
            if (!this.tileCache[layerId]) {
                this.tileCache[layerId] = {};
            }
            this.tileCache[layerId][cacheKey] = metadata;
            
            console.log(`Tile metadata received for ${layerId} at ${zoomCategory} zoom:`, metadata);
            return metadata;
        } catch (error) {
            console.error(`Error fetching tile metadata for ${layerId}:`, error);
            
            // Fallback to hardcoded values if server request fails
            console.warn(`Using fallback tile metadata for ${layerId}`);
            
            const apiKey = '6c14f64dcf8546cad54c8a33c52bd577'; // OpenWeatherMap API key
            
            // Base URLs for different layer types (fallback)
            const baseUrls = {
                temperature: {
                    GLOBAL: `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                    REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                    LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/TA2/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
                },
                precipitation: {
                    GLOBAL: `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                    REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                    LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/PAC0/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
                },
                wind: {
                    GLOBAL: `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                    REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                    LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/WND/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
                },
                cloud: {
                    GLOBAL: `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${apiKey}`,
                    REGIONAL: `https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true`,
                    LOCAL: `https://maps.openweathermap.org/maps/2.0/weather/CL/{z}/{x}/{y}?appid=${apiKey}&fill_bound=true&opacity=0.9`
                }
            };
            
            // Return fallback metadata
            return {
                url: baseUrls[layerId]?.[zoomCategory] || baseUrls[layerId]?.GLOBAL,
                tileSize: 256,
                minZoom: zoomCategory === 'GLOBAL' ? 0 : (zoomCategory === 'REGIONAL' ? 3 : 8),
                maxZoom: zoomCategory === 'GLOBAL' ? 3 : (zoomCategory === 'REGIONAL' ? 8 : 22),
                resolution: zoomCategory === 'GLOBAL' ? 'low' : (zoomCategory === 'REGIONAL' ? 'medium' : 'high'),
                attribution: '© OpenWeatherMap',
                tileCoverage: null,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Create a transition layer to smooth between zoom levels
     * @param {string} layerId - Layer ID
     * @param {string} fromZoomCategory - Starting zoom category
     * @param {string} toZoomCategory - Target zoom category
     * @returns {Promise<Array>} - Array of transition layer IDs
     */
    static async createTransitionLayer(layerId, fromZoomCategory, toZoomCategory) {
        const transitionId = `${layerId}-transition-${fromZoomCategory}-${toZoomCategory}`;
        
        // Remove existing transition layer if it exists
        if (map.getLayer(`${transitionId}-from`)) {
            map.removeLayer(`${transitionId}-from`);
        }
        if (map.getLayer(`${transitionId}-to`)) {
            map.removeLayer(`${transitionId}-to`);
        }
        if (map.getSource(`${layerId}-${fromZoomCategory.toLowerCase()}-tiles`)) {
            map.removeSource(`${layerId}-${fromZoomCategory.toLowerCase()}-tiles`);
        }
        if (map.getSource(`${layerId}-${toZoomCategory.toLowerCase()}-tiles`)) {
            map.removeSource(`${layerId}-${toZoomCategory.toLowerCase()}-tiles`);
        }
        
        // Get metadata for both zoom categories
        const [fromMetadata, toMetadata] = await Promise.all([
            this.getTileMetadata(layerId, fromZoomCategory),
            this.getTileMetadata(layerId, toZoomCategory)
        ]);
        
        // Add source for 'from' zoom category
        const fromSourceId = `${layerId}-${fromZoomCategory.toLowerCase()}-tiles`;
        map.addSource(fromSourceId, {
            type: 'raster',
            tiles: [fromMetadata.url],
            tileSize: fromMetadata.tileSize,
            attribution: fromMetadata.attribution
        });
        
        // Add source for 'to' zoom category
        const toSourceId = `${layerId}-${toZoomCategory.toLowerCase()}-tiles`;
        map.addSource(toSourceId, {
            type: 'raster',
            tiles: [toMetadata.url],
            tileSize: toMetadata.tileSize,
            attribution: toMetadata.attribution
        });
        
        // Get zoom range for transition
        const fromZoom = this.zoomLevels[fromZoomCategory].max;
        const toZoom = this.zoomLevels[toZoomCategory].min;
        
        // Add transition layer for 'from' source
        const fromLayerId = `${transitionId}-from`;
        map.addLayer({
            id: fromLayerId,
            type: 'raster',
            source: fromSourceId,
            paint: {
                'raster-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    fromZoom - 0.5, 1,
                    toZoom + 0.5, 0
                ],
                'raster-fade-duration': 0
            }
        });
        
        // Add transition layer for 'to' source
        const toLayerId = `${transitionId}-to`;
        map.addLayer({
            id: toLayerId,
            type: 'raster',
            source: toSourceId,
            paint: {
                'raster-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    fromZoom - 0.5, 0,
                    toZoom + 0.5, 1
                ],
                'raster-fade-duration': 0
            }
        });
        
        // Return both layer IDs
        return [fromLayerId, toLayerId];
    }
    
    /**
     * Add debugging overlay for weather tile system
     */
    static enableDebugMode() {
        this.debugMode = true;
        
        // Create debug overlay if it doesn't exist
        if (!document.getElementById('weather-debug-info')) {
            const debugEl = document.createElement('div');
            debugEl.id = 'weather-debug-info';
            debugEl.style.position = 'absolute';
            debugEl.style.bottom = '10px';
            debugEl.style.right = '10px';
            debugEl.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            debugEl.style.color = 'white';
            debugEl.style.padding = '10px';
            debugEl.style.borderRadius = '5px';
            debugEl.style.fontFamily = 'monospace';
            debugEl.style.fontSize = '12px';
            debugEl.style.zIndex = '1000';
            document.body.appendChild(debugEl);
        }
        
        // Update debug info immediately
        this.updateDebugInfo();
        
        console.log('Weather tile debug mode enabled');
    }
    
    /**
     * Update debug information display
     */
    static updateDebugInfo() {
        const debugEl = document.getElementById('weather-debug-info');
        if (!debugEl) return;
        
        const zoomCategory = this.getZoomCategory(this.currentViewport.zoom);
        const activeLayers = Object.keys(this.activeWeatherLayers)
            .filter(id => this.activeWeatherLayers[id])
            .join(', ');
        
        const cacheInfo = Object.keys(this.tileCache)
            .map(layer => `${layer}: ${Object.keys(this.tileCache[layer]).length} entries`)
            .join(', ');
        
        debugEl.innerHTML = `
            <div>Zoom: ${this.currentViewport.zoom.toFixed(2)} (${zoomCategory})</div>
            <div>Center: ${this.currentViewport.center.lng.toFixed(2)}, ${this.currentViewport.center.lat.toFixed(2)}</div>
            <div>Active Layers: ${activeLayers || 'none'}</div>
            <div>Prefetch Queue: ${this.prefetchQueue.length}</div>
            <div>Cache: ${cacheInfo}</div>
        `;
    }
} 