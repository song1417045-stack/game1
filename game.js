(function () {
  "use strict";

  const Logic = window.HamsterLogic;
  if (!Logic) {
    throw new Error("HamsterLogic이 먼저 로드되어야 합니다.");
  }

  const WIDTH = 1280;
  const HEIGHT = 720;
  const WORLD_WIDTH = 9600;
  const GROUND_Y = 600;
  const FIXED_STEP = 1 / 60;
  const STORAGE_KEY = "hamjji-seed-adventure:v1";
  const TOTAL_SEEDS = 36;
  const TOTAL_SECRETS = 3;

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const frame = document.querySelector(".game-frame");
  const ui = {
    hud: document.getElementById("hud"),
    title: document.getElementById("title-screen"),
    pause: document.getElementById("pause-screen"),
    complete: document.getElementById("complete-screen"),
    respawnNote: document.getElementById("respawn-note"),
    health: document.getElementById("health-value"),
    power: document.getElementById("power-status"),
    seeds: document.getElementById("seed-value"),
    secrets: document.getElementById("secret-value"),
    time: document.getElementById("time-value"),
    mute: document.getElementById("mute-button"),
    resultSeeds: document.getElementById("result-seeds"),
    resultSecrets: document.getElementById("result-secrets"),
    resultTime: document.getElementById("result-time"),
    bestResult: document.getElementById("best-result"),
    completeMessage: document.getElementById("complete-message"),
  };

  const imageSources = {
    hamster: "assets/hamster.png",
    fluffy: "assets/hamster-fluffy.png",
    snail: "assets/snail.png",
    beetle: "assets/beetle.png",
    superSeed: "assets/super-seed.png",
    background: "assets/garden-bg.webp",
  };
  const images = {};
  for (const [name, source] of Object.entries(imageSources)) {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    images[name] = image;
  }

  const input = {
    held: new Set(),
    jumpPressed: false,
  };

  let state = "title";
  let level = buildLevel();
  let player = createPlayer();
  let camera = { x: 0, targetX: 0 };
  let particles = [];
  let elapsed = 0;
  let accumulator = 0;
  let lastFrameTime = performance.now();
  let respawnTimer = 0;
  let screenFlash = 0;
  let checkpointSnapshot = null;
  let deviceScale = 1;
  let records = loadRecords();

  class ToyAudio {
    constructor() {
      this.context = null;
      this.master = null;
      this.musicTimer = null;
      this.bar = 0;
      this.muted = Boolean(records.muted);
    }

    init() {
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : 0.22;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === "suspended") {
        this.context.resume().catch(() => {});
      }
      if (!this.musicTimer) {
        this.musicTimer = window.setInterval(() => this.scheduleBar(), 2140);
      }
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.context && this.master) {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setTargetAtTime(muted ? 0 : 0.22, this.context.currentTime, 0.03);
      }
    }

    tone(frequency, start, duration, options = {}) {
      if (!this.context || !this.master || this.muted) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = options.type || "sine";
      oscillator.frequency.setValueAtTime(frequency, now + start);
      if (options.slide) {
        oscillator.frequency.exponentialRampToValueAtTime(options.slide, now + start + duration);
      }
      const volume = options.volume || 0.09;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      oscillator.connect(gain);
      gain.connect(this.master);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration + 0.03);
    }

    scheduleBar() {
      if (state !== "playing" || this.muted || !this.context) return;
      const bars = [
        [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, 392.0],
        [440.0, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 493.88],
      ];
      const notes = bars[this.bar++ % bars.length];
      notes.forEach((note, index) => {
        this.tone(note, index * 0.255, 0.19, { type: "sine", volume: 0.032 });
        if (index % 2 === 0) {
          this.tone(note / 2, index * 0.255, 0.26, { type: "triangle", volume: 0.018 });
        }
      });
    }

    sfx(name) {
      this.init();
      switch (name) {
        case "jump":
          this.tone(310, 0, 0.11, { slide: 530, type: "triangle", volume: 0.08 });
          break;
        case "seed":
          this.tone(740, 0, 0.09, { type: "sine", volume: 0.075 });
          this.tone(988, 0.07, 0.13, { type: "sine", volume: 0.065 });
          break;
        case "power":
          [523, 659, 784, 1047].forEach((note, index) =>
            this.tone(note, index * 0.08, 0.22, { type: "triangle", volume: 0.075 }),
          );
          break;
        case "stomp":
          this.tone(210, 0, 0.12, { slide: 145, type: "triangle", volume: 0.09 });
          this.tone(520, 0.04, 0.1, { type: "sine", volume: 0.045 });
          break;
        case "hurt":
          this.tone(260, 0, 0.18, { slide: 145, type: "sawtooth", volume: 0.055 });
          break;
        case "shield":
          this.tone(760, 0, 0.2, { slide: 390, type: "sine", volume: 0.07 });
          break;
        case "break":
          this.tone(180, 0, 0.07, { slide: 95, type: "square", volume: 0.04 });
          this.tone(290, 0.04, 0.09, { slide: 125, type: "triangle", volume: 0.05 });
          break;
        case "checkpoint":
          [440, 554, 659].forEach((note, index) =>
            this.tone(note, index * 0.1, 0.28, { type: "sine", volume: 0.07 }),
          );
          break;
        case "secret":
          [659, 831, 988, 1319].forEach((note, index) =>
            this.tone(note, index * 0.065, 0.25, { type: "sine", volume: 0.06 }),
          );
          break;
        case "finish":
          [523, 659, 784, 1047, 1319].forEach((note, index) =>
            this.tone(note, index * 0.115, 0.42, { type: "triangle", volume: 0.075 }),
          );
          break;
      }
    }
  }

  const audio = new ToyAudio();

  function createPlayer() {
    return {
      x: 160,
      y: GROUND_Y - 72,
      previousX: 160,
      previousY: GROUND_Y - 72,
      w: 62,
      h: 72,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      coyote: 0.11,
      jumpBuffer: 0,
      hearts: 3,
      fluffy: false,
      invulnerable: 0,
      runTime: 0,
      landingSquash: 0,
      fluffyTrailTimer: 0,
    };
  }

  function buildLevel() {
    const platforms = [];
    const seeds = [];
    const addPlatform = (x, y, w, h, style = "ground", extra = {}) => {
      platforms.push({ x, y, w, h, style, broken: false, ...extra });
    };
    const addSeed = (x, y) => seeds.push({ x, y, collected: false, phase: (x * 0.013) % Math.PI });

    [
      [0, 1040],
      [1510, 1650],
      [3460, 2200],
      [6030, 1150],
      [7480, 2120],
    ].forEach(([x, width]) => addPlatform(x, GROUND_Y, width, 150, "ground"));

    addPlatform(520, 510, 185, 90, "planter");
    addPlatform(790, 440, 175, 36, "leaf");
    addPlatform(1075, 535, 150, 30, "leaf");
    addPlatform(1270, 465, 155, 30, "leaf");
    addPlatform(1430, 530, 130, 30, "leaf");
    addPlatform(1760, 470, 180, 32, "leaf");
    addPlatform(1990, 470, 150, 130, "planter");
    addPlatform(2390, 480, 180, 30, "leaf");
    addPlatform(2680, 455, 180, 145, "planter");
    addPlatform(2930, 500, 150, 28, "leaf");
    addPlatform(3215, 505, 155, 95, "stump");
    addPlatform(3650, 500, 190, 30, "leaf");
    addPlatform(3860, 465, 170, 135, "planter");
    addPlatform(4700, 500, 180, 30, "leaf");
    addPlatform(5070, 430, 220, 34, "leaf");
    addPlatform(5480, 445, 72, 72, "cracked", { breakable: true });
    addPlatform(5552, 445, 72, 72, "cracked", { breakable: true });
    addPlatform(5624, 445, 72, 72, "cracked", { breakable: true });
    addPlatform(5700, 520, 145, 30, "leaf");
    addPlatform(5885, 450, 160, 32, "leaf");
    addPlatform(6250, 500, 170, 30, "leaf");
    addPlatform(6630, 535, 150, 28, "leaf");
    addPlatform(6760, 500, 180, 100, "planter");
    addPlatform(7205, 500, 170, 100, "stump");
    addPlatform(7770, 470, 170, 32, "leaf");
    addPlatform(7970, 390, 170, 32, "leaf");
    addPlatform(8170, 475, 180, 32, "leaf");
    addPlatform(8550, 510, 160, 30, "leaf");

    [
      [300, 520], [430, 520], [605, 450], [690, 450], [830, 380], [920, 380],
      [1100, 485], [1180, 475], [1300, 405], [1380, 405], [1515, 525], [1620, 525],
      [1810, 415], [2025, 410], [2100, 410], [2430, 420], [2720, 400], [2990, 445],
      [3540, 525], [3700, 445], [3910, 405], [4100, 525], [4310, 525], [4520, 525],
      [4760, 445], [4980, 520], [5150, 370], [5330, 525], [5780, 465], [5945, 390],
      [6150, 525], [6330, 445], [6840, 440], [7300, 440], [7900, 410], [8800, 520],
    ].forEach(([x, y]) => addSeed(x, y));

    const enemies = [
      createEnemy("snail", 2250, 545, 1980, 2470, 52),
      createEnemy("beetle", 2860, 544, 2820, 3120, 74),
      createEnemy("snail", 4100, 545, 4050, 4380, 48),
      createEnemy("beetle", 4770, 444, 4700, 4820, 68),
      createEnemy("snail", 6470, 545, 6200, 6650, 52),
      createEnemy("beetle", 8360, 544, 8300, 8700, 78),
    ];

    return {
      platforms,
      seeds,
      enemies,
      hazards: [
        { x: 1040, y: 612, w: 470, h: 108, type: "water" },
        { x: 3160, y: 612, w: 300, h: 108, type: "water" },
        { x: 5660, y: 612, w: 370, h: 108, type: "water" },
        { x: 7180, y: 612, w: 300, h: 108, type: "water" },
        { x: 2530, y: 568, w: 92, h: 32, type: "thorns" },
        { x: 4900, y: 568, w: 100, h: 32, type: "thorns" },
        { x: 6510, y: 568, w: 96, h: 32, type: "thorns" },
      ],
      secrets: [
        { x: 1845, y: 380, found: false, reveal: 0 },
        { x: 5590, y: 360, found: false, reveal: 0 },
        { x: 8055, y: 325, found: false, reveal: 0 },
      ],
      powerup: { x: 5180, y: 337, w: 66, h: 74, collected: false },
      checkpoint: { x: 4460, y: 475, active: false, spawnX: 4500, spawnY: GROUND_Y - 72 },
      goal: { x: 9150, y: 450, w: 215, h: 150 },
      hints: [
        { x: 300, y: 410, text: "A · D  또는  ← · → 로 걸어요", accent: "이동" },
        { x: 780, y: 315, text: "SPACE 를 톡 눌러 점프!", accent: "점프" },
        { x: 2240, y: 420, text: "정원 친구는 위에서 통통!", accent: "통통" },
        { x: 5100, y: 255, text: "큰 씨앗은 털을 복슬복슬하게 해요", accent: "복슬" },
        { x: 9000, y: 390, text: "포근한 둥지가 바로 앞이에요", accent: "도착" },
      ],
      decorations: [
        [1050, 230, 0.72], [1530, 270, 0.56], [3370, 240, 0.68], [4430, 285, 0.52],
        [5680, 210, 0.8], [7190, 250, 0.62], [8890, 205, 0.82],
      ],
    };
  }

  function createEnemy(type, x, y, minX, maxX, speed) {
    const dimensions = type === "snail" ? { w: 88, h: 55 } : { w: 72, h: 58 };
    return {
      type,
      x,
      y,
      minX,
      maxX,
      speed,
      direction: -1,
      active: true,
      defeatedTimer: 0,
      phase: x * 0.01,
      ...dimensions,
    };
  }

  function resetRun() {
    level = buildLevel();
    player = createPlayer();
    camera = { x: 0, targetX: 0 };
    particles = [];
    elapsed = 0;
    respawnTimer = 0;
    screenFlash = 0;
    checkpointSnapshot = captureSnapshot();
    input.held.clear();
    input.jumpPressed = false;
    updateHud();
  }

  function startRun() {
    audio.init();
    resetRun();
    setState("playing");
    canvas.focus({ preventScroll: true });
  }

  function goToTitle() {
    resetRun();
    setState("title");
  }

  function setState(nextState) {
    state = nextState;
    const onTitle = state === "title";
    const onPause = state === "paused";
    const onComplete = state === "complete";
    ui.title.classList.toggle("is-hidden", !onTitle);
    ui.pause.classList.toggle("is-hidden", !onPause);
    ui.complete.classList.toggle("is-hidden", !onComplete);
    ui.hud.classList.toggle("is-hidden", onTitle);
    frame.classList.toggle("is-playing", !onTitle);
    if (state !== "respawning") ui.respawnNote.classList.remove("is-visible");
  }

  function pauseGame() {
    if (state === "playing") {
      input.held.clear();
      setState("paused");
    } else if (state === "paused") {
      setState("playing");
      audio.init();
      canvas.focus({ preventScroll: true });
    }
  }

  function captureSnapshot() {
    return {
      seeds: level.seeds.map((seed) => seed.collected),
      secrets: level.secrets.map((secret) => secret.found),
      enemies: level.enemies.map((enemy) => ({
        x: enemy.x,
        direction: enemy.direction,
        active: enemy.active,
      })),
      blocks: level.platforms.map((platform) => Boolean(platform.broken)),
      powerCollected: level.powerup.collected,
    };
  }

  function restoreSnapshot() {
    const snapshot = checkpointSnapshot;
    if (!snapshot) return;
    level.seeds.forEach((seed, index) => {
      seed.collected = snapshot.seeds[index];
    });
    level.secrets.forEach((secret, index) => {
      secret.found = snapshot.secrets[index];
      secret.reveal = secret.found ? 1 : 0;
    });
    level.enemies.forEach((enemy, index) => {
      const saved = snapshot.enemies[index];
      enemy.x = saved.x;
      enemy.direction = saved.direction;
      enemy.active = saved.active;
      enemy.defeatedTimer = 0;
    });
    level.platforms.forEach((platform, index) => {
      platform.broken = snapshot.blocks[index];
    });
    level.powerup.collected = snapshot.powerCollected;
  }

  function activateCheckpoint() {
    if (level.checkpoint.active) return;
    level.checkpoint.active = true;
    checkpointSnapshot = captureSnapshot();
    player.hearts = 3;
    audio.sfx("checkpoint");
    burst(level.checkpoint.x + 28, level.checkpoint.y + 38, ["#ffd35a", "#fff6c3", "#78b875"], 24, 240);
    showNote("중간 씨앗 바구니 저장!", 1300);
  }

  function triggerRespawn(message) {
    if (state !== "playing") return;
    state = "respawning";
    respawnTimer = 0.72;
    input.held.clear();
    audio.sfx("hurt");
    showNote(message || "씨앗 바구니에서 다시 출발!", 900);
  }

  function finishRespawn() {
    restoreSnapshot();
    const checkpoint = level.checkpoint;
    player = createPlayer();
    if (checkpoint.active) {
      player.x = checkpoint.spawnX;
      player.y = checkpoint.spawnY;
      player.previousX = player.x;
      player.previousY = player.y;
    }
    player.invulnerable = 1.2;
    camera.x = Logic.clamp(player.x - WIDTH * 0.38, 0, WORLD_WIDTH - WIDTH);
    setState("playing");
    updateHud();
  }

  function completeRun() {
    if (state !== "playing") return;
    const seeds = seedCount();
    const secrets = secretCount();
    const oldRecords = { bestSeeds: records.bestSeeds || 0, bestTime: records.bestTime || 0 };
    const next = Logic.nextBest(oldRecords, { seeds, time: elapsed });
    const seedRecord = seeds > oldRecords.bestSeeds;
    const timeRecord = oldRecords.bestTime <= 0 || elapsed < oldRecords.bestTime;
    records.bestSeeds = next.bestSeeds;
    records.bestTime = next.bestTime;
    saveRecords();

    ui.resultSeeds.textContent = `${seeds} / ${TOTAL_SEEDS}`;
    ui.resultSecrets.textContent = `${secrets} / ${TOTAL_SECRETS}`;
    ui.resultTime.textContent = Logic.formatTime(elapsed);
    ui.bestResult.textContent = seedRecord || timeRecord ? "새로운 최고 기록이에요! ✦" :
      `최고 ${records.bestSeeds}개 · ${Logic.formatTime(records.bestTime)}`;
    if (seeds === TOTAL_SEEDS && secrets === TOTAL_SECRETS) {
      ui.completeMessage.textContent = "정원의 모든 반짝임을 찾아낸 완벽한 소풍이었어요!";
    } else if (secrets === TOTAL_SECRETS) {
      ui.completeMessage.textContent = "꼭꼭 숨은 씨앗 바구니를 모두 발견했어요!";
    } else {
      ui.completeMessage.textContent = "햄찌가 간식을 가득 안고 집으로 돌아왔어요.";
    }
    audio.sfx("finish");
    burst(level.goal.x + 105, level.goal.y + 50, ["#ffd35a", "#ff9e7a", "#ffffff", "#79bb76"], 58, 360);
    setState("complete");
  }

  function showNote(message, duration) {
    ui.respawnNote.textContent = message;
    ui.respawnNote.classList.add("is-visible");
    window.clearTimeout(showNote.timer);
    showNote.timer = window.setTimeout(() => {
      if (state !== "respawning") ui.respawnNote.classList.remove("is-visible");
    }, duration);
  }

  function update(dt) {
    updateParticles(dt);
    screenFlash = Math.max(0, screenFlash - dt * 2.8);
    if (state === "respawning") {
      respawnTimer -= dt;
      if (respawnTimer <= 0) finishRespawn();
      return;
    }
    if (state !== "playing") return;

    elapsed += dt;
    player.previousX = player.x;
    player.previousY = player.y;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    player.landingSquash = Math.max(0, player.landingSquash - dt * 5);
    player.fluffyTrailTimer = Math.max(0, player.fluffyTrailTimer - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    if (input.jumpPressed) {
      player.jumpBuffer = 0.13;
      input.jumpPressed = false;
    }

    const moveLeft = input.held.has("ArrowLeft") || input.held.has("KeyA");
    const moveRight = input.held.has("ArrowRight") || input.held.has("KeyD");
    const moveDirection = Number(moveRight) - Number(moveLeft);
    const acceleration = player.grounded ? 2450 : 1650;
    const maxSpeed = player.fluffy ? 300 : 330;

    if (moveDirection) {
      player.vx += moveDirection * acceleration * dt;
      player.vx = Logic.clamp(player.vx, -maxSpeed, maxSpeed);
      player.facing = moveDirection;
      player.runTime += dt * (Math.abs(player.vx) / maxSpeed);
    } else {
      const drag = player.grounded ? 0.000015 : 0.08;
      player.vx *= Math.pow(drag, dt);
      if (Math.abs(player.vx) < 2) player.vx = 0;
    }

    if (player.grounded) {
      player.coyote = 0.115;
    } else {
      player.coyote = Math.max(0, player.coyote - dt);
    }

    if (Logic.shouldJump(player.jumpBuffer, player.coyote)) {
      player.vy = player.fluffy ? -735 : -760;
      player.grounded = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      audio.sfx("jump");
      dust(player.x + player.w / 2, player.y + player.h, 5);
    }

    player.vy = Math.min(1100, player.vy + 2050 * dt);
    if (player.fluffy && Math.abs(player.vx) > 35 && player.fluffyTrailTimer <= 0) {
      fluffyTrail(player.x + player.w * 0.35, player.y + player.h * 0.55);
      player.fluffyTrailTimer = 0.075;
    }
    movePlayerX(dt);
    movePlayerY(dt);
    player.x = Logic.clamp(player.x, 0, WORLD_WIDTH - player.w);

    updateEnemies(dt);
    collectItems(dt);
    checkEnemyCollisions();
    checkHazards();
    checkCheckpointAndGoal();

    if (player.y > HEIGHT + 160) {
      triggerRespawn("물방울을 털고 다시 출발!");
    }

    camera.targetX = Logic.clamp(player.x + player.w / 2 - WIDTH * 0.38, 0, WORLD_WIDTH - WIDTH);
    camera.x = Logic.lerp(camera.x, camera.targetX, 1 - Math.pow(0.0008, dt));
    updateHud();
  }

  function movePlayerX(dt) {
    player.x += player.vx * dt;
    for (const platform of level.platforms) {
      if (platform.broken || !Logic.rectsOverlap(player, platform)) continue;
      if (player.vx > 0) {
        player.x = platform.x - player.w;
      } else if (player.vx < 0) {
        player.x = platform.x + platform.w;
      }
      player.vx = 0;
    }
  }

  function movePlayerY(dt) {
    const wasGrounded = player.grounded;
    const previousBottom = player.previousY + player.h;
    const previousTop = player.previousY;
    player.y += player.vy * dt;
    player.grounded = false;

    for (const platform of level.platforms) {
      if (platform.broken || !Logic.rectsOverlap(player, platform)) continue;
      if (player.vy >= 0 && previousBottom <= platform.y + 14) {
        player.y = platform.y - player.h;
        if (!wasGrounded && player.vy > 410) {
          player.landingSquash = 1;
          dust(player.x + player.w / 2, player.y + player.h, 7);
        }
        player.vy = 0;
        player.grounded = true;
      } else if (player.vy < 0 && previousTop >= platform.y + platform.h - 15) {
        if (platform.breakable && player.fluffy) {
          platform.broken = true;
          player.vy = 75;
          audio.sfx("break");
          burst(platform.x + platform.w / 2, platform.y + platform.h / 2, ["#b56d43", "#d99462", "#f3c08c"], 13, 220);
        } else {
          player.y = platform.y + platform.h;
          player.vy = 65;
          if (platform.breakable) {
            burst(platform.x + platform.w / 2, platform.y + platform.h, ["#fff1c9"], 4, 80);
          }
        }
      } else {
        if (player.x + player.w / 2 < platform.x + platform.w / 2) {
          player.x = platform.x - player.w;
        } else {
          player.x = platform.x + platform.w;
        }
        player.vx = 0;
      }
    }
  }

  function updateEnemies(dt) {
    for (const enemy of level.enemies) {
      if (!enemy.active) {
        enemy.defeatedTimer = Math.min(1, enemy.defeatedTimer + dt * 2.6);
        continue;
      }
      const nextX = enemy.x + enemy.speed * enemy.direction * dt;
      if (nextX <= enemy.minX) {
        enemy.x = enemy.minX;
        enemy.direction = 1;
      } else if (nextX >= enemy.maxX) {
        enemy.x = enemy.maxX;
        enemy.direction = -1;
      } else if (Logic.enemyHitsObstacle(enemy, nextX, level.platforms)) {
        enemy.direction *= -1;
        enemy.phase += Math.PI * 0.35;
        burst(enemy.x + enemy.w / 2, enemy.y + enemy.h * 0.55, ["#fff4bf", "#d9b986"], 3, 60);
      } else {
        enemy.x = nextX;
      }
      enemy.phase += dt * 4;
    }
  }

  function collectItems(dt) {
    const playerCenterX = player.x + player.w / 2;
    const playerCenterY = player.y + player.h / 2;
    for (const seed of level.seeds) {
      if (seed.collected) continue;
      const distance = Math.hypot(playerCenterX - seed.x, playerCenterY - seed.y);
      if (distance < 45) {
        seed.collected = true;
        audio.sfx("seed");
        burst(seed.x, seed.y, ["#ffd35a", "#fff3b0", "#8ebf72"], 9, 150);
      }
    }

    for (const secret of level.secrets) {
      if (secret.found) continue;
      const distance = Math.hypot(playerCenterX - secret.x, playerCenterY - secret.y);
      const targetReveal = distance < 330 ? 1 : 0;
      secret.reveal = Logic.lerp(secret.reveal, targetReveal, 1 - Math.pow(0.012, dt));
      if (distance < 49) {
        secret.found = true;
        secret.reveal = 1;
        audio.sfx("secret");
        burst(secret.x, secret.y, ["#fff5b8", "#ffd052", "#ff9f7d", "#ffffff"], 25, 280);
        showNote(`숨은 씨앗 바구니 ${secretCount()} / ${TOTAL_SECRETS}`, 1200);
      }
    }

    const powerup = level.powerup;
    if (!powerup.collected && Logic.rectsOverlap(player, powerup)) {
      powerup.collected = true;
      player.fluffy = true;
      player.invulnerable = Math.max(player.invulnerable, 0.45);
      audio.sfx("power");
      screenFlash = 0.7;
      burst(powerup.x + powerup.w / 2, powerup.y + powerup.h / 2, ["#ffd35a", "#fff9d2", "#ffffff"], 34, 320);
      showNote("복슬복슬 파워! 금 간 화분을 깨 보세요", 1800);
    }
  }

  function checkEnemyCollisions() {
    const previousBottom = player.previousY + player.h;
    for (const enemy of level.enemies) {
      if (!enemy.active) continue;
      const hitbox = {
        x: enemy.x + 6,
        y: enemy.y + 7,
        w: enemy.w - 12,
        h: enemy.h - 7,
      };
      if (!Logic.rectsOverlap(player, hitbox)) continue;
      if (Logic.isStomp(player, hitbox, previousBottom)) {
        enemy.active = false;
        enemy.defeatedTimer = 0;
        player.vy = -535;
        player.grounded = false;
        audio.sfx("stomp");
        burst(enemy.x + enemy.w / 2, enemy.y + 10, ["#fff0aa", "#9acb83"], 10, 170);
      } else {
        damagePlayer(enemy.x + enemy.w / 2);
      }
      break;
    }
  }

  function checkHazards() {
    for (const hazard of level.hazards) {
      if (hazard.type === "water") continue;
      const hitbox = { x: hazard.x + 8, y: hazard.y + 8, w: hazard.w - 16, h: hazard.h - 8 };
      if (Logic.rectsOverlap(player, hitbox)) {
        damagePlayer(hazard.x + hazard.w / 2);
        player.vy = -430;
        break;
      }
    }
  }

  function damagePlayer(sourceX) {
    if (player.invulnerable > 0 || state !== "playing") return;
    const result = Logic.applyDamage(player);
    player.hearts = result.hearts;
    player.fluffy = result.fluffy;
    player.invulnerable = 1.15;
    player.vx = (player.x + player.w / 2 < sourceX ? -1 : 1) * 310;
    player.vy = -390;
    screenFlash = 0.45;
    audio.sfx(result.absorbed ? "shield" : "hurt");
    if (result.absorbed) {
      showNote("복슬 파워가 햄찌를 지켜줬어요 · 보호 종료", 1650);
    }
    burst(player.x + player.w / 2, player.y + player.h / 2,
      result.absorbed ? ["#ffe27a", "#ffffff"] : ["#ff9a8c", "#fff2df"], 14, 200);
    if (player.hearts <= 0) {
      triggerRespawn("마음을 가다듬고 다시 출발!");
    }
    updateHud();
  }

  function checkCheckpointAndGoal() {
    if (!level.checkpoint.active && Math.abs(player.x + player.w / 2 - level.checkpoint.x) < 52) {
      activateCheckpoint();
    }
    if (Logic.rectsOverlap(player, level.goal)) {
      completeRun();
    }
  }

  function seedCount() {
    return level.seeds.reduce((total, seed) => total + Number(seed.collected), 0);
  }

  function secretCount() {
    return level.secrets.reduce((total, secret) => total + Number(secret.found), 0);
  }

  function updateHud() {
    ui.health.textContent = `${"♥ ".repeat(player.hearts)}${"♡ ".repeat(3 - player.hearts)}`.trim();
    ui.power.classList.toggle("is-hidden", !player.fluffy);
    ui.seeds.textContent = `${seedCount()} / ${TOTAL_SEEDS}`;
    ui.secrets.textContent = `${secretCount()} / ${TOTAL_SECRETS}`;
    ui.time.textContent = Logic.formatTime(elapsed);
    ui.mute.textContent = audio.muted ? "×" : "♪";
    ui.mute.setAttribute("aria-label", audio.muted ? "소리 켜기" : "소리 끄기");
  }

  function burst(x, y, colors, count, speed) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.45;
      const velocity = speed * (0.38 + Math.random() * 0.62);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - speed * 0.16,
        life: 0.48 + Math.random() * 0.52,
        maxLife: 1,
        size: 3 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        spin: Math.random() * Math.PI,
        gravity: 360,
      });
    }
  }

  function dust(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: x + (Math.random() - 0.5) * 38,
        y: y - Math.random() * 8,
        vx: (Math.random() - 0.5) * 80,
        vy: -20 - Math.random() * 45,
        life: 0.32 + Math.random() * 0.25,
        maxLife: 0.55,
        size: 5 + Math.random() * 9,
        color: "rgba(255, 246, 210, 0.74)",
        spin: 0,
        gravity: -12,
      });
    }
  }

  function fluffyTrail(x, y) {
    for (let index = 0; index < 3; index += 1) {
      particles.push({
        x: x - player.facing * (12 + Math.random() * 18),
        y: y + (Math.random() - 0.5) * 28,
        vx: -player.facing * (18 + Math.random() * 32),
        vy: -18 - Math.random() * 34,
        life: 0.42 + Math.random() * 0.2,
        maxLife: 0.62,
        size: 4 + Math.random() * 6,
        color: index === 0 ? "#fff9c9" : index === 1 ? "#ffd65f" : "#ffffff",
        spin: Math.random() * Math.PI,
        gravity: -8,
      });
    }
  }

  function updateParticles(dt) {
    for (const particle of particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= Math.pow(0.18, dt);
      particle.spin += dt * 4;
    }
    particles = particles.filter((particle) => particle.life > 0);
  }

  function render() {
    ctx.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawBackground(state === "title" ? 0 : camera.x);

    if (state === "title") {
      drawTitleScene();
    } else {
      drawWorld();
    }

    if (screenFlash > 0) {
      ctx.save();
      ctx.globalAlpha = screenFlash * 0.35;
      ctx.fillStyle = player.fluffy ? "#fff4a4" : "#fff7e8";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }
    if (state === "respawning") {
      const progress = Logic.clamp(1 - respawnTimer / 0.72, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(255, 250, 228, ${Math.sin(progress * Math.PI) * 0.52})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.restore();
    }
  }

  function drawBackground(cameraX) {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#99d5ec");
    sky.addColorStop(0.58, "#f6dfa4");
    sky.addColorStop(1, "#dbe8a0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (images.background.complete && images.background.naturalWidth) {
      const tileWidth = WIDTH + 80;
      const offset = -((cameraX * 0.035) % tileWidth) - 40;
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.drawImage(images.background, offset, -38, tileWidth, HEIGHT + 76);
      ctx.drawImage(images.background, offset + tileWidth - 2, -38, tileWidth, HEIGHT + 76);
      ctx.restore();
    }

    const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    wash.addColorStop(0, "rgba(241, 250, 244, 0.06)");
    wash.addColorStop(0.7, "rgba(255, 240, 184, 0.08)");
    wash.addColorStop(1, "rgba(69, 107, 68, 0.1)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.fillStyle = "rgba(255, 248, 197, 0.54)";
    for (let index = 0; index < 16; index += 1) {
      const x = ((index * 173 - cameraX * (0.02 + (index % 3) * 0.01)) % (WIDTH + 80)) - 30;
      const y = 95 + ((index * 71) % 360);
      const radius = 1.3 + (index % 4) * 0.7;
      ctx.beginPath();
      ctx.arc(x, y + Math.sin(performance.now() * 0.0008 + index) * 6, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTitleScene() {
    ctx.save();
    const groundGradient = ctx.createLinearGradient(0, 525, 0, HEIGHT);
    groundGradient.addColorStop(0, "rgba(132, 177, 91, 0.05)");
    groundGradient.addColorStop(1, "rgba(58, 100, 63, 0.28)");
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, 510, WIDTH, 210);
    drawSunflower(1050, 430, 0.88);
    drawSunflower(1190, 500, 0.56);
    drawHamsterSprite({
      x: 905,
      y: 342 + Math.sin(performance.now() * 0.0022) * 7,
      w: 230,
      h: 250,
      vx: 0,
      vy: 0,
      facing: 1,
      runTime: performance.now() * 0.001,
      fluffy: false,
      invulnerable: 0,
      landingSquash: 0,
    }, true);
    if (images.superSeed.complete && images.superSeed.naturalWidth) {
      const bob = Math.sin(performance.now() * 0.003) * 8;
      ctx.save();
      ctx.translate(1110, 225 + bob);
      ctx.rotate(0.08);
      ctx.drawImage(images.superSeed, -46, -46, 92, 92);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawWorld() {
    ctx.save();
    ctx.translate(-camera.x, 0);

    for (const [x, y, scale] of level.decorations) {
      if (isVisible(x, 220)) drawSunflower(x, y, scale);
    }
    drawWater();
    for (const platform of level.platforms) {
      if (!platform.broken && isVisible(platform.x, platform.w + 100)) drawPlatform(platform);
    }
    drawCheckpoint(level.checkpoint);
    drawGoal(level.goal);

    for (const seed of level.seeds) {
      if (!seed.collected && isVisible(seed.x, 80)) drawSeed(seed);
    }
    for (const secret of level.secrets) {
      if (!secret.found && secret.reveal > 0.02 && isVisible(secret.x, 100)) drawSecret(secret);
    }
    if (!level.powerup.collected && isVisible(level.powerup.x, 100)) drawPowerup(level.powerup);
    for (const enemy of level.enemies) {
      if ((enemy.active || enemy.defeatedTimer < 1) && isVisible(enemy.x, enemy.w + 120)) drawEnemy(enemy);
    }
    drawHints();
    drawHamsterSprite(player);
    drawParticles();
    drawForegroundGrass();
    ctx.restore();
  }

  function isVisible(x, width) {
    return x + width >= camera.x - 100 && x <= camera.x + WIDTH + 100;
  }

  function drawWater() {
    for (const hazard of level.hazards) {
      if (hazard.type !== "water" || !isVisible(hazard.x, hazard.w)) continue;
      const gradient = ctx.createLinearGradient(0, hazard.y, 0, HEIGHT);
      gradient.addColorStop(0, "rgba(112, 197, 210, 0.86)");
      gradient.addColorStop(1, "rgba(60, 137, 166, 0.95)");
      ctx.fillStyle = gradient;
      ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h);
      ctx.strokeStyle = "rgba(232, 255, 242, 0.72)";
      ctx.lineWidth = 4;
      for (let x = hazard.x - 12; x < hazard.x + hazard.w + 18; x += 38) {
        const wave = Math.sin(performance.now() * 0.003 + x * 0.03) * 3;
        ctx.beginPath();
        ctx.arc(x, hazard.y + 4 + wave, 18, Math.PI, 0);
        ctx.stroke();
      }
    }

    for (const hazard of level.hazards) {
      if (hazard.type === "thorns" && isVisible(hazard.x, hazard.w)) drawThorns(hazard);
    }
  }

  function drawPlatform(platform) {
    ctx.save();
    if (platform.style === "ground") {
      const soil = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
      soil.addColorStop(0, "#8a694b");
      soil.addColorStop(0.16, "#7a583f");
      soil.addColorStop(1, "#503e35");
      ctx.fillStyle = soil;
      ctx.fillRect(platform.x, platform.y + 10, platform.w, platform.h - 10);
      ctx.fillStyle = "#72a85f";
      roundedRectPath(platform.x - 3, platform.y, platform.w + 6, 24, 12);
      ctx.fill();
      ctx.fillStyle = "#9dce78";
      roundedRectPath(platform.x, platform.y, platform.w, 10, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 221, 157, 0.14)";
      for (let x = platform.x + 35; x < platform.x + platform.w; x += 73) {
        ctx.beginPath();
        ctx.arc(x, platform.y + 52 + ((x * 7) % 44), 4 + (x % 3), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (platform.style === "leaf") {
      ctx.translate(platform.x + platform.w / 2, platform.y + platform.h / 2);
      const leaf = ctx.createLinearGradient(0, -platform.h, 0, platform.h);
      leaf.addColorStop(0, "#9fd67c");
      leaf.addColorStop(1, "#4f8e61");
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.moveTo(-platform.w / 2, 0);
      ctx.quadraticCurveTo(-platform.w * 0.18, -platform.h * 1.05, platform.w / 2, 0);
      ctx.quadraticCurveTo(platform.w * 0.1, platform.h * 0.9, -platform.w / 2, 0);
      ctx.fill();
      ctx.strokeStyle = "rgba(236, 255, 205, 0.58)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-platform.w * 0.36, 0);
      ctx.lineTo(platform.w * 0.36, 0);
      ctx.stroke();
    } else if (platform.style === "planter") {
      const pot = ctx.createLinearGradient(platform.x, 0, platform.x + platform.w, 0);
      pot.addColorStop(0, "#b96e43");
      pot.addColorStop(0.5, "#e29a64");
      pot.addColorStop(1, "#9a593d");
      ctx.fillStyle = pot;
      roundedRectPath(platform.x + 12, platform.y + 18, platform.w - 24, platform.h - 18, 14);
      ctx.fill();
      ctx.fillStyle = "#e8a271";
      roundedRectPath(platform.x, platform.y, platform.w, 30, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 213, 162, 0.5)";
      roundedRectPath(platform.x + 10, platform.y + 4, platform.w - 20, 7, 4);
      ctx.fill();
    } else if (platform.style === "stump") {
      ctx.fillStyle = "#9c704c";
      roundedRectPath(platform.x + 10, platform.y, platform.w - 20, platform.h + 25, 16);
      ctx.fill();
      ctx.fillStyle = "#d8a66c";
      ctx.beginPath();
      ctx.ellipse(platform.x + platform.w / 2, platform.y + 5, platform.w / 2, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(108, 71, 45, 0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(platform.x + platform.w / 2, platform.y + 5, platform.w * 0.28, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (platform.style === "cracked") {
      const clay = ctx.createLinearGradient(platform.x, platform.y, platform.x + platform.w, platform.y + platform.h);
      clay.addColorStop(0, "#e8a26d");
      clay.addColorStop(1, "#aa6043");
      ctx.fillStyle = clay;
      roundedRectPath(platform.x + 2, platform.y + 2, platform.w - 4, platform.h - 4, 12);
      ctx.fill();
      ctx.strokeStyle = "rgba(105, 59, 45, 0.68)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(platform.x + 35, platform.y + 8);
      ctx.lineTo(platform.x + 28, platform.y + 29);
      ctx.lineTo(platform.x + 42, platform.y + 41);
      ctx.lineTo(platform.x + 33, platform.y + 64);
      ctx.moveTo(platform.x + 42, platform.y + 41);
      ctx.lineTo(platform.x + 58, platform.y + 32);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 222, 180, 0.36)";
      roundedRectPath(platform.x + 10, platform.y + 8, platform.w - 20, 7, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSeed(seed) {
    const bob = Math.sin(performance.now() * 0.004 + seed.phase) * 6;
    ctx.save();
    ctx.translate(seed.x, seed.y + bob);
    ctx.rotate(-0.42 + Math.sin(performance.now() * 0.002 + seed.phase) * 0.08);
    ctx.shadowColor = "rgba(255, 213, 84, 0.7)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#684331";
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#f2d797";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(-3, 0, 0, 13);
    ctx.stroke();
    ctx.restore();
  }

  function drawSecret(secret) {
    const bob = Math.sin(performance.now() * 0.004 + secret.x) * 7;
    ctx.save();
    ctx.globalAlpha = secret.reveal;
    ctx.translate(secret.x, secret.y + bob);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
    ctx.scale(pulse, pulse);
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 48);
    glow.addColorStop(0, "rgba(255, 255, 222, 0.98)");
    glow.addColorStop(0.35, "rgba(255, 213, 80, 0.6)");
    glow.addColorStop(1, "rgba(255, 204, 70, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd359";
    drawStarPath(0, 0, 19, 9, 5);
    ctx.fill();
    ctx.fillStyle = "#fff8cc";
    drawStarPath(-4, -4, 7, 3, 5);
    ctx.fill();
    ctx.restore();
  }

  function drawPowerup(powerup) {
    const bob = Math.sin(performance.now() * 0.0045) * 9;
    ctx.save();
    ctx.translate(powerup.x + powerup.w / 2, powerup.y + powerup.h / 2 + bob);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.045;
    ctx.scale(pulse, pulse);
    if (images.superSeed.complete && images.superSeed.naturalWidth) {
      ctx.drawImage(images.superSeed, -44, -44, 88, 88);
    } else {
      ctx.fillStyle = "#ffd052";
      ctx.beginPath();
      ctx.ellipse(0, 0, 23, 32, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ctx.save();
    const progress = enemy.active ? 0 : Logic.clamp(enemy.defeatedTimer, 0, 1);
    ctx.globalAlpha = 1 - progress;
    const wobble = enemy.active ? Math.sin(enemy.phase) * 2 : 0;
    ctx.translate(enemy.x + enemy.w / 2, enemy.y + enemy.h + wobble);
    ctx.scale(enemy.direction > 0 ? -1 : 1, enemy.active ? 1 : Math.max(0.15, 1 - progress * 0.85));
    ctx.rotate(enemy.active ? Math.sin(enemy.phase * 0.7) * 0.018 : progress * 0.22);
    ctx.fillStyle = "rgba(62, 70, 45, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, 2, enemy.w * 0.37, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const image = enemy.type === "snail" ? images.snail : images.beetle;
    if (image.complete && image.naturalWidth) {
      const visualW = enemy.type === "snail" ? enemy.w * 1.34 : enemy.w * 1.24;
      const visualH = enemy.type === "snail" ? enemy.h * 1.44 : enemy.h * 1.35;
      ctx.drawImage(image, -visualW / 2, -visualH, visualW, visualH);
    } else {
      ctx.fillStyle = enemy.type === "snail" ? "#80b875" : "#384f9f";
      ctx.beginPath();
      ctx.ellipse(0, -enemy.h / 2, enemy.w / 2, enemy.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHamsterSprite(subject, titlePose = false) {
    ctx.save();
    const centerX = subject.x + subject.w / 2;
    const bottomY = subject.y + subject.h;
    const moving = Math.abs(subject.vx || 0) > 18;
    const runBob = moving ? Math.sin(subject.runTime * 12) * 3.5 : Math.sin(performance.now() * 0.0027) * 1.8;
    const shadowWidth = titlePose ? subject.w * 0.5 : subject.w * (subject.fluffy ? 0.72 : 0.62);

    ctx.globalAlpha = subject.invulnerable > 0 && Math.floor(subject.invulnerable * 14) % 2 ? 0.38 : 1;
    ctx.fillStyle = "rgba(59, 70, 44, 0.2)";
    ctx.beginPath();
    ctx.ellipse(centerX, bottomY + 5, shadowWidth, titlePose ? 18 : 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(centerX, bottomY + runBob);
    const jumpStretch = subject.grounded ? 0 : Logic.clamp(Math.abs(subject.vy) / 900, 0, 0.16);
    const land = subject.landingSquash || 0;
    const scaleX = (subject.fluffy ? 1.1 : 1) * (1 - jumpStretch * 0.32 + land * 0.13);
    const scaleY = (subject.fluffy ? 1.06 : 1) * (1 + jumpStretch - land * 0.14);
    ctx.scale((subject.facing || 1) * scaleX, scaleY);
    ctx.rotate(titlePose ? -0.025 : Logic.clamp((subject.vx || 0) / 2300 + (subject.vy || 0) / 8200, -0.14, 0.14));

    const image = subject.fluffy ? images.fluffy : images.hamster;
    const visualW = titlePose ? subject.w : subject.fluffy ? 112 : 103;
    const visualH = titlePose ? subject.h : subject.fluffy ? 101 : 96;
    if (subject.fluffy && !titlePose) {
      drawFluffyAura(visualW, visualH, subject.facing || 1);
    }
    if (image.complete && image.naturalWidth) {
      ctx.drawImage(image, -visualW / 2, -visualH + 5, visualW, visualH);
    } else {
      drawFallbackHamster(visualW, visualH);
    }
    if (subject.fluffy && !titlePose) {
      ctx.globalAlpha *= 0.95;
      ctx.fillStyle = "#fff5a5";
      ctx.shadowColor = "#ffca3d";
      ctx.shadowBlur = 9;
      [[-0.46, -0.82, 7], [0.5, -0.68, 6], [-0.4, -0.2, 5]].forEach(([x, y, size]) => {
        drawStarPath(visualW * x, visualH * y, size, size * 0.42, 4);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawFluffyAura(visualW, visualH, facing) {
    const time = performance.now() * 0.004;
    ctx.save();
    const aura = ctx.createRadialGradient(0, -visualH * 0.47, visualW * 0.2, 0, -visualH * 0.47, visualW * 0.74);
    aura.addColorStop(0, "rgba(255, 246, 153, 0.26)");
    aura.addColorStop(0.55, "rgba(255, 211, 75, 0.24)");
    aura.addColorStop(1, "rgba(255, 186, 42, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, -visualH * 0.47, visualW * 0.72, visualH * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let index = 0; index < 10; index += 1) {
      const angle = (Math.PI * 2 * index) / 10 + Math.sin(time * 0.55 + index) * 0.06;
      const puffX = Math.cos(angle) * visualW * 0.53;
      const puffY = -visualH * 0.47 + Math.sin(angle) * visualH * 0.48;
      const puffSize = 7 + (index % 3) * 2 + Math.sin(time + index) * 1.2;
      ctx.fillStyle = index % 2 ? "rgba(255, 232, 116, 0.34)" : "rgba(255, 199, 55, 0.28)";
      ctx.beginPath();
      ctx.arc(puffX, puffY, puffSize, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let index = 0; index < 5; index += 1) {
      const angle = time + (Math.PI * 2 * index) / 5;
      const orbitX = Math.cos(angle) * visualW * 0.64;
      const orbitY = -visualH * 0.48 + Math.sin(angle) * visualH * 0.43;
      const radius = index === 0 ? 5.5 : 3.2;
      ctx.fillStyle = index === 0 ? "#fff8a7" : "rgba(255, 216, 72, 0.9)";
      ctx.shadowColor = "#ffca3d";
      ctx.shadowBlur = 9;
      ctx.beginPath();
      ctx.arc(orbitX * facing, orbitY, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFallbackHamster(w, h) {
    ctx.fillStyle = "#e8a849";
    ctx.beginPath();
    ctx.ellipse(-5, -h * 0.45, w * 0.46, h * 0.43, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff0cf";
    ctx.beginPath();
    ctx.ellipse(w * 0.18, -h * 0.49, w * 0.27, h * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#442f28";
    ctx.beginPath();
    ctx.arc(w * 0.3, -h * 0.58, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCheckpoint(checkpoint) {
    if (!isVisible(checkpoint.x, 100)) return;
    ctx.save();
    ctx.translate(checkpoint.x, checkpoint.y);
    ctx.fillStyle = "#8d6548";
    roundedRectPath(-6, 0, 12, 126, 5);
    ctx.fill();
    ctx.fillStyle = checkpoint.active ? "#ffd356" : "#f5edd1";
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.quadraticCurveTo(48, -4, 74, 15);
    ctx.lineTo(53, 43);
    ctx.quadraticCurveTo(29, 27, 4, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = checkpoint.active ? "#7cae68" : "#aaa78f";
    ctx.beginPath();
    ctx.arc(31, 18, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = checkpoint.active ? "#ffd765" : "#ded8bf";
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      ctx.beginPath();
      ctx.ellipse(31 + Math.cos(angle) * 13, 18 + Math.sin(angle) * 13, 6, 3.5, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGoal(goal) {
    if (!isVisible(goal.x, goal.w + 130)) return;
    ctx.save();
    const x = goal.x + goal.w / 2;
    const y = GROUND_Y;
    ctx.fillStyle = "rgba(68, 73, 44, 0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y + 7, 132, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    const mound = ctx.createRadialGradient(x - 25, y - 110, 12, x, y - 78, 150);
    mound.addColorStop(0, "#a9cb73");
    mound.addColorStop(0.65, "#6e9d5f");
    mound.addColorStop(1, "#4f7750");
    ctx.fillStyle = mound;
    ctx.beginPath();
    ctx.moveTo(x - 148, y);
    ctx.quadraticCurveTo(x - 132, y - 150, x, y - 160);
    ctx.quadraticCurveTo(x + 132, y - 150, x + 148, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#49372d";
    ctx.beginPath();
    ctx.ellipse(x, y - 52, 59, 74, 0, Math.PI, 0);
    ctx.lineTo(x + 59, y);
    ctx.lineTo(x - 59, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a5032";
    ctx.beginPath();
    ctx.ellipse(x, y - 49, 42, 56, 0, Math.PI, 0);
    ctx.lineTo(x + 42, y);
    ctx.lineTo(x - 42, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f4c96a";
    roundedRectPath(x + 53, y - 115, 74, 39, 12);
    ctx.fill();
    ctx.fillStyle = "#64513a";
    ctx.font = "800 16px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("우리 집", x + 90, y - 90);
    ctx.restore();
  }

  function drawHints() {
    for (const hint of level.hints) {
      const distance = Math.abs(player.x + player.w / 2 - hint.x);
      if (distance > 520 || !isVisible(hint.x, 340)) continue;
      const opacity = Logic.clamp(1 - Math.abs(distance - 150) / 430, 0.18, 1);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.font = "800 17px system-ui";
      const width = Math.min(340, ctx.measureText(hint.text).width + 40);
      const x = hint.x - width / 2;
      const y = hint.y;
      ctx.fillStyle = "rgba(255, 252, 237, 0.9)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2;
      roundedRectPath(x, y, width, 45, 16);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6c6456";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(hint.text, hint.x, y + 23);
      ctx.restore();
    }
  }

  function drawSunflower(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "#5e965e";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 260);
    ctx.quadraticCurveTo(-10, 110, 0, 18);
    ctx.stroke();
    ctx.fillStyle = "#72aa66";
    ctx.beginPath();
    ctx.ellipse(-28, 155, 44, 18, -0.4, 0, Math.PI * 2);
    ctx.ellipse(28, 205, 42, 17, 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 207, 75, 0.94)";
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      ctx.beginPath();
      ctx.ellipse(Math.cos(angle) * 43, Math.sin(angle) * 43, 28, 13, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#8b633e";
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 225, 126, 0.28)";
    for (let index = 0; index < 15; index += 1) {
      const angle = index * 2.4;
      const radius = 4 + index * 1.7;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawThorns(hazard) {
    ctx.save();
    ctx.fillStyle = "#618c55";
    for (let x = hazard.x; x < hazard.x + hazard.w; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, hazard.y + hazard.h);
      ctx.quadraticCurveTo(x + 8, hazard.y + 7, x + 12, hazard.y);
      ctx.quadraticCurveTo(x + 18, hazard.y + 12, x + 20, hazard.y + hazard.h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of particles) {
      ctx.save();
      ctx.globalAlpha = Logic.clamp(particle.life / particle.maxLife, 0, 1);
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.spin);
      ctx.fillStyle = particle.color;
      roundedRectPath(-particle.size / 2, -particle.size / 2, particle.size, particle.size, particle.size * 0.4);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawForegroundGrass() {
    const start = Math.floor((camera.x - 60) / 42) * 42;
    ctx.save();
    ctx.strokeStyle = "rgba(58, 113, 62, 0.7)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let x = start; x < camera.x + WIDTH + 80; x += 42) {
      const onGround = level.platforms.some(
        (platform) => platform.style === "ground" && x >= platform.x && x <= platform.x + platform.w,
      );
      if (!onGround) continue;
      const sway = Math.sin(performance.now() * 0.0018 + x) * 3;
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 7);
      ctx.quadraticCurveTo(x - 3, GROUND_Y - 4, x + sway, GROUND_Y - 13 - (x % 11));
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawStarPath(x, y, outerRadius, innerRadius, points) {
    ctx.beginPath();
    for (let index = 0; index < points * 2; index += 1) {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = -Math.PI / 2 + (Math.PI * index) / points;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function frameLoop(now) {
    const frameDelta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    accumulator += frameDelta;
    while (accumulator >= FIXED_STEP) {
      update(FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    render();
    requestAnimationFrame(frameLoop);
  }

  function resizeCanvas() {
    deviceScale = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(WIDTH * deviceScale);
    canvas.height = Math.round(HEIGHT * deviceScale);
  }

  function toggleMute() {
    audio.init();
    audio.setMuted(!audio.muted);
    records.muted = audio.muted;
    saveRecords();
    updateHud();
  }

  function loadRecords() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        bestSeeds: Number(saved.bestSeeds) || 0,
        bestTime: Number(saved.bestTime) || 0,
        muted: Boolean(saved.muted),
      };
    } catch (_error) {
      return { bestSeeds: 0, bestTime: 0, muted: false };
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (_error) {
      // file:// 환경에서 저장소가 막혀도 현재 플레이는 그대로 진행한다.
    }
  }

  function handleKeyDown(event) {
    const handledCodes = [
      "ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "Escape", "KeyR", "KeyM",
    ];
    if (handledCodes.includes(event.code)) event.preventDefault();
    if (event.repeat && ["Escape", "KeyR", "KeyM"].includes(event.code)) return;

    if (["Space", "ArrowUp", "KeyW"].includes(event.code) && !input.held.has(event.code)) {
      input.jumpPressed = true;
    }
    input.held.add(event.code);

    if (event.code === "Escape" && ["playing", "paused"].includes(state)) pauseGame();
    if (event.code === "KeyR" && state !== "title") startRun();
    if (event.code === "KeyM") toggleMute();
    if ((event.code === "Space" || event.code === "Enter") && state === "title") startRun();
  }

  function handleKeyUp(event) {
    input.held.delete(event.code);
    if (["Space", "ArrowUp", "KeyW"].includes(event.code) && player.vy < -260) {
      player.vy *= 0.54;
    }
  }

  function clearInputAndPause() {
    input.held.clear();
    input.jumpPressed = false;
    if (state === "playing") setState("paused");
  }

  document.getElementById("start-button").addEventListener("click", startRun);
  document.getElementById("resume-button").addEventListener("click", pauseGame);
  document.getElementById("restart-button").addEventListener("click", startRun);
  document.getElementById("title-button").addEventListener("click", goToTitle);
  document.getElementById("play-again-button").addEventListener("click", startRun);
  document.getElementById("complete-title-button").addEventListener("click", goToTitle);
  ui.mute.addEventListener("click", toggleMute);
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp, { passive: false });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("blur", clearInputAndPause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInputAndPause();
  });

  window.HamsterSeedAdventure = Object.freeze({
    start: startRun,
    restart: startRun,
    pause: pauseGame,
    setMuted(muted) {
      audio.init();
      audio.setMuted(Boolean(muted));
      records.muted = audio.muted;
      saveRecords();
      updateHud();
    },
    getState() {
      return {
        state,
        seeds: seedCount(),
        secrets: secretCount(),
        time: elapsed,
        hearts: player.hearts,
        fluffy: player.fluffy,
        x: player.x,
        y: player.y,
      };
    },
    getWorldSummary() {
      return {
        platforms: level.platforms.length,
        hazards: level.hazards.length,
        enemies: level.enemies.length,
        totalSeeds: level.seeds.length,
        totalSecrets: level.secrets.length,
        hasCheckpoint: Boolean(level.checkpoint),
        hasGoal: Boolean(level.goal),
      };
    },
  });

  resizeCanvas();
  resetRun();
  setState("title");
  updateHud();
  requestAnimationFrame(frameLoop);
})();
