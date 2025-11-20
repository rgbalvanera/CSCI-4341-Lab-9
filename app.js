// Kings of the West - simple 6x6 tactical duel
const ROWS = 6, COLS = 6;

const PIECE_ICONS = {
    king: '\u{2B50}',
    gunslinger: '\u{1F52B}',
    bruiser: '\u{1FA93}',
};

let readyCallback = null;
let readyTimeout = null;
let skipTimeout = null;
const state = {
	board: [], // cells
	players: {1:{pieces:[]},2:{pieces:[]}},
	currentPlayer: null,
	phase: 'setup', // setup, placement, play
	selectedPiece: null,
	dice: null,
	diceMultiplier: 1,
	awaitingPlacement: 0,
	actionLocked: false,
	attackPending: false,
	pendingPlacement: [],
	attackTargets: new Set(),
	aiEnabled: false,
	aiDifficulty: 'easy',
};

const el = {
	board: document.getElementById('board'),
	boardArea: document.getElementById('board-area'),
	sidebar: document.getElementById('sidebar'),
	startBtn: document.getElementById('start-btn'),
	rollBtn: document.getElementById('roll-btn'),
	diceResult: document.getElementById('dice-result'),
	playerTurn: document.getElementById('player-turn'),
	actionDesc: document.getElementById('action-desc'),
	controls: document.getElementById('controls'),
	messages: document.getElementById('messages'),
	resetBtn: document.getElementById('reset-btn'),
	setupPanel: document.getElementById('setup'),
	turnBanner: document.getElementById('turn-banner'),
	bannerTurn: document.getElementById('banner-turn'),
	rulesToggle: document.getElementById('rules-toggle'),
	rulesModal: document.getElementById('rules-modal'),
	rulesClose: document.getElementById('rules-close'),
	readyModal: document.getElementById('ready-modal'),
	readyContinue: document.getElementById('ready-continue'),
	endTurnBtn: document.getElementById('end-turn-btn'),
	modeSelect: document.getElementById('mode-select'),
	aiDifficulty: document.getElementById('ai-difficulty'),
	aiDiffButtons: null,
	currentMode: document.getElementById('current-mode'),
};

function log(...args){
	const d = document.createElement('div');
	d.textContent = args.join(' ');
	if(el.messages){
		el.messages.prepend(d);
	} else {
		console.log(...args);
	}
}

function resetHighlights(){
	document.querySelectorAll('.cell').forEach(c=>c.classList.remove('highlight-move','highlight-attack'));
	state.attackTargets.clear();
}

function createBoard(){
	state.board = [];
	el.board.innerHTML = '';
	for(let r=0;r<ROWS;r++){
		for(let c=0;c<COLS;c++){
			const idx = r*COLS + c;
			state.board[idx] = {r,c,el:null};
			const cell = document.createElement('div');
			cell.className = 'cell';
			cell.dataset.r = r; cell.dataset.c = c; cell.dataset.idx = idx;
			cell.addEventListener('click', ()=>onCellClick(r,c));
			el.board.appendChild(cell);
			state.board[idx].el = cell;
		}
	}
}

function uid(prefix){return prefix+'-'+Math.random().toString(36).slice(2,9)}

function placePiece(owner,type,r,c,isKing=false){
	const piece = {id:uid('p'), owner, type, r,c, hp: type==='king'?10:(type==='gunslinger'?7:8), isKing:!!isKing};
	state.players[owner].pieces.push(piece);
	renderBoard();
}

function renderBoard(){
	// clear pieces
	document.querySelectorAll('.cell .piece') .forEach(n=>n.remove());
	for(const p of [...state.players[1].pieces, ...state.players[2].pieces]){
		const idx = p.r*COLS + p.c;
		const cell = state.board[idx].el;
		const div = document.createElement('div'); div.className = `piece ${p.owner===1? 'p1':'p2'}`;
		if(p.isKing) div.classList.add('p-king');
		const icon = PIECE_ICONS[p.type] || p.type[0].toUpperCase();
		div.innerHTML = `<div class="piece-icon">${icon}</div><div class="hp">${p.hp}</div>`;
		div.title = `${p.type} (${p.hp} HP)`;
		div.dataset.id = p.id;
		div.addEventListener('click', (ev)=>{ 
			ev.stopPropagation(); 
			onPieceClick(p); 
			if(state.attackTargets.has(p.id)) onCellClick(p.r,p.c); 
		});
		cell.appendChild(div);
		cell.classList.toggle('dead', p.hp<=0);
	}
	updateTurnInfo();
}

