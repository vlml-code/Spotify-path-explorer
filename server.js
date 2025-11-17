const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 50101;

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
db.initDatabase();

// API Routes

// Get all artists
app.get('/api/artists', (req, res) => {
  try {
    const artists = db.getAllArtists();
    res.json(artists);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get graph data (with genres)
app.get('/api/graph', (req, res) => {
  try {
    const data = db.getGraphData();
    // Add genres to each artist
    const artistsWithGenres = data.artists.map(artist => ({
      ...artist,
      genres: db.getArtistGenres(artist.id)
    }));
    res.json({ ...data, artists: artistsWithGenres });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get artist by ID
app.get('/api/artists/:id', (req, res) => {
  try {
    const artist = db.getArtistById(req.params.id);
    if (artist) {
      res.json(artist);
    } else {
      res.status(404).json({ error: 'Artist not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update artist
app.post('/api/artists', (req, res) => {
  try {
    const { name, location, rating, explored, genres } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Artist name is required' });
    }

    // Get or create the artist
    let artist = db.getOrCreateArtist(name, location);

    // Update if additional data provided
    if (rating !== undefined || explored !== undefined) {
      artist = db.updateArtist(artist.id, { rating, explored, location });
    }

    // Handle genres
    if (genres && Array.isArray(genres)) {
      db.setArtistGenres(artist.id, genres);
    }

    // Return artist with genres
    const artistWithGenres = {
      ...artist,
      genres: db.getArtistGenres(artist.id)
    };

    res.json(artistWithGenres);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update artist
app.put('/api/artists/:id', (req, res) => {
  try {
    const { rating, explored, location } = req.body;
    const artist = db.updateArtist(req.params.id, { rating, explored, location });
    res.json(artist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add related artists (with CSV processing)
app.post('/api/artists/:id/related', (req, res) => {
  try {
    const artistId = parseInt(req.params.id);
    const { relatedArtists } = req.body; // Array of { name, location, genres }

    if (!Array.isArray(relatedArtists)) {
      return res.status(400).json({ error: 'relatedArtists must be an array' });
    }

    const results = [];

    for (const { name, location, genres } of relatedArtists) {
      if (name && name.trim()) {
        // Get or create the related artist
        const relatedArtist = db.getOrCreateArtist(name.trim(), location?.trim() || null);

        // Add genres if provided
        if (genres && Array.isArray(genres) && genres.length > 0) {
          db.setArtistGenres(relatedArtist.id, genres);
        }

        // Add relationship (if not the same artist)
        if (relatedArtist.id !== artistId) {
          db.addRelationship(artistId, relatedArtist.id);
          results.push({
            ...relatedArtist,
            genres: db.getArtistGenres(relatedArtist.id)
          });
        }
      }
    }

    res.json({ added: results.length, artists: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get related artists
app.get('/api/artists/:id/related', (req, res) => {
  try {
    const related = db.getRelatedArtists(req.params.id);
    res.json(related);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete artist
app.delete('/api/artists/:id', (req, res) => {
  try {
    db.deleteArtist(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all genres
app.get('/api/genres', (req, res) => {
  try {
    const genres = db.getAllGenres();
    res.json(genres);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🎵 Artist Explorer server running on http://localhost:${PORT}`);
});
