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
1. Sleeper API provides league, user, roster, and state data via IDX_0 through IDX_3
2. TRMNL prepends `shared.liquid` to the selected layout file
3. Liquid templates process this data server-side
4. JavaScript fetches live matchup data client-side (when in-season)
5. TRMNL Framework v2 classes style the output for e-ink displays

## Data Structure

### IDX_0 - League Data
```json
{
  "name": "League Name",
  "status": "pre_draft" | "in_season" | "complete",
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

### IDX_1 - Users Data
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

### IDX_2 - Rosters Data
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

### IDX_3 - NFL State
```json
{
  "week": 1,
  "leg": 1,
  "season": "2025",
  "season_type": "regular"
}
```

## Display Modes

### 1. Pre-Draft Mode (`status: "pre_draft"`)
- Shows centered message: "{League Name} is in pre-season"
- Full-screen card with centered text

### 2. In-Season Mode (`status: "in_season"`)
- Fetches live matchup data from the Sleeper matchups endpoint
- Displays a simplified matchup view with:
  - Team header (avatar, name, @username)
  - Win/loss record pills (last 6)
  - Current score only (no projected score/win probability)
  - VS divider with week number
  - BYE WEEK card when no opponent is scheduled

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
1. Fetches current week matchups from: `https://api.sleeper.app/v1/league/{league_id}/matchups/{week}`
2. Finds the user's team matchup (or a random team if not specified)
3. Renders a simplified matchup view (no projected scores/win probability) using framework v2 classes

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
  - `status`: set to `in_season` or `complete` to force the display mode
  - `week`: set to a numeric week (e.g., `8`) to control the matchup fetch
- Example (temporary during testing):
  - `{% assign status = 'in_season' %}`
  - `{% assign week = 8 %}`
- Remove or comment out these lines to return to normal behavior.

## Development Tips

1. Test with different league statuses to ensure proper display
2. Handle missing data gracefully (avatars, team names, etc.)
3. Keep layouts simple and high-contrast for e-ink readability
4. Use framework classes instead of custom CSS
5. Minimize JavaScript execution for battery efficiency