function findPieceById(id){
	for(const pl of [1,2]){
		for(const p of state.players[pl].pieces) if(p.id===id) return p;
	}
}

function onCellClick(r,c){
	if(state.phase === 'placement' && state.awaitingPlacement>0){
		// placing for current placementOwner (1 or 2)
		const owner = state.placementOwner || 1;
		const validRows = owner===1 ? [4,5] : [0,1];
		if(!validRows.includes(r)){ log('Choose a tile in your back two rows'); return; }
		if(getPieceAt(r,c)){ log('Tile occupied'); return; }
		const pending = state.pendingPlacement.shift();
		placePiece(owner, pending, r, c, pending==='king');
		state.awaitingPlacement--;
		if(state.awaitingPlacement===0){
			handlePlacementComplete();
		} else {
			log(`Placed ${pending}. ${state.awaitingPlacement} left to place.`);
		}
		return;
	}

	if(state.phase==='play'){
		// if selecting a highlighted move target
		const cell = getPieceAt(r,c);
		// if selection is a move target highlighted (no piece present)
		const elCell = state.board[r*COLS+c].el;
		if(elCell.classList.contains('highlight-move') && state.selectedPiece && state.selectedPiece.owner===state.currentPlayer){
			// move
			movePiece(state.selectedPiece, r, c);
		}
		if(elCell.classList.contains('highlight-attack') && state.selectedPiece){
			const target = getPieceAt(r,c);
			if(target) performAttack(state.selectedPiece, target, state.diceMultiplier || 1);
		}
	}
}

