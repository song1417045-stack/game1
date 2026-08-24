(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.HamsterLogic = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function shouldJump(jumpBufferSeconds, coyoteSeconds) {
    return jumpBufferSeconds > 0 && coyoteSeconds > 0;
  }

  function canReachPlatform(startSurfaceY, targetSurfaceY, jumpVelocity, gravity, safetyMargin = 0) {
    const maximumRise = (jumpVelocity * jumpVelocity) / (2 * gravity);
    const requiredRise = Math.max(0, startSurfaceY - targetSurfaceY) + safetyMargin;
    return requiredRise <= maximumRise;
  }

  function isStomp(player, enemy, previousBottom) {
    return player.vy > 100 && previousBottom <= enemy.y + Math.min(18, enemy.h * 0.35);
  }

  function applyDamage(status) {
    if (status.fluffy) {
      return { hearts: status.hearts, fluffy: false, absorbed: true };
    }
    return {
      hearts: Math.max(0, status.hearts - 1),
      fluffy: false,
      absorbed: false,
    };
  }

  function enemyHitsObstacle(enemy, nextX, platforms) {
    const nextBounds = { x: nextX, y: enemy.y, w: enemy.w, h: enemy.h };
    return platforms.some((platform) => {
      if (platform.broken || platform.style === "ground") return false;
      const blocksBody = platform.y < enemy.y + enemy.h - 8 && platform.y + platform.h > enemy.y + 8;
      return blocksBody && rectsOverlap(nextBounds, platform);
    });
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function nextBest(previous, run) {
    const previousSeeds = Number(previous.bestSeeds) || 0;
    const previousTime = Number(previous.bestTime) || 0;
    return {
      bestSeeds: Math.max(previousSeeds, run.seeds),
      bestTime: previousTime > 0 ? Math.min(previousTime, run.time) : run.time,
    };
  }

  return Object.freeze({
    clamp,
    lerp,
    rectsOverlap,
    shouldJump,
    canReachPlatform,
    isStomp,
    applyDamage,
    enemyHitsObstacle,
    formatTime,
    nextBest,
  });
});
