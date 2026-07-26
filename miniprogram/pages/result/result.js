// pages/result/result.js
Page({
  data: {
    result: null,
    userText: '',
    showText: true,
    formattedTime: '',
  },

  onLoad() {
    const result = wx.getStorageSync('currentResult');
    const userText = wx.getStorageSync('currentText');

    if (result) {
      const formattedTime = this.formatTimestamp(result.timestamp || new Date().toISOString());
      this.setData({ result, userText, formattedTime });
    } else {
      wx.navigateBack();
    }
  },

  formatTimestamp(iso) {
    const d = new Date(iso);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  // 切换显示文字
  toggleShowText() {
    this.setData({ showText: !this.data.showText });
  },

  // 保存卡片到相册
  saveCard() {
    const { result } = this.data;
    if (!result || !result.imageUrl) {
      wx.showToast({ title: '没有可保存的图片', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    // 下载图片
    wx.downloadFile({
      url: result.imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '已保存到相册', icon: 'success' });
            },
            fail: (err) => {
              wx.hideLoading();
              if (err.errMsg.includes('auth')) {
                wx.showModal({
                  title: '需要相册权限',
                  content: '请在设置中允许保存图片到相册',
                  confirmText: '去设置',
                  success: (res) => {
                    if (res.confirm) wx.openSetting();
                  },
                });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            },
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      },
    });
  },

  // 分享
  shareCard() {
    // 使用微信原生分享
    wx.showToast({ title: '点击右上角分享', icon: 'none' });
  },

  // 再来一次
  generateAgain() {
    wx.navigateBack();
  },

  // 分享给朋友（转发）
  onShareAppMessage() {
    const { result, userText } = this.data;
    return {
      title: `我的记忆被凝固为「${result?.category || '未知'}」— 来冻结你的瞬间`,
      path: '/pages/index/index',
      imageUrl: result?.imageUrl || '',
    };
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: 'Momenta凝刻 — 冻结你的瞬间',
    };
  },
});
