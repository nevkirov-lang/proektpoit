/* app.js
   Фангай подаръците — семпла canvas игра
   Контроли: ← / → , или с мишка/тач
*/

// --------- AUDIO ----------
// Audio is handled in `index.html` so playback starts after user interaction.

// --------- GAME -----------
(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // UI
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const scoreEl = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    const levelEl = document.getElementById('level');

    // Game state
    let running = false;
    let paused = false;
    let score = 0;
    let lives = 3;
    let level = 1;
    let lastTime = 0;
    let spawnTimer = 0;
    let spawnInterval = 1200; // ms
    let giftSpeed = 100; // px per second base
    let gifts = [];
    let player;
    const width = canvas.width;
    const height = canvas.height;
    // Visual scene: stars and snow
    let stars = [];
    let snow = [];
    let hazards = []; // harmful projectiles from Krampus
    let houses = []; // precomputed village houses (static)
    let mountains = [];
    let trees = [];
    let moon = null;

    // Santa (drops gifts from his sled)
    const santa = {
      x: width * 0.15,
      y: 60,
      w: 84,
      h: 28,
      vx: 60, // slower
      dropTimer: 0,
      dropInterval: 1400 // drops less frequently
    };

    // Krampus boss (inactive until later)
    const krampus = {
      active: false,
      x: width * 0.8,
      y: 120,
      w: 96,
      h: 46,
      vx: -40,
      hp: 0,
      timer: 0,
      attackInterval: 2200
    };

    // Player object (sled)
    function createPlayer() {
      return {
        x: width / 2,
        y: height - 60,
        w: 110,
        h: 34,
        vx: 0,
        speed: 380
      };
    }

    // Gift factory (can spawn at specific x when dropped from Santa)
    function spawnGift(fromX){
      const size = randInt(22, 44);
      let x;
      if(typeof fromX === 'number'){
        x = Math.round(fromX - size/2);
        x = clamp(x, 12, width - 12 - size);
      } else {
        x = randInt(20, width - 20 - size);
      }
      const kind = randChoice(['box','star','ornament']);
      gifts.push({
        x, y: santa.y + santa.h/2 + 6 - size,
        w: size, h: size,
        vy: giftSpeed + Math.random()*40 + (level-1)*12, // slower variance
        kind
      });
    }

    function spawnHazard(x, vy, vx){
      hazards.push({ x: x - 10, y: krampus.y + krampus.h/2, w: 18, h: 18, vy: vy || 80, vx: vx || (Math.random()*30 - 15), kind: 'spike' });
    }

    // helpers
    function randInt(min, max){ return Math.floor(Math.random()*(max-min+1))+min; }
    function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

    // Input handling
    const keys = {};
    window.addEventListener('keydown', e => { keys[e.key] = true; });
    window.addEventListener('keyup', e => { keys[e.key] = false; });

    function pointerMove(clientX){
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      player.x = clamp(x, player.w/2, width - player.w/2);
    }
    canvas.addEventListener('mousemove', e => pointerMove(e.clientX));
    canvas.addEventListener('touchmove', e => {
      if(e.touches && e.touches[0]) pointerMove(e.touches[0].clientX);
      e.preventDefault();
    }, { passive:false });

    // Game loop
    function startGame(){
      score = 0; lives = 5; level = 1; // give more lives for easier play
      spawnInterval = 1600;
      giftSpeed = 60; // slower gifts
      gifts = [];
      player = createPlayer();
      running = true;
      paused = false;
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      lastTime = performance.now();
      spawnTimer = 0;
      requestAnimationFrame(loop);
      updateUI();
    }

    function pauseGame(){
      paused = !paused;
      pauseBtn.textContent = paused ? 'Продължи' : 'Пауза';
      if(!paused) {
        lastTime = performance.now();
        requestAnimationFrame(loop);
      }
    }

    function resetGame(){
      running = false;
      paused = false;
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      pauseBtn.textContent = 'Пауза';
      gifts = [];
      score = 0; lives = 5; level = 1;
      player = createPlayer();
      initScene();
      hazards = [];
      krampus.active = false;
      krampus.timer = 0;
      krampus.hp = 0;
      updateUI();
      draw();
    }

    function updateUI(){
      scoreEl.textContent = score;
      livesEl.textContent = lives;
      levelEl.textContent = level;
    }

    // Collision AABB
    function collides(a,b){
      return !(a.x - a.w/2 > b.x + b.w/2 ||
               a.x + a.w/2 < b.x - b.w/2 ||
               a.y - a.h/2 > b.y + b.h/2 ||
               a.y + a.h/2 < b.y - b.h/2);
    }

    // Draw everything
    function draw(){
      ctx.clearRect(0,0,width,height);

      // night gradient
      const g = ctx.createLinearGradient(0,0,0,height);
      g.addColorStop(0,'#04121d');
      g.addColorStop(1,'#061826');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,width,height);

      // moon
      drawMoon();

      // stars
      drawStars();

      // snow (particles)
      drawSnow();

      // mid / background: mountains, trees, then village
      drawMountains();
      drawTrees();
      // village and ground (behind gifts)
      drawVillage();

      // gifts
      gifts.forEach(gf => drawGift(gf));

      // player sled
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = '#b02e2e';
      roundRect(ctx, -player.w/2, -player.h/2, player.w, player.h, 8, true, false);
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-player.w/2 + 6, player.h/2 - 4);
      ctx.lineTo(player.w/2 - 6, player.h/2 - 4);
      ctx.stroke();
      ctx.restore();

      // Santa and Krampus (on top)
      drawSanta();
      drawKrampus();
      // hazards
      hazards.forEach(h => {
        ctx.save();
        ctx.translate(h.x + h.w/2, h.y + h.h/2);
        ctx.fillStyle = '#6b0000';
        ctx.beginPath(); ctx.moveTo(0, -h.h/2); ctx.lineTo(h.w/2, h.h/2); ctx.lineTo(-h.w/2, h.h/2); ctx.closePath(); ctx.fill();
        ctx.restore();
      });

      // snowman sits on the ground
      drawSnowman();
    }

    function drawGift(gf){
      ctx.save();
      ctx.translate(gf.x + gf.w/2, gf.y + gf.h/2);
      const rot = (gf.y/300) % (Math.PI*2);
      ctx.rotate(Math.sin(rot)*0.2);

      if(gf.kind === 'box'){
        ctx.fillStyle = '#ffbb33';
        roundRect(ctx, -gf.w/2, -gf.h/2, gf.w, gf.h, 6, true, false);
        ctx.fillStyle = '#b22222';
        ctx.fillRect(-8, -gf.h/2, 16, gf.h);
        ctx.fillRect(-gf.w/2, -6, gf.w, 12);
      } 
      else if(gf.kind === 'star'){
        ctx.fillStyle = '#ffd36b';
        ctx.beginPath();
        const r = gf.w/2;
        for(let i=0;i<5;i++){
          ctx.lineTo(Math.cos((18 + i*72)*Math.PI/180)*r, -Math.sin((18 + i*72)*Math.PI/180)*r);
          ctx.lineTo(Math.cos((54 + i*72)*Math.PI/180)*(r*0.5), -Math.sin((54 + i*72)*Math.PI/180)*(r*0.5));
        }
        ctx.closePath();
        ctx.fill();
      } 
      else {
        ctx.fillStyle = '#88c0d0';
        ctx.beginPath();
        ctx.ellipse(0, 0, gf.w/2, gf.h/2, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#d9534f';
        ctx.fillRect(-gf.w*0.12, -gf.h/2 - 4, gf.w*0.24, 6);
      }

      ctx.restore();
    }


    function initScene(){
      stars = [];
      for(let i=0;i<120;i++){
        // smaller base radius for subtler stars
        stars.push({ x: Math.random()*width, y: Math.random()*height*0.5, r: Math.random()*0.9+0.3, a: Math.random() });
      }
      snow = [];
      for(let i=0;i<60;i++) snow.push({ x: Math.random()*width, y: Math.random()*height, r: Math.random()*2+0.8, vy: 20 + Math.random()*40 });

      // precompute houses so they remain static (avoid flicker)
      houses = [];
      const houseW = 60;
      const baseY = height - 36;
      for(let i=0;i<Math.ceil(width/80)+1;i++){
        const hx = i*80 + 8;
        const hy = baseY - randInt(18, 40);
        const windows = [Math.random() < 0.6, Math.random() < 0.6];
        houses.push({ x: hx, y: hy, w: houseW, h: baseY - hy, windows });
      }

      // precompute mountains (large triangles) behind village
      mountains = [];
      const mCount = 3;
      for(let i=0;i<mCount;i++){
        const mx = Math.round((i/(mCount-1)) * width);
        const mh = Math.round(height*0.18 + Math.random()*height*0.16);
        const mw = Math.round(width*0.5 + Math.random()*width*0.2);
        mountains.push({ x: mx, h: mh, w: mw, offset: randInt(-40,40) });
      }

      // precompute evergreen trees along the mid-ground
      trees = [];
      const treeCount = Math.ceil(width / 48);
      for(let i=0;i<treeCount;i++){
        const tx = i * (width / treeCount) + randInt(-12,12);
        const th = randInt(28, 56);
        trees.push({ x: Math.round(tx), h: th });
      }
      // static moon position (scaled to canvas)
      moon = {
        x: Math.round(width * 0.78),
        y: Math.round(height * 0.14),
        r: Math.round(Math.min(46, width * 0.08)),
        glowR: Math.round(Math.min(88, width * 0.18))
      };
    }

    function drawStars(){
      ctx.save();
      stars.forEach(s => {
        const tw = (Math.sin((Date.now()/800) + s.a*10)+1)/2;
        ctx.globalAlpha = 0.6 + tw*0.3;
        ctx.fillStyle = '#fff9d6';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.6 + tw*0.5), 0, Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawSnow(){
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.8;
      for(let p of snow){
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawMoon(){
      if(!moon) return;
      // soft glow radial gradient
      const gx = moon.x, gy = moon.y, gr = moon.glowR;
      const grad = ctx.createRadialGradient(gx, gy, moon.r*0.3, gx, gy, gr);
      grad.addColorStop(0, 'rgba(255,255,230,0.95)');
      grad.addColorStop(0.5, 'rgba(255,255,230,0.45)');
      grad.addColorStop(1, 'rgba(255,255,230,0.02)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI*2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // moon body
      ctx.fillStyle = '#fffef6';
      ctx.beginPath(); ctx.arc(gx, gy, moon.r, 0, Math.PI*2); ctx.fill();

      // a few subtle craters
      ctx.fillStyle = 'rgba(200,200,200,0.12)';
      ctx.beginPath(); ctx.arc(gx - moon.r*0.28, gy - moon.r*0.08, Math.max(2, moon.r*0.12), 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + moon.r*0.16, gy + moon.r*0.14, Math.max(2, moon.r*0.09), 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    function drawSanta(){
      ctx.save();
      ctx.translate(santa.x, santa.y);
      // sled
      ctx.fillStyle = '#6b2b10';
      roundRect(ctx, -santa.w/2, -santa.h/2, santa.w, santa.h, 6, true, false);
      // runner
      ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-santa.w/2 + 6, santa.h/2 - 2); ctx.lineTo(santa.w/2 - 6, santa.h/2 - 2); ctx.stroke();
      // Santa (simple)
      ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(santa.w*0.15, -santa.h/4, 8, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(santa.w*0.1, -santa.h/8, 10, 6);
      ctx.restore();
    }

    function drawVillage(){
      const groundY = height - 36;
      ctx.save();
      ctx.fillStyle = '#eef7fb';
      ctx.fillRect(0, groundY, width, height - groundY);
      // draw precomputed houses
      for(const h of houses){
        ctx.fillStyle = '#6c3f2b';
        roundRect(ctx, h.x, h.y, h.w, h.h, 6, true, false);
        ctx.fillStyle = '#8b1e1e';
        ctx.beginPath(); ctx.moveTo(h.x-4, h.y); ctx.lineTo(h.x+h.w/2, h.y-18); ctx.lineTo(h.x+h.w+4, h.y); ctx.closePath(); ctx.fill();
        // windows: size and positions adapt to house width so they always fit
        const winW = Math.min(14, Math.max(8, Math.floor(h.w * 0.16)));
        const winH = Math.max(10, Math.floor(winW * 1.15));
        const padding = Math.max(6, Math.floor(h.w * 0.12));
        const inner = h.w - padding*2;
        for(let cw=0; cw<2; cw++){
          const wx = Math.round(h.x + padding + cw * (inner - winW));
          const wy = Math.round(h.y + Math.max(6, h.h*0.12));
          ctx.fillStyle = h.windows[cw] ? '#fff18b' : '#3a3a3a';
          ctx.fillRect(wx, wy, winW, winH);
        }
      }
      ctx.restore();
    }

    function drawSnowman(){
      const baseY = height - 52;
      const x = 64;
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, baseY, 14, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, baseY-20, 10, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, baseY-34, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(x-2, baseY-36, 4, 2); // eyes
      ctx.fillStyle = '#ff8c00'; ctx.beginPath(); ctx.moveTo(x+2, baseY-32); ctx.lineTo(x+10, baseY-30); ctx.lineTo(x+2, baseY-28); ctx.fill();
      ctx.restore();
    }

    function drawKrampus(){
      if(!krampus.active) return;
      ctx.save();
      ctx.translate(krampus.x, krampus.y);
      // body
      ctx.fillStyle = '#3a2418';
      roundRect(ctx, -krampus.w/2, -krampus.h/2, krampus.w, krampus.h, 8, true, false);
      // horns
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.moveTo(-krampus.w/4, -krampus.h/2); ctx.lineTo(-krampus.w/4 - 8, -krampus.h/2 - 12); ctx.lineTo(-krampus.w/4 + 4, -krampus.h/2 + 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(krampus.w/4, -krampus.h/2); ctx.lineTo(krampus.w/4 + 8, -krampus.h/2 - 12); ctx.lineTo(krampus.w/4 - 4, -krampus.h/2 + 2); ctx.fill();
      // angry eyes
      ctx.fillStyle = '#ffd36b'; ctx.fillRect(-10, -8, 6, 6); ctx.fillRect(4, -8, 6, 6);
      // hp bar
      ctx.fillStyle = '#222'; ctx.fillRect(-krampus.w/2, -krampus.h/2 - 12, krampus.w, 6);
      ctx.fillStyle = '#d9534f'; ctx.fillRect(-krampus.w/2 + 2, -krampus.h/2 - 10, (krampus.w - 4) * (krampus.hp / Math.max(krampus.maxHp || 1,1)), 2);
      ctx.restore();
    }

    function drawMountains(){
      if(!mountains || mountains.length === 0) return;
      ctx.save();
      // draw a darker silhouette for the far mountains
      for(let i=0;i<mountains.length;i++){
        const m = mountains[i];
        const baseY = height - 36;
        const left = m.x - m.w/2 + m.offset;
        const right = m.x + m.w/2 + m.offset;
        const peakY = baseY - m.h;
        // gradient fill for depth
        const grad = ctx.createLinearGradient(0, peakY, 0, baseY);
        grad.addColorStop(0, i===0 ? '#1b2b32' : '#162026');
        grad.addColorStop(1, '#0b1a20');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(left, baseY);
        ctx.lineTo((left+right)/2, peakY);
        ctx.lineTo(right, baseY);
        ctx.closePath();
        ctx.fill();
        // snow cap - triangular cap matching mountain peak shape
        const px = Math.round((left+right)/2);
        const py = peakY;
        // make cap narrower and clamp it tightly to the mountain edges
        const capW = Math.max(8, Math.min(80, Math.round(m.w * 0.10))); // narrower (10% width)
        let capLeft = px - Math.round(capW/2);
        let capRight = px + Math.round(capW/2);
        // ensure cap sits well within the mountain's left/right bounds with a slightly larger padding
        capLeft = Math.max(left + 6, capLeft);
        capRight = Math.min(right - 6, capRight);
        const capBottom = py + Math.max(6, Math.round(m.h * 0.08));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(capRight, capBottom);
        ctx.lineTo(capLeft, capBottom);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    function drawTrees(){
      if(!trees || trees.length === 0) return;
      ctx.save();
      const groundY = height - 36;
      for(const t of trees){
        const baseX = t.x;
        const th = t.h;
        // trunk
        ctx.fillStyle = '#3b2a20';
        ctx.fillRect(baseX - 3, groundY - 8, 6, 8);
        // three layers of foliage
        ctx.fillStyle = '#0f2f18';
        ctx.beginPath(); ctx.moveTo(baseX, groundY - 8 - th); ctx.lineTo(baseX - th*0.35, groundY - 8); ctx.lineTo(baseX + th*0.35, groundY - 8); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(baseX, groundY - 4 - th*0.75); ctx.lineTo(baseX - th*0.28, groundY - 4); ctx.lineTo(baseX + th*0.28, groundY - 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(baseX, groundY - 2 - th*0.45); ctx.lineTo(baseX - th*0.2, groundY - 2); ctx.lineTo(baseX + th*0.2, groundY - 2); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke){
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if(fill) ctx.fill();
      if(stroke) ctx.stroke();
    }

    function loop(now){
      if(!running || paused) return;

      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      // update Santa
      santa.x += santa.vx * (dt/1000);
      if(santa.x < 40 || santa.x > width - 40){
        santa.vx *= -1;
      }
      santa.dropTimer += dt;

      // movement
      let moveX = 0;
      if(keys['ArrowLeft'] || keys['a'] || keys['A']) moveX = -1;
      if(keys['ArrowRight'] || keys['d'] || keys['D']) moveX = 1;
      if(moveX !== 0){
        player.x += moveX * player.speed * (dt/1000);
        player.x = clamp(player.x, player.w/2, width - player.w/2);
      }

      // spawn gifts from Santa
      spawnTimer += dt;
      if(spawnTimer >= spawnInterval){
        spawnTimer = 0;
        // drop near Santa with some horizontal variance
        spawnGift(santa.x + randInt(-24, 24));
      }

      // Santa drops more frequently as well
      if(santa.dropTimer >= santa.dropInterval){
        santa.dropTimer = 0;
        spawnGift(santa.x + randInt(-18, 18));
      }

      // Krampus activation: appears later and more gently (easy mode)
      if(!krampus.active && level >= 5){
        krampus.active = true;
        krampus.hp = 2 + Math.floor((level-5)/3);
        krampus.maxHp = Math.max(1, krampus.hp);
        krampus.x = width - 120;
        krampus.vx = -30; // slow movement
        krampus.attackInterval = 2200 + (level-5)*200; // relatively infrequent
        krampus.timer = 0;
      }

      // Krampus movement & attacks
      if(krampus.active){
        krampus.x += krampus.vx * (dt/1000);
        if(krampus.x < 120 || krampus.x > width - 120) krampus.vx *= -1;
        krampus.timer += dt;
        if(krampus.timer >= krampus.attackInterval){
          krampus.timer = 0;
          // throw 1-2 hazards
          const throws = randInt(1, Math.min(2, 1 + Math.floor((level-2)/3)));
          for(let t=0;t<throws;t++) spawnHazard(krampus.x + randInt(-24,24), 120 + Math.random()*60, randInt(-40,40));
        }
      }

      // update gifts
      for(let i = gifts.length - 1; i >= 0; i--){
        const g = gifts[i];
        g.y += g.vy * (dt/1000);

        const giftBox = { x: g.x + g.w/2, y: g.y + g.h/2, w: g.w, h: g.h };
        const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };

        if(collides(playerBox, giftBox)){
          // harmful hazards handled elsewhere; gifts normally give points
          if(g.kind === 'star' && krampus.active){
            // star damages Krampus when active
            krampus.hp = Math.max(0, krampus.hp - 1);
            score += 15;
            if(krampus.hp <= 0){
              // defeat Krampus
              krampus.active = false;
              score += 80;
              // reward and reduce difficulty briefly
              spawnInterval = Math.max(600, spawnInterval + 200);
            }
          } else {
            score += 10;
          }
          gifts.splice(i,1);
          handleScoreProgress();
          updateUI();
          continue;
        }

        if(g.y > height + 20){
          gifts.splice(i,1);
          lives -= 1;
          updateUI();
          if(lives <= 0){
            gameOver();
            return;
          }
        }
      }

      // update hazards
      for(let i = hazards.length - 1; i >= 0; i--){
        const h = hazards[i];
        h.y += h.vy * (dt/1000);
        h.x += (h.vx || 0) * (dt/1000);
        const hBox = { x: h.x + h.w/2, y: h.y + h.h/2, w: h.w, h: h.h };
        const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
        if(collides(playerBox, hBox)){
          hazards.splice(i,1);
          lives -= 1;
          updateUI();
          if(lives <= 0){ gameOver(); return; }
          continue;
        }
        if(h.y > height + 40) hazards.splice(i,1);
      }

      draw();
      // update snow particles after draw for nicer movement
      for(let p of snow){
        p.y += p.vy * (dt/1000);
        p.x += Math.sin((Date.now()/1000) + p.y) * 0.2;
        if(p.y > height + 8){ p.y = -8; p.x = Math.random()*width; }
      }
      requestAnimationFrame(loop);
    }

    function handleScoreProgress(){
      const newLevel = Math.floor(score / 50) + 1;
      if(newLevel > level){
        level = newLevel;
        spawnInterval = Math.max(400, spawnInterval - 120);
        giftSpeed += 18;
        flashBorder();
        updateUI();
      }
    }

    function flashBorder(){
      const old = canvas.style.boxShadow;
      canvas.style.boxShadow = '0 0 18px 6px rgba(255,215,0,0.12)';
      setTimeout(()=> canvas.style.boxShadow = old, 300);
    }

    function gameOver(){
      running = false;
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      alert(`Играта свърши! Точки: ${score}\nНиво: ${level}`);
    }

    // initial draw
    resetGame();

    // buttons
    startBtn.addEventListener('click', () => {
      if(!running) startGame();
    });
    pauseBtn.addEventListener('click', () => {
      if(running) pauseGame();
    });
    resetBtn.addEventListener('click', () => {
      resetGame();
    });

})();
