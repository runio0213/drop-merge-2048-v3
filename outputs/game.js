const SAVE_KEY = "math-symbol-game-save-v1";
const ZERO_LOG = Number.NEGATIVE_INFINITY;
const MAX_LOG = 1e300;
const TICK_SECONDS = 0.1;

const UPGRADES = [
  { id: "plus1", symbol: "+", label: "+1", amount: 1, cost: 10, tone: "teal", diminish: 0.985 },
  { id: "plus20", symbol: "Σ", label: "+20", amount: 20, cost: 220, tone: "amber", diminish: 0.965 },
  { id: "plus500", symbol: "∫", label: "+500", amount: 500, cost: 5200, tone: "rose", diminish: 0.945 },
];

const PRESTIGE_SCALES = [
  {
    id: "r1",
    title: "환생 1",
    startLog: 4,
    divisor: 4,
    power: 1.08,
    rate: 2.2,
    softcap: 45,
    softness: 0.72,
    effect: "1점마다 ×1.1",
    reset: "업그레이드",
  },
  {
    id: "r2",
    title: "환생 2",
    startLog: 10,
    divisor: 8,
    power: 1.02,
    rate: 1.35,
    softcap: 32,
    softness: 0.8,
    effect: "초당 +50%",
    reset: "업그레이드, 환생 1",
  },
  {
    id: "r3",
    title: "환생 3",
    startLog: 20,
    divisor: 14,
    power: 0.96,
    rate: 1.05,
    softcap: 24,
    softness: 0.86,
    effect: "전체 증가량 ^1.05",
    reset: "업그레이드, 환생 1-2",
  },
  {
    id: "r4",
    title: "환생 4",
    startLog: 40,
    divisor: 24,
    power: 0.92,
    rate: 0.82,
    softcap: 18,
    softness: 0.92,
    effect: "(log10 숫자 + 1)!",
    reset: "업그레이드, 환생 1-3",
  },
  {
    id: "r5",
    title: "환생 5",
    startLog: 80,
    divisor: 42,
    power: 0.88,
    rate: 0.62,
    softcap: 14,
    softness: 0.98,
    effect: "(log-log 숫자 + 1) ↑↑",
    reset: "업그레이드, 환생 1-4",
  },
];

const HYPER_NAMES = [
  "펜테이션",
  "헥세이션",
  "헵테이션",
  "옥테이션",
  "노네이션",
  "데케이션",
  "언데케이션",
  "도데케이션",
  "트리데케이션",
  "테트라데케이션",
  "펜타데케이션",
  "헥사데케이션",
  "헵타데케이션",
  "옥타데케이션",
];

const ACHIEVEMENTS = [
  { id: "n1k", label: "첫 수열", text: "총 획득 e3", bonus: 1.05, test: () => state.totalEarnedLog >= 3 },
  { id: "n1m", label: "지수 표기", text: "현재 숫자 e6", bonus: 1.08, test: () => state.numberLog >= 6 },
  { id: "up100", label: "업그레이드 합성", text: "업그레이드 e2개", bonus: 1.08, test: () => totalUpgradeLog() >= 2 },
  { id: "r1", label: "첫 환생", text: "환생 1 보유", bonus: 1.12, test: () => state.prestige[0] > 0 },
  { id: "r3", label: "제곱 도약", text: "환생 3 보유", bonus: 1.16, test: () => state.prestige[2] > 0 },
  { id: "r5", label: "테트레이션 문", text: "환생 5 보유", bonus: 1.22, test: () => state.prestige[4] > 0 },
  { id: "hyper1", label: "v2 개방", text: "펜테이션 보유", bonus: 1.28, test: () => state.hyper[0] > 0 },
  { id: "auto", label: "최적화 루틴", text: "자동 최적 활성", bonus: 1.06, test: () => state.autoBest },
];

let state = loadState();
catchUpOffline();
let accumulator = 0;
let autoBuyTimer = 0;
let renderTimer = 0;
let saveTimer = 0;
let lastFrame = performance.now();
let canvasParticles = [];

