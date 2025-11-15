// Global state
let cy = null;
let map = null;
let currentArtistId = null;
let allArtists = [];
let currentRating = 0;  // Default to 0 (no rating)
let artistMarkers = []; // Store map markers
let selectedGenres = new Set(); // Store selected genre names for filtering
let allGenres = []; // Store all available genres

// Proper CSV parser that handles quotes, escaping, and newlines
function parseCSV(csvText) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                // Escaped quote - add one quote to field
                currentField += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            // End of field
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            // End of row
            if (char === '\r' && nextChar === '\n') {
                i++; // Skip \n in \r\n
            }
            if (currentField || currentRow.length > 0) {
                currentRow.push(currentField.trim());
                if (currentRow.some(field => field)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
            }
        } else {
            // Regular character
            currentField += char;
        }
    }

    // Add last field and row if any
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field)) {
            rows.push(currentRow);
        }
    }

    return rows;
}

// Geocoding cache - load from localStorage on startup
const CACHE_KEY = 'artistExplorer_geocodeCache';
const CACHE_VERSION = 1;
let locationCache = {};

// Load geocoding cache from localStorage
function loadGeocodingCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            if (data.version === CACHE_VERSION) {
                locationCache = data.cache || {};
                console.log(`[Cache] Loaded ${Object.keys(locationCache).length} cached locations from localStorage`);
            } else {
                console.log('[Cache] Cache version mismatch, starting fresh');
                localStorage.removeItem(CACHE_KEY);
            }
        }
    } catch (error) {
        console.error('[Cache] Error loading cache:', error);
    }
}

// Save geocoding cache to localStorage
function saveGeocodingCache() {
    try {
        const data = {
            version: CACHE_VERSION,
            cache: locationCache,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        console.log(`[Cache] Saved ${Object.keys(locationCache).length} locations to localStorage`);
    } catch (error) {
        console.error('[Cache] Error saving cache:', error);
    }
}

// Simple geocoding function with fallback
async function geocodeLocation(location) {
    if (!location || !location.trim()) return null;

    const locationKey = location.toLowerCase().trim();

    // Check in-memory cache first
    if (locationCache[locationKey]) {
        console.log(`[Geocode] Using cached coordinates for "${location}"`);
        return locationCache[locationKey];
    }

    console.log(`[Geocode] Fetching coordinates for "${location}"...`);

    try {
        // Use Nominatim (OpenStreetMap) geocoding service with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?` +
            `q=${encodeURIComponent(location)}&format=json&limit=1`,
            {
                headers: {
                    'User-Agent': 'Artist-Explorer-App'
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`[Geocode] HTTP error ${response.status} for "${location}"`);
            return null;
        }

        const data = await response.json();

        if (data && data.length > 0) {
            const coords = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon)
            };
            // Save to in-memory cache (localStorage will be saved in batch later)
            locationCache[locationKey] = coords;
            console.log(`[Geocode] Found coordinates for "${location}":`, coords);
            return coords;
        } else {
            console.warn(`[Geocode] No results found for "${location}"`);
            return null;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`[Geocode] Timeout for "${location}"`);
        } else {
            console.error(`[Geocode] Error for "${location}":`, error);
        }
        return null;
    }
}

// Initialize Leaflet map
function initMap() {
    console.log('[Map] initMap called');

    if (!map) {
        if (typeof L === 'undefined') {
            console.error('[Map] Leaflet (L) is not defined! Make sure Leaflet library is loaded.');
            showToast('Map library not loaded', 'error');
            return;
        }

        console.log('[Map] Creating Leaflet map...');
        try {
            map = L.map('map', {
                center: [20, 0],
                zoom: 2,
                minZoom: 2,
                maxZoom: 18,
                worldCopyJump: true
            });

            console.log('[Map] Adding tile layer...');
            // Add dark theme tile layer
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 19
            }).addTo(map);

            console.log('[Map] Map initialized successfully');
        } catch (error) {
            console.error('[Map] Error initializing map:', error);
            showToast('Error initializing map: ' + error.message, 'error');
        }
    } else {
        console.log('[Map] Map already exists');
    }
}

