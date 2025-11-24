// Medium AI using a compact Monte Carlo Tree Search
// Exposes MCTS.chooseAction(state, player, iterations)

var MCTS = (function(){
    const ROWS = 6, COLS = 6;

    function cloneState(s){
        // Deep-clone players and their pieces, but ignore DOM-specific fields
        return {
            players: JSON.parse(JSON.stringify(s.players)),
            currentPlayer: s.currentPlayer,
            dice: s.dice,
            phase: s.phase
        };
    }

    function getPieceAt(state, r, c){
        for(const pl of [1,2]){
            for(const p of state.players[pl].pieces){
                if(p.r===r && p.c===c && p.hp>0) return p;
            }
        }
        return null;
    }

    function getReachable(state, p, steps){
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
                if(getPieceAt(state,nr,nc)) { seen.add(key); continue; }
                const nd = cur.dist+1;
                if(nd>steps) { seen.add(key); continue; }
                reachable.push({r:nr,c:nc});
                seen.add(key);
                q.push({r:nr,c:nc,dist:nd});
            }
        }
        return reachable;
    }

    function getEnemiesInAttackRange(state, p, fromR, fromC){
        const opp = p.owner===1?2:1;
        const enemies = [];
        for(const e of state.players[opp].pieces){
            if(e.hp<=0) continue;
            const dist = Math.abs(e.r-fromR)+Math.abs(e.c-fromC);
            if(p.type==='gunslinger'){
                if(dist===1) enemies.push(e);
                else if(dist>=2 && dist<=3) enemies.push(e);
            } else {
                if(dist===1) enemies.push(e);
            }
        }
        return enemies;
    }

    function applyAction(state, action){
        // mutate state: move then attack if present; remove dead pieces
        const piece = findPieceById(state, action.pieceId);
        if(!piece) return state;
        if(action.move){ piece.r = action.move.r; piece.c = action.move.c; }
        if(action.attackId){
            const target = findPieceById(state, action.attackId);
            if(target){
                const dist = Math.abs(piece.r-target.r)+Math.abs(piece.c-target.c);
                let dmg = 0;
                if(piece.type==='gunslinger') dmg = dist===1?3:(dist>=2&&dist<=3?2:0);
                else dmg = dist===1?3:0;
                const mult = (state.dice===4?2:(state.dice===5?3:1));
                dmg *= mult;
                target.hp -= dmg;
            }
        }
        // remove dead pieces
        for(const pl of [1,2]){
            state.players[pl].pieces = state.players[pl].pieces.filter(x=>x.hp>0);
        }
        // clear dice and toggle player (in our simulation we'll roll for next player later)
        state.dice = null;
        state.currentPlayer = state.currentPlayer===1?2:1;
        return state;
    }

    function findPieceById(state, id){
        for(const pl of [1,2]){
            for(const p of state.players[pl].pieces) if(p.id===id) return p;
        }
        return null;
    }

    function isTerminal(state){
        for(const pl of [1,2]){
            const opponent = pl===1?2:1;
            const oppPieces = state.players[opponent].pieces;
            const kingAlive = oppPieces.some(p=>p.isKing);
            const fightersAlive = oppPieces.filter(p=>!p.isKing).length;
            if(!kingAlive || fightersAlive===0) return true;
        }
        return false;
    }

    function getWinner(state){
        // returns 1 or 2 or null
        for(const pl of [1,2]){
            const opponent = pl===1?2:1;
            const oppPieces = state.players[opponent].pieces;
            const kingAlive = oppPieces.some(p=>p.isKing);
            const fightersAlive = oppPieces.filter(p=>!p.isKing).length;
            if(!kingAlive || fightersAlive===0) return pl;
        }
        return null;
    }

    function rollDice(){ return Math.floor(Math.random()*6)+1; }

    function getLegalActions(state, player){
        const actions = [];
        const pieces = state.players[player].pieces.filter(p=>p.hp>0);
        const dice = state.dice||0;
        for(const p of pieces){
            // immediate attacks from current tile
            const enemiesHere = getEnemiesInAttackRange(state, p, p.r, p.c);
            for(const e of enemiesHere){ actions.push({pieceId:p.id, move:null, attackId:e.id}); }
            // moves + optional attacks depending on dice
            let maxStep = 0;
            if(dice>=1 && dice<=3) maxStep = dice;
            if(dice===4 || dice===5) maxStep = 1;
            if(maxStep>0){
                const tiles = getReachable(state, p, maxStep);
                tiles.push(null);
                for(const t of tiles){
                    const moveTo = t?{r:t.r,c:t.c}:null;
                    const enemies = getEnemiesInAttackRange(state, p, moveTo?moveTo.r:p.r, moveTo?moveTo.c:p.c);
                    if(enemies.length===0){ actions.push({pieceId:p.id, move:moveTo, attackId:null}); }
                    else { for(const e of enemies) actions.push({pieceId:p.id, move:moveTo, attackId:e.id}); }
                }
            }
        }
        return actions;
    }

    function randomPlayout(state, playingFor, maxDepth=60){
        const s = cloneState(state);
        let depth = 0;
        while(!isTerminal(s) && depth<maxDepth){
            depth++;
            // ensure dice for current player
            if(!s.dice) s.dice = rollDice();
            const acts = getLegalActions(s, s.currentPlayer);
            if(acts.length===0){
                // if nothing to do, skip turn
                s.dice = null; s.currentPlayer = s.currentPlayer===1?2:1; continue;
            }
            // pick random action
            const a = acts[Math.floor(Math.random()*acts.length)];
            applyAction(s, a);
            // after applyAction, next player's dice will be rolled in next loop
        }
        const winner = getWinner(s);
        if(winner===playingFor) return 1; // win
        if(winner===null) return 0.5; // draw
        return 0; // loss
    }

    // Simple MCTS Node
    function Node(state, parent=null, actionFromParent=null){
        this.state = state; // cloned state
        this.parent = parent;
        this.actionFromParent = actionFromParent;
        this.children = [];
        this.untriedActions = null; // lazily filled
        this.visits = 0;
        this.value = 0;
    }

    function uctSelect(childNodes){
        // choose child with highest UCT score
        const C = 1.4;
        let best = null; let bestScore = -Infinity;
        for(const ch of childNodes){
            const exploit = ch.value / (ch.visits || 1);
            const explore = Math.sqrt(Math.log(ch.parent.visits+1) / (ch.visits || 1));
            const score = exploit + C * explore;
            if(score>bestScore){ bestScore = score; best = ch; }
        }
        return best;
    }

    function chooseAction(rawState, player, iterations=200){
        const rootState = cloneState(rawState);
        // root state's dice should already be set by caller
        const root = new Node(rootState, null, null);
        root.untriedActions = getLegalActions(root.state, player);
        if(!root.untriedActions || root.untriedActions.length===0) return null;

        for(let it=0; it<iterations; it++){
            // SELECTION
            let node = root;
            // copy state reference for traversal
            while(node.untriedActions && node.untriedActions.length===0 && node.children.length>0){
                node = uctSelect(node.children);
            }
            // EXPANSION
            if(!node.untriedActions) node.untriedActions = getLegalActions(node.state, node.state.currentPlayer);
            if(node.untriedActions && node.untriedActions.length>0){
                // pick one action to expand
                const idx = Math.floor(Math.random()*node.untriedActions.length);
                const action = node.untriedActions.splice(idx,1)[0];
                // apply action to cloned state
                const newState = cloneState(node.state);
                // ensure dice present for node.state.currentPlayer when applying action
                if(!newState.dice) newState.dice = rollDice();
                applyAction(newState, action);
                // for the newState, next player's dice will be null (rolled during playout or further expansion)
                const child = new Node(newState, node, action);
                child.untriedActions = null; // lazy
                node.children.push(child);
                node = child;
            }
            // SIMULATION
            const reward = randomPlayout(node.state, player, 40);
            // BACKPROPAGATION
            while(node){
                node.visits += 1;
                node.value += reward;
                node = node.parent;
            }
        }
        // choose best child by highest visits (robust)
        let bestChild = null; let bestVisits = -1;
        for(const ch of root.children){
            if(ch.visits>bestVisits){ bestVisits = ch.visits; bestChild = ch; }
        }
        if(!bestChild) return null;
        return bestChild.actionFromParent;
    }

    return { chooseAction };
})();

if(typeof window!=='undefined') window.MCTS = MCTS;
