# Artist Path Explorer

A modern, animated web application for exploring relationships between artists. Built with Node.js, Express, SQLite, and Cytoscape.js for interactive graph visualization.

## Features

- **Interactive Graph Visualization**: Beautiful, animated network graph showing artist relationships
- **Physics-Based Dragging**: Drag nodes and connected artists follow with spring-like physics
  - Smooth gravitational pull on connected nodes
  - Realistic spring forces and damping
  - Momentum-based deceleration after release
- **Artist Management**: Add, edit, and rate artists (1-10 stars)
- **Relationship Tracking**: Connect artists and visualize their network
- **CSV Import**: Bulk import related artists using CSV format
- **Smart Duplicate Handling**: Automatically prevents duplicate artists
- **Color Coding**:
  - Green nodes: Explored artists
  - Orange nodes: Unexplored artists
  - Gold border: High-rated artists (8-10)
  - Green border: Medium-rated artists (6-7)
- **Responsive Design**: Modern, dark-themed UI with smooth animations
- **Real-time Stats**: Track total artists and connections

## Requirements

- Node.js v22.5.0 or later (uses built-in SQLite module)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Adding an Artist

1. Enter the artist name in the form
2. Optionally add location
3. Set rating (1-10 stars)
4. Check "Explored" if you've already explored this artist
5. Click "Save Artist"

### Adding Related Artists

1. First, save an artist (this becomes the current artist)
2. In the "Add Related Artists" section, enter CSV data:
   ```
   Taylor Swift, USA
   Ed Sheeran, UK
   Adele, UK
   ```
3. Click "Add Related Artists"
4. The app will:
   - Create new artists if they don't exist
   - Avoid duplicates
   - Create bidirectional relationships

### Interacting with the Graph

- **Click** on a node to view artist details
- **Hover** over nodes to highlight connections
- **Drag** nodes to reposition them
  - Connected nodes follow with spring physics
  - Great for organizing clusters of related artists
  - Nodes have momentum and smoothly decelerate
- **Scroll** to zoom in/out
- **Pan** by dragging the background
- Use the controls to:
  - Fit graph to screen
  - Reset view
  - Refresh data

### Editing Artists

1. Click on a node in the graph
2. Click "Edit" in the info panel
3. Update the form
4. Click "Save Artist"

### Deleting Artists

1. Click on a node in the graph
2. Click "Delete" in the info panel
3. Confirm deletion
4. Artist and all relationships will be removed

## CSV Format

The CSV format for adding related artists supports full CSV formatting rules:
```
artist_name, location
```

### Basic Examples:
```csv
The Beatles, UK
Pink Floyd, UK
Led Zeppelin, UK
```

### Advanced CSV Features Supported:

**Quoted values** (for names/locations with commas):
```csv
"Smith, John", "New York, NY"
AC/DC, Australia
```

**Escaped quotes** (use double quotes to include a quote):
```csv
"John ""The Boss"" Smith", USA
"She said ""Hello""", UK
```

**Optional location**:
```csv
Taylor Swift, USA
Adele
Ed Sheeran, UK
```

**Multi-line values** (within quotes):
```csv
"Artist with
multiple line name", Location
```

The parser handles:
- Quoted fields containing commas
- Escaped double quotes (`""`)
- Both CRLF and LF line endings
- Leading/trailing whitespace trimming
- Empty fields

## Database

The app uses Node.js's built-in SQLite module (available in Node.js v22.5.0+) with the following schema:

- **artists**: id, name, location, rating, explored, created_at
- **relationships**: id, artist_id, related_artist_id, created_at

Database file: `artists.db` (auto-created on first run)

## Tech Stack

- **Backend**: Node.js (v22.5.0+), Express, Built-in SQLite module
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Graph**: Cytoscape.js with Cola.js layout for force-directed physics
- **Physics**: Custom spring-based drag system with momentum and damping
- **Database**: SQLite (via Node.js built-in module - no native compilation required!)

## API Endpoints

- `GET /api/artists` - Get all artists
- `GET /api/graph` - Get graph data (artists + relationships)
- `GET /api/artists/:id` - Get artist by ID
- `POST /api/artists` - Create or update artist
- `PUT /api/artists/:id` - Update artist
- `POST /api/artists/:id/related` - Add related artists
- `GET /api/artists/:id/related` - Get related artists
- `DELETE /api/artists/:id` - Delete artist

## Color Scheme

- **Primary**: #1db954 (Green)
- **Explored**: #1db954 (Green)
- **Unexplored**: #e67e22 (Orange)
- **High Rating**: #ffd700 (Gold border)
- **Background**: Dark theme with gradients

## Browser Support

Modern browsers with ES6+ support:
- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## License

ISC
