/**
 * TRMNL Serverless function (Node.js) for Sleeper One-on-One Matchups.
 *
 * Input (from TRMNL):
 *   IDX_0  https://api.sleeper.app/v1/state/nfl
 *   IDX_1  https://api.sleeper.app/v1/league/{{ league_id }}
 *   IDX_2  https://api.sleeper.app/v1/league/{{ league_id }}/users    (wrapped as { data: [...] })
 *   IDX_3  https://api.sleeper.app/v1/league/{{ league_id }}/rosters  (wrapped as { data: [...] })
 *   trmnl  global variables, incl. plugin_settings.custom_fields_values
 *          { league_id, user_team, mode, test_status, test_week }
 * Any missing IDX_* payload is fetched here directly, so the function also works standalone.
 *
 * Output: { sleeper: {...} } — a single, display-ready object consumed by shared.liquid.
 *   view: 'pre_season' | 'matchup' | 'status' | 'winner' | 'none'
 */

const API = 'https://api.sleeper.app/v1';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper API ${res.status} for ${url}`);
  return res.json();
}

// TRMNL wraps top-level JSON arrays as { data: [...] }
function unwrap(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.data)) return value.data;
  return null;
}

function teamName(user) {
  return (user && ((user.metadata && user.metadata.team_name) || user.display_name)) || 'Team';
}

function profile(user) {
  return {
    team_name: teamName(user),
    username: (user && user.display_name) || '',
    avatar: (user && user.metadata && user.metadata.avatar) || null,
  };
}

function team(user, roster, points, projected) {
  return {
    ...profile(user),
    record: (roster && roster.metadata && roster.metadata.record) || '',
    wins: roster && roster.settings ? roster.settings.wins : null,
    losses: roster && roster.settings ? roster.settings.losses : null,
    score: (Number(points) || 0).toFixed(2),
    projected: projected == null ? null : projected.toFixed(2),
  };
}

// Score one player's projected stat line with the league's own scoring settings
// (Sleeper only ships pts_ppr/half/std presets, which ignore custom bonuses).
function projectPlayer(stats, scoring) {
  if (!stats) return 0;
  let pts = 0;
  for (const key of Object.keys(scoring)) {
    if (stats[key] != null && scoring[key]) pts += stats[key] * scoring[key];
  }
  return pts;
}

// Sum of projected points for a matchup's starters; null when no projections are available.
function projectTeam(matchup, projections, scoring) {
  if (!matchup || !projections || !Array.isArray(matchup.starters)) return null;
  let total = 0;
  let found = false;
  for (const id of matchup.starters) {
    const stats = projections[id];
    if (!stats) continue;
    found = true;
    total += projectPlayer(stats, scoring);
  }
  return found ? total : null;
}

function findUser(users, name) {
  const wanted = (name || '').trim();
  if (!wanted) return null;
  return users.find(u => u.display_name === wanted || (u.metadata && u.metadata.team_name === wanted)) || null;
}

// Pick the roster to feature: the configured team in 'my_team' mode, otherwise a random one.
function pickTarget(users, rosters, fields) {
  if ((fields.mode || 'all_teams') === 'my_team') {
    const user = findUser(users, fields.user_team);
    const roster = user && rosters.find(r => r.owner_id === user.user_id);
    if (user && roster) return { user, roster };
  }
  if (!rosters.length) return { user: null, roster: null };
  const roster = rosters[Math.floor(Math.random() * rosters.length)];
  return { roster, user: users.find(u => u.user_id === roster.owner_id) || null };
}

// ---- Playoff bracket helpers (Sleeper bracket entries: { r, m, t1, t2, w, l, t1_from, t2_from }) ----

function resolveFromRef(bracket, ref) {
  if (!ref) return null;
  const prevId = ref.w !== undefined ? ref.w : ref.l;
  const prev = bracket.find(m => m.m === prevId);
  if (!prev) return null;
  const resolved = ref.w !== undefined ? prev.w : prev.l;
  return resolved === undefined ? null : resolved;
}

function slots(bracket, match) {
  return [
    match.t1 != null ? match.t1 : resolveFromRef(bracket, match.t1_from),
    match.t2 != null ? match.t2 : resolveFromRef(bracket, match.t2_from),
  ];
}

function involves(bracket, match, rosterId) {
  const [t1, t2] = slots(bracket, match);
  return t1 === rosterId || t2 === rosterId;
}

function opponentOf(bracket, match, rosterId) {
  const [t1, t2] = slots(bracket, match);
  if (t1 === rosterId) return t2;
  if (t2 === rosterId) return t1;
  return null;
}

/**
 * Returns one of:
 *   { outcome: 'matchup', opponent, bracket_type }
 *   { outcome: 'waiting', bracket_type }      bye, or previous round not yet decided
 *   { outcome: 'eliminated' }
 */
async function resolvePlayoffs(leagueId, rosterId, round) {
  const [winners, losers] = await Promise.all([
    getJson(`${API}/league/${leagueId}/winners_bracket`),
    getJson(`${API}/league/${leagueId}/losers_bracket`),
  ]);

  let bracket = winners;
  let type = 'Winners';
  let match = winners.find(m => m.r === round && involves(winners, m, rosterId));
  if (!match) {
    bracket = losers;
    type = 'Losers';
    match = losers.find(m => m.r === round && involves(losers, m, rosterId));
  }

  if (!match) {
    const lostInLosers = losers.some(m => m.l === rosterId);
    const inAnyBracket =
      winners.some(m => involves(winners, m, rosterId)) || losers.some(m => involves(losers, m, rosterId));
    if (lostInLosers || !inAnyBracket) return { outcome: 'eliminated' };
    return { outcome: 'waiting', bracket_type: null };
  }

  const opponent = opponentOf(bracket, match, rosterId);
  if (opponent === null) return { outcome: 'waiting', bracket_type: type };
  return { outcome: 'matchup', opponent, bracket_type: type };
}

// ---- Main ----

async function run(input) {
  input = input || {};
  const fields = (input.trmnl && input.trmnl.plugin_settings && input.trmnl.plugin_settings.custom_fields_values) || {};

  const out = {
    status: null,
    week: null,
    is_playoffs: false,
    playoff_round: 0,
    bracket_type: null,
    league: { name: null, avatar: null, season: null },
    season_start_date: null,
    my_team: null,
    view: 'none',
    team1: null,
    team2: null,
    status_text: null,
    winner: null,
    error: null,
  };

  try {
    // Prefer the league the data was actually polled for; fall back to the configured field.
    const leagueId = (input.IDX_1 && input.IDX_1.league_id) || fields.league_id;
    if (!leagueId) throw new Error('No league_id configured');

    const [nfl, league, users, rosters] = await Promise.all([
      input.IDX_0 || getJson(`${API}/state/nfl`),
      input.IDX_1 || getJson(`${API}/league/${leagueId}`),
      unwrap(input.IDX_2) || getJson(`${API}/league/${leagueId}/users`),
      unwrap(input.IDX_3) || getJson(`${API}/league/${leagueId}/rosters`),
    ]);
    const settings = league.settings || {};

    const status = fields.test_status || league.status;
    const week = parseInt(fields.test_week, 10) || nfl.week || settings.leg || 1;
    const playoffStart = settings.playoff_week_start || 15;
    const isPlayoffs = week >= playoffStart;
    const round = isPlayoffs ? week - playoffStart + 1 : 0;

    out.status = status;
    out.week = week;
    out.is_playoffs = isPlayoffs;
    out.playoff_round = round;
    out.league = { name: league.name, avatar: league.avatar || null, season: league.season };
    out.season_start_date = nfl.season_start_date || null;

    const myUser = findUser(users, fields.user_team);
    out.my_team = myUser ? profile(myUser) : null;

    if (status === 'pre_draft' || status === 'drafting') {
      out.view = 'pre_season';
    } else if (status === 'in_season' || status === 'post_season') {
      await buildMatchup();
    } else if (status === 'complete') {
      const winnerId = String((league.metadata && league.metadata.latest_league_winner_roster_id) || '');
      const roster = rosters.find(r => String(r.roster_id) === winnerId);
      const user = roster && users.find(u => u.user_id === roster.owner_id);
      out.winner = user ? profile(user) : null;
      out.view = 'winner';
    }

    async function buildMatchup() {
      const { user, roster } = pickTarget(users, rosters, fields);
      if (!roster) throw new Error('League has no rosters');
      const rosterId = roster.roster_id;

      const showStatus = (text) => {
        out.view = 'status';
        out.team1 = team(user, roster);
        out.status_text = text;
      };

      // Start the scores and projections requests now; they are needed in every non-terminal path below.
      const matchupsPromise = getJson(`${API}/league/${leagueId}/matchups/${week}`).catch(() => null);
      const projectionsPromise = getJson(`${API}/projections/nfl/regular/${league.season}/${week}`).catch(() => null);

      let opponentId = null;
      if (isPlayoffs) {
        const playoff = await resolvePlayoffs(leagueId, rosterId, round);
        out.bracket_type = playoff.bracket_type || null;
        if (playoff.outcome === 'eliminated') return showStatus('SEASON OVER');
        if (playoff.outcome === 'waiting') return showStatus(round === 1 ? 'FIRST ROUND BYE' : 'AWAITING OPPONENT');
        opponentId = playoff.opponent;
      }

      const matchups = (await matchupsPromise) || [];
      const mine = matchups.find(m => m.roster_id === rosterId);

      if (!isPlayoffs) {
        if (!mine) {
          // No schedule for this week yet: show the featured team on its own.
          out.view = 'matchup';
          out.team1 = team(user, roster);
          return;
        }
        if (mine.matchup_id == null) return showStatus('BYE WEEK');
        const opp = matchups.find(m => m.matchup_id === mine.matchup_id && m.roster_id !== rosterId);
        if (!opp) return showStatus('BYE WEEK');
        opponentId = opp.roster_id;
      }

      const oppMatchup = matchups.find(m => m.roster_id === opponentId) || null;
      const oppRoster = rosters.find(r => r.roster_id === opponentId) || null;
      const oppUser = oppRoster ? users.find(u => u.user_id === oppRoster.owner_id) || null : null;

      const projections = await projectionsPromise;
      const scoring = league.scoring_settings || {};

      out.view = 'matchup';
      out.team1 = team(user, roster, mine && mine.points, projectTeam(mine, projections, scoring));
      out.team2 = oppRoster
        ? team(oppUser, oppRoster, oppMatchup && oppMatchup.points, projectTeam(oppMatchup, projections, scoring))
        : null;
    }
  } catch (err) {
    out.error = err && err.message ? err.message : String(err);
    console.error('sleeper serverless error:', out.error);
  }

  return { sleeper: out };
}

// Allow local testing with `node`; TRMNL only needs the global `run` above.
if (typeof module !== 'undefined') module.exports = { run };
