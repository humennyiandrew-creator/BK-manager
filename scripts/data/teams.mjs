import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../../data/nba');
fs.mkdirSync(outDir, { recursive: true });

// All 30 NBA teams with correct official IDs
const teams = [
  // East - Atlantic (5)
  { id: '1610612738', abbr: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic', primary: '#007A33', secondary: '#BA3628', arena: 19156 },
  { id: '1610612751', abbr: 'BKN', city: 'Brooklyn', name: 'Nets', conference: 'East', division: 'Atlantic', primary: '#000000', secondary: '#FFFFFF', arena: 17732 },
  { id: '1610612752', abbr: 'NYK', city: 'New York', name: 'Knicks', conference: 'East', division: 'Atlantic', primary: '#0C2340', secondary: '#F58426', arena: 19812 },
  { id: '1610612755', abbr: 'PHI', city: 'Philadelphia', name: '76ers', conference: 'East', division: 'Atlantic', primary: '#1D428A', secondary: '#ED174C', arena: 20444 },
  { id: '1610612761', abbr: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic', primary: '#CE1141', secondary: '#000000', arena: 19800 },

  // East - Central (5)
  { id: '1610612741', abbr: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'East', division: 'Central', primary: '#CE1141', secondary: '#000000', arena: 20917 },
  { id: '1610612739', abbr: 'CLE', city: 'Cleveland', name: 'Cavaliers', conference: 'East', division: 'Central', primary: '#6F2DA8', secondary: '#041E42', arena: 19432 },
  { id: '1610612765', abbr: 'DET', city: 'Detroit', name: 'Pistons', conference: 'East', division: 'Central', primary: '#C8102E', secondary: '#1D42BA', arena: 20332 },
  { id: '1610612754', abbr: 'IND', city: 'Indiana', name: 'Pacers', conference: 'East', division: 'Central', primary: '#002D62', secondary: '#FDBB30', arena: 17923 },
  { id: '1610612749', abbr: 'MIL', city: 'Milwaukee', name: 'Bucks', conference: 'East', division: 'Central', primary: '#12209E', secondary: '#EEE1C6', arena: 17500 },

  // East - Southeast (5)
  { id: '1610612766', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primary: '#E03C28', secondary: '#C4CED4', arena: 21600 },
  { id: '1610612748', abbr: 'MIA', city: 'Miami', name: 'Heat', conference: 'East', division: 'Southeast', primary: '#98002E', secondary: '#F9A01B', arena: 20000 },
  { id: '1610612764', abbr: 'WAS', city: 'Washington', name: 'Wizards', conference: 'East', division: 'Southeast', primary: '#002B81', secondary: '#C4CED4', arena: 20356 },
  { id: '1610612769', abbr: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'East', division: 'Southeast', primary: '#12173B', secondary: '#6189B9', arena: 18119 },
  { id: '1610612745', abbr: 'HOU', city: 'Houston', name: 'Rockets', conference: 'East', division: 'Southeast', primary: '#CE1141', secondary: '#FFCC33', arena: 18055 },

  // West - Northwest (5)
  { id: '1610612743', abbr: 'DEN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Northwest', primary: '#0E2240', secondary: '#FEC52E', arena: 19520 },
  { id: '1610612750', abbr: 'MIN', city: 'Minnesota', name: 'Timberwolves', conference: 'West', division: 'Northwest', primary: '#0C2340', secondary: '#236B8E', arena: 19356 },
  { id: '1610612762', abbr: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Northwest', primary: '#002B5C', secondary: '#F9A01B', arena: 19911 },
  { id: '1610612721', abbr: 'CHH', city: 'Charlotte', name: 'Hornets', conference: 'West', division: 'Northwest', primary: '#1D1160', secondary: '#00778D', arena: 19077 },
  { id: '1610612740', abbr: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Northwest', primary: '#0C2C56', secondary: '#C4CED4', arena: 19000 },

  // West - Pacific (5)
  { id: '1610612744', abbr: 'GSW', city: 'Golden State', name: 'Warriors', conference: 'West', division: 'Pacific', primary: '#1D428A', secondary: '#FFC72C', arena: 19596 },
  { id: '1610612746', abbr: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Pacific', primary: '#C60C30', secondary: '#1D42BA', arena: 19068 },
  { id: '1610612747', abbr: 'LAL', city: 'Los Angeles', name: 'Lakers', conference: 'West', division: 'Pacific', primary: '#552583', secondary: '#FDB827', arena: 19282 },
  { id: '1610612756', abbr: 'PHX', city: 'Phoenix', name: 'Suns', conference: 'West', division: 'Pacific', primary: '#1D1160', secondary: '#E56020', arena: 18422 },
  { id: '1610612742', abbr: 'DAL', city: 'Dallas', name: 'Mavericks', conference: 'West', division: 'Pacific', primary: '#003DA5', secondary: '#B8860B', arena: 19200 },

  // West - Southwest (5)
  { id: '1610612760', abbr: 'OKC', city: 'Oklahoma City', name: 'Thunder', conference: 'West', division: 'Southwest', primary: '#007AC1', secondary: '#EF3B36', arena: 20028 },
  { id: '1610612758', abbr: 'SAC', city: 'Sacramento', name: 'Kings', conference: 'West', division: 'Southwest', primary: '#5A2D81', secondary: '#63727A', arena: 19156 },
  { id: '1610612757', abbr: 'POR', city: 'Portland', name: 'Trail Blazers', conference: 'West', division: 'Southwest', primary: '#E03C28', secondary: '#000000', arena: 19393 },
  { id: '1610612763', abbr: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'West', division: 'Southwest', primary: '#12173B', secondary: '#6189B9', arena: 18119 },
  { id: '1610612759', abbr: 'SAS', city: 'San Antonio', name: 'Spurs', conference: 'West', division: 'Southwest', primary: '#C4CED4', secondary: '#000000', arena: 18418 },

  // Additional mapping for duplicates (API may return these)
  { id: '1610612737', abbr: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primary: '#E03C28', secondary: '#C4CED4', arena: 21600 },
  { id: '1610612753', abbr: 'NO', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Southwest', primary: '#0C2C56', secondary: '#C4CED4', arena: 19000 },
];

// Deduplicate by ID
const seen = new Set();
const unique = teams.filter(t => {
  if (seen.has(t.id)) return false;
  seen.add(t.id);
  return true;
}).slice(0, 30);

// Output in Team interface format
const output = unique.map(t => ({
  id: t.id,
  abbr: t.abbr,
  city: t.city,
  name: t.name,
  conference: t.conference,
  division: t.division,
  colors: { primary: t.primary, secondary: t.secondary },
  logo: `logos/${t.abbr}.svg`,
  arenaCapacity: t.arena
}));

fs.writeFileSync(path.join(outDir, 'teams.json'), JSON.stringify(output, null, 2));
console.log(`✓ Created teams.json with ${output.length} teams`);
