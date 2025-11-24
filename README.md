```markdown
# CSCI-4341-Lab-9 — Kings of the West

This small browser game implements a 6×6 tactical duel between two players (kings, gunslingers, bruisers).

How to run
- Open `index.html` in a browser.

Quick rules
- Board: 6x6 grid.
- Each player fields 5 pieces: King (required) + 4 chosen fighters (from gunslingers / bruisers).
- King: 10 HP. Gunslinger: 7 HP. Bruiser: 8 HP.
- Movement and dice:
	- Roll 1: move 1 tile (may attack after move)
	- Roll 2: move up to 2 tiles
	- Roll 3: move up to 3 tiles
	- Roll 4: move 1 tile + attack with 2x damage 
	- Roll 5: move 1 tile + attack with 3x damage 
	- Roll 6: unlucky — skip
- Attacks:
	- Gunslinger: short (1 tile) = 3 dmg; long (2-3 tiles) = 2 dmg
	- Bruiser: short (1 tile) = 3 dmg
	- King: melee/short (1 tile) = 3 dmg
- Win: eliminate opponent's king OR all opponent fighters.

Controls
- Use the roster checkboxes to select 4 additional pieces (king is required).
- Click Start, then place your fighters in your back two rows (player 1: rows 4–5). King is auto-placed.
- Player 2 will be auto-placed (king at 0,5). Highest initial roll goes first.
- On your turn press Roll Dice and follow the action prompts.

Notes
- This is a small, local-only demo. It aims to match the provided formal rules with a simple UI.
``` 