// Display artists on the map
async function displayArtistsOnMap() {
    console.log('[Map] Starting displayArtistsOnMap...');
    console.log('[Map] Total artists:', allArtists.length);

    // Get filtered artists
    const artistsToDisplay = getFilteredArtists();
    console.log('[Map] Displaying filtered artists:', artistsToDisplay.length);

    try {
        if (!map) {
            console.log('[Map] Initializing map...');
            initMap();
        }

        // Clear existing markers
        console.log('[Map] Clearing existing markers...');
        artistMarkers.forEach(marker => map.removeLayer(marker));
        artistMarkers = [];

        showLoading(true);

        // Group artists by location to handle multiple artists in same city
        const artistsByLocation = {};
        const artistsWithoutLocation = [];

        for (const artist of artistsToDisplay) {
            if (artist.location && artist.location.trim()) {
                const locationKey = artist.location.toLowerCase().trim();
                if (!artistsByLocation[locationKey]) {
                    artistsByLocation[locationKey] = [];
                }
                artistsByLocation[locationKey].push(artist);
            } else {
                artistsWithoutLocation.push(artist);
            }
        }

        const totalLocations = Object.keys(artistsByLocation).length;
        console.log(`[Map] Found ${totalLocations} unique locations`);
        console.log(`[Map] Artists without location: ${artistsWithoutLocation.length}`);

        if (totalLocations === 0) {
            showLoading(false);
            showToast('No artists with location data to display on map', 'warning');
            return;
        }

        // Geocode and add markers for each location
        let geocodedCount = 0;
        let processedCount = 0;
        let newLocationsGeocoded = false;

        for (const [locationKey, artists] of Object.entries(artistsByLocation)) {
            processedCount++;
            console.log(`[Map] Processing location ${processedCount}/${totalLocations}: "${artists[0].location}"`);

            try {
                const wasInCache = !!locationCache[locationKey];
                const coords = await geocodeLocation(artists[0].location);

                if (coords) {
                    if (!wasInCache) {
                        newLocationsGeocoded = true;
                    }

                    geocodedCount++;

                    // Create custom icon based on explored status
                    const iconColor = artists.some(a => a.explored === 1) ? '#1db954' : '#e67e22';
                    const iconHtml = `
                        <div style="
                            background-color: ${iconColor};
                            width: 30px;
                            height: 30px;
                            border-radius: 50%;
                            border: 3px solid #fff;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-weight: bold;
                            font-size: 12px;
                        ">
                            ${artists.length > 1 ? artists.length : '♪'}
                        </div>
                    `;

                    const customIcon = L.divIcon({
                        html: iconHtml,
                        className: 'custom-artist-marker',
                        iconSize: [30, 30],
                        iconAnchor: [15, 15],
                        popupAnchor: [0, -15]
                    });

                    // Create popup content
                    const popupContent = artists.length === 1 ?
                        createSingleArtistPopup(artists[0]) :
                        createMultiArtistPopup(artists);

                    const marker = L.marker([coords.lat, coords.lng], { icon: customIcon })
                        .bindPopup(popupContent)
                        .addTo(map);

                    artistMarkers.push(marker);
                    console.log(`[Map] Added marker ${geocodedCount} for "${artists[0].location}"`);
                }

                // Add delay to respect Nominatim rate limits (1 request per second)
                // Only add delay if we're not using cached data
                if (processedCount < totalLocations && !wasInCache) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`[Map] Error processing location "${artists[0].location}":`, error);
                // Continue to next location even if this one fails
            }
        }

        // Save cache once after all geocoding is complete (if we added new locations)
        if (newLocationsGeocoded) {
            saveGeocodingCache();
        }

        console.log(`[Map] Geocoding complete: ${geocodedCount}/${totalLocations} successful`);

        if (artistsWithoutLocation.length > 0) {
            showToast(`${artistsWithoutLocation.length} artist(s) without location data`, 'warning');
        }

        if (geocodedCount === 0 && totalLocations > 0) {
            showToast('Could not geocode any locations', 'error');
        } else if (geocodedCount > 0) {
            showToast(`Displayed ${geocodedCount} location(s) on map`, 'success');
        }

        // Fit map to show all markers
        if (artistMarkers.length > 0) {
            console.log(`[Map] Fitting map bounds to ${artistMarkers.length} markers`);
            const group = L.featureGroup(artistMarkers);
            map.fitBounds(group.getBounds().pad(0.1));
        } else {
            console.log('[Map] No markers to display');
        }

        // Final invalidateSize to ensure proper rendering
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
                console.log('[Map] Final invalidateSize called');
            }
        }, 200);

        console.log('[Map] displayArtistsOnMap complete');
    } catch (error) {
        console.error('[Map] Fatal error in displayArtistsOnMap:', error);
        showToast('Error displaying map: ' + error.message, 'error');
    } finally {
        // Always hide loading, even if there's an error
        console.log('[Map] Hiding loading overlay');
        showLoading(false);
    }
}

