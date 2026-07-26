/**
 * 支付工具：下单 → 调起支付 / Mock 确认 → 刷新会员状态
 */

function callPay(action, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'pay',
      data: { action, ...data },
      success: (res) => {
        const result = res.result || {};
        if (result.error) {
          reject(new Error(result.error));
          return;
        }
        resolve(result);
      },
      fail: (err) => reject(err),
    });
  });
}

/** 拉取会员状态与商品列表 */
function getStatus() {
  return callPay('getStatus');
}

/**
 * 购买商品
 * @param {string} productId monthly | yearly | single
 * @returns {Promise<{membership, mock?}>}
 */
function purchase(productId) {
  return callPay('createOrder', { productId }).then((orderRes) => {
    if (orderRes.mock) {
      // Mock：弹窗确认后直接开通
      return new Promise((resolve, reject) => {
        wx.showModal({
          title: '模拟支付',
          content: `${orderRes.product.name} ¥${(orderRes.product.price / 100).toFixed(1)}\n\n当前未配置商户号，确认后将模拟支付成功并开通权益。`,
          confirmText: '确认支付',
          cancelText: '取消',
          success: (modal) => {
            if (!modal.confirm) {
              reject(new Error('已取消支付'));
              return;
            }
            callPay('mockConfirm', { outTradeNo: orderRes.outTradeNo })
              .then((r) => resolve({ ...r, mock: true }))
              .catch(reject);
          },
          fail: () => reject(new Error('已取消支付')),
        });
      });
    }

    // 真实微信支付
    const p = orderRes.payment;
    if (!p || !p.timeStamp) {
      return Promise.reject(new Error('支付参数无效'));
    }

    return new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: String(p.timeStamp),
        nonceStr: p.nonceStr,
        package: p.package,
        signType: p.signType || 'RSA',
        paySign: p.paySign,
        success: () => {
          // 回调云函数异步到账，短暂等待后查状态
          setTimeout(() => {
            getStatus()
              .then((s) => resolve({ ok: true, membership: s.membership, mock: false }))
              .catch(() => resolve({ ok: true, membership: null, mock: false, pending: true }));
          }, 800);
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || '';
          if (msg.includes('cancel')) {
            reject(new Error('已取消支付'));
          } else {
            reject(new Error('支付失败'));
          }
        },
      });
    });
  });
}

/** 将会员状态写入本地缓存，供页面快速展示 */
function cacheMembership(membership) {
  if (!membership) return;
  wx.setStorageSync('membership', membership);
  wx.setStorageSync('isPremium', !!membership.isPremium);
  wx.setStorageSync('credits', membership.credits || 0);
  if (membership.premiumUntil) {
    wx.setStorageSync('premiumUntil', membership.premiumUntil);
  }
}

function readCachedMembership() {
  return (
    wx.getStorageSync('membership') || {
      isPremium: !!wx.getStorageSync('isPremium'),
      credits: wx.getStorageSync('credits') || 0,
      premiumUntil: wx.getStorageSync('premiumUntil') || null,
      plan: null,
    }
  );
}

module.exports = {
  callPay,
  getStatus,
  purchase,
  cacheMembership,
  readCachedMembership,
};
