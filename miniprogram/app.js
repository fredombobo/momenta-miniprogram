// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'momenta-prod', // 替换为你的云环境ID
        traceUser: true,
      });
    }

    // 检查首次访问
    const visited = wx.getStorageSync('momenta-visited');
    this.globalData.isFirstVisit = !visited;
    if (!visited) {
      wx.setStorageSync('momenta-visited', true);
    }
  },

  globalData: {
    isFirstVisit: true,
    userInfo: null,
    openid: null,
    // 免费增值配置
    freemium: {
      freeGenerationsPerDay: 2,
      premiumMonthlyPrice: 1990, // 分 (¥19.9)
      premiumYearlyPrice: 12800, // 分 (¥128)
      singleGenerationPrice: 390, // 分 (¥3.9)
    }
  },
});