function onPieceClick(p){
	if(state.phase==='placement') return;
	if(state.phase==='play' && state.currentPlayer && p.owner===state.currentPlayer){
		if(state.actionLocked) return;
		// selecting own piece
		state.selectedPiece = p;
		resetHighlights();
		// If dice is 1-3, highlight reachable tiles
		if(state.dice>=1 && state.dice<=3){
			const tiles = getReachable(p, state.dice);
			tiles.forEach(t=>state.board[t.r*COLS+t.c].el.classList.add('highlight-move'));
			// also highlight attackable enemies in current position (if no move chosen)
			const enemies = getEnemiesInAttackRange(p, p.r, p.c);
			enemies.forEach(e=>state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'));
			state.attackTargets = new Set(enemies.map(e=>e.id));
			el.actionDesc.textContent = `Move up to ${state.dice} and optionally attack`;
		} else if(state.dice===4 || state.dice===5){
			// move up to 1 tile and attack with multiplier
			const mult = state.dice===4?2:3;
			state.diceMultiplier = mult;
			const tiles = getReachable(p, 1);
			tiles.forEach(t=>state.board[t.r*COLS+t.c].el.classList.add('highlight-move'));
			const attackCandidates = [];
			// highlight enemies attackable from current position
			const enemiesHere = getEnemiesInAttackRange(p, p.r, p.c, /*allowLong*/true);
			enemiesHere.forEach(e=>{ state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'); attackCandidates.push(e); });
			// highlight enemies attackable from each possible move tile
			for(const t of tiles){
				const enemiesFrom = getEnemiesInAttackRange(p, t.r, t.c, /*allowLong*/true);
				enemiesFrom.forEach(e=>{ state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'); attackCandidates.push(e); });
			}
			state.attackTargets = new Set(attackCandidates.map(e=>e.id));
			el.actionDesc.textContent = `Move up to 1 tile and attack with ${mult}x damage - choose piece or target`;
		} else if(state.dice===6){
			el.actionDesc.textContent = 'This unit is skipped (rolled 6).';
			state.attackTargets.clear();
		}
	}
	if(state.attackTargets.size===0 && state.dice!==6){
		state.attackTargets.clear();
	}
}

function getPieceAt(r,c){
	for(const p of [...state.players[1].pieces, ...state.players[2].pieces]) if(p.r===r && p.c===c && p.hp>0) return p;
	return null;
}

function getReachable(p, steps){
	// BFS orthogonal not passing through pieces
	const q=[{r:p.r,c:p.c,dist:0}];
	const seen = new Set([p.r+','+p.c]);
	const reachable = [];
	while(q.length){
		const cur = q.shift();
		const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
		for(const d of dirs){
			const nr = cur.r + d[0], nc = cur.c + d[1];
			if(nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
			const key = nr+','+nc;
			if(seen.has(key)) continue;
			// cannot move into occupied cells
			if(getPieceAt(nr,nc)) { seen.add(key); continue; }
			const nd = cur.dist+1;
			if(nd>steps) { seen.add(key); continue; }
			reachable.push({r:nr,c:nc});
			seen.add(key);
			q.push({r:nr,c:nc,dist:nd});
		}
	}
	return reachable;
}

function getEnemiesInAttackRange(p, fromR, fromC, allowLong=false){
	const opp = p.owner===1?2:1;
	const enemies = [];
	for(const e of state.players[opp].pieces){
		if(e.hp<=0) continue;
		const dist = Math.abs(e.r-fromR)+Math.abs(e.c-fromC);
		if(p.type==='gunslinger'){
			if(dist===1) enemies.push(e);
			else if(dist>=2 && dist<=3) enemies.push(e);
		} else { // bruiser or king
			if(dist===1) enemies.push(e);
		}
	}
	return enemies;
}

function movePiece(p, r,c){
	p.r = r; p.c = c; renderBoard();
	state.actionLocked = true;
	// after moving, allow attack if enemies in range
	const enemies = getEnemiesInAttackRange(p, r, c);
	state.attackPending = enemies.length>0;
	state.attackTargets = new Set(enemies.map(e=>e.id));
	if(enemies.length){
		enemies.forEach(e=>state.board[e.r*COLS+e.c].el.classList.add('highlight-attack'));
		el.actionDesc.textContent = 'Choose an enemy to attack or end turn.';
		// if player clicks attack highlight, handled elsewhere
	} else {
		endTurn();
	}
}

function performAttack(attacker, target, multiplier=1){
	const dist = Math.abs(attacker.r-target.r)+Math.abs(attacker.c-target.c);
	let dmg = 0;
	if(attacker.type==='gunslinger'){
		dmg = dist===1?3: (dist>=2 && dist<=3?2:0);
	} else { dmg = dist===1?3:0; }
	dmg *= multiplier;
	if(dmg<=0){ log('Target out of range'); return; }
	target.hp -= dmg;
	log(`Player ${attacker.owner}'s ${attacker.type} hits Player ${target.owner}'s ${target.type} for ${dmg} damage.`);
	if(target.hp<=0){
		log(`${target.type} (Player ${target.owner}) was eliminated.`);
		// remove piece
		state.players[target.owner].pieces = state.players[target.owner].pieces.filter(x=>x.id!==target.id);
	}
	// clear dice multiplier
	state.diceMultiplier = 1;
	renderBoard();
	checkWin();
	endTurn();
}

function endTurn(){
	resetHighlights();
	state.selectedPiece = null;
	state.dice = null; state.diceMultiplier = 1;
	el.diceResult.textContent = '-'; el.actionDesc.textContent='-';
	el.rollBtn.disabled = false;
	hideEndTurnButton();
	if(skipTimeout){ clearTimeout(skipTimeout); skipTimeout = null; }
	state.currentPlayer = state.currentPlayer===1?2:1;
	state.actionLocked = false;
	state.attackPending = false;
	updateTurnInfo();
	// If the next player is AI, trigger its turn
	triggerAITurnIfNeeded();
}

function updateTurnInfo(){
	el.sidebar?.classList.remove('player-1-turn','player-2-turn');
	el.controls?.classList.remove('player-1-turn','player-2-turn');
	if(!state.currentPlayer){
		el.playerTurn.textContent='-';
		el.turnBanner?.classList.add('hidden');
		if(el.bannerTurn) el.bannerTurn.textContent='-';
		return;
	}
	el.playerTurn.textContent = `Player ${state.currentPlayer}`;
	if(el.bannerTurn) el.bannerTurn.textContent = `Player ${state.currentPlayer}`;
	el.turnBanner?.classList.remove('hidden');
	el.sidebar?.classList.add(`player-${state.currentPlayer}-turn`);
	el.controls?.classList.add(`player-${state.currentPlayer}-turn`);
	el.playerTurn.classList.remove('pulse');
	requestAnimationFrame(()=> el.playerTurn.classList.add('pulse'));
}

function showRules(){
	el.rulesModal?.classList.remove('hidden');
}

function hideRules(){
	el.rulesModal?.classList.add('hidden');
}

function showEndTurnButton(){
	el.endTurnBtn?.classList.remove('hidden');
}

function hideEndTurnButton(){
	el.endTurnBtn?.classList.add('hidden');
}

function showReadyMessage(callback){
	readyCallback = callback||null;
	el.readyModal?.classList.remove('hidden');
	if(readyTimeout){ clearTimeout(readyTimeout); readyTimeout = null; }
	readyTimeout = setTimeout(hideReadyMessage, 1400);
}

function hideReadyMessage(){
	if(!el.readyModal) return;
	el.readyModal.classList.add('hidden');
	if(readyTimeout){ clearTimeout(readyTimeout); readyTimeout = null; }
	if(readyCallback){
		const cb = readyCallback;
		readyCallback = null;
		cb();
	}
}

function rollDice(){ return Math.floor(Math.random()*6)+1; }

function onRoll(){
	if(state.phase!=='play') return;
	state.actionLocked = false;
	state.attackPending = false;
	state.diceMultiplier = 1;
	state.selectedPiece = null;
	resetHighlights();
	const r = rollDice();
	state.dice = r;
	el.diceResult.textContent = r;
	el.rollBtn.disabled = true;
	log(`Player ${state.currentPlayer} rolled ${r}`);
	if(r===6){
		log('Unlucky! Turn skipped.');
		el.actionDesc.textContent = 'Rolled 6: turn skipped';
		hideEndTurnButton();
		if(skipTimeout) clearTimeout(skipTimeout);
		skipTimeout = setTimeout(()=>{
			skipTimeout = null;
			endTurn();
		}, 1100);
		return;
	}
	// player must now select a piece to act
	showEndTurnButton();
	if(r>=1 && r<=3){
		el.actionDesc.textContent = `Select a piece to move up to ${r}`;
	} else if(r===4 || r===5){
		const mult = r===4?2:3;
		el.actionDesc.textContent = `Select a piece to move up to 1 and attack (x${mult})`;
	}
}

function checkWin(){
	for(const pl of [1,2]){
		const opponent = pl===1?2:1;
		const oppPieces = state.players[opponent].pieces;
		const kingAlive = oppPieces.some(p=>p.isKing);
		const fightersAlive = oppPieces.filter(p=>!p.isKing).length;
		if(!kingAlive || fightersAlive===0){
			// pl wins
			log(`Player ${pl} wins!`);
			alert(`Player ${pl} wins!`);
			state.phase='finished';
			el.controls.classList.add('hidden');
			return true;
		}
	}
	return false;
}

function startPlacement(){
	state.phase='placement';
	// read selected choices
	const choices1 = Array.from(document.querySelectorAll('.p-choice-p1')).filter(i=>i.checked).map(i=>i.value);
	const choices2 = Array.from(document.querySelectorAll('.p-choice-p2')).filter(i=>i.checked).map(i=>i.value);
	if(choices1.length!==4 || choices2.length!==4){
		alert('Each player must select exactly 4 additional pieces (plus the king makes 5).');
		return;
	}
	el.startBtn.disabled = true;
	el.boardArea.classList.remove('hidden-board');
	// store both rosters and prepare pending placement for Player 1
	state.roster1 = [...choices1];
	state.roster2 = [...choices2];
	state.pendingPlacement = [...state.roster1];
	state.awaitingPlacement = state.pendingPlacement.length;
	state.placementOwner = 1;
	// place player1 king at bottom-left (row5,col0)
	placePiece(1,'king',5,0,true);
	log('Player 1 king placed at (5,0). Player 1: place remaining pieces by clicking your back two rows (rows 4-5).');
	el.startBtn.disabled = true; el.startBtn.textContent='Placing...';
}

function handlePlacementComplete(){
	// If player 1 just finished, switch to player 2 placement
	if(!state.placementOwner || state.placementOwner===1){
		state.placementOwner = 2;
		// place player2 king at top-right (0,5)
		placePiece(2,'king',0,5,true);
		// refill pendingPlacement for player 2 using roster2
		state.pendingPlacement = [...(state.roster2||[])];
		state.awaitingPlacement = state.pendingPlacement.length;
		log('Player 2 king placed at (0,5). Player 2: place your remaining pieces by clicking rows 0-1.');
		return;
	}

	// both players finished placement
	log('Both players placed. Ready to begin.');
	showReadyMessage(decideFirstPlayer);
}

function decideFirstPlayer(){
	let a = rollDice(), b = rollDice();
	while(a===b){ a=rollDice(); b=rollDice(); }
	const starter = a>b?1:2;
	state.currentPlayer = starter; state.phase='play'; el.controls.classList.remove('hidden'); el.startBtn.style.display='none';
	log(`Player 1 rolled ${a}, Player 2 rolled ${b}. Player ${starter} goes first.`);
	renderBoard(); updateTurnInfo();
	el.setupPanel?.classList.add('hidden');
	// If AI is enabled and it's the AI's turn, trigger its turn
	triggerAITurnIfNeeded();
}

// Trigger the AI if it's the AI player's turn
function triggerAITurnIfNeeded(){
	if(state.phase!=='play') return;
	if(!state.aiEnabled) return;
	// default: Player 2 is AI
	if(state.currentPlayer===2){
		// small delay for UX
		setTimeout(()=>{ aiTurn(); }, 700);
	}
}

function aiTurn(){
	if(state.phase!=='play' || !state.aiEnabled || state.currentPlayer!==2) return;
	state.actionLocked = false; state.attackPending = false; state.selectedPiece = null;
	resetHighlights();
	const r = rollDice();
	state.dice = r; el.diceResult.textContent = r; el.rollBtn.disabled = true;
	log(`AI (Player 2) rolled ${r}`);
	if(r===6){
		log('AI rolled 6: skipped');
		el.actionDesc.textContent = 'AI rolled 6: turn skipped';
		// let user see message briefly
		setTimeout(()=> endTurn(), 900);
		return;
	}
	if(r===4 || r===5){ state.diceMultiplier = (r===4?2:3); }
	// Give AI a brief moment to "think"
	setTimeout(()=>{
		try{
			const action = (typeof EasyAI!=='undefined' && EasyAI.chooseAction) ? EasyAI.chooseAction(state, 2) : null;
			if(!action){ log('AI had no action, ending turn'); setTimeout(()=> endTurn(), 400); return; }
			const attacker = findPieceById(action.pieceId);
			if(!attacker){ log('AI selected missing piece'); setTimeout(()=> endTurn(), 400); return; }
			// perform move if present
			if(action.move){
				movePiece(attacker, action.move.r, action.move.c);
				// if AI intended to attack after moving, perform attack
				if(action.attackId){
					const target = findPieceById(action.attackId);
					if(target){
						// slight delay to show move
						setTimeout(()=> performAttack(attacker, target, state.diceMultiplier || 1), 350);
					} else {
						// no target, end turn after short pause
						setTimeout(()=> endTurn(), 350);
					}
				}
				// if no attack intended, movePiece will call endTurn() when appropriate
				return;
			}
			// no move, maybe attack from place
			if(action.attackId){
				const target = findPieceById(action.attackId);
				if(target){
					performAttack(attacker, target, state.diceMultiplier || 1);
				} else {
					setTimeout(()=> endTurn(), 300);
				}
				return;
			}
			// fallback: end turn
			setTimeout(()=> endTurn(), 300);
		}catch(err){ console.error('AI error', err); setTimeout(()=> endTurn(), 400); }
	}, 300);
}

function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

function init(){
	createBoard();
	renderBoard();
	el.startBtn.addEventListener('click', startPlacement);
	el.rollBtn.addEventListener('click', onRoll);
	el.resetBtn.addEventListener('click', ()=>location.reload());
	el.rulesToggle?.addEventListener('click', showRules);
	el.rulesClose?.addEventListener('click', hideRules);
	el.rulesModal?.addEventListener('click', (ev)=>{ if(ev.target===el.rulesModal) hideRules(); });
	el.readyContinue?.addEventListener('click', hideReadyMessage);
	el.readyModal?.addEventListener('click', (ev)=>{ if(ev.target===el.readyModal) hideReadyMessage(); });
	el.endTurnBtn?.addEventListener('click', ()=>{
		el.actionDesc.textContent = 'Turn ended early';
		endTurn();
	});

	// Mode selection wiring
	el.aiDiffButtons = Array.from(document.querySelectorAll('.ai-diff'));
	const modeRadios = Array.from(document.querySelectorAll('input[name="mode"]'));
	function setMode(mode){
		state.aiEnabled = (mode === 'pvai');
		el.currentMode && (el.currentMode.textContent = (mode==='pvai'?'PvAI':'PvP'));
		if(state.aiEnabled){ el.aiDifficulty.classList.remove('hidden'); } else { el.aiDifficulty.classList.add('hidden'); }
	}
	modeRadios.forEach(r=> r.addEventListener('change', (e)=> setMode(e.target.value)));
	// difficulty buttons
	el.aiDiffButtons.forEach(btn=>{
		btn.addEventListener('click', ()=>{
			const diff = btn.dataset.diff;
			state.aiDifficulty = diff;
			// visual selected
			el.aiDiffButtons.forEach(b=>b.classList.remove('selected'));
			btn.classList.add('selected');
		});
	});
	// default
	setMode('pvp');
	// mark easy selected by default
	const defaultBtn = el.aiDiffButtons.find(b=>b.dataset.diff==='easy'); if(defaultBtn) defaultBtn.classList.add('selected');
	el.controls.classList.add('hidden');
}

init();





