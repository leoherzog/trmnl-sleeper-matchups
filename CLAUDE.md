# Sleeper Matchups Plugin for TRMNL

## Overview
This is a TRMNL plugin that displays fantasy football matchup information from the Sleeper Fantasy Football platform on e-ink displays. The plugin adapts its display based on the league's current status (pre-draft, in-season, or complete).

## Architecture

### Files
- `shared.liquid` - Primary template source containing all reusable Liquid templates and components. This file is automatically prepended to the selected layout by the TRMNL system
- `full.liquid` - Full-screen layout that renders `main_content` and a `title_bar`
- `half-horizontal.liquid` - Half-screen horizontal layout that renders `main_content` with `layout_size: "half-horizontal"`
- `half-vertical.liquid` - Half-screen vertical layout that renders `main_content` with `layout_size: "half-vertical"`
- `quadrant.liquid` - Quarter-screen layout that renders `main_content` with `layout_size: "quadrant"`
- `IDX_*.example.json` - Example data files showing the API response structure

### Template System
The TRMNL system automatically prepends `shared.liquid` to whichever layout file is being rendered. This means:
- All template definitions should be placed in `shared.liquid`
- Layout files (`full.liquid`, `half-*.liquid`, `quadrant.liquid`) should only contain layout-specific rendering logic
- Templates defined in `shared.liquid` are available to all layout files via `{% render %}` tags

### Data Flow
1. Sleeper API provides NFL state, league, user, and roster data via IDX_0 through IDX_3 (in that order)
2. TRMNL prepends `shared.liquid` to the selected layout file
3. Liquid templates process this data server-side
4. JavaScript fetches live matchup data client-side (when in-season)
5. TRMNL Framework v2 classes style the output for e-ink displays

## Data Structure

### IDX_0 - NFL State
```json
{
  "week": 1,
  "leg": 1,
  "season": "2025",
  "season_type": "regular",
  "season_start_date": "2025-09-04"
}
```

### IDX_1 - League Data
```json
{
  "name": "League Name",
  "status": "pre_draft" | "in_season" | "post_season" | "complete",
  "season": "2025",
  "draft_id": "...",
  "settings": {
    "leg": 1,  // Current week of regular season
    "playoff_week_start": 16,
    "num_teams": 10,
    ...
  },
  "roster_positions": ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF", "BN", ...],
  "avatar": "..." // Optional league avatar ID
}
```

### IDX_2 - Users Data
```json
{
  "data": [{
    "user_id": "...",
    "display_name": "@username",
    "metadata": {
      "team_name": "Custom Team Name",
      "avatar": "https://..." // Optional team avatar URL
    }
  }]
}
```

### IDX_3 - Rosters Data
```json
{
  "data": [{
    "roster_id": 1,
    "owner_id": "user_id",
    "settings": {
      "wins": 0,
      "losses": 0,
      "fpts": 0,  // Fantasy points (actual)
      "fpts_decimal": 0,
      "ppts": 0,  // Projected points
      "ppts_decimal": 0
    },
    "metadata": {
      "record": "WWLWLL"  // Win/loss record string
    },
    "starters": ["player_id", ...],
    "players": ["player_id", ...]
  }]
}
```

## Semantic Variables
The templates now use semantic variable names mapped from the IDX data:
- `nfl_state` (from IDX_0)
- `league_data` (from IDX_1)
- `users_data` (from IDX_2)
- `rosters_data` (from IDX_3)

## Display Modes

### 1. Pre-Draft Mode (`status: "pre_draft"`)
- Shows centered message: "{League Name} is in pre-season"
- Full-screen card with centered text

### 2. In-Season Mode (`status: "in_season"` or `"post_season"`)
- `in_season`: Regular season games (weeks 1 through playoff_week_start - 1)
- `post_season`: Playoff games (Sleeper changes status to this when playoffs begin)
- Both statuses use the same matchup display logic
- Fetches live matchup data from the Sleeper matchups endpoint
- Displays a simplified matchup view with:
  - Team header (avatar, name, @username with record e.g. "7-3")
  - Win/loss record pills (full history)
  - Current score only (no projected score/win probability)
  - VS divider with week number (regular season) or round number (playoffs)
  - BYE WEEK card when no opponent is scheduled

