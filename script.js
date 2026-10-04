let currentLevel = 1;
let currentExp = 50;
let currentGold = 100;
let completedTasks = 0;

const totalTasks = 3;

// 每一級需要的 EXP
function getRequiredExp() {
  return 100 + (currentLevel - 1) * 50;
}

// 完成任務
function toggleTask(element, expReward, goldReward) {
  const isCompleted = element.classList.toggle('completed');

  if (isCompleted) {
    currentExp += expReward;
    currentGold += goldReward;
    completedTasks++;

    checkLevelUp();
  } else {
    currentExp -= expReward;
    currentGold -= goldReward;
    completedTasks--;

    // 防止 EXP 變成負數
    if (currentExp < 0) {
      currentExp = 0;
    }
  }

  updateUI();
}

// 檢查是否升級
function checkLevelUp() {
  let requiredExp = getRequiredExp();

  while (currentExp >= requiredExp) {
    currentExp -= requiredExp;
    currentLevel++;

    // 升級獎勵
    currentGold += 50;

    requiredExp = getRequiredExp();

    alert(
      `✨ LEVEL UP！\n\n` +
      `你已經升到 Lv.${currentLevel}！\n` +
      `獲得 +50 金幣！`
    );
  }
}

// 更新畫面
function updateUI() {
  const requiredExp = getRequiredExp();

  // 等級
  document.getElementById('player-level').textContent =
    `Lv.${currentLevel}`;

  // EXP
  document.getElementById('current-exp').textContent =
    currentExp;

  // 金幣
  document.getElementById('player-gold').textContent =
    currentGold;

  // EXP 進度條
  const expPercent = Math.min(
    (currentExp / requiredExp) * 100,
    100
  );

  document.getElementById('exp-bar').style.width =
    expPercent + '%';

  // 完成率
  const ratePercent = Math.round(
    (completedTasks / totalTasks) * 100
  );

  document.getElementById('rate-text').textContent =
    ratePercent + '%';

  document.getElementById('rate-bar').style.width =
    ratePercent + '%';
}