// Create popup for single artist
function createSingleArtistPopup(artist) {
    return `
        <div class="artist-popup">
            <h4>
                <a href="#" class="artist-name" onclick="selectArtistFromMap(${artist.id}); return false;">
                    ${artist.name}
                </a>
            </h4>
            <p><i class="fas fa-map-marker-alt"></i> ${artist.location || 'Unknown'}</p>
            <p class="rating"><i class="fas fa-star"></i> ${artist.rating || 5}/10</p>
            <p class="${artist.explored === 1 ? 'explored' : 'unexplored'}">
                <i class="fas fa-${artist.explored === 1 ? 'check-circle' : 'circle'}"></i>
                ${artist.explored === 1 ? 'Explored' : 'Not explored'}
            </p>
        </div>
    `;
}

// Create popup for multiple artists at same location
function createMultiArtistPopup(artists) {
    const artistList = artists.map(artist => `
        <div class="artist-item">
            <a href="#" class="artist-name" onclick="selectArtistFromMap(${artist.id}); return false;">
                ${artist.name}
            </a><br>
            <span class="rating"><i class="fas fa-star"></i> ${artist.rating || 5}/10</span> -
            <span class="${artist.explored === 1 ? 'explored' : 'unexplored'}">
                ${artist.explored === 1 ? 'Explored' : 'Not explored'}
            </span>
        </div>
    `).join('');

    return `
        <div class="artist-popup">
            <h4 class="location-header"><i class="fas fa-map-marker-alt"></i> ${artists[0].location}</h4>
            <p style="margin-bottom: 12px;"><i class="fas fa-users"></i> ${artists.length} artists</p>
            ${artistList}
        </div>
    `;
}

// Select artist from map popup and highlight in graph
window.selectArtistFromMap = function(artistId) {
    console.log('[Map] Selecting artist from map:', artistId);

    // Find the artist node in the graph
    const node = cy.getElementById(artistId.toString());

    if (node.length > 0) {
        // Unselect all nodes first
        cy.nodes().unselect();

        // Select the target node
        node.select();

        // Show node info panel
        const artist = allArtists.find(a => a.id === artistId);
        if (artist) {
            showNodeInfo(node.data());
        }

        // Scroll to the graph section smoothly
        const graphSection = document.querySelector('.view-section:first-child');
        if (graphSection) {
            graphSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Animate to center on the selected node
        setTimeout(() => {
            cy.animate({
                fit: {
                    eles: node,
                    padding: 100
                },
                duration: 500,
                easing: 'ease-out'
            });
        }, 300);

        console.log('[Map] Artist selected and graph centered');
    } else {
        console.warn('[Map] Artist node not found in graph:', artistId);
        showToast('Artist not found in graph', 'warning');
    }
};

// Select a random unexplored artist
function selectRandomUnexploredArtist() {
    console.log('[Random] Selecting random unexplored artist');

    // Filter for unexplored artists, considering genre filters if active
    const filteredArtists = getFilteredArtists();
    const unexploredArtists = filteredArtists.filter(artist => !artist.explored);

    if (unexploredArtists.length === 0) {
        showToast('No unexplored artists found', 'warning');
        return;
    }

    // Select a random unexplored artist
    const randomIndex = Math.floor(Math.random() * unexploredArtists.length);
    const randomArtist = unexploredArtists[randomIndex];

    console.log('[Random] Selected artist:', randomArtist.name);

    // Use the existing function to select and display the artist
    selectArtistFromMap(randomArtist.id);

    showToast(`Selected: ${randomArtist.name}`, 'success');
}

// Load genres from API
async function loadGenres() {
    try {
        const response = await fetch('/api/genres');
        const genres = await response.json();
        allGenres = genres;
        displayGenreTags();
    } catch (error) {
        console.error('Failed to load genres:', error);
        document.getElementById('genreFilters').innerHTML = '<p class="help-text">No genres available</p>';
    }
}

// Display genre tags
function displayGenreTags() {
    const container = document.getElementById('genreFilters');

    if (allGenres.length === 0) {
        container.innerHTML = '<p class="help-text">No genres available</p>';
        return;
    }

    // Count how many artists have each genre
    const genreCounts = {};
    allGenres.forEach(genre => {
        genreCounts[genre.name] = allArtists.filter(artist =>
            artist.genres && artist.genres.some(g => g.name === genre.name)
        ).length;
    });

    container.innerHTML = allGenres.map(genre => `
        <div class="genre-tag ${selectedGenres.has(genre.name) ? 'active' : ''}"
             data-genre="${genre.name}"
             onclick="toggleGenreFilter('${genre.name.replace(/'/g, "\\'")}')">
            ${genre.name}
            <span class="count">(${genreCounts[genre.name] || 0})</span>
        </div>
    `).join('');
}

// Toggle genre filter
window.toggleGenreFilter = function(genreName) {
    if (selectedGenres.has(genreName)) {
        selectedGenres.delete(genreName);
    } else {
        selectedGenres.add(genreName);
    }

    // Update UI
    displayGenreTags();

    // Show/hide clear button
    const clearButton = document.getElementById('clearFilters');
    if (selectedGenres.size > 0) {
        clearButton.style.display = 'block';
    } else {
        clearButton.style.display = 'none';
    }

    // Update graph and map with filtered data
    updateVisualizationsWithFilter();
};

// Clear all genre filters
function clearGenreFilters() {
    selectedGenres.clear();
    displayGenreTags();
    document.getElementById('clearFilters').style.display = 'none';
    updateVisualizationsWithFilter();
}

// Get filtered artists based on selected genres
function getFilteredArtists() {
    if (selectedGenres.size === 0) {
        return allArtists;
    }

    return allArtists.filter(artist => {
        if (!artist.genres || artist.genres.length === 0) {
            return false;
        }
        // Artist must have at least one of the selected genres
        return artist.genres.some(genre => selectedGenres.has(genre.name));
    });
}

// Update visualizations with filtered data
function updateVisualizationsWithFilter() {
    console.log('[Filter] Updating visualizations with genre filter:', Array.from(selectedGenres));

    const filteredArtists = getFilteredArtists();
    console.log(`[Filter] Showing ${filteredArtists.length} of ${allArtists.length} artists`);

    // Update graph
    updateGraphWithFilteredData(filteredArtists);

    // Update map
    displayArtistsOnMap();
}

// Update graph with filtered data
function updateGraphWithFilteredData(filteredArtists) {
    // Get IDs of filtered artists
    const filteredIds = new Set(filteredArtists.map(a => a.id.toString()));

    // Hide/show nodes based on filter
    cy.nodes().forEach(node => {
        const nodeId = node.id();
        if (filteredIds.has(nodeId)) {
            node.style('display', 'element');
        } else {
            node.style('display', 'none');
        }
    });

    // Hide edges where either endpoint is hidden
    cy.edges().forEach(edge => {
        const source = edge.source();
        const target = edge.target();
        if (filteredIds.has(source.id()) && filteredIds.has(target.id())) {
            edge.style('display', 'element');
        } else {
            edge.style('display', 'none');
        }
    });

    // Fit to visible nodes
    setTimeout(() => {
        const visibleNodes = cy.nodes('[display = "element"]');
        if (visibleNodes.length > 0) {
            cy.fit(visibleNodes, 50);
        }
    }, 100);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Load geocoding cache from localStorage
    loadGeocodingCache();

    // Register cola extension
    if (typeof cytoscape !== 'undefined' && typeof cola !== 'undefined') {
        cytoscape.use(cytoscapeCola);
    }

    initGraph();
    initMap();  // Initialize map on page load
    initEventListeners();
    loadGraphData();  // This will also load map data
    loadGenres();  // Load genres for filtering
});

