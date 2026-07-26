const pay = require('../../utils/pay');

Page({
  data: {
    loading: true,
    paying: false,
    mockPay: true,
    membership: {
      isPremium: false,
      credits: 0,
      premiumUntil: null,
      plan: null,
    },
    products: [],
    statusBarHeight: 20,
    navBarHeight: 64,
    premiumUntilText: '',
  },

  onLoad() {
    this.initSafeArea();
    this.refresh();
  },

  onShow() {
    this.refresh();
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

  goBack() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: '/pages/index/index' }),
    });
  },

  formatUntil(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const p = (n) => (n < 10 ? `0${n}` : `${n}`);
      return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
    } catch (e) {
      return iso;
    }
  },

  refresh() {
    this.setData({ loading: true });
    pay
      .getStatus()
      .then((res) => {
        const membership = res.membership || {};
        pay.cacheMembership(membership);
        this.setData({
          loading: false,
          mockPay: !!res.mockPay,
          membership,
          products: res.products || [],
          premiumUntilText: this.formatUntil(membership.premiumUntil),
        });
      })
      .catch((err) => {
        console.error(err);
        // 云函数未部署时用本地缓存 + 默认商品
        const membership = pay.readCachedMembership();
        this.setData({
          loading: false,
          mockPay: true,
          membership,
          premiumUntilText: this.formatUntil(membership.premiumUntil),
          products: [
            {
              id: 'monthly',
              name: '月度会员',
              desc: '无限生成 30 天',
              price: 1990,
              priceYuan: '19.9',
              type: 'membership',
            },
            {
              id: 'yearly',
              name: '年度会员',
              desc: '无限生成 365 天 · 更划算',
              price: 12800,
              priceYuan: '128',
              type: 'membership',
            },
            {
              id: 'single',
              name: '单次生成',
              desc: '额外 1 次生成额度',
              price: 390,
              priceYuan: '3.9',
              type: 'credit',
            },
          ],
        });
        if (err && err.message) {
          wx.showToast({ title: '支付服务未就绪，可测 Mock', icon: 'none' });
        }
      });
  },

  onBuy(e) {
    const productId = e.currentTarget.dataset.id;
    if (!productId || this.data.paying) return;

    this.setData({ paying: true });
    wx.showLoading({ title: '下单中...' });

    pay
      .purchase(productId)
      .then((res) => {
        wx.hideLoading();
        this.setData({ paying: false });
        if (res.membership) {
          pay.cacheMembership(res.membership);
        }
        wx.showToast({
          title: res.mock ? '模拟开通成功' : res.pending ? '支付成功，权益稍后生效' : '开通成功',
          icon: 'success',
        });
        this.refresh();
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ paying: false });
        const msg = (err && err.message) || '支付失败';
        if (msg.includes('取消')) {
          wx.showToast({ title: '已取消', icon: 'none' });
        } else {
          wx.showToast({ title: msg, icon: 'none' });
        }
      });
  },
});