#### Playoff Mode (automatic when `week >= playoff_week_start`)
- Detects playoffs automatically by comparing current week to `league_data.settings.playoff_week_start`
- Calculates playoff round: `playoff_round = current_week - playoff_week_start + 1`
- Shows "Round X" instead of "Week X" in title bar and VS divider
- Special handling for playoff scenarios:
  - **First Round Bye**: Top seeds with no opponent in Round 1 see "FIRST ROUND BYE"
  - **Eliminated Teams**: Teams not in playoffs (no matchup data) see "SEASON OVER"
  - **Awaiting Opponent**: Teams with no opponent in Round 2+ see "AWAITING OPPONENT"

### 3. Season Complete Mode (`status: "complete"`)
- Shows season winner with trophy emoji
- Displays: "The {year} winner of {league name} is"
- Team header with avatar, name, and @username

## Key Templates in shared.liquid

### `title_bar`
Displays league header with:
- League avatar (or Sleeper logo fallback)
- League name
- User's team name and avatar (shown only in `layout_size: "full"`)

### `team_header`
Reusable component for displaying team info:
- Parameters: `user`, `alignment` (left/right/center), `show_avatar`
- Shows avatar (with Sleeper logo fallback), team name, @username
- Used in matchup cards and winner display

### `pre_season_draft_card`
Full-screen centered card for pre-draft status

### `season_complete_card`
Full-screen card showing season winner with trophy

### `matchup_card`
Team matchup card used by JS and can be rendered via Liquid:
- Team header
- Win/loss record
- Current score (no projected/win probability)

### `bye_week_card`
Renders a BYE WEEK card with the team name centered.

### `in_season_matchup_container`
Responsive container that adapts classes to `layout_size`.

### `matchup_display`
Wires up the container and the JavaScript for in-season rendering.

### `matchup_javascript`
Client-side script that fetches matchups, determines the target roster (selected or random), pairs it with its opponent if any, and injects simplified HTML using framework v2 classes.

## TRMNL Framework v2 Classes Used

### Layout & Positioning
- `view view--full` - Full viewport container
- `flex flex--center-x flex--center-y` - Center content both axes
- `flex flex--row` / `flex--col` - Row/column layouts
- `flex--space-between` - Space items evenly
- `gap--medium`, `gap--small` - Spacing between flex items

### Typography
- `title title--small/medium/large/xlarge` - Title sizes
- `label label--small` - Small labels
- `value value--small/medium/large` - Numeric values
- `text--center`, `text--right` - Text alignment

### Colors & Backgrounds
- `bg--white`, `bg--gray-65` - Background colors
- `bg--black`, `bg--gray-30` - For win/loss pills
- `text--white` - White text on dark backgrounds
- `dim` - Dimmed text appearance

### Images
- `image image-stroke image--dither` - E-ink optimized images
- `rounded--full` - Circular images
- `w--12 h--12` - 48px square dimensions

### Utilities
- `mb--8`, `pt--8` - Margin/padding utilities
- `rounded--medium` - Rounded corners
- `border--h-1` - Horizontal borders
- `no-shrink`, `stretch-x` - Flex item behavior

## JavaScript Integration

The `shared.liquid` file includes client-side JavaScript that:

### Regular Season
1. Fetches current week matchups from: `https://api.sleeper.app/v1/league/{league_id}/matchups/{week}`
2. Finds the user's team matchup (or a random team if not specified)
3. Renders a simplified matchup view (no projected scores/win probability) using framework v2 classes

### Playoffs
During playoffs (when `week >= playoff_week_start`), the JavaScript:
1. Fetches both brackets in parallel:
   - Winners bracket: `https://api.sleeper.app/v1/league/{league_id}/winners_bracket`
   - Losers bracket (consolation): `https://api.sleeper.app/v1/league/{league_id}/losers_bracket`