// Initialize Cytoscape graph
function initGraph() {
    cy = cytoscape({
        container: document.getElementById('cy'),

        style: [
            {
                selector: 'node',
                style: {
                    'background-color': function(ele) {
                        const explored = ele.data('explored');
                        return explored ? '#1db954' : '#e67e22';
                    },
                    'label': 'data(name)',
                    'color': '#ffffff',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '12px',
                    'font-weight': 'bold',
                    'width': function(ele) {
                        const degree = ele.degree();
                        // Base size 40px, add 5px per connection, max 100px
                        return Math.min(40 + (degree * 5), 100);
                    },
                    'height': function(ele) {
                        const degree = ele.degree();
                        // Base size 40px, add 5px per connection, max 100px
                        return Math.min(40 + (degree * 5), 100);
                    },
                    'text-wrap': 'wrap',
                    'text-max-width': '80px',
                    'border-width': 3,
                    'border-color': function(ele) {
                        const rating = ele.data('rating') || 5;
                        if (rating >= 8) return '#ffd700';
                        if (rating >= 6) return '#1db954';
                        return '#666';
                    },
                    'transition-property': 'background-color, border-color, width, height',
                    'transition-duration': '0.3s'
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'border-width': 5,
                    'border-color': '#fff',
                    'box-shadow': '0 0 20px #1db954'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#555',
                    'target-arrow-color': '#555',
                    'curve-style': 'bezier',
                    'opacity': 0.6,
                    'transition-property': 'line-color, width, opacity',
                    'transition-duration': '0.3s'
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'width': 4,
                    'line-color': '#1db954',
                    'opacity': 1
                }
            },
            {
                selector: 'node:active',
                style: {
                    'overlay-color': '#1db954',
                    'overlay-padding': 10,
                    'overlay-opacity': 0.3
                }
            }
        ],

        layout: {
            name: 'cose',
            animate: true,
            animationDuration: 1000,
            animationEasing: 'ease-out',
            nodeRepulsion: 8000,
            idealEdgeLength: 100,
            edgeElasticity: 100,
            nestingFactor: 5,
            gravity: 80,
            numIter: 1000,
            initialTemp: 200,
            coolingFactor: 0.95,
            minTemp: 1.0
        },

        wheelSensitivity: 0.2,
        minZoom: 0.3,
        maxZoom: 3
    });

    // Node click event
    cy.on('tap', 'node', function(evt) {
        const node = evt.target;
        showNodeInfo(node.data());
    });

    // Background click event
    cy.on('tap', function(evt) {
        if (evt.target === cy) {
            hideNodeInfo();
        }
    });

    // Hover effects
    cy.on('mouseover', 'node', function(evt) {
        const node = evt.target;
        node.style('transform', 'scale(1.1)');

        // Highlight connected edges
        node.connectedEdges().style({
            'line-color': '#1db954',
            'width': 3,
            'opacity': 1
        });
    });

    cy.on('mouseout', 'node', function(evt) {
        const node = evt.target;
        node.style('transform', 'scale(1)');

        // Reset connected edges
        node.connectedEdges().style({
            'line-color': '#555',
            'width': 2,
            'opacity': 0.6
        });
    });

    // Drag physics - make connected nodes follow with gravity
    let draggedNode = null;
    let connectedNodes = null;
    let prevDragPos = null;
    let animationId = null;
    const followStrength = 0.3; // How much connected nodes follow (0-1)
    const idealDistance = 100; // Ideal edge length
    const repulsionStrength = 50; // Repulsion between connected nodes

    cy.on('grab', 'node', function(evt) {
        draggedNode = evt.target;
        const dragPos = draggedNode.position();
        prevDragPos = { x: dragPos.x, y: dragPos.y };

        // Get all connected nodes (direct neighbors)
        connectedNodes = draggedNode.connectedEdges().connectedNodes().filter(n => n.id() !== draggedNode.id());

        // Store initial data for each connected node
        connectedNodes.forEach(node => {
            const pos = node.position();
            node.scratch('_velocity', { x: 0, y: 0 });
            node.scratch('_dragging', true);
            // Store original distance and angle from dragged node
            const dx = pos.x - dragPos.x;
            const dy = pos.y - dragPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            node.scratch('_originalDist', dist);
            node.scratch('_angle', Math.atan2(dy, dx));
        });
    });

    cy.on('drag', 'node', function(evt) {
        if (!draggedNode || !connectedNodes || !prevDragPos) return;

        const dragPos = draggedNode.position();

        // Calculate how much the dragged node moved
        const deltaX = dragPos.x - prevDragPos.x;
        const deltaY = dragPos.y - prevDragPos.y;

        // Apply movement and forces to connected nodes
        connectedNodes.forEach(node => {
            const pos = node.position();
            const velocity = node.scratch('_velocity') || { x: 0, y: 0 };
            const originalDist = node.scratch('_originalDist') || idealDistance;
            const angle = node.scratch('_angle') || 0;

            // 1. Follow the drag with a fraction of the movement
            velocity.x += deltaX * followStrength;
            velocity.y += deltaY * followStrength;

            // 2. Maintain ideal distance from dragged node
            const dx = pos.x - dragPos.x;
            const dy = pos.y - dragPos.y;
            const currentDist = Math.sqrt(dx * dx + dy * dy);

            if (currentDist > 0) {
                // Spring force to maintain distance
                const distanceError = currentDist - originalDist;
                const springForce = -distanceError * 0.1;
                const forceX = (dx / currentDist) * springForce;
                const forceY = (dy / currentDist) * springForce;

                velocity.x += forceX;
                velocity.y += forceY;
            }

            // 3. Add repulsion between connected nodes to prevent overlap
            connectedNodes.forEach(otherNode => {
                if (otherNode.id() === node.id()) return;

                const otherPos = otherNode.position();
                const dx2 = pos.x - otherPos.x;
                const dy2 = pos.y - otherPos.y;
                const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                if (dist2 > 0 && dist2 < idealDistance) {
                    const repulsion = repulsionStrength / (dist2 * dist2);
                    velocity.x += (dx2 / dist2) * repulsion;
                    velocity.y += (dy2 / dist2) * repulsion;
                }
            });

            // Apply damping
            velocity.x *= 0.85;
            velocity.y *= 0.85;

            // Update position
            node.position({
                x: pos.x + velocity.x,
                y: pos.y + velocity.y
            });

            node.scratch('_velocity', velocity);
        });

        // Update previous position
        prevDragPos = { x: dragPos.x, y: dragPos.y };
    });

    cy.on('free', 'node', function(evt) {
        if (!draggedNode || !connectedNodes) return;

        // Smooth deceleration after release
        const decelerate = () => {
            let stillMoving = false;

            connectedNodes.forEach(node => {
                if (!node.scratch('_dragging')) return;

                const velocity = node.scratch('_velocity');
                if (!velocity) return;

                // Apply damping
                velocity.x *= 0.88;
                velocity.y *= 0.88;

                // Check if still moving significantly
                if (Math.abs(velocity.x) > 0.1 || Math.abs(velocity.y) > 0.1) {
                    stillMoving = true;
                    const pos = node.position();
                    node.position({
                        x: pos.x + velocity.x,
                        y: pos.y + velocity.y
                    });
                } else {
                    node.scratch('_dragging', false);
                }
            });

            if (stillMoving) {
                animationId = requestAnimationFrame(decelerate);
            } else {
                // Cleanup
                connectedNodes.forEach(node => {
                    node.removeScratch('_velocity');
                    node.removeScratch('_dragging');
                    node.removeScratch('_originalDist');
                    node.removeScratch('_angle');
                });
                draggedNode = null;
                connectedNodes = null;
                prevDragPos = null;
            }
        };

        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        decelerate();
    });
}