const els = {
  numberDisplay: document.getElementById("numberDisplay"),
  tickRate: document.getElementById("tickRate"),
  perSecond: document.getElementById("perSecond"),
  totalEarned: document.getElementById("totalEarned"),
  runTime: document.getElementById("runTime"),
  formulaLine: document.getElementById("formulaLine"),
  upgradeList: document.getElementById("upgradeList"),
  prestigeList: document.getElementById("prestigeList"),
  hyperList: document.getElementById("hyperList"),
  autoBest: document.getElementById("autoBest"),
  saveState: document.getElementById("saveState"),
  proofBonus: document.getElementById("proofBonus"),
  scaleReadout: document.getElementById("scaleReadout"),
  upgradeCount: document.getElementById("upgradeCount"),
  bestEfficiency: document.getElementById("bestEfficiency"),
  achievementList: document.getElementById("achievementList"),
  proofCount: document.getElementById("proofCount"),
  upgradeSummary: document.getElementById("upgradeSummary"),
};

function defaultState() {
  return {
    numberLog: ZERO_LOG,
    totalEarnedLog: ZERO_LOG,
    upgrades: Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, ZERO_LOG])),
    prestige: Array(PRESTIGE_SCALES.length).fill(0),
    hyper: Array(8).fill(0),
    visibleHyper: 8,
    runSeconds: 0,
    totalSeconds: 0,
    tickCount: 0,
    autoBest: false,
    achievements: {},
    lastSeen: Date.now(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const next = { ...defaultState(), ...parsed };
    next.upgrades = { ...defaultState().upgrades, ...(parsed.upgrades || {}) };
    next.prestige = PRESTIGE_SCALES.map((_, index) => Number(parsed.prestige?.[index] || 0));
    next.hyper = Array.from({ length: Math.max(8, parsed.hyper?.length || 0) }, (_, index) =>
      Number(parsed.hyper?.[index] || 0)
    );
    next.visibleHyper = Math.max(8, Number(parsed.visibleHyper || 8));
    next.achievements = parsed.achievements || {};
    next.numberLog = normalizeLog(next.numberLog);
    next.totalEarnedLog = normalizeLog(next.totalEarnedLog);
    return next;
  } catch {
    return defaultState();
  }
}

function saveState(manual = false) {
  state.lastSeen = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (manual) {
    els.saveState.textContent = "방금 저장";
    setTimeout(() => (els.saveState.textContent = "저장됨"), 1100);
  }
}

function catchUpOffline() {
  const elapsed = Math.max(0, Math.min(14400, (Date.now() - Number(state.lastSeen || Date.now())) / 1000));
  if (elapsed < 2) return;
  const ticks = Math.floor(elapsed / TICK_SECONDS);
  addNumberLog(logMul(currentGainLog(), toLog(ticks)));
  state.runSeconds += elapsed;
  state.totalSeconds += elapsed;
  state.tickCount += ticks;
}

function toLog(value) {
  if (!Number.isFinite(value) || value <= 0) return ZERO_LOG;
  return Math.log10(value);
}

function normalizeLog(value) {
  const numeric = Number(value);
  if (numeric === ZERO_LOG || !Number.isFinite(numeric)) return ZERO_LOG;
  return clampLog(numeric);
}

function clampLog(value) {
  if (value === ZERO_LOG) return ZERO_LOG;
  if (!Number.isFinite(value)) return MAX_LOG;
  return Math.max(ZERO_LOG, Math.min(MAX_LOG, value));
}

function logAdd(a, b) {
  if (a === ZERO_LOG) return b;
  if (b === ZERO_LOG) return a;
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  if (high - low > 14) return high;
  return clampLog(high + Math.log10(1 + 10 ** (low - high)));
}

function logSub(a, b) {
  if (a === ZERO_LOG || b === ZERO_LOG) return a;
  if (b >= a) return ZERO_LOG;
  if (a - b > 14) return a;
  return clampLog(a + Math.log10(1 - 10 ** (b - a)));
}

