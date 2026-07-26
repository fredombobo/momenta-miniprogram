/**
 * 商品与会员权益定义（云函数与文档共用逻辑，部署时各函数内会再内联一份以防路径问题）
 * 价格单位：分
 */

const PRODUCTS = {
  monthly: {
    id: 'monthly',
    name: '月度会员',
    desc: 'Momenta凝刻月度会员',
    price: 1990, // ¥19.9
    type: 'membership',
    durationDays: 30,
  },
  yearly: {
    id: 'yearly',
    name: '年度会员',
    desc: 'Momenta凝刻年度会员',
    price: 12800, // ¥128
    type: 'membership',
    durationDays: 365,
  },
  single: {
    id: 'single',
    name: '单次生成',
    desc: 'Momenta凝刻单次生成券',
    price: 390, // ¥3.9
    type: 'credit',
    credits: 1,
  },
};

module.exports = { PRODUCTS };
