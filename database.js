const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'artists.db'));

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
  const stmt = db.prepare('SELECT * FROM artists WHERE name = ?');
  const existing = stmt.get(name);

  if (existing) {
    return existing;
  }

  const insertStmt = db.prepare('INSERT INTO artists (name, location) VALUES (?, ?)');
  const result = insertStmt.run(name, location);

  const selectStmt = db.prepare('SELECT * FROM artists WHERE id = ?');
  return selectStmt.get(result.lastInsertRowid);
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
    const stmt = db.prepare(`UPDATE artists SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  const selectStmt = db.prepare('SELECT * FROM artists WHERE id = ?');
  return selectStmt.get(id);
}

// Add relationship (bidirectional)
function addRelationship(artistId, relatedArtistId) {
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO relationships (artist_id, related_artist_id) VALUES (?, ?)');
    // Add relationship in both directions
    stmt.run(artistId, relatedArtistId);
    stmt.run(relatedArtistId, artistId);
    return true;
  } catch (error) {
    console.error('Error adding relationship:', error);
    return false;
  }
}

// Get all artists
function getAllArtists() {
  const stmt = db.prepare('SELECT * FROM artists ORDER BY created_at DESC');
  return stmt.all();
}

// Get artist by ID
function getArtistById(id) {
  const stmt = db.prepare('SELECT * FROM artists WHERE id = ?');
  return stmt.get(id);
}

// Get artist by name
function getArtistByName(name) {
  const stmt = db.prepare('SELECT * FROM artists WHERE name = ?');
  return stmt.get(name);
}

// Get graph data (all artists and relationships)
function getGraphData() {
  const artists = getAllArtists();
  const stmt = db.prepare(`
    SELECT DISTINCT r.artist_id, r.related_artist_id
    FROM relationships r
    ORDER BY r.artist_id, r.related_artist_id
  `);
  const relationships = stmt.all();

  return { artists, relationships };
}

// Get related artists for a specific artist
function getRelatedArtists(artistId) {
  const stmt = db.prepare(`
    SELECT a.* FROM artists a
    INNER JOIN relationships r ON a.id = r.related_artist_id
    WHERE r.artist_id = ?
  `);
  return stmt.all(artistId);
}

// Delete artist and all relationships
function deleteArtist(id) {
  const stmt1 = db.prepare('DELETE FROM relationships WHERE artist_id = ? OR related_artist_id = ?');
  stmt1.run(id, id);

  const stmt2 = db.prepare('DELETE FROM artists WHERE id = ?');
  stmt2.run(id);
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