function logMul(a, b) {
  if (a === ZERO_LOG || b === ZERO_LOG) return ZERO_LOG;
  return clampLog(a + b);
}

function formatLog(logValue, digits = 3) {
  if (logValue === ZERO_LOG || logValue < -12) return "0";
  const exponent = Math.floor(logValue);
  const mantissa = 10 ** (logValue - exponent);
  return `${mantissa.toFixed(digits)}e${formatExponent(exponent)}`;
}

function formatExponent(exponent) {
  if (!Number.isFinite(exponent)) return "∞";
  if (Math.abs(exponent) < 1_000_000) return String(Math.floor(exponent));
  const expLog = Math.log10(Math.abs(exponent));
  const expPower = Math.floor(expLog);
  const expMantissa = 10 ** (expLog - expPower);
  return `${expMantissa.toFixed(2)}e${expPower}`;
}

function formatCount(value) {
  if (!Number.isFinite(value)) return "∞";
  if (value < 100000) return Math.floor(value).toLocaleString("ko-KR");
  return formatLog(toLog(value));
}

function formatSeconds(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${Math.floor(seconds % 60)}초`;
  return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
}

function upgradeCountLog(upgrade) {
  return normalizeLog(state.upgrades[upgrade.id]);
}

function effectiveUpgradeCountLog(upgrade, countLog = upgradeCountLog(upgrade)) {
  if (countLog === ZERO_LOG) return ZERO_LOG;
  if (countLog <= 2) return countLog;
  return 2 + (countLog - 2) * upgrade.diminish;
}

function effectiveUpgradeCount(upgrade, rawCount) {
  if (rawCount <= 0) return 0;
  if (rawCount <= 100) return rawCount;
  return 100 * (rawCount / 100) ** upgrade.diminish;
}

function totalUpgradeLog() {
  return UPGRADES.reduce((sum, upgrade) => logAdd(sum, upgradeCountLog(upgrade)), ZERO_LOG);
}

function flatGainLog() {
  let gain = toLog(1);
  for (const upgrade of UPGRADES) {
    const countLog = effectiveUpgradeCountLog(upgrade);
    if (countLog !== ZERO_LOG) {
      gain = logAdd(gain, countLog + toLog(upgrade.amount));
    }
  }
  return clampLog(gain);
}

function achievementBonusLog() {
  return ACHIEVEMENTS.reduce((bonus, achievement) => {
    if (!state.achievements[achievement.id]) return bonus;
    return bonus + toLog(achievement.bonus);
  }, 0);
}

function factorialLog10(n) {
  if (n <= 1) return 0;
  if (n < 30) {
    let total = 0;
    for (let i = 2; i <= n; i += 1) total += Math.log10(i);
    return total;
  }
  return n * Math.log10(n / Math.E) + Math.log10(2 * Math.PI * n) / 2;
}

function tetrationLog10(base, height) {
  let result = Math.log10(Math.max(1.0001, base));
  for (let i = 1; i < height; i += 1) {
    const exponent = Math.min(8, result);
    result = 10 ** exponent * Math.log10(base);
    if (result > 1e12) return 1e12;
  }
  return Math.max(0, result);
}

function hyperLayer(index) {
  const opRank = index + 5;
  return {
    index,
    title: `환생 ${index + 1}-v${index + 1}`,
    name: HYPER_NAMES[index] || `${opRank}단 초연산`,
    opRank,
    thresholdLog: 150 * 2.05 ** index,
    divisor: 70 * 1.42 ** index,
    power: 0.82 + index * 0.035,
    softcap: Math.max(4, 10 - index * 0.35),
  };
}

function hyperSymbol(index) {
  const arrows = index + 3;
  if (arrows <= 8) return "↑".repeat(arrows);
  return `↑^${arrows}`;
}

function currentGainLog() {
  let gain = flatGainLog();
  const p1 = state.prestige[0];
  const p2 = state.prestige[1];
  const p3 = state.prestige[2];
  const p4 = state.prestige[3];
  const p5 = state.prestige[4];

  gain += p1 * toLog(1.1);

  if (p2 > 0) {
    gain += toLog(1 + 0.5 * p2 * Math.max(1, state.runSeconds));
  }

  const currentLogScale = Math.max(1, state.numberLog === ZERO_LOG ? 1 : state.numberLog);

  if (p4 > 0) {
    const n = Math.max(2, Math.min(200000, Math.floor(currentLogScale + 1)));
    gain += factorialLog10(n) * Math.log1p(p4) * 0.035;
  }

  if (p5 > 0) {
    const logLogScale = Math.max(1.05, Math.log10(Math.max(10, currentLogScale)) + 1);
    const height = Math.min(5, 2 + Math.floor(Math.sqrt(p5)));
    gain += tetrationLog10(logLogScale, height) * Math.log1p(p5) * 0.16;
  }

  for (let i = 0; i < state.hyper.length; i += 1) {
    const count = Number(state.hyper[i] || 0);
    if (count <= 0) continue;
    const layer = hyperLayer(i);
    const scale = Math.max(1.1, Math.log10(Math.max(10, currentLogScale)) + 1);
    const rankWeight = 0.42 + layer.opRank * 0.045;
    gain += scale ** (1 + i * 0.14) * Math.log1p(count) * rankWeight;
  }

  gain += achievementBonusLog();

  if (p3 > 0) {
    const exponent = Math.min(28, 1.05 ** Math.min(250, p3));
    gain *= exponent;
  }

  return clampLog(gain);
}

function addNumberLog(amountLog) {
  if (amountLog === ZERO_LOG) return;
  state.numberLog = logAdd(state.numberLog, amountLog);
  state.totalEarnedLog = logAdd(state.totalEarnedLog, amountLog);
}

function bestAffordableUpgrade() {
  const affordable = UPGRADES.filter((upgrade) => state.numberLog >= toLog(upgrade.cost));
  if (!affordable.length) return null;
  return affordable.slice().sort((a, b) => upgradeEfficiencyLog(b) - upgradeEfficiencyLog(a))[0];
}

function upgradeEfficiencyLog(upgrade) {
  const countLog = upgradeCountLog(upgrade);
  let marginalLog;
  if (countLog === ZERO_LOG) {
    marginalLog = toLog(upgrade.amount);
  } else if (countLog < 7) {
    const raw = 10 ** countLog;
    const delta = effectiveUpgradeCount(upgrade, raw + 1) - effectiveUpgradeCount(upgrade, raw);
    marginalLog = toLog(Math.max(1e-12, upgrade.amount * delta));
  } else {
    marginalLog = toLog(upgrade.amount * upgrade.diminish) + (upgrade.diminish - 1) * countLog;
  }
  return marginalLog - toLog(upgrade.cost);
}

function buyUpgrade(id, mode = "one") {
  const upgrade = UPGRADES.find((item) => item.id === id);
  if (!upgrade || state.numberLog < toLog(upgrade.cost)) return false;

  if (mode === "max") {
    const countLog = state.numberLog - toLog(upgrade.cost);
    if (state.numberLog < 12) {
      const cash = Math.floor(10 ** state.numberLog);
      const buys = Math.floor(cash / upgrade.cost);
      if (buys < 1) return false;
      const remain = cash - buys * upgrade.cost;
      state.upgrades[upgrade.id] = logAdd(upgradeCountLog(upgrade), toLog(buys));
      state.numberLog = toLog(remain);
    } else {
      state.upgrades[upgrade.id] = logAdd(upgradeCountLog(upgrade), countLog);
      state.numberLog = ZERO_LOG;
    }
    return true;
  }

  state.upgrades[upgrade.id] = logAdd(upgradeCountLog(upgrade), toLog(1));
  state.numberLog = logSub(state.numberLog, toLog(upgrade.cost));
  return true;
}

function buyBest() {
  const upgrade = bestAffordableUpgrade();
  if (!upgrade) return false;
  return buyUpgrade(upgrade.id, "max");
}

function scaledReward(scale, owned) {
  if (state.numberLog < scale.startLog) return 0;
  const measured = Math.max(0, (state.numberLog - scale.startLog) / scale.divisor + 1);
  const raw = (measured ** scale.power - 1) * scale.rate;
  const diminished = raw / ((1 + owned / scale.softcap) ** scale.softness);
  return Math.max(0, Math.floor(diminished));
}

function prestigeReward(index) {
  return scaledReward(PRESTIGE_SCALES[index], state.prestige[index]);
}

function doPrestige(index) {
  const reward = prestigeReward(index);
  if (reward < 1) return false;
  state.prestige[index] += reward;
  resetForLayer(index + 1);
  saveState();
  return true;
}

function resetForLayer(layer) {
  state.numberLog = ZERO_LOG;
  state.upgrades = Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, ZERO_LOG]));
  state.runSeconds = 0;
  for (let i = 0; i < layer - 1; i += 1) {
    state.prestige[i] = 0;
  }
}

function hyperReward(index) {
  const layer = hyperLayer(index);
  if (state.numberLog < layer.thresholdLog) return 0;
  const measured = Math.max(0, (state.numberLog - layer.thresholdLog) / layer.divisor + 1);
  const owned = Number(state.hyper[index] || 0);
  const raw = measured ** layer.power - 1;
  const diminished = raw / ((1 + owned / layer.softcap) ** 0.95);
  return Math.max(0, Math.floor(diminished));
}

function doHyper(index) {
  ensureHyperLength(index + 1);
  const reward = hyperReward(index);
  if (reward < 1) return false;
  state.hyper[index] += reward;
  state.numberLog = ZERO_LOG;
  state.upgrades = Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, ZERO_LOG]));
  state.prestige = state.prestige.map(() => 0);
  state.runSeconds = 0;
  for (let i = 0; i < index; i += 1) {
    state.hyper[i] = 0;
  }
  saveState();
  return true;
}

function ensureHyperLength(length) {
  while (state.hyper.length < length) state.hyper.push(0);
}

function updateAchievements() {
  for (const achievement of ACHIEVEMENTS) {
    if (!state.achievements[achievement.id] && achievement.test()) {
      state.achievements[achievement.id] = true;
    }
  }
}

function hardReset() {
  if (!window.confirm("수학기호 게임 저장 데이터를 초기화할까요?")) return;
  state = defaultState();
  localStorage.removeItem(SAVE_KEY);
  render();
}

function buildFormula() {
  const p = state.prestige;
  const parts = ["기본 1"];
  const totalUpgrades = totalUpgradeLog();
  if (totalUpgrades !== ZERO_LOG) parts.push(`업그레이드 ${formatLog(totalUpgrades)}`);
  if (p[0] > 0) parts.push(`×1.1^${formatCount(p[0])}`);
  if (p[1] > 0) parts.push(`×(1+0.5·t·${formatCount(p[1])})`);
  if (p[2] > 0) parts.push(`^${Math.min(28, 1.05 ** Math.min(250, p[2])).toFixed(2)}`);
  if (p[3] > 0) parts.push(`×(log10(n)+1)!`);
  if (p[4] > 0) parts.push(`×(loglog(n)+1)↑↑`);
  const hyperOwned = state.hyper.some((count) => count > 0);
  if (hyperOwned) parts.push("× 환생v2 초연산");
  return parts.join("  ");
}

function render() {
  updateAchievements();
  const gainLog = currentGainLog();
  const perSecondLog = gainLog + toLog(10);
  const best = bestAffordableUpgrade() || UPGRADES.slice().sort((a, b) => upgradeEfficiencyLog(b) - upgradeEfficiencyLog(a))[0];

  els.numberDisplay.textContent = formatLog(state.numberLog);
  els.tickRate.textContent = `0.1초당 ${formatLog(gainLog)}`;
  els.perSecond.textContent = formatLog(perSecondLog);
  els.totalEarned.textContent = formatLog(state.totalEarnedLog);
  els.runTime.textContent = formatSeconds(state.runSeconds);
  els.formulaLine.textContent = buildFormula();
  els.autoBest.checked = state.autoBest;
  els.proofBonus.textContent = `×${(10 ** achievementBonusLog()).toFixed(2)}`;
  els.scaleReadout.textContent = state.numberLog === ZERO_LOG ? "e0" : `e${formatExponent(Math.max(0, state.numberLog))}`;
  els.upgradeCount.textContent = formatLog(totalUpgradeLog());
  els.bestEfficiency.textContent = best.label;
  els.upgradeSummary.textContent = `비용 고정 · log 보상 · 최적 ${best.label}`;

  renderUpgrades();
  renderPrestige();
  renderHyper();
  renderAchievements();
}

function renderUpgrades() {
  els.upgradeList.innerHTML = UPGRADES.map((upgrade) => {
    const owned = upgradeCountLog(upgrade);
    const affordable = state.numberLog >= toLog(upgrade.cost);
    return `
      <article class="upgrade-card">
        <div class="symbol-tile ${upgrade.tone}">${upgrade.symbol}</div>
        <div>
          <div class="card-title">
            <strong>${upgrade.label} 업그레이드</strong>
            <span class="mini-stat">효율 ${formatLog(upgradeEfficiencyLog(upgrade))}</span>
          </div>
          <div class="upgrade-stats">
            <span>보유<strong>${formatLog(owned)}</strong></span>
            <span>비용<strong>${formatLog(toLog(upgrade.cost))}</strong></span>
            <span>실효<strong>${formatLog(effectiveUpgradeCountLog(upgrade))}</strong></span>
          </div>
          <div class="button-row">
            <button class="upgrade-button" type="button" data-buy="${upgrade.id}" ${affordable ? "" : "disabled"}>×1</button>
            <button class="upgrade-button max" type="button" data-buy-max="${upgrade.id}" ${affordable ? "" : "disabled"}>MAX</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderPrestige() {
  els.prestigeList.innerHTML = PRESTIGE_SCALES.map((scale, index) => {
    const reward = prestigeReward(index);
    const owned = state.prestige[index];
    return `
      <article class="prestige-card">
        <div class="card-title">
          <strong>${scale.title}</strong>
          <span class="mini-stat">보유 ${formatCount(owned)}</span>
        </div>
        <div class="prestige-effect">${scale.effect}<br>초기화: ${scale.reset}</div>
        <div class="prestige-stats">
          <span>시작<strong>${formatLog(scale.startLog)}</strong></span>
          <span>스케일<strong>${scale.divisor}</strong></span>
          <span>보상<strong>+${formatCount(reward)}</strong></span>
        </div>
        <button class="prestige-button" type="button" data-prestige="${index}" ${reward > 0 ? "" : "disabled"}>환생</button>
      </article>
    `;
  }).join("");
}

function renderHyper() {
  ensureHyperLength(state.visibleHyper);
  const cards = [];
  for (let index = 0; index < state.visibleHyper; index += 1) {
    const layer = hyperLayer(index);
    const reward = hyperReward(index);
    const owned = state.hyper[index] || 0;
    cards.push(`
      <article class="hyper-card">
        <div class="hyper-symbol">
          <span>${hyperSymbol(index)}</span>
          <span>${layer.title}</span>
        </div>
        <div>
          <strong>${layer.name}</strong>
          <div class="hyper-effect">현재 숫자 log 스케일로 +${formatCount(reward)} · 이전 v단계 초기화</div>
        </div>
        <div class="prestige-stats">
          <span>보유<strong>${formatCount(owned)}</strong></span>
          <span>시작<strong>${formatLog(layer.thresholdLog)}</strong></span>
          <span>연산급<strong>${layer.opRank}</strong></span>
        </div>
        <button class="prestige-button" type="button" data-hyper="${index}" ${reward > 0 ? "" : "disabled"}>환생v2</button>
      </article>
    `);
  }
  els.hyperList.innerHTML = cards.join("");
}

function renderAchievements() {
  const unlocked = ACHIEVEMENTS.filter((achievement) => state.achievements[achievement.id]).length;
  els.proofCount.textContent = `${unlocked}/${ACHIEVEMENTS.length}`;
  els.achievementList.innerHTML = ACHIEVEMENTS.map((achievement) => `
    <div class="achievement-item ${state.achievements[achievement.id] ? "unlocked" : ""}">
      <strong>${achievement.label}</strong>
      <span>${achievement.text} · ×${achievement.bonus.toFixed(2)}</span>
    </div>
  `).join("");
}

function step(deltaSeconds) {
  const safeDelta = Math.min(0.5, Math.max(0, deltaSeconds));
  accumulator += safeDelta;
  autoBuyTimer += safeDelta;
  renderTimer += safeDelta;
  saveTimer += safeDelta;
  state.runSeconds += safeDelta;
  state.totalSeconds += safeDelta;

  if (state.autoBest && autoBuyTimer >= 0.45) {
    buyBest();
    autoBuyTimer = 0;
  }

  if (accumulator >= TICK_SECONDS) {
    const ticks = Math.floor(accumulator / TICK_SECONDS);
    accumulator -= ticks * TICK_SECONDS;
    state.tickCount += ticks;
    addNumberLog(currentGainLog() + toLog(ticks));
  }

  if (renderTimer >= 0.18) {
    render();
    renderTimer = 0;
  }

  if (saveTimer >= 4) {
    saveState();
    saveTimer = 0;
  }
}

function loop(now) {
  step((now - lastFrame) / 1000);
  lastFrame = now;
  drawSymbols(now);
  requestAnimationFrame(loop);
}

function setupEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "manualTick") addNumberLog(currentGainLog());
    if (action === "buyBest") buyBest();
    if (action === "save") saveState(true);
    if (action === "hardReset") hardReset();
    if (action === "showMoreHyper") {
      state.visibleHyper += 3;
      ensureHyperLength(state.visibleHyper);
    }
    if (target.dataset.buy) buyUpgrade(target.dataset.buy, "one");
    if (target.dataset.buyMax) buyUpgrade(target.dataset.buyMax, "max");
    if (target.dataset.prestige) doPrestige(Number(target.dataset.prestige));
    if (target.dataset.hyper) doHyper(Number(target.dataset.hyper));
    render();
  });

  els.autoBest.addEventListener("change", () => {
    state.autoBest = els.autoBest.checked;
    render();
  });

  window.addEventListener("beforeunload", () => saveState());
}

