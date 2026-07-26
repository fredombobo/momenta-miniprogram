// pages/result/result.js
Page({
  data: {
    result: null,
    userText: '',
    showText: true,
    formattedTime: '',
    statusBarHeight: 20,
    navBarHeight: 64,
    saving: false,
  },

  onLoad() {
    this.initSafeArea();

    const result = wx.getStorageSync('currentResult');
    const userText = wx.getStorageSync('currentText') || '';
    const showTextStored = wx.getStorageSync('currentShowText');
    const showText = showTextStored === '' || showTextStored === undefined
      ? true
      : !!showTextStored;

    if (result && !result.error) {
      const formattedTime = this.formatTimestamp(
        result.timestamp || new Date().toISOString()
      );
      this.setData({ result, userText, formattedTime, showText });
    } else {
      wx.showToast({ title: '暂无结果', icon: 'none' });
      setTimeout(() => wx.navigateBack({ fail: () => {
        wx.redirectTo({ url: '/pages/index/index' });
      }}), 500);
    }
  },

  initSafeArea() {
    try {
      const sys = wx.getSystemInfoSync();
      const statusBarHeight = sys.statusBarHeight || 20;
      this.setData({
        statusBarHeight,
        navBarHeight: statusBarHeight + 44,
      });
    } catch (e) {
      // ignore
    }
  },

  formatTimestamp(iso) {
    const d = new Date(iso);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/index/index' }),
    });
  },

  toggleShowText() {
    const showText = !this.data.showText;
    this.setData({ showText });
    wx.setStorageSync('currentShowText', showText);
  },

  /**
   * 合成完整记忆卡片（图 + 原文 + 品类 + 解读 + 时间 + 品牌）后保存相册
   */
  saveCard() {
    const { result, userText, showText, formattedTime, saving } = this.data;
    if (saving) return;

    if (!result || !result.imageUrl) {
      wx.showToast({ title: '没有可保存的图片', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '合成卡片中...' });

    // 下载原图后用离屏 canvas 合成
    wx.downloadFile({
      url: result.imageUrl,
      success: (dl) => {
        if (dl.statusCode !== 200) {
          this._saveFail('下载图片失败');
          return;
        }
        this._composeAndSave(dl.tempFilePath, {
          userText: showText ? userText : '',
          category: result.category || '记忆投射',
          interpretation: result.interpretation || '',
          emotionColor: result.emotionColor || '#C9A55C',
          formattedTime,
        });
      },
      fail: () => {
        // 域名未配置时降级：尝试直接保存（可能仍失败）
        this._saveImageFile(null, true);
      },
    });
  },

  _composeAndSave(imagePath, meta) {
    const width = 750;
    const imgH = 750;
    const bodyPad = 40;
    const categoryH = 56;
    const interpLines = this._wrapText(meta.interpretation, 28);
    const interpH = Math.min(interpLines.length, 6) * 42;
    const footerH = 80;
    const bodyH = bodyPad + categoryH + 16 + interpH + 24 + footerH;
    const height = imgH + bodyH;

    // 使用旧版 canvas 接口，兼容性更好
    const ctx = wx.createCanvasContext('cardCanvas', this);

    // 背景
    ctx.setFillStyle('#141414');
    ctx.fillRect(0, 0, width, height);

    // 主图
    ctx.drawImage(imagePath, 0, 0, width, imgH);

    // 底部渐变遮罩 + 用户文字
    const grd = ctx.createLinearGradient(0, imgH - 220, 0, imgH);
    grd.addColorStop(0, 'rgba(10,10,10,0)');
    grd.addColorStop(0.4, 'rgba(10,10,10,0.75)');
    grd.addColorStop(1, 'rgba(10,10,10,0.95)');
    ctx.setFillStyle(grd);
    ctx.fillRect(0, imgH - 220, width, 220);

    if (meta.userText) {
      ctx.setFillStyle('#E8E0D4');
      ctx.setFontSize(28);
      const lines = this._wrapText(`「${meta.userText}」`, 22);
      let ty = imgH - 120;
      lines.slice(0, 3).forEach((line, i) => {
        ctx.fillText(line, 40, ty + i * 36);
      });
    }

    ctx.setFillStyle('#9A918A');
    ctx.setFontSize(22);
    ctx.fillText(meta.formattedTime, 40, imgH - 36);

    // 卡片正文区
    let y = imgH + bodyPad;

    // 色点 + 品类
    ctx.setFillStyle(meta.emotionColor);
    ctx.beginPath();
    ctx.arc(52, y + 16, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.setFillStyle(meta.emotionColor);
    ctx.setFontSize(36);
    ctx.fillText(meta.category, 72, y + 28);
    y += categoryH + 8;

    // 解读
    ctx.setFillStyle('#9A918A');
    ctx.setFontSize(26);
    interpLines.slice(0, 6).forEach((line) => {
      ctx.fillText(line, 40, y);
      y += 42;
    });

    y += 12;
    // 分割线
    ctx.setStrokeStyle(meta.emotionColor + '55');
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(width - 40, y);
    ctx.stroke();
    y += 36;

    // 品牌
    ctx.setFillStyle('#5A534D');
    ctx.setFontSize(22);
    ctx.fillText('Momenta凝刻 — 每个瞬间都值得被冻结', 40, y);

    ctx.draw(false, () => {
      setTimeout(() => {
        wx.canvasToTempFilePath(
          {
            canvasId: 'cardCanvas',
            x: 0,
            y: 0,
            width,
            height,
            destWidth: width * 2,
            destHeight: height * 2,
            fileType: 'png',
            success: (res) => {
              this._saveImageFile(res.tempFilePath, false);
            },
            fail: (err) => {
              console.error('canvasToTempFilePath fail', err);
              // 合成失败则保存原图
              this._saveImageFile(imagePath, false);
            },
          },
          this
        );
      }, 300);
    });
  },

  /** 简易按字数折行（中文约 1 宽） */
  _wrapText(text, maxChars) {
    if (!text) return [];
    const lines = [];
    let current = '';
    for (let i = 0; i < text.length; i++) {
      current += text[i];
      if (current.length >= maxChars || text[i] === '\n') {
        lines.push(current.replace(/\n/g, ''));
        current = '';
      }
    }
    if (current) lines.push(current);
    return lines;
  },

  _saveImageFile(filePath, isFallbackOnly) {
    const finish = (ok, msg) => {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: msg, icon: ok ? 'success' : 'none' });
    };

    if (!filePath) {
      // 下载失败：提示域名配置
      finish(
        false,
        isFallbackOnly
          ? '下载失败，请配置 downloadFile 合法域名'
          : '保存失败'
      );
      return;
    }

    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => finish(true, '已保存到相册'),
      fail: (err) => {
        wx.hideLoading();
        this.setData({ saving: false });
        const msg = (err && err.errMsg) || '';
        if (msg.includes('auth') || msg.includes('authorize')) {
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
  },

  _saveFail(msg) {
    wx.hideLoading();
    this.setData({ saving: false });
    wx.showToast({ title: msg || '保存失败', icon: 'none' });
  },

  shareCard() {
    wx.showToast({ title: '点击右上角分享', icon: 'none' });
  },

  generateAgain() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/index/index' }),
    });
  },

  onShareAppMessage() {
    const { result } = this.data;
    return {
      title: `我的记忆被凝固为「${(result && result.category) || '未知'}」— 来冻结你的瞬间`,
      path: '/pages/index/index',
      imageUrl: (result && result.imageUrl) || '',
    };
  },

  onShareTimeline() {
    return {
      title: 'Momenta凝刻 — 冻结你的瞬间',
    };
  },
});
