// Generated players: draft prospects and (later) youth. Ratings built straight from target OVR/POT.
import type { Player } from './model';
import { emptyLine } from './model';
import { ATTRS, type Attr, type Attributes, type PlayerRatings } from './ratings';
import { gauss, type Rng } from './rng';
import type { Position } from './types';

const FIRST_US = ['Jalen', 'Marcus', 'Tyrese', 'Jaylen', 'Darius', 'Cam', 'Isaiah', 'Malik', 'Jordan', 'Devin', 'Keegan', 'Trey', 'Amari', 'Caleb', 'Elijah', 'Jaden', 'Xavier', 'Micah', 'Terrence', 'Andre', 'Bryce', 'Cole', 'Dylan', 'Grant', 'Hunter', 'Jace', 'Kobe', 'Landon', 'Mason', 'Nolan', 'Quentin', 'Reggie', 'Tristan', 'Zion', 'Deandre', 'Kendall', 'Tariq', 'Omari', 'Jamal', 'Brandon'];
const LAST_US = ['Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Thomas', 'Jackson', 'White', 'Harris', 'Martin', 'Thompson', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Reed', 'Bailey'];
const INTL: [string, string[], string[]][] = [
  ['Serbia', ['Nikola', 'Marko', 'Stefan', 'Luka', 'Vasilije', 'Filip'], ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović']],
  ['France', ['Théo', 'Hugo', 'Mathis', 'Noah', 'Rayan', 'Yanis'], ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Fournier']],
  ['Spain', ['Pablo', 'Álvaro', 'Sergio', 'Hugo', 'Izan', 'Mario'], ['García', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Ruiz']],
  ['Lithuania', ['Matas', 'Lukas', 'Rokas', 'Tadas', 'Arnas', 'Dovydas'], ['Kazlauskas', 'Petrauskas', 'Jankauskas', 'Žukauskas', 'Butkus', 'Vasiliauskas']],
  ['Australia', ['Josh', 'Liam', 'Jack', 'Riley', 'Kai', 'Mitch'], ['Smith', 'Kelly', "O'Brien", 'Murray', 'Walsh', 'Ryan']],
  ['Canada', ['Olivier', 'Ethan', 'Leonard', 'Zach', 'Aaron', 'Tyler'], ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Gauthier']],
  ['Nigeria', ['Chidi', 'Emeka', 'Tobi', 'Femi', 'Ikenna', 'Obinna'], ['Okafor', 'Adebayo', 'Eze', 'Nwosu', 'Okeke', 'Obi']],
  ['Germany', ['Jonas', 'Leon', 'Felix', 'Paul', 'Moritz', 'Lukas'], ['Müller', 'Schmidt', 'Wagner', 'Becker', 'Hoffmann', 'Schulz']],
  ['Ukraine', ['Artem', 'Oleksandr', 'Maksym', 'Dmytro', 'Bohdan', 'Vladyslav'], ['Shevchenko', 'Bondarenko', 'Kovalenko', 'Tkachenko', 'Kravchenko', 'Melnyk']],
  ['Turkey', ['Emir', 'Arda', 'Kerem', 'Alperen', 'Efe', 'Yusuf'], ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Öztürk']],
  ['Greece', ['Giorgos', 'Nikos', 'Kostas', 'Dimitris', 'Giannis', 'Vasilis'], ['Papadopoulos', 'Pappas', 'Georgiou', 'Nikolaidis', 'Oikonomou', 'Karagiannis']],
];
const COLLEGES = ['Duke', 'Kentucky', 'Kansas', 'North Carolina', 'UConn', 'Gonzaga', 'Arizona', 'Houston', 'Purdue', 'Baylor', 'UCLA', 'Michigan', 'Michigan State', 'Villanova', 'Texas', 'Alabama', 'Auburn', 'Tennessee', 'Arkansas', 'Indiana', 'Illinois', 'Florida', 'Creighton', 'Marquette', 'BYU', 'Iowa State', 'St. John\'s', 'USC', 'Ohio State', 'Oregon'];
const INTL_CLUBS: Record<string, string> = {
  Serbia: 'Mega Basket', France: 'ASVEL', Spain: 'Real Madrid', Lithuania: 'Žalgiris', Australia: 'NBL Next Stars', Canada: 'Overtime Elite',
  Nigeria: 'NBA Academy Africa', Germany: 'Ratiopharm Ulm', Ukraine: 'Prometey', Turkey: 'Anadolu Efes', Greece: 'Panathinaikos',
};

const TEMPLATE: Record<Position, Partial<Record<Attr, number>>> = {
  PG: { ballHandle: 12, passing: 12, vision: 10, speed: 8, acceleration: 8, threePoint: 4, steal: 4, block: -12, offRebound: -10, defRebound: -8, strength: -8, postScoring: -10, interiorD: -10, closeShot: -4 },
  SG: { threePoint: 8, midRange: 6, ballHandle: 4, speed: 5, acceleration: 4, perimeterD: 4, block: -8, offRebound: -8, postScoring: -8, interiorD: -8, strength: -4 },
  SF: { perimeterD: 3, threePoint: 2, strength: 2, layup: 2 },
  PF: { strength: 8, defRebound: 8, offRebound: 6, interiorD: 6, block: 4, postScoring: 4, closeShot: 3, ballHandle: -8, speed: -4, passing: -4, vision: -4 },
  C: { block: 12, interiorD: 12, defRebound: 12, offRebound: 10, strength: 12, closeShot: 8, dunk: 6, threePoint: -10, midRange: -6, ballHandle: -14, speed: -8, acceleration: -8, passing: -6, freeThrow: -6, perimeterD: -6 },
};
const HEIGHT: Record<Position, number> = { PG: 189, SG: 196, SF: 201, PF: 206, C: 211 };
const POS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function genRatings(pos: Position, ovr: number, pot: number, rng: Rng): PlayerRatings {
  const base = 62 + (ovr - 72) * 1.1;
  const attrs = {} as Attributes;
  for (const k of ATTRS) attrs[k] = Math.round(clamp(base + (TEMPLATE[pos][k] ?? 0) + gauss(rng) * 6, 25, 99));
  const big = pos === 'C' || pos === 'PF';
  const r20 = () => 1 + Math.floor(rng() * 20);
  return {
    attrs, ovr, pot: Math.max(ovr, pot),
    tend: {
      usage: clamp(0.14 + (ovr - 65) * 0.006 + gauss(rng) * 0.02, 0.1, 0.3),
      threeRate: clamp((big ? 0.22 : 0.42) + (attrs.threePoint - 62) * 0.006 + gauss(rng) * 0.05, 0.02, 0.8),
      rimRate: big ? 0.65 : pos === 'PG' ? 0.4 : 0.45,
      ftRate: clamp(0.22 + (attrs.drawFoul - 62) * 0.004, 0.08, 0.5),
      passRate: clamp(0.35 + (attrs.passing - attrs.closeShot) * 0.01, 0.1, 0.8),
    },
    personality: { ego: r20(), workEthic: r20(), loyalty: r20(), temperament: r20() },
    injuryProne: clamp(0.5 - (attrs.durability - 62) / 60, 0.05, 0.95),
  };
}

export interface GenOpts { id: string; ovr: number; pot: number; age: number; pos?: Position; asOf: string; rng: Rng }

export function genPlayer(o: GenOpts): Player {
  const { rng } = o;
  const pos = o.pos ?? POS[Math.floor(rng() * 5)];
  const intl = rng() < 0.3 ? INTL[Math.floor(rng() * INTL.length)] : null;
  const pickName = (list: string[]) => list[Math.floor(rng() * list.length)];
  const [country, firstName, lastName] = intl ? [intl[0], pickName(intl[1]), pickName(intl[2])] : ['USA', pickName(FIRST_US), pickName(LAST_US)];
  const birthYear = Number(o.asOf.slice(0, 4)) - o.age;
  const heightCm = Math.round(HEIGHT[pos] + gauss(rng) * 3.5);
  return {
    id: o.id, firstName, lastName, teamId: null, jersey: String(Math.floor(rng() * 45)),
    positions: [pos], heightCm, weightKg: Math.round(heightCm * 0.49 - 5 + gauss(rng) * 5),
    birthDate: `${birthYear}-${String(1 + Math.floor(rng() * 12)).padStart(2, '0')}-15`, country,
    draft: null, yearsPro: 0, face: null,
    ratings: genRatings(pos, o.ovr, o.pot, rng), contract: null, history: [],
    season: emptyLine(), playoffs: emptyLine(), injury: null, morale: 70,
    prospect: true, college: intl ? INTL_CLUBS[country] : pickName(COLLEGES),
  };
}
