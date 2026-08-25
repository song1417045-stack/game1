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

  function weatherCodeInfo(code) {
    const numericCode = Number(code);
    if (numericCode === 0) return { key: "clear", label: "맑음", icon: "☀", precipitation: "none" };
    if ([1, 2].includes(numericCode)) return { key: "partly-cloudy", label: "구름 조금", icon: "🌤", precipitation: "none" };
    if (numericCode === 3) return { key: "cloudy", label: "흐림", icon: "☁", precipitation: "none" };
    if ([45, 48].includes(numericCode)) return { key: "fog", label: "안개", icon: "≋", precipitation: "none" };
    if ([51, 53, 55, 56, 57].includes(numericCode)) {
      return { key: "drizzle", label: "이슬비", icon: "☂", precipitation: "rain" };
    }
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(numericCode)) {
      return { key: "rain", label: "비", icon: "☂", precipitation: "rain" };
    }
    if ([71, 73, 75, 77, 85, 86].includes(numericCode)) {
      return { key: "snow", label: "눈", icon: "❄", precipitation: "snow" };
    }
    if ([95, 96, 99].includes(numericCode)) {
      return { key: "storm", label: "뇌우", icon: "ϟ", precipitation: "rain" };
    }
    return { key: "unknown", label: "날씨 확인 중", icon: "○", precipitation: "none" };
  }

  function solarPhase(nowMs, sunriseMs, sunsetMs) {
    const now = Number(nowMs);
    const sunrise = Number(sunriseMs);
    const sunset = Number(sunsetMs);
    if (![now, sunrise, sunset].every(Number.isFinite) || sunrise >= sunset) {
      return { phase: "day", daylight: 0.75, transition: 0 };
    }

    const transitionWindow = 45 * 60 * 1000;
    if (now < sunrise - transitionWindow || now > sunset + transitionWindow) {
      return { phase: "night", daylight: 0.08, transition: 0 };
    }
    if (now < sunrise + transitionWindow) {
      const progress = clamp((now - (sunrise - transitionWindow)) / (transitionWindow * 2), 0, 1);
      return { phase: "dawn", daylight: lerp(0.08, 0.82, progress), transition: Math.sin(progress * Math.PI) };
    }
    if (now > sunset - transitionWindow) {
      const progress = clamp((now - (sunset - transitionWindow)) / (transitionWindow * 2), 0, 1);
      return { phase: "dusk", daylight: lerp(0.82, 0.08, progress), transition: Math.sin(progress * Math.PI) };
    }
    return { phase: "day", daylight: 1, transition: 0 };
  }

  function nextHoursForecast(hourlyTimes, probabilities, precipitation, nowMs, hours = 6) {
    const start = Number(nowMs);
    const end = start + Math.max(1, Number(hours) || 6) * 60 * 60 * 1000;
    let maxProbability = 0;
    let precipitationSum = 0;
    let matched = 0;
    for (let index = 0; index < hourlyTimes.length; index += 1) {
      const time = Date.parse(hourlyTimes[index]);
      if (!Number.isFinite(time) || time < start - 60 * 60 * 1000 || time > end) continue;
      maxProbability = Math.max(maxProbability, Number(probabilities[index]) || 0);
      precipitationSum += Number(precipitation[index]) || 0;
      matched += 1;
    }
    return {
      maxProbability: Math.round(maxProbability),
      precipitationSum: Math.round(precipitationSum * 10) / 10,
      matched,
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
    weatherCodeInfo,
    solarPhase,
    nextHoursForecast,
  });
});
