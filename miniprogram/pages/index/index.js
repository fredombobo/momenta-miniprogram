// pages/index/index.js
const app = getApp();

// 情绪数据
const ALL_EMOTIONS = [
  { id: 'calm', label: '平静', color: '#7EB8C9', group: 'warm' },
  { id: 'joy', label: '喜悦', color: '#C9A55C', group: 'warm' },
  { id: 'touched', label: '感动', color: '#D4A0B8', group: 'warm' },
  { id: 'happy', label: '幸福', color: '#E8A87C', group: 'warm' },
  { id: 'grateful', label: '感恩', color: '#A8C686', group: 'warm' },
  { id: 'passion', label: '热烈', color: '#C9544D', group: 'hot' },
  { id: 'excited', label: '兴奋', color: '#E8744F', group: 'hot' },
  { id: 'thrilled', label: '激动', color: '#D4634B', group: 'hot' },
  { id: 'proud', label: '骄傲', color: '#D4A04A', group: 'hot' },
  { id: 'lonely', label: '孤独', color: '#5B6B8C', group: 'cold' },
  { id: 'sorrow', label: '哀伤', color: '#6B7B8D', group: 'cold' },
  { id: 'lost', label: '迷茫', color: '#9B8EC9', group: 'cold' },
  { id: 'down', label: '失落', color: '#7A8B9A', group: 'cold' },
  { id: 'relief', label: '释然', color: '#8CB88C', group: 'complex' },
  { id: 'embarrassed', label: '窘迫', color: '#B8856B', group: 'complex' },
  { id: 'awkward', label: '尴尬', color: '#A89070', group: 'complex' },
  { id: 'collapsed', label: '崩溃', color: '#5A4A6B', group: 'complex' },
  { id: 'nostalgic', label: '怀念', color: '#8FA4B8', group: 'complex' },
  { id: 'bittersweet', label: '百感交集', color: '#9A8AA0', group: 'complex' },
  { id: 'awe', label: '敬畏', color: '#4A6B8A', group: 'complex' },
];

