const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'artists.db'));

// Initialize database schema
function initDatabase() {
  // Create artists table
  db.exec(`
    CREATE TABLE IF NOT EXISTS artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      location TEXT,
      rating INTEGER DEFAULT 5 CHECK(rating >= 1 AND rating <= 10),
      explored INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create relationships table
  db.exec(`
    CREATE TABLE IF NOT EXISTS relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artist_id INTEGER NOT NULL,
      related_artist_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (artist_id) REFERENCES artists (id),
      FOREIGN KEY (related_artist_id) REFERENCES artists (id),
      UNIQUE(artist_id, related_artist_id)
    )
  `);

  console.log('Database initialized successfully');
}

// Get or create artist
function getOrCreateArtist(name, location = null) {
  const existing = db.prepare('SELECT * FROM artists WHERE name = ?').get(name);

  if (existing) {
    return existing;
  }

  const result = db.prepare('INSERT INTO artists (name, location) VALUES (?, ?)').run(name, location);
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(result.lastInsertRowid);
}

// Update artist
function updateArtist(id, data) {
  const { rating, explored, location } = data;
  const updates = [];
  const values = [];

  if (rating !== undefined) {
    updates.push('rating = ?');
    values.push(rating);
  }
  if (explored !== undefined) {
    updates.push('explored = ?');
    values.push(explored ? 1 : 0);
  }
  if (location !== undefined) {
    updates.push('location = ?');
    values.push(location);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE artists SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id);
}

// Add relationship (bidirectional)
function addRelationship(artistId, relatedArtistId) {
  try {
    // Add relationship in both directions
    db.prepare('INSERT OR IGNORE INTO relationships (artist_id, related_artist_id) VALUES (?, ?)').run(artistId, relatedArtistId);
    db.prepare('INSERT OR IGNORE INTO relationships (artist_id, related_artist_id) VALUES (?, ?)').run(relatedArtistId, artistId);
    return true;
  } catch (error) {
    console.error('Error adding relationship:', error);
    return false;
  }
}

// Get all artists
function getAllArtists() {
  return db.prepare('SELECT * FROM artists ORDER BY created_at DESC').all();
}

// Get artist by ID
function getArtistById(id) {
  return db.prepare('SELECT * FROM artists WHERE id = ?').get(id);
}

// Get artist by name
function getArtistByName(name) {
  return db.prepare('SELECT * FROM artists WHERE name = ?').get(name);
}

// Get graph data (all artists and relationships)
function getGraphData() {
  const artists = getAllArtists();
  const relationships = db.prepare(`
    SELECT DISTINCT r.artist_id, r.related_artist_id
    FROM relationships r
    ORDER BY r.artist_id, r.related_artist_id
  `).all();

  return { artists, relationships };
}

// Get related artists for a specific artist
function getRelatedArtists(artistId) {
  return db.prepare(`
    SELECT a.* FROM artists a
    INNER JOIN relationships r ON a.id = r.related_artist_id
    WHERE r.artist_id = ?
  `).all(artistId);
}

// Delete artist and all relationships
function deleteArtist(id) {
  db.prepare('DELETE FROM relationships WHERE artist_id = ? OR related_artist_id = ?').run(id, id);
  db.prepare('DELETE FROM artists WHERE id = ?').run(id);
}

module.exports = {
  initDatabase,
  getOrCreateArtist,
  updateArtist,
  addRelationship,
  getAllArtists,
  getArtistById,
  getArtistByName,
  getGraphData,
  getRelatedArtists,
  deleteArtist
};
