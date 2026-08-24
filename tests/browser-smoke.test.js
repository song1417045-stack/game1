"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function createElement() {
  return {
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    addEventListener() {},
    setAttribute() {},
    focus() {},
    textContent: "",
  };
}

const elements = new Map();
const getElement = (id) => {
  if (!elements.has(id)) elements.set(id, createElement());
  return elements.get(id);
};

const canvas = getElement("game-canvas");
const gradient = { addColorStop() {} };
const drawingContext = new Proxy({}, {
  get(_target, property) {
    if (property === "createLinearGradient" || property === "createRadialGradient") return () => gradient;
    if (property === "measureText") return (text) => ({ width: String(text).length * 9 });
    return () => {};
  },
  set() { return true; },
});
canvas.getContext = () => drawingContext;

global.window = global;
global.HamsterLogic = require("../logic.js");
global.document = {
  hidden: false,
  getElementById: getElement,
  querySelector: () => createElement(),
  addEventListener() {},
};
global.Image = class {
  constructor() {
    this.complete = false;
    this.naturalWidth = 0;
  }
};
global.localStorage = {
  getItem() { return null; },
  setItem() {},
};
let animationFrameCallback = null;
const windowListeners = new Map();
global.requestAnimationFrame = (callback) => {
  animationFrameCallback = callback;
  return 1;
};
global.addEventListener = (type, callback) => windowListeners.set(type, callback);

require("../game.js");

test("game boots to the Korean title state without a build step", () => {
  assert.equal(window.HamsterSeedAdventure.getState().state, "title");
});

test("level contains every planned collectible and progression element", () => {
  const summary = window.HamsterSeedAdventure.getWorldSummary();
  assert.equal(summary.totalSeeds, 36);
  assert.equal(summary.totalSecrets, 3);
  assert.equal(summary.enemies, 6);
  assert.equal(summary.hasCheckpoint, true);
  assert.equal(summary.hasGoal, true);
});

test("start and pause transitions are callable from the page UI", () => {
  window.HamsterSeedAdventure.start();
  assert.equal(window.HamsterSeedAdventure.getState().state, "playing");
  window.HamsterSeedAdventure.pause();
  assert.equal(window.HamsterSeedAdventure.getState().state, "paused");
  window.HamsterSeedAdventure.pause();
  assert.equal(window.HamsterSeedAdventure.getState().state, "playing");
});

test("fixed-step loop responds to keyboard movement and jumping", () => {
  window.HamsterSeedAdventure.restart();
  let virtualTime = performance.now();
  const stepFrames = (count) => {
    for (let index = 0; index < count; index += 1) {
      virtualTime += 1000 / 60;
      animationFrameCallback(virtualTime);
    }
  };
  const keyboardEvent = (code) => ({ code, repeat: false, preventDefault() {} });

  windowListeners.get("keydown")(keyboardEvent("KeyD"));
  stepFrames(50);
  windowListeners.get("keyup")(keyboardEvent("KeyD"));
  const afterWalk = window.HamsterSeedAdventure.getState();
  assert.ok(afterWalk.x > 250, `expected hamster to move right, got x=${afterWalk.x}`);

  windowListeners.get("keydown")(keyboardEvent("Space"));
  stepFrames(8);
  const afterJump = window.HamsterSeedAdventure.getState();
  assert.ok(afterJump.y < afterWalk.y, `expected hamster to rise, got ${afterJump.y} from ${afterWalk.y}`);
  windowListeners.get("keyup")(keyboardEvent("Space"));
});