Page({
  data: {
    inputText: '',
    selectedEmotions: [],
    isGenerating: false,
    loadingStep: 0,
    hasResult: false,
    error: null,
    showIntro: false,
    introOpacity: 1,
    showIntroText: false,
    remainingFree: 2,
    isPremium: false,
    warmEmotions: [],
    hotEmotions: [],
    coldEmotions: [],
    complexEmotions: [],
    loadingSteps: [
      { text: '正在解读你的记忆...', icon: '🔮' },
      { text: '感受情绪氛围...', icon: '✨' },
      { text: '选择投射形态', icon: '🦌' },
      { text: '凝固中...', icon: '💎' },
    ],
  },

  stepTimer: null,

  onLoad() {
    this.initEmotions();
    this.checkUsage();
    this.handleIntro();
  },

  onUnload() {
    if (this.stepTimer) clearInterval(this.stepTimer);
  },

  // 初始化情绪分组
  initEmotions() {
    const toGroup = (emotions) => emotions.map(e => ({ ...e, active: false }));
    this.setData({
      warmEmotions: toGroup(ALL_EMOTIONS.filter(e => e.group === 'warm')),
      hotEmotions: toGroup(ALL_EMOTIONS.filter(e => e.group === 'hot')),
      coldEmotions: toGroup(ALL_EMOTIONS.filter(e => e.group === 'cold')),
      complexEmotions: toGroup(ALL_EMOTIONS.filter(e => e.group === 'complex')),
    });
  },

  // 检查今日使用次数
  checkUsage() {
    const today = new Date().toDateString();
    const stored = wx.getStorageSync('usage');
    if (!stored || stored.date !== today) {
      wx.setStorageSync('usage', { date: today, count: 0 });
      this.setData({ remainingFree: 2 });
    } else {
      this.setData({ remainingFree: Math.max(0, 2 - stored.count) });
    }
    // 检查会员状态
    const premium = wx.getStorageSync('isPremium');
    this.setData({ isPremium: !!premium });
  },

  // 入场动画
  handleIntro() {
    const visited = wx.getStorageSync('momenta-visited');
    if (!visited) {
      this.setData({ showIntro: true });
      setTimeout(() => this.setData({ showIntroText: true }), 800);
      setTimeout(() => {
        this.setData({ introOpacity: 0 });
        setTimeout(() => this.setData({ showIntro: false }), 800);
      }, 3200);
    }
  },

  // 输入事件
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  // 切换情绪
  toggleEmotion(e) {
    const id = e.currentTarget.dataset.id;
    const { selectedEmotions } = this.data;
    const idx = selectedEmotions.indexOf(id);

    if (idx >= 0) {
      selectedEmotions.splice(idx, 1);
    } else if (selectedEmotions.length < 3) {
      selectedEmotions.push(id);
    } else {
      return;
    }

    // 更新所有分组的 active 状态
    const updateActive = (group) => group.map(e => ({ ...e, active: selectedEmotions.includes(e.id) }));
    const labels = selectedEmotions.map(id => {
      const e = ALL_EMOTIONS.find(em => em.id === id);
      return e ? e.label : '';
    }).filter(Boolean);

    const steps = [...this.data.loadingSteps];
    steps[1] = {
      ...steps[1],
      text: labels.length > 0 ? `发现情绪：${labels.join('、')}` : '感受情绪氛围...',
    };

    this.setData({
      selectedEmotions,
      warmEmotions: updateActive(this.data.warmEmotions),
      hotEmotions: updateActive(this.data.hotEmotions),
      coldEmotions: updateActive(this.data.coldEmotions),
      complexEmotions: updateActive(this.data.complexEmotions),
      loadingSteps: steps,
    });
  },

  // 生成
  handleGenerate() {
    if (!this.data.inputText.trim()) return;

    // 检查免费次数
    if (this.data.remainingFree <= 0 && !this.data.isPremium) {
      this.showPremium();
      return;
    }

    this.setData({ isGenerating: true, error: null, loadingStep: 0 });

    // 分步动画
    this.stepTimer = setInterval(() => {
      if (this.data.loadingStep < this.data.loadingSteps.length - 1) {
        this.setData({ loadingStep: this.data.loadingStep + 1 });
      }
    }, 2000);

    // 调用云函数
    const emotionLabels = this.data.selectedEmotions.map(id => {
      const e = ALL_EMOTIONS.find(em => em.id === id);
      return e ? e.label : '';
    }).filter(Boolean);

    wx.cloud.callFunction({
      name: 'generate',
      data: {
        text: this.data.inputText.trim(),
        emotions: emotionLabels.length > 0 ? emotionLabels : undefined,
      },
      success: (res) => {
        clearInterval(this.stepTimer);
        const result = res.result;

        // 扣减免费次数
        if (!this.data.isPremium) {
          const today = new Date().toDateString();
          const stored = wx.getStorageSync('usage') || { date: today, count: 0 };
          stored.count += 1;
          wx.setStorageSync('usage', stored);
          this.setData({ remainingFree: Math.max(0, 2 - stored.count) });
        }

        // 存储结果并跳转
        wx.setStorageSync('currentResult', result);
        wx.setStorageSync('currentText', this.data.inputText);
        this.setData({ hasResult: true });
        wx.navigateTo({ url: '/pages/result/result' });
      },
      fail: (err) => {
        clearInterval(this.stepTimer);
        console.error('Generate failed:', err);
        this.setData({ error: '凝固失败，请稍后重试', isGenerating: false });
      },
    });
  },

  // 显示会员
  showPremium() {
    wx.showModal({
      title: '升级 Momenta凝刻',
      content: '月度会员 ¥19.9/月\n年度会员 ¥128/年\n\n• 无限生成\n• 高清卡片\n• 专属情绪风格',
      confirmText: '立即升级',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          // TODO: 接入微信支付
          wx.showToast({ title: '支付功能开发中', icon: 'none' });
        }
      },
    });
  },

  // 分享
  onShareAppMessage() {
    return {
      title: 'Momenta凝刻 — 冻结你的瞬间',
      path: '/pages/index/index',
    };
  },
});