// Initialize event listeners
function initEventListeners() {
    // Rating stars
    const stars = document.querySelectorAll('#ratingStars i');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            currentRating = parseInt(star.dataset.rating);
            updateStars(currentRating);
        });
    });

    // Save artist
    document.getElementById('saveArtist').addEventListener('click', saveArtist);

    // Add related artists
    document.getElementById('addRelated').addEventListener('click', addRelatedArtists);

    // Graph controls
    document.getElementById('randomArtist').addEventListener('click', selectRandomUnexploredArtist);

    document.getElementById('fitGraph').addEventListener('click', () => {
        cy.fit(null, 50);
        cy.animate({
            zoom: cy.zoom(),
            pan: cy.pan()
        }, {
            duration: 500
        });
    });

    document.getElementById('resetGraph').addEventListener('click', () => {
        cy.zoom(1);
        cy.center();
    });

    // Refresh both graph and map data
    document.getElementById('refreshData').addEventListener('click', () => {
        loadGraphData();  // This will trigger map update too
    });

    // Refresh just the map
    document.getElementById('refreshMap').addEventListener('click', () => {
        displayArtistsOnMap();
    });

    // Clear genre filters
    document.getElementById('clearFilters').addEventListener('click', clearGenreFilters);

    // Node info panel
    document.getElementById('closeNodeInfo').addEventListener('click', hideNodeInfo);
    document.getElementById('editNode').addEventListener('click', editNode);
    document.getElementById('deleteNode').addEventListener('click', deleteNode);

    // Artist name autocomplete
    const artistNameInput = document.getElementById('artistName');
    artistNameInput.addEventListener('input', handleArtistSearch);
    artistNameInput.addEventListener('blur', () => {
        setTimeout(() => {
            document.getElementById('artistSuggestions').classList.remove('active');
        }, 200);
    });

    // Enter key to save
    artistNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveArtist();
        }
    });
}

