// pages/index/index.js
const pay = require('../../utils/pay');

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

const FREE_PER_DAY = 2;
const app = getApp();

Page({
  data: {
    inputText: '',
    selectedEmotions: [],
    isGenerating: false,
    loadingStep: 0,
    error: null,
    showIntro: false,
    introOpacity: 1,
    showIntroText: false,
    remainingFree: FREE_PER_DAY,
    isPremium: false,
    credits: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
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
    this.initSafeArea();
    this.initEmotions();
    this.applyLocalUsage();
    this.syncMembership();
    this.handleIntro();
  },

  onShow() {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.data.isGenerating) {
      this.setData({ isGenerating: false, loadingStep: 0 });
    }
    this.applyLocalUsage();
    this.syncMembership();
  },

  onUnload() {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
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

  initEmotions() {
    const toGroup = (emotions) => emotions.map((e) => ({ ...e, active: false }));
    this.setData({
      warmEmotions: toGroup(ALL_EMOTIONS.filter((e) => e.group === 'warm')),
      hotEmotions: toGroup(ALL_EMOTIONS.filter((e) => e.group === 'hot')),
      coldEmotions: toGroup(ALL_EMOTIONS.filter((e) => e.group === 'cold')),
      complexEmotions: toGroup(ALL_EMOTIONS.filter((e) => e.group === 'complex')),
    });
  },

  /** 本地免费次数（展示用；权威计数在云函数） */
  applyLocalUsage() {
    const cached = pay.readCachedMembership();
    const today = new Date().toDateString();
    const stored = wx.getStorageSync('usage');
    let remainingFree = FREE_PER_DAY;
    if (stored && stored.date === today) {
      remainingFree = Math.max(0, FREE_PER_DAY - (stored.count || 0));
    } else {
      wx.setStorageSync('usage', { date: today, count: 0 });
    }
    this.setData({
      isPremium: !!cached.isPremium,
      credits: cached.credits || 0,
      remainingFree,
    });
  },

  /** 从云函数同步会员 */
  syncMembership() {
    pay
      .getStatus()
      .then((res) => {
        if (res.membership) {
          pay.cacheMembership(res.membership);
          this.setData({
            isPremium: !!res.membership.isPremium,
            credits: res.membership.credits || 0,
          });
        }
      })
      .catch(() => {
        // 云函数未部署时忽略
      });
  },

  handleIntro() {
    const isFirst = app.globalData && app.globalData.isFirstVisit;
    if (!isFirst) return;

    this.setData({ showIntro: true, introOpacity: 1, showIntroText: false });
    setTimeout(() => this.setData({ showIntroText: true }), 800);
    setTimeout(() => {
      this.setData({ introOpacity: 0 });
      setTimeout(() => {
        this.setData({ showIntro: false });
        wx.setStorageSync('momenta-visited', true);
        if (app.globalData) app.globalData.isFirstVisit = false;
      }, 800);
    }, 3200);
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  toggleEmotion(e) {
    const id = e.currentTarget.dataset.id;
    const selectedEmotions = [...this.data.selectedEmotions];
    const idx = selectedEmotions.indexOf(id);

    if (idx >= 0) {
      selectedEmotions.splice(idx, 1);
    } else if (selectedEmotions.length < 3) {
      selectedEmotions.push(id);
    } else {
      return;
    }

    const updateActive = (group) =>
      group.map((em) => ({ ...em, active: selectedEmotions.includes(em.id) }));
    const labels = selectedEmotions
      .map((sid) => {
        const found = ALL_EMOTIONS.find((em) => em.id === sid);
        return found ? found.label : '';
      })
      .filter(Boolean);

    const steps = [...this.data.loadingSteps];
    steps[1] = {
      ...steps[1],
      text:
        labels.length > 0
          ? `发现情绪：${labels.join('、')}`
          : '感受情绪氛围...',
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

  /** 本地展示扣次（服务端也会扣；双计保证 UI 即时反馈） */
  deductLocalFreeUsage() {
    if (this.data.isPremium) return;
    const today = new Date().toDateString();
    const stored = wx.getStorageSync('usage') || { date: today, count: 0 };
    if (stored.date !== today) {
      stored.date = today;
      stored.count = 0;
    }
    stored.count += 1;
    wx.setStorageSync('usage', stored);
    this.setData({ remainingFree: Math.max(0, FREE_PER_DAY - stored.count) });
  },

  canGenerateLocally() {
    if (this.data.isPremium) return true;
    if ((this.data.credits || 0) > 0) return true;
    if (this.data.remainingFree > 0) return true;
    return false;
  },

  handleGenerate() {
    if (!this.data.inputText.trim()) return;

    // 前端预检（最终以云函数为准）
    if (!this.canGenerateLocally()) {
      this.openPremium();
      return;
    }

    this.setData({ isGenerating: true, error: null, loadingStep: 0 });

    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = setInterval(() => {
      if (this.data.loadingStep < this.data.loadingSteps.length - 1) {
        this.setData({ loadingStep: this.data.loadingStep + 1 });
      }
    }, 2000);

    const emotionIds =
      this.data.selectedEmotions.length > 0
        ? this.data.selectedEmotions
        : undefined;

    wx.cloud.callFunction({
      name: 'generate',
      data: {
        text: this.data.inputText.trim(),
        emotions: emotionIds,
      },
      success: (res) => {
        if (this.stepTimer) {
          clearInterval(this.stepTimer);
          this.stepTimer = null;
        }

        const result = res.result || {};

        if (result.error) {
          this.setData({
            error: result.error || '凝固失败，请稍后重试',
            isGenerating: false,
            loadingStep: 0,
          });
          if (result.code === 'QUOTA_EXCEEDED') {
            setTimeout(() => this.openPremium(), 400);
          }
          return;
        }

        // 同步配额展示
        if (typeof result.remainingFree === 'number') {
          this.setData({ remainingFree: result.remainingFree });
          const today = new Date().toDateString();
          wx.setStorageSync('usage', {
            date: today,
            count: FREE_PER_DAY - result.remainingFree,
          });
        } else if (result.quotaMode === 'free') {
          this.deductLocalFreeUsage();
        }

        if (typeof result.credits === 'number') {
          this.setData({ credits: result.credits });
          const m = pay.readCachedMembership();
          m.credits = result.credits;
          if (result.isPremium) m.isPremium = true;
          pay.cacheMembership(m);
        }
        if (result.isPremium) {
          this.setData({ isPremium: true });
        }

        wx.setStorageSync('currentResult', result);
        wx.setStorageSync('currentText', this.data.inputText.trim());
        wx.setStorageSync('currentShowText', true);

        this.setData({ isGenerating: false, loadingStep: 0 });
        wx.navigateTo({ url: '/pages/result/result' });
      },
      fail: (err) => {
        if (this.stepTimer) {
          clearInterval(this.stepTimer);
          this.stepTimer = null;
        }
        console.error('Generate failed:', err);
        this.setData({
          error: '凝固失败，请稍后重试',
          isGenerating: false,
          loadingStep: 0,
        });
      },
    });
  },

  openPremium() {
    wx.navigateTo({ url: '/pages/premium/premium' });
  },

  showPremium() {
    this.openPremium();
  },

  onShareAppMessage() {
    return {
      title: 'Momenta凝刻 — 冻结你的瞬间',
      path: '/pages/index/index',
    };
  },
});
