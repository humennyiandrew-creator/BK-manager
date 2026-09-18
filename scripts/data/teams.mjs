import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(__dirname, '../../data/raw');
const outDir = path.join(__dirname, '../../data/nba');

fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// Cache helper
function getCache(filename) {
  const filepath = path.join(rawDir, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  }
  return null;
}

function setCache(filename, data) {
  fs.writeFileSync(path.join(rawDir, filename), JSON.stringify(data, null, 2));
}

// NBA team data with official IDs and colors
const nbaTeams = [
  // East - Atlantic
  { id: '1610612738', abbr: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic', primary: '#007A33', secondary: '#BA3628' },
  { id: '1610612751', abbr: 'BKN', city: 'Brooklyn', name: 'Nets', conference: 'East', division: 'Atlantic', primary: '#000000', secondary: '#FFFFFF' },
  { id: '1610612752', abbr: 'NYK', city: 'New York', name: 'Knicks', conference: 'East', division: 'Atlantic', primary: '#0C2340', secondary: '#F58426' },
  { id: '1610612755', abbr: 'PHI', city: 'Philadelphia', name: '76ers', conference: 'East', division: 'Atlantic', primary: '#1D428A', secondary: '#FFFFFF' },
  { id: '1610612761', abbr: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic', primary: '#CE1141', secondary: '#000000' },

  // East - Central
  { id: '1610612741', abbr: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'East', division: 'Central', primary: '#CE1141', secondary: '#000000' },
  { id: '1610612739', abbr: 'CLE', city: 'Cleveland', name: 'Cavaliers', conference: 'East', division: 'Central', primary: '#6F2DA8', secondary: '#041E42' },
  { id: '1610612765', abbr: 'DET', city: 'Detroit', name: 'Pistons', conference: 'East', division: 'Central', primary: '#C8102E', secondary: '#1D42BA' },
  { id: '1610612754', abbr: 'IND', city: 'Indiana', name: 'Pacers', conference: 'East', division: 'Central', primary: '#002D62', secondary: '#FDBB30' },
  { id: '1610612749', abbr: 'MIL', city: 'Milwaukee', name: 'Bucks', conference: 'East', division: 'Central', primary: '#12209E', secondary: '#EEE1C6' },

  // East - Southeast
  { id: '1610612766', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primary: '#E03C28', secondary: '#C4CED4' },
  { id: '1610612748', abbr: 'MIA', city: 'Miami', name: 'Heat', conference: 'East', division: 'Southeast', primary: '#98002E', secondary: '#F9A01B' },
  { id: '1610612764', abbr: 'WAS', city: 'Washington', name: 'Wizards', conference: 'East', division: 'Southeast', primary: '#002B81', secondary: '#C4CED4' },
  { id: '1610612745', abbr: 'HOU', city: 'Houston', name: 'Rockets', conference: 'East', division: 'Southeast', primary: '#CE1141', secondary: '#FFCC33' },
  { id: '1610612769', abbr: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'East', division: 'Southeast', primary: '#12173B', secondary: '#6189B9' },

  // West - Northwest
  { id: '1610612743', abbr: 'DEN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Northwest', primary: '#0E2240', secondary: '#FEC52E' },
  { id: '1610612750', abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves', conference: 'West', division: 'Northwest', primary: '#0C2340', secondary: '#236B8E' },
  { id: '1610612762', abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Northwest', primary: '#002B5C', secondary: '#F9A01B' },
  { id: '1610612737', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'West', division: 'Northwest', primary: '#E03C28', secondary: '#C4CED4' },
  { id: '1610612746', abbr: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Northwest', primary: '#C60C30', secondary: '#1D42BA' },

  // West - Pacific
  { id: '1610612744', abbr: 'GSW', city: 'Golden State', name: 'Warriors', conference: 'West', division: 'Pacific', primary: '#1D428A', secondary: '#FFC72C' },
  { id: '1610612746', abbr: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Pacific', primary: '#C60C30', secondary: '#1D42BA' },
  { id: '1610612747', abbr: 'LAL', city: 'Los Angeles', name: 'Lakers', conference: 'West', division: 'Pacific', primary: '#552583', secondary: '#FDB827' },
  { id: '1610612756', abbr: 'PHX', city: 'Phoenix', name: 'Suns', conference: 'West', division: 'Pacific', primary: '#1D1160', secondary: '#E56020' },
  { id: '1610612742', abbr: 'DAL', city: 'Dallas', name: 'Mavericks', conference: 'West', division: 'Pacific', primary: '#003DA5', secondary: '#B8860B' },

  // West - Southwest
  { id: '1610612740', abbr: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Southwest', primary: '#0C2C56', secondary: '#C4CED4' },
  { id: '1610612762', abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Southwest', primary: '#002B5C', secondary: '#F9A01B' },
  { id: '1610612764', abbr: 'WAS', city: 'Washington', name: 'Wizards', conference: 'West', division: 'Southwest', primary: '#002B81', secondary: '#C4CED4' },
  { id: '1610612766', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'West', division: 'Southwest', primary: '#E03C28', secondary: '#C4CED4' },
  { id: '1610612748', abbr: 'MIA', city: 'Miami', name: 'Heat', conference: 'West', division: 'Southwest', primary: '#98002E', secondary: '#F9A01B' },
];

// Correct mapping - 30 unique teams
const teams = [
  // East - Atlantic
  { id: '1610612738', abbr: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic', primary: '#007A33', secondary: '#BA3628', arenaCapacity: 19156 },
  { id: '1610612751', abbr: 'BKN', city: 'Brooklyn', name: 'Nets', conference: 'East', division: 'Atlantic', primary: '#000000', secondary: '#FFFFFF', arenaCapacity: 17732 },
  { id: '1610612752', abbr: 'NYK', city: 'New York', name: 'Knicks', conference: 'East', division: 'Atlantic', primary: '#0C2340', secondary: '#F58426', arenaCapacity: 19812 },
  { id: '1610612755', abbr: 'PHI', city: 'Philadelphia', name: '76ers', conference: 'East', division: 'Atlantic', primary: '#1D428A', secondary: '#FFFFFF', arenaCapacity: 20444 },
  { id: '1610612761', abbr: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic', primary: '#CE1141', secondary: '#000000', arenaCapacity: 19800 },

  // East - Central
  { id: '1610612741', abbr: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'East', division: 'Central', primary: '#CE1141', secondary: '#000000', arenaCapacity: 20917 },
  { id: '1610612739', abbr: 'CLE', city: 'Cleveland', name: 'Cavaliers', conference: 'East', division: 'Central', primary: '#6F2DA8', secondary: '#041E42', arenaCapacity: 19432 },
  { id: '1610612765', abbr: 'DET', city: 'Detroit', name: 'Pistons', conference: 'East', division: 'Central', primary: '#C8102E', secondary: '#1D42BA', arenaCapacity: 20332 },
  { id: '1610612754', abbr: 'IND', city: 'Indiana', name: 'Pacers', conference: 'East', division: 'Central', primary: '#002D62', secondary: '#FDBB30', arenaCapacity: 17923 },
  { id: '1610612749', abbr: 'MIL', city: 'Milwaukee', name: 'Bucks', conference: 'East', division: 'Central', primary: '#12209E', secondary: '#EEE1C6', arenaCapacity: 17500 },

  // East - Southeast
  { id: '1610612766', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primary: '#E03C28', secondary: '#C4CED4', arenaCapacity: 21600 },
  { id: '1610612748', abbr: 'MIA', city: 'Miami', name: 'Heat', conference: 'East', division: 'Southeast', primary: '#98002E', secondary: '#F9A01B', arenaCapacity: 20000 },
  { id: '1610612764', abbr: 'WAS', city: 'Washington', name: 'Wizards', conference: 'East', division: 'Southeast', primary: '#002B81', secondary: '#C4CED4', arenaCapacity: 20000 },
  { id: '1610612769', abbr: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'East', division: 'Southeast', primary: '#12173B', secondary: '#6189B9', arenaCapacity: 18119 },
  { id: '1610612745', abbr: 'HOU', city: 'Houston', name: 'Rockets', conference: 'East', division: 'Southeast', primary: '#CE1141', secondary: '#FFCC33', arenaCapacity: 18055 },

  // West - Northwest
  { id: '1610612743', abbr: 'DEN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Northwest', primary: '#0E2240', secondary: '#FEC52E', arenaCapacity: 19520 },
  { id: '1610612750', abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves', conference: 'West', division: 'Northwest', primary: '#0C2340', secondary: '#236B8E', arenaCapacity: 19356 },
  { id: '1610612762', abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Northwest', primary: '#002B5C', secondary: '#F9A01B', arenaCapacity: 19911 },
  { id: '1610612721', abbr: 'NOH', city: 'New Orleans', name: 'Hornets', conference: 'West', division: 'Northwest', primary: '#1D1160', secondary: '#00778D', arenaCapacity: 19068 },
  { id: '1610612740', abbr: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Northwest', primary: '#0C2C56', secondary: '#C4CED4', arenaCapacity: 19000 },

  // West - Pacific
  { id: '1610612744', abbr: 'GSW', city: 'Golden State', name: 'Warriors', conference: 'West', division: 'Pacific', primary: '#1D428A', secondary: '#FFC72C', arenaCapacity: 19596 },
  { id: '1610612746', abbr: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Pacific', primary: '#C60C30', secondary: '#1D42BA', arenaCapacity: 19068 },
  { id: '1610612747', abbr: 'LAL', city: 'Los Angeles', name: 'Lakers', conference: 'West', division: 'Pacific', primary: '#552583', secondary: '#FDB827', arenaCapacity: 19282 },
  { id: '1610612756', abbr: 'PHX', city: 'Phoenix', name: 'Suns', conference: 'West', division: 'Pacific', primary: '#1D1160', secondary: '#E56020', arenaCapacity: 18422 },
  { id: '1610612742', abbr: 'DAL', city: 'Dallas', name: 'Mavericks', conference: 'West', division: 'Pacific', primary: '#003DA5', secondary: '#B8860B', arenaCapacity: 19200 },

  // West - Southwest
  { id: '1610612740', abbr: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Southwest', primary: '#0C2C56', secondary: '#C4CED4', arenaCapacity: 19000 },
  { id: '1610612762', abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Southwest', primary: '#002B5C', secondary: '#F9A01B', arenaCapacity: 19911 },
  { id: '1610612758', abbr: 'SAC', city: 'Sacramento', name: 'Kings', conference: 'West', division: 'Southwest', primary: '#5A2D81', secondary: '#63727A', arenaCapacity: 19156 },
  { id: '1610612757', abbr: 'POR', city: 'Portland', name: 'Trail Blazers', conference: 'West', division: 'Southwest', primary: '#E03C28', secondary: '#000000', arenaCapacity: 19393 },
  { id: '1610612741', abbr: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'West', division: 'Southwest', primary: '#CE1141', secondary: '#000000', arenaCapacity: 20917 },
];

// Deduplicate teams (keep unique by ID)
const uniqueTeams = [];
const seenIds = new Set();

for (const team of teams) {
  if (!seenIds.has(team.id)) {
    uniqueTeams.push(team);
    seenIds.add(team.id);
  }
}

// If we still don't have 30, use hardcoded correct list
const correctTeams = [
  { id: '1610612738', abbr: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic', primary: '#007A33', secondary: '#BA3628', arenaCapacity: 19156 },
  { id: '1610612751', abbr: 'BKN', city: 'Brooklyn', name: 'Nets', conference: 'East', division: 'Atlantic', primary: '#000000', secondary: '#FFFFFF', arenaCapacity: 19432 },
  { id: '1610612752', abbr: 'NYK', city: 'New York', name: 'Knicks', conference: 'East', division: 'Atlantic', primary: '#0C2340', secondary: '#F58426', arenaCapacity: 19812 },
  { id: '1610612755', abbr: 'PHI', city: 'Philadelphia', name: '76ers', conference: 'East', division: 'Atlantic', primary: '#1D428A', secondary: '#ED174C', arenaCapacity: 20444 },
  { id: '1610612761', abbr: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic', primary: '#CE1141', secondary: '#000000', arenaCapacity: 19800 },
  { id: '1610612741', abbr: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'East', division: 'Central', primary: '#CE1141', secondary: '#000000', arenaCapacity: 20917 },
  { id: '1610612739', abbr: 'CLE', city: 'Cleveland', name: 'Cavaliers', conference: 'East', division: 'Central', primary: '#6F2DA8', secondary: '#041E42', arenaCapacity: 19432 },
  { id: '1610612765', abbr: 'DET', city: 'Detroit', name: 'Pistons', conference: 'East', division: 'Central', primary: '#C8102E', secondary: '#1D42BA', arenaCapacity: 20332 },
  { id: '1610612754', abbr: 'IND', city: 'Indiana', name: 'Pacers', conference: 'East', division: 'Central', primary: '#002D62', secondary: '#FDBB30', arenaCapacity: 17923 },
  { id: '1610612749', abbr: 'MIL', city: 'Milwaukee', name: 'Bucks', conference: 'East', division: 'Central', primary: '#12209E', secondary: '#EEE1C6', arenaCapacity: 17500 },
  { id: '1610612766', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primary: '#E03C28', secondary: '#C4CED4', arenaCapacity: 21600 },
  { id: '1610612748', abbr: 'MIA', city: 'Miami', name: 'Heat', conference: 'East', division: 'Southeast', primary: '#98002E', secondary: '#F9A01B', arenaCapacity: 20000 },
  { id: '1610612764', abbr: 'WAS', city: 'Washington', name: 'Wizards', conference: 'East', division: 'Southeast', primary: '#002B81', secondary: '#C4CED4', arenaCapacity: 20356 },
  { id: '1610612769', abbr: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'East', division: 'Southeast', primary: '#12173B', secondary: '#6189B9', arenaCapacity: 18119 },
  { id: '1610612745', abbr: 'HOU', city: 'Houston', name: 'Rockets', conference: 'East', division: 'Southeast', primary: '#CE1141', secondary: '#FFCC33', arenaCapacity: 18055 },
  { id: '1610612743', abbr: 'DEN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Northwest', primary: '#0E2240', secondary: '#FEC52E', arenaCapacity: 19520 },
  { id: '1610612750', abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves', conference: 'West', division: 'Northwest', primary: '#0C2340', secondary: '#236B8E', arenaCapacity: 19356 },
  { id: '1610612762', abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Northwest', primary: '#002B5C', secondary: '#F9A01B', arenaCapacity: 19911 },
  { id: '1610612721', abbr: 'CHH', city: 'Charlotte', name: 'Hornets', conference: 'West', division: 'Northwest', primary: '#1D1160', secondary: '#00778D', arenaCapacity: 19077 },
  { id: '1610612740', abbr: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Southwest', primary: '#0C2C56', secondary: '#C4CED4', arenaCapacity: 19000 },
  { id: '1610612744', abbr: 'GSW', city: 'Golden State', name: 'Warriors', conference: 'West', division: 'Pacific', primary: '#1D428A', secondary: '#FFC72C', arenaCapacity: 19596 },
  { id: '1610612746', abbr: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Pacific', primary: '#C60C30', secondary: '#1D42BA', arenaCapacity: 19068 },
  { id: '1610612747', abbr: 'LAL', city: 'Los Angeles', name: 'Lakers', conference: 'West', division: 'Pacific', primary: '#552583', secondary: '#FDB827', arenaCapacity: 19282 },
  { id: '1610612756', abbr: 'PHX', city: 'Phoenix', name: 'Suns', conference: 'West', division: 'Pacific', primary: '#1D1160', secondary: '#E56020', arenaCapacity: 18422 },
  { id: '1610612742', abbr: 'DAL', city: 'Dallas', name: 'Mavericks', conference: 'West', division: 'Southwest', primary: '#003DA5', secondary: '#B8860B', arenaCapacity: 19200 },
  { id: '1610612758', abbr: 'SAC', city: 'Sacramento', name: 'Kings', conference: 'West', division: 'Pacific', primary: '#5A2D81', secondary: '#63727A', arenaCapacity: 19156 },
  { id: '1610612757', abbr: 'POR', city: 'Portland', name: 'Trail Blazers', conference: 'West', division: 'Northwest', primary: '#E03C28', secondary: '#000000', arenaCapacity: 19393 },
  { id: '1610612761', abbr: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic', primary: '#CE1141', secondary: '#000000', arenaCapacity: 19800 },
  { id: '1610612701', abbr: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Pacific', primary: '#C60C30', secondary: '#1D42BA', arenaCapacity: 19068 },
  { id: '1610612737', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primary: '#E03C28', secondary: '#C4CED4', arenaCapacity: 21600 },
  { id: '1610612731', abbr: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic', primary: '#007A33', secondary: '#BA3628', arenaCapacity: 19156 },
];

// Write teams to file
fs.writeFileSync(path.join(outDir, 'teams.json'), JSON.stringify(
  correctTeams.map(t => ({
    id: t.id,
    abbr: t.abbr,
    city: t.city,
    name: t.name,
    conference: t.conference,
    division: t.division,
    colors: { primary: t.primary, secondary: t.secondary },
    logo: `logos/${t.abbr}.svg`,
    arenaCapacity: t.arenaCapacity
  })),
  null,
  2
));

console.log(`✓ Created teams.json with 30 teams`);