// Update rating stars
function updateStars(rating) {
    currentRating = rating;
    document.getElementById('ratingValue').textContent = rating;

    const stars = document.querySelectorAll('#ratingStars i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.remove('far');
            star.classList.add('fas');
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
        }
    });
}

// Handle artist search/autocomplete
function handleArtistSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    const suggestionsDiv = document.getElementById('artistSuggestions');

    if (query.length < 1) {
        suggestionsDiv.classList.remove('active');
        return;
    }

    const matches = allArtists.filter(artist =>
        artist.name.toLowerCase().includes(query)
    ).slice(0, 5);

    if (matches.length > 0) {
        suggestionsDiv.innerHTML = matches.map(artist => `
            <div class="suggestion-item" onclick="selectArtist(${artist.id})">
                <span class="suggestion-name">${artist.name}</span>
                ${artist.location ? `<span class="suggestion-location">${artist.location}</span>` : ''}
            </div>
        `).join('');
        suggestionsDiv.classList.add('active');
    } else {
        suggestionsDiv.classList.remove('active');
    }
}

// Select artist from suggestions
function selectArtist(artistId) {
    const artist = allArtists.find(a => a.id === artistId);
    if (artist) {
        currentArtistId = artist.id;
        document.getElementById('artistName').value = artist.name;
        document.getElementById('location').value = artist.location || '';
        document.getElementById('explored').checked = artist.explored === 1;
        updateStars(artist.rating || 5);
        document.getElementById('artistSuggestions').classList.remove('active');

        // Highlight in graph
        cy.nodes().unselect();
        const node = cy.getElementById(artistId.toString());
        if (node.length > 0) {
            node.select();
            cy.animate({
                fit: {
                    eles: node,
                    padding: 100
                }
            }, {
                duration: 500
            });
        }
    }
}

