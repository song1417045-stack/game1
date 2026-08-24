"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Logic = require("../logic.js");

test("clamp keeps movement inside world boundaries", () => {
  assert.equal(Logic.clamp(-20, 0, 100), 0);
  assert.equal(Logic.clamp(52, 0, 100), 52);
  assert.equal(Logic.clamp(130, 0, 100), 100);
});

test("rectangles overlap only when their areas cross", () => {
  assert.equal(Logic.rectsOverlap({ x: 0, y: 0, w: 20, h: 20 }, { x: 15, y: 10, w: 20, h: 20 }), true);
  assert.equal(Logic.rectsOverlap({ x: 0, y: 0, w: 20, h: 20 }, { x: 20, y: 0, w: 20, h: 20 }), false);
});

test("jump buffer and coyote time must both remain active", () => {
  assert.equal(Logic.shouldJump(0.1, 0.08), true);
  assert.equal(Logic.shouldJump(0, 0.08), false);
  assert.equal(Logic.shouldJump(0.1, 0), false);
});

test("late thorn route keeps a generous jump-height safety margin", () => {
  assert.equal(Logic.canReachPlatform(600, 500, 760, 2050, 30), true);
  assert.equal(Logic.canReachPlatform(600, 465, 760, 2050, 30), false);
});

test("stomp requires downward movement and approach from above", () => {
  const enemy = { x: 100, y: 200, w: 80, h: 50 };
  assert.equal(Logic.isStomp({ vy: 420 }, enemy, 204), true);
  assert.equal(Logic.isStomp({ vy: -30 }, enemy, 204), false);
  assert.equal(Logic.isStomp({ vy: 420 }, enemy, 230), false);
});

test("fluffy form absorbs one hit without consuming a heart", () => {
  assert.deepEqual(Logic.applyDamage({ hearts: 3, fluffy: true }), {
    hearts: 3,
    fluffy: false,
    absorbed: true,
  });
});

test("normal damage consumes one heart and never goes below zero", () => {
  assert.deepEqual(Logic.applyDamage({ hearts: 3, fluffy: false }), {
    hearts: 2,
    fluffy: false,
    absorbed: false,
  });
  assert.equal(Logic.applyDamage({ hearts: 0, fluffy: false }).hearts, 0);
});

test("garden creatures turn around at tall planters but ignore the platform under their feet", () => {
  const snail = { x: 2142, y: 545, w: 88, h: 55 };
  const planter = { x: 1990, y: 470, w: 150, h: 130, style: "planter", broken: false };
  const ground = { x: 1510, y: 600, w: 1650, h: 150, style: "ground", broken: false };
  assert.equal(Logic.enemyHitsObstacle(snail, 2138, [ground, planter]), true);

  const beetle = { x: 4770, y: 444, w: 72, h: 58 };
  const leafUnderFeet = { x: 4700, y: 500, w: 180, h: 30, style: "leaf", broken: false };
  assert.equal(Logic.enemyHitsObstacle(beetle, 4768, [leafUnderFeet]), false);
});

test("time formatting and best-record updates are stable", () => {
  assert.equal(Logic.formatTime(0), "00:00");
  assert.equal(Logic.formatTime(65.9), "01:05");
  assert.deepEqual(
    Logic.nextBest({ bestSeeds: 25, bestTime: 82 }, { seeds: 30, time: 91 }),
    { bestSeeds: 30, bestTime: 82 },
  );
  assert.deepEqual(
    Logic.nextBest({ bestSeeds: 25, bestTime: 0 }, { seeds: 20, time: 91 }),
    { bestSeeds: 25, bestTime: 91 },
  );
});
