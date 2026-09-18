export interface FakeTeam {
  id: string;
  abbr: string;
  name: string;
  logo: string;
  wins: number;
  losses: number;
}

export interface FakeStandingRow {
  rank: number;
  team: FakeTeam;
  wins: number;
  losses: number;
  gb: string;
  streak: string;
  isUser: boolean;
}

export interface FakeStarPlayer {
  id: string;
  firstName: string;
  lastName: string;
  face: string | null;
  position: string;
  rank: number;
  rankTrend: 'up' | 'down' | 'none';
  overall: number;
}

export interface FakeEvent {
  id: string;
  icon: 'game' | 'training' | 'meeting' | 'contract' | 'scouting';
  title: string;
  subtitle: string;
}

export const userTeam: FakeTeam = {
  id: '1610612747',
  abbr: 'LAL',
  name: 'Los Angeles Lakers',
  logo: 'logos/LAL.svg',
  wins: 4,
  losses: 2
};

export const nextOpponent: FakeTeam = {
  id: '1610612744',
  abbr: 'GSW',
  name: 'Golden State Warriors',
  logo: 'logos/GSW.svg',
  wins: 5,
  losses: 1
};

export const boardConfidence = 68;
export const seasonObjective = 'Reach the Conference Semi-Finals';
export const longTermObjective = 'Build a top-4 roster within 3 seasons';

export const starPlayers: FakeStarPlayer[] = [
  {
    id: '203999',
    firstName: 'Nikolas',
    lastName: 'Voss',
    face: 'faces/203999.png',
    position: 'PF',
    rank: 3,
    rankTrend: 'up',
    overall: 91
  },
  {
    id: '201142',
    firstName: 'Marcus',
    lastName: 'Delaney',
    face: 'faces/201142.png',
    position: 'PG',
    rank: 7,
    rankTrend: 'down',
    overall: 88
  }
];

const westTeams: FakeTeam[] = [
  userTeam,
  nextOpponent,
  { id: '2', abbr: 'DEN', name: 'Denver Nuggets', logo: 'logos/DEN.svg', wins: 5, losses: 1 },
  { id: '3', abbr: 'PHX', name: 'Phoenix Suns', logo: 'logos/PHX.svg', wins: 4, losses: 2 },
  { id: '4', abbr: 'DAL', name: 'Dallas Mavericks', logo: 'logos/DAL.svg', wins: 3, losses: 3 },
  { id: '5', abbr: 'MEM', name: 'Memphis Grizzlies', logo: 'logos/MEM.svg', wins: 3, losses: 3 }
];

const eastTeams: FakeTeam[] = [
  { id: '6', abbr: 'BOS', name: 'Boston Celtics', logo: 'logos/BOS.svg', wins: 6, losses: 0 },
  { id: '7', abbr: 'MIL', name: 'Milwaukee Bucks', logo: 'logos/MIL.svg', wins: 5, losses: 1 },
  { id: '8', abbr: 'NYK', name: 'New York Knicks', logo: 'logos/NYK.svg', wins: 4, losses: 2 },
  { id: '9', abbr: 'PHI', name: 'Philadelphia 76ers', logo: 'logos/PHI.svg', wins: 4, losses: 2 },
  { id: '10', abbr: 'MIA', name: 'Miami Heat', logo: 'logos/MIA.svg', wins: 3, losses: 3 },
  { id: '11', abbr: 'CLE', name: 'Cleveland Cavaliers', logo: 'logos/CLE.svg', wins: 3, losses: 3 }
];

function toStandings(teams: FakeTeam[], userId: string): FakeStandingRow[] {
  return teams
    .slice()
    .sort((a, b) => b.wins - b.losses - (a.wins - a.losses))
    .map((team, i) => ({
      rank: i + 1,
      team,
      wins: team.wins,
      losses: team.losses,
      gb: i === 0 ? '-' : `${((teams[0].wins - teams[0].losses - (team.wins - team.losses)) / 2).toFixed(1)}`,
      streak: team.wins >= team.losses ? `W${Math.max(1, team.wins - team.losses)}` : `L${team.losses - team.wins}`,
      isUser: team.id === userId
    }));
}

export const standingsWest = toStandings(westTeams, userTeam.id);
export const standingsEast = toStandings(eastTeams, userTeam.id);

export const daysUntilNextGame = 2;

export const upcomingEvents: { group: string; events: FakeEvent[] }[] = [
  {
    group: 'IN 1 DAY',
    events: [
      { id: 'e1', icon: 'training', title: 'Team Training Session', subtitle: 'Full squad, main facility' },
      { id: 'e2', icon: 'meeting', title: 'Board Meeting', subtitle: 'Quarterly review with ownership' }
    ]
  },
  {
    group: 'IN 3 DAYS',
    events: [
      { id: 'e3', icon: 'game', title: 'vs Golden State Warriors', subtitle: 'Crypto.com Arena, 19:30' },
      { id: 'e4', icon: 'contract', title: 'Contract Deadline', subtitle: 'M. Delaney extension expires' },
      { id: 'e5', icon: 'scouting', title: 'Scouting Report Ready', subtitle: '2027 Draft class, top 10' }
    ]
  }
];

export const cashOnHand = '$38,436,726';
export const gameDate = '1 Oct, 2026';