function setupCanvas() {
  const canvas = document.getElementById("symbolCanvas");
  const context = canvas.getContext("2d");
  const symbols = ["+", "×", "÷", "log", "√", "π", "e", "!", "∑", "↑", "∞", "≠", "≈"];
  canvasParticles = Array.from({ length: 42 }, () => ({
    text: symbols[Math.floor(Math.random() * symbols.length)],
    x: Math.random(),
    y: Math.random(),
    size: 14 + Math.random() * 34,
    speed: 0.02 + Math.random() * 0.045,
    alpha: 0.16 + Math.random() * 0.34,
  }));
  canvas._context = context;
}

function drawSymbols(now) {
  const canvas = document.getElementById("symbolCanvas");
  const context = canvas._context;
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  if (canvas.width !== Math.floor(rect.width * scale) || canvas.height !== Math.floor(rect.height * scale)) {
    canvas.width = Math.floor(rect.width * scale);
    canvas.height = Math.floor(rect.height * scale);
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(scale, scale);
  for (const particle of canvasParticles) {
    const x = ((particle.x + now * 0.00002 * particle.speed) % 1) * rect.width;
    const wave = Math.sin(now * 0.001 * particle.speed + particle.x * 10) * 12;
    const y = particle.y * rect.height + wave;
    context.globalAlpha = particle.alpha;
    context.fillStyle = particle.text === "!" || particle.text === "↑" ? "#fbbf24" : "#ffffff";
    context.font = `700 ${particle.size}px "Cascadia Mono", Consolas, monospace`;
    context.fillText(particle.text, x, y);
  }
  context.restore();
}

setupCanvas();
setupEvents();
render();
requestAnimationFrame(loop);
