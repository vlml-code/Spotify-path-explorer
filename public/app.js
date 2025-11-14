// Global state
let cy = null;
let currentArtistId = null;
let allArtists = [];
let currentRating = 5;

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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initGraph();
    initEventListeners();
    loadGraphData();
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
                        const rating = ele.data('rating') || 5;
                        return 30 + (rating * 3);
                    },
                    'height': function(ele) {
                        const rating = ele.data('rating') || 5;
                        return 30 + (rating * 3);
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

    document.getElementById('refreshGraph').addEventListener('click', loadGraphData);

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
            // Expected format: name, location
            if (row.length >= 1 && row[0]) {
                relatedArtists.push({
                    name: row[0],
                    location: row[1] || null
                });
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

        // Run layout with animation
        const layout = cy.layout({
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
        });

        layout.run();

        // Fit graph after layout
        setTimeout(() => {
            cy.fit(null, 50);
        }, 1100);

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
    document.getElementById('nodeRating').textContent = artist.rating || 5;
    document.getElementById('nodeExplored').textContent = artist.explored ? 'Explored ✓' : 'Not explored yet';

    // Count connections
    const connections = cy.getElementById(nodeData.id).connectedEdges().length;
    document.getElementById('nodeConnections').textContent = connections;

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
    updateStars(5);
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
