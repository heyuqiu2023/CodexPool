import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { asyncHandler } from '../utils/helpers.js';
import { broadcast } from '../ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLATFORMS_FILE = path.join(__dirname, '..', 'platforms.json');
const DEFAULT_PLATFORMS = ['gpt', 'gemini', 'claude'];

const router = express.Router();

async function readPlatforms() {
  try {
    const data = await fs.readFile(PLATFORMS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [...DEFAULT_PLATFORMS];
  }
}

async function writePlatforms(platforms) {
  await fs.writeFile(PLATFORMS_FILE, JSON.stringify(platforms, null, 2), 'utf8');
}

// GET /api/platforms
router.get('/platforms', asyncHandler(async (_req, res) => {
  const platforms = await readPlatforms();
  res.json(platforms);
}));

// POST /api/platforms
router.post('/platforms', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Platform name cannot be empty' });
  }
  const clean = name.trim().toLowerCase();
  const platforms = await readPlatforms();
  if (platforms.includes(clean)) {
    return res.status(409).json({ message: 'Platform already exists' });
  }
  platforms.push(clean);
  await writePlatforms(platforms);
  broadcast('platform_added', { name: clean });
  res.status(201).json(platforms);
}));

// DELETE /api/platforms/:name
router.delete('/platforms/:name', asyncHandler(async (req, res) => {
  const { name } = req.params;
  const platforms = await readPlatforms();
  const index = platforms.indexOf(name);
  if (index === -1) {
    return res.status(404).json({ message: 'Platform does not exist' });
  }
  platforms.splice(index, 1);
  await writePlatforms(platforms);
  broadcast('platform_removed', { name });
  res.json(platforms);
}));

export default router;
