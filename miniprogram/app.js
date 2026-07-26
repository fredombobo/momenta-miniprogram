// app.js
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // TODO: 上线前替换为真实云环境 ID
        env: 'momenta-prod',
        traceUser: true,
      });
    }

    // 只记录是否首次访问，不在此写入 storage，
    // 避免首页入场动画永远不播放
    const visited = wx.getStorageSync('momenta-visited');
    this.globalData.isFirstVisit = !visited;
  },

  globalData: {
    isFirstVisit: true,
    userInfo: null,
    openid: null,
    freemium: {
      freeGenerationsPerDay: 2,
      premiumMonthlyPrice: 1990, // 分 (¥19.9)
      premiumYearlyPrice: 12800, // 分 (¥128)
      singleGenerationPrice: 390, // 分 (¥3.9)
    },
  },
});
