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
global.fetch = async () => {
  throw new Error("offline smoke test");
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

test("weather integration has an offline-safe Seoul fallback", () => {
  const weather = window.HamsterSeedAdventure.getWeather();
  assert.equal(weather.location, "서울");
  assert.equal(weather.source, "fallback");
  assert.equal(typeof weather.rainChance, "number");
  assert.match(weather.sunrise, /^\d{2}:\d{2}$/);
});

test("live Seoul weather response reaches the public game state", async () => {
  await new Promise((resolve) => setImmediate(resolve));
  const offsetMs = 9 * 60 * 60 * 1000;
  const toSeoulApiTime = (milliseconds) => new Date(milliseconds + offsetMs).toISOString().slice(0, 16);
  const now = Date.now();
  const localDate = toSeoulApiTime(now).slice(0, 10);
  global.fetch = async () => ({
    ok: true,
    async json() {
      return {
        utc_offset_seconds: 32400,
        current: {
          temperature_2m: 27.9,
          precipitation: 0.1,
          rain: 0.1,
          snowfall: 0,
          weather_code: 51,
          cloud_cover: 39,
          is_day: 1,
          wind_speed_10m: 3.6,
          shortwave_radiation: 413,
        },
        hourly: {
          time: [0, 1, 2, 3, 4, 5, 6].map((hour) => toSeoulApiTime(now + hour * 60 * 60 * 1000)),
          precipitation_probability: [20, 35, 80, 45, 15, 10, 5],
          precipitation: [0.1, 0.2, 0.8, 0.1, 0, 0, 0],
        },
        daily: {
          sunrise: [`${localDate}T05:56`],
          sunset: [`${localDate}T19:12`],
          sunshine_duration: [12294],
          precipitation_sum: [1.7],
          precipitation_probability_max: [94],
        },
      };
    },
  });

  await window.HamsterSeedAdventure.refreshWeather();
  const weather = window.HamsterSeedAdventure.getWeather();
  assert.equal(weather.source, "live");
  assert.equal(weather.condition, "이슬비");
  assert.equal(weather.rainChance, 80);
  assert.equal(weather.shortwaveRadiation, 413);
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