2. Checks winners bracket first, then losers bracket if team not found
3. Parses bracket structure to find:
   - Which teams are in the current playoff round
   - Who each team's opponent is (using bracket `t1`/`t2` fields)
   - Whether a team has a first-round bye or is eliminated
4. Also fetches matchups endpoint for live scores: `https://api.sleeper.app/v1/league/{league_id}/matchups/{week}`
5. Combines bracket data (opponent pairing) with matchups data (scores)

**Note:** Teams eliminated from the winners bracket play in the losers (consolation) bracket. The code tracks which bracket a team is in via `isLosersBracket` flag.

### Bracket Response Structure
The `winners_bracket` endpoint returns:
```json
[
  {"r": 1, "m": 1, "t1": 3, "t2": 6, "w": null, "l": null},
  {"r": 2, "m": 3, "t1": 1, "t2": null, "t2_from": {"w": 1}, "w": null, "l": null}
]
```

**Field definitions:**
- `r`: Round number (1, 2, 3...)
- `m`: Match ID (unique identifier for this matchup)
- `t1`/`t2`: Direct roster IDs when team is seeded directly, OR `null` when determined by bracket progression
- `t1_from`/`t2_from`: Bracket progression reference (e.g., `{w: 1}` = winner of match 1, `{l: 1}` = loser of match 1)
- `w`/`l`: Winner and loser roster IDs once the match is decided

**Important:** When `t1` or `t2` is `null`, check `t1_from` or `t2_from` to find where the team comes from. The actual roster ID is found by resolving the reference: look up the match by `m` and get the `w` (winner) or `l` (loser) field.

**Example:** In `{"r": 2, "m": 3, "t1": 1, "t2": null, "t2_from": {"w": 1}}`:
- Team 1 (roster_id: 1) has a first-round bye and is directly seeded
- Team 2 is the winner of match 1 (resolved via `t2_from.w`)

## Configuration

Plugin settings (via `trmnl.plugin_settings.custom_fields_values`):
- `mode`: "my_team" or "all_teams"
- `user_team`: Username or team name to track
- `league_id`: Sleeper league ID

## Important Notes

1. **Avatar Fallbacks**: Always check for avatar existence and fall back to Sleeper logo SVG
2. **Score Formatting**: Live matchup `points` values are displayed as provided by the API and formatted to two decimals; no integer/decimal recombination is performed in the client script
3. **Flex Centering**: Use `flex--center-x flex--center-y` together (not just `flex--center`)
4. **E-ink Optimization**: Use dithered images and grayscale patterns from framework
5. **Status Checking**: Always verify league status before rendering mode-specific content
6. **BYE Handling**: If no opponent is found for the selected team, a `BYE WEEK` card is shown

## Testing Simulation

To simulate different league states during development:
- At the top of `shared.liquid`, set overrides:
  - `status`: set to `in_season`, `post_season`, or `complete` to force the display mode
  - `week`: set to a numeric week (e.g., `8`) to control the matchup fetch
- Example (temporary during testing):
  - `{% assign status = 'in_season' %}`
  - `{% assign week = 8 %}`
- Remove or comment out these lines to return to normal behavior.
- Note: `in_season` and `post_season` both render the matchup display; the difference is cosmetic (Sleeper API uses `post_season` during playoffs).

### Testing Playoffs
To simulate playoff mode:
- Set `test_week` in your TRMNL plugin settings to a value >= `playoff_week_start`
- For example, if `playoff_week_start` is 15, set `test_week` to 15 for Round 1, 16 for Round 2, etc.
- Alternatively, add at the top of `shared.liquid`:
  - `{% assign force_week = 15 %}` (where 15 >= your league's playoff_week_start)

## Development Tips

1. Test with different league statuses to ensure proper display
2. Handle missing data gracefully (avatars, team names, etc.)
3. Keep layouts simple and high-contrast for e-ink readability
4. Use framework classes instead of custom CSS
5. Minimize JavaScript execution for battery efficiency
