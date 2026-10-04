let currentExp = 50;
let currentGold = 100;
let completedTasks = 0;
const totalTasks = 3;

function toggleTask(element, expReward, goldReward) {
  const isCompleted = element.classList.toggle('completed');

  if (isCompleted) {
    currentExp += expReward;
    currentGold += goldReward;
    completedTasks++;
  } else {
    currentExp -= expReward;
    currentGold -= goldReward;
    completedTasks--;
  }

  // 更新經驗值與金幣
  document.getElementById('current-exp').textContent = currentExp;
  document.getElementById('player-gold').textContent = currentGold;
  
  const expPercent = Math.min((currentExp / 100) * 100, 100);
  document.getElementById('exp-bar').style.width = expPercent + '%';

  // 更新完成率
  const ratePercent = Math.round((completedTasks / totalTasks) * 100);
  document.getElementById('rate-text').textContent = ratePercent + '%';
  document.getElementById('rate-bar').style.width = ratePercent + '%';
}