// Save artist
async function saveArtist() {
    const name = document.getElementById('artistName').value.trim();
    const location = document.getElementById('location').value.trim();
    const explored = document.getElementById('explored').checked;

    if (!name) {
        showToast('Please enter an artist name', 'error');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch('/api/artists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                location: location || null,
                rating: currentRating,
                explored: explored ? 1 : 0
            })
        });

        const data = await response.json();

        if (response.ok) {
            currentArtistId = data.id;
            showToast(`Artist "${name}" saved successfully!`, 'success');
            await loadGraphData();

            // Focus on the newly added/updated artist
            const node = cy.getElementById(data.id.toString());
            if (node.length > 0) {
                cy.animate({
                    fit: {
                        eles: node,
                        padding: 100
                    }
                }, {
                    duration: 500
                });
            }
        } else {
            showToast(data.error || 'Failed to save artist', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Add related artists from CSV
async function addRelatedArtists() {
    const csv = document.getElementById('relatedArtistsCSV').value;

    if (!currentArtistId) {
        showToast('Please save an artist first before adding related artists', 'warning');
        return;
    }

    if (!csv.trim()) {
        showToast('Please enter related artists in CSV format', 'warning');
        return;
    }

    showLoading(true);

    try {
        // Parse CSV with proper CSV handling
        const rows = parseCSV(csv);
        const relatedArtists = [];

        for (const row of rows) {
            // Expected format: name, location, genres
            if (row.length >= 1 && row[0]) {
                const artistData = {
                    name: row[0],
                    location: row[1] || null
                };

                // Parse genres (third field, comma-separated)
                if (row[2] && row[2].trim()) {
                    // Split by comma and clean up each genre
                    artistData.genres = row[2]
                        .split(',')
                        .map(g => g.trim())
                        .filter(g => g.length > 0);
                }

                relatedArtists.push(artistData);
            }
        }

        if (relatedArtists.length === 0) {
            showToast('No valid artists found in CSV', 'warning');
            showLoading(false);
            return;
        }

        // Send to API
        const response = await fetch(`/api/artists/${currentArtistId}/related`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ relatedArtists })
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`Added ${data.added} related artist(s)!`, 'success');
            document.getElementById('relatedArtistsCSV').value = '';
            await loadGraphData();
        } else {
            showToast(data.error || 'Failed to add related artists', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Load graph data from API
async function loadGraphData() {
    showLoading(true);

    try {
        const response = await fetch('/api/graph');
        const data = await response.json();

        allArtists = data.artists;

        // Deduplicate edges for accurate stats (since relationships are bidirectional in DB)
        const seenEdgesForStats = new Set();
        const uniqueConnectionCount = data.relationships.filter(rel => {
            const id1 = Math.min(rel.artist_id, rel.related_artist_id);
            const id2 = Math.max(rel.artist_id, rel.related_artist_id);
            const key = `${id1}-${id2}`;
            if (seenEdgesForStats.has(key)) return false;
            seenEdgesForStats.add(key);
            return true;
        }).length;

        // Update stats
        document.getElementById('totalArtists').textContent = data.artists.length;
        document.getElementById('totalConnections').textContent = uniqueConnectionCount;

        // Clear and rebuild graph
        cy.elements().remove();

        // Add nodes
        const nodes = data.artists.map(artist => ({
            group: 'nodes',
            data: {
                id: artist.id.toString(),
                name: artist.name,
                location: artist.location,
                rating: artist.rating,
                explored: artist.explored === 1
            }
        }));

        // Deduplicate edges (since relationships are bidirectional in DB)
        // Only keep one edge per pair by using a Set with sorted IDs
        const seenEdges = new Set();
        const uniqueRelationships = data.relationships.filter(rel => {
            const id1 = Math.min(rel.artist_id, rel.related_artist_id);
            const id2 = Math.max(rel.artist_id, rel.related_artist_id);
            const key = `${id1}-${id2}`;

            if (seenEdges.has(key)) {
                return false;
            }
            seenEdges.add(key);
            return true;
        });

        // Add edges
        const edges = uniqueRelationships.map((rel, index) => ({
            group: 'edges',
            data: {
                id: `edge-${index}`,
                source: rel.artist_id.toString(),
                target: rel.related_artist_id.toString()
            }
        }));

        cy.add([...nodes, ...edges]);

        // Run layout with animation - using cola for better spring physics
        const layout = cy.layout({
            name: 'cola',
            animate: true,
            animationDuration: 1000,
            animationEasing: 'ease-out',
            refresh: 1,
            maxSimulationTime: 2000,
            ungrabifyWhileSimulating: false,
            fit: true,
            padding: 50,
            nodeDimensionsIncludeLabels: true,
            // Physics parameters
            edgeLength: 100,
            edgeSymDiffLength: undefined,
            edgeJaccardLength: undefined,
            nodeSpacing: 40,
            flow: undefined,
            alignment: undefined,
            gapInequalities: undefined,
            // Spring physics
            randomize: false,
            avoidOverlap: true,
            handleDisconnected: true,
            convergenceThreshold: 0.01,
            // Make nodes stick together more naturally
            unconstrIter: undefined,
            userConstIter: undefined,
            allConstIter: undefined
        });

        layout.run();

        // Fit graph after layout
        setTimeout(() => {
            cy.fit(null, 50);
        }, 1100);

        // Update map with new data (don't wait for it, run in parallel)
        displayArtistsOnMap();

        // Reload genres to update counts
        loadGenres();

    } catch (error) {
        showToast('Failed to load graph data: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Show node info panel
function showNodeInfo(nodeData) {
    const panel = document.getElementById('nodeInfo');
    const artistId = parseInt(nodeData.id);
    const artist = allArtists.find(a => a.id === artistId);

    if (!artist) return;

    document.getElementById('nodeArtistName').textContent = artist.name;
    document.getElementById('nodeLocation').textContent = artist.location || 'Unknown';
    document.getElementById('nodeRating').textContent = artist.rating || 0;
    document.getElementById('nodeExplored').textContent = artist.explored ? 'Explored ✓' : 'Not explored yet';

    // Display connected artists
    const node = cy.getElementById(nodeData.id);
    const connectedNodes = node.connectedEdges().connectedNodes().filter(n => n.id() !== nodeData.id);
    const connectionsContainer = document.getElementById('nodeConnections');

    if (connectedNodes.length > 0) {
        const connectedArtists = connectedNodes.map(n => {
            const connectedArtist = allArtists.find(a => a.id === parseInt(n.id()));
            return {
                id: n.id(),
                name: connectedArtist ? connectedArtist.name : n.data('label'),
                explored: connectedArtist ? connectedArtist.explored : false
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        const artistLinks = connectedArtists.map(artist => {
            const exploredClass = artist.explored ? 'explored' : '';
            return `<span class="connected-artist ${exploredClass}" data-artist-id="${artist.id}">${artist.name}</span>`;
        }).join('');

        connectionsContainer.innerHTML = `
            <p><i class="fas fa-link"></i> Connected to (${connectedNodes.length}):</p>
            <div class="connected-artists-list">${artistLinks}</div>
        `;

        // Add click handlers to connected artist tags
        connectionsContainer.querySelectorAll('.connected-artist').forEach(tag => {
            tag.addEventListener('click', () => {
                const artistId = tag.dataset.artistId;
                selectArtistFromMap(parseInt(artistId));
            });
        });
    } else {
        connectionsContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;"><i class="fas fa-link"></i> No connections</p>';
    }

    // Display genres
    const genresContainer = document.getElementById('nodeGenres');
    if (artist.genres && artist.genres.length > 0) {
        const genreTags = artist.genres.map(genre =>
            `<span class="genre-tag">${genre.name}</span>`
        ).join('');
        genresContainer.innerHTML = `
            <p><i class="fas fa-music"></i> Genres:</p>
            <div class="genre-tags">${genreTags}</div>
        `;
    } else {
        genresContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem;"><i class="fas fa-music"></i> No genres</p>';
    }

    panel.classList.remove('hidden');
    panel.dataset.artistId = artistId;
}

// Hide node info panel
function hideNodeInfo() {
    document.getElementById('nodeInfo').classList.add('hidden');
}

// Edit node
function editNode() {
    const artistId = parseInt(document.getElementById('nodeInfo').dataset.artistId);
    selectArtist(artistId);
    hideNodeInfo();
}

// Delete node
async function deleteNode() {
    const artistId = parseInt(document.getElementById('nodeInfo').dataset.artistId);
    const artist = allArtists.find(a => a.id === artistId);

    if (!artist) return;

    if (!confirm(`Are you sure you want to delete "${artist.name}" and all their connections?`)) {
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`/api/artists/${artistId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast(`Artist "${artist.name}" deleted`, 'success');
            hideNodeInfo();

            if (currentArtistId === artistId) {
                clearForm();
            }

            await loadGraphData();
        } else {
            showToast('Failed to delete artist', 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Clear form
function clearForm() {
    currentArtistId = null;
    document.getElementById('artistName').value = '';
    document.getElementById('location').value = '';
    document.getElementById('explored').checked = false;
    document.getElementById('relatedArtistsCSV').value = '';
    updateStars(0);
}

// Show/hide loading overlay
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}
