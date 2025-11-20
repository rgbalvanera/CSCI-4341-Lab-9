// Easy AI for Kings of the West
// Exposes EasyAI.chooseAction(state, player)
// Heuristic priorities:
// 1) Immediate capture / highest damage action
// 2) Move+attack that yields highest damage (if movement allowed)
// 3) Safe move (minimize being in enemy attack range)
// 4) Advance toward nearest enemy

var EasyAI = (function(){
    function cloneState(s){
        // minimal shallow clone to avoid mutation
        return JSON.parse(JSON.stringify(s));
    }

    function getPieceAt(state, r, c){
        for(const pl of [1,2]){
            for(const p of state.players[pl].pieces){
                if(p.r===r && p.c===c && p.hp>0) return p;
            }
        }
        return null;
    }

    function manhattan(a,b){ return Math.abs(a.r-b.r)+Math.abs(a.c-b.c); }

    function getReachable(state, p, steps){
        const ROWS = 6, COLS = 6;
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
                if(dist===1) enemies.push({piece:e,dist:dist,damage:3});
                else if(dist>=2 && dist<=3) enemies.push({piece:e,dist:dist,damage:2});
            } else {
                if(dist===1) enemies.push({piece:e,dist:dist,damage:3});
            }
        }
        return enemies;
    }

    function enemyCanAttackTile(state, owner, r,c){
        // Count how many enemy pieces could attack tile (r,c)
        const opp = owner===1?2:1;
        let count = 0;
        for(const e of state.players[opp].pieces){
            if(e.hp<=0) continue;
            const dist = Math.abs(e.r-r)+Math.abs(e.c-c);
            if(e.type==='gunslinger'){
                if(dist===1 || (dist>=2 && dist<=3)) count++;
            } else {
                if(dist===1) count++;
            }
        }
        return count;
    }

    function evaluateAction(state, piece, moveTo, attackCandidate, multiplier){
        // score higher for more damage, prefer captures, prefer safety
        let score = 0;
        const fromR = moveTo?moveTo.r:piece.r;
        const fromC = moveTo?moveTo.c:piece.c;
        if(attackCandidate){
            const dist = Math.abs(attackCandidate.r - fromR) + Math.abs(attackCandidate.c - fromC);
            let base = 0;
            if(piece.type==='gunslinger') base = (dist===1?3: (dist>=2 && dist<=3?2:0));
            else base = (dist===1?3:0);
            const dmg = base * (multiplier||1);
            score += dmg * 10;
            // extra if attack would kill
            if(attackCandidate.hp <= dmg) score += 50;
        }
        // safety: penalize positions attackable by enemies
        const danger = enemyCanAttackTile(state, piece.owner, fromR, fromC);
        score -= danger * 6;
        // prefer advancing toward enemy king
        const oppPieces = state.players[piece.owner===1?2:1].pieces;
        const kings = oppPieces.filter(x=>x.isKing);
        if(kings.length){
            const distToKing = Math.min(...kings.map(k=>Math.abs(k.r-fromR)+Math.abs(k.c-fromC)));
            score += (10 - distToKing);
        }
        // small bias to prefer non-null move (activity)
        if(moveTo) score += 1;
        return score;
    }

    function chooseAction(rawState, player){
        // returns {pieceId, move:{r,c} or null, attackId or null}
        const state = cloneState(rawState);
        const dice = state.dice || 0;
        const mult = (dice===4?2: (dice===5?3:1));
        let best = {score:-Infinity, action:null};
        const pieces = state.players[player].pieces.filter(p=>p.hp>0);
        for(const p of pieces){
            // immediate attacks from current tile
            const enemiesHere = getEnemiesInAttackRange(state, p, p.r, p.c);
            for(const eObj of enemiesHere){
                const score = evaluateAction(state, p, null, eObj.piece, mult);
                if(score>best.score){ best.score=score; best.action = {pieceId:p.id, move:null, attackId:eObj.piece.id}; }
            }
            // moves + optional attacks depending on dice
            let maxStep = 0;
            if(dice>=1 && dice<=3) maxStep = dice;
            if(dice===4 || dice===5) maxStep = 1;
            if(maxStep>0){
                const tiles = getReachable(state, p, maxStep);
                // also include staying in place as an option
                tiles.push(null);
                for(const t of tiles){
                    const moveTo = t?{r:t.r,c:t.c}:null;
                    // find attackable enemies from this position
                    const enemies = getEnemiesInAttackRange(state, p, moveTo?moveTo.r: p.r, moveTo?moveTo.c: p.c);
                    if(enemies.length===0){
                        const score = evaluateAction(state, p, moveTo, null, mult);
                        if(score>best.score){ best.score=score; best.action={pieceId:p.id, move:moveTo, attackId:null}; }
                    } else {
                        for(const eObj of enemies){
                            const score = evaluateAction(state, p, moveTo, eObj.piece, mult);
                            if(score>best.score){ best.score=score; best.action={pieceId:p.id, move:moveTo, attackId:eObj.piece.id}; }
                        }
                    }
                }
            }
        }
        if(!best.action) return null;
        return best.action;
    }

    return { chooseAction };
})();

// Expose to global
if(typeof window !== 'undefined') window.EasyAI = EasyAI;
