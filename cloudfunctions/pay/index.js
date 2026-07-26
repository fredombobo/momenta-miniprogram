/**
 * 云函数 pay
 * action:
 *   - createOrder  { productId }
 *   - getStatus    查询会员 / 单次券
 *   - mockConfirm  { outTradeNo }  仅 MOCK 模式确认支付成功
 *   - listProducts 商品列表
 *
 * 环境变量：
 *   WX_PAY_MCH_ID   微信支付商户号（subMchId）
 *   MOCK_PAY=true   强制 Mock（无商户号时也会自动 Mock）
 *   CLOUD_ENV       云环境 ID（支付回调用，缺省 DYNAMIC_CURRENT_ENV）
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PRODUCTS = {
  monthly: {
    id: 'monthly',
    name: '月度会员',
    desc: 'Momenta凝刻月度会员 · 无限生成',
    price: 1990,
    type: 'membership',
    durationDays: 30,
  },
  yearly: {
    id: 'yearly',
    name: '年度会员',
    desc: 'Momenta凝刻年度会员 · 无限生成',
    price: 12800,
    type: 'membership',
    durationDays: 365,
  },
  single: {
    id: 'single',
    name: '单次生成',
    desc: 'Momenta凝刻单次生成券',
    price: 390,
    type: 'credit',
    credits: 1,
  },
};

const MCH_ID = process.env.WX_PAY_MCH_ID || '';
const FORCE_MOCK = process.env.MOCK_PAY === 'true' || process.env.MOCK_PAY === '1';
const USE_MOCK = FORCE_MOCK || !MCH_ID;

function genOutTradeNo(openid, productId) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const oid = (openid || 'anon').slice(-8);
  return `mk${productId.slice(0, 3)}${oid}${ts}${rand}`.slice(0, 32);
}

async function ensureCollections() {
  // 云开发会在首次 add 时自动建集合；这里仅作说明：
  // orders / memberships
}

async function getMembership(openid) {
  try {
    const res = await db.collection('memberships').doc(openid).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

function isPremiumActive(member) {
  if (!member) return false;
  if (!member.premiumUntil) return false;
  return new Date(member.premiumUntil).getTime() > Date.now();
}

async function grantEntitlement(openid, product, order) {
  const now = Date.now();
  let member = await getMembership(openid);

  if (!member) {
    member = {
      _id: openid,
      openid,
      premiumUntil: null,
      credits: 0,
      updatedAt: new Date(),
      createdAt: new Date(),
    };
  }

  if (product.type === 'membership') {
    const base = isPremiumActive(member)
      ? new Date(member.premiumUntil).getTime()
      : now;
    const until = new Date(base + product.durationDays * 24 * 60 * 60 * 1000);
    member.premiumUntil = until.toISOString();
    member.plan = product.id;
  } else if (product.type === 'credit') {
    member.credits = (member.credits || 0) + (product.credits || 1);
  }

  member.updatedAt = new Date();
  member.lastOrderId = order.outTradeNo;

  try {
    await db.collection('memberships').doc(openid).set({
      data: {
        openid,
        premiumUntil: member.premiumUntil,
        credits: member.credits || 0,
        plan: member.plan || null,
        updatedAt: member.updatedAt,
        lastOrderId: member.lastOrderId,
        createdAt: member.createdAt || new Date(),
      },
    });
  } catch (e) {
    // set 失败时尝试 update
    await db.collection('memberships').doc(openid).update({
      data: {
        premiumUntil: member.premiumUntil,
        credits: member.credits || 0,
        plan: member.plan || null,
        updatedAt: member.updatedAt,
        lastOrderId: member.lastOrderId,
      },
    });
  }

  return member;
}

async function createOrder(event, openid) {
  const productId = event.productId;
  const product = PRODUCTS[productId];
  if (!product) {
    return { error: '未知商品', code: 'INVALID_PRODUCT' };
  }

  const outTradeNo = genOutTradeNo(openid, productId);
  const order = {
    outTradeNo,
    openid,
    productId: product.id,
    productName: product.name,
    price: product.price,
    type: product.type,
    status: 'created', // created | paid | failed | closed
    mock: USE_MOCK,
    createdAt: db.serverDate(),
    paidAt: null,
  };

  await db.collection('orders').add({ data: order });

  // ---- Mock 支付：返回 mock 参数，由客户端确认后调 mockConfirm ----
  if (USE_MOCK) {
    return {
      mock: true,
      outTradeNo,
      product,
      message: '当前为 Mock 支付（未配置商户号）。确认后将直接开通权益。',
    };
  }

  // ---- 真实微信支付统一下单 ----
  const envId =
    process.env.CLOUD_ENV ||
    cloud.DYNAMIC_CURRENT_ENV ||
    '';

  try {
    const payRes = await cloud.cloudPay.unifiedOrder({
      body: product.desc,
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: MCH_ID,
      totalFee: product.price,
      envId: typeof envId === 'string' ? envId : undefined,
      functionName: 'payCallback',
      tradeType: 'JSAPI',
    });

    // 不同 SDK 版本字段略有差异，尽量透传
    const payment = payRes.payment || payRes;

    if (payRes.returnCode === 'FAIL' || payRes.resultCode === 'FAIL') {
      await db
        .collection('orders')
        .where({ outTradeNo })
        .update({ data: { status: 'failed', failReason: payRes.returnMsg || payRes.errCodeDes } });
      return {
        error: payRes.returnMsg || payRes.errCodeDes || '下单失败',
        code: 'UNIFIED_ORDER_FAIL',
      };
    }

    return {
      mock: false,
      outTradeNo,
      product,
      payment: {
        timeStamp: payment.timeStamp || payment.timestamp,
        nonceStr: payment.nonceStr,
        package: payment.package,
        signType: payment.signType || 'MD5',
        paySign: payment.paySign,
      },
    };
  } catch (err) {
    console.error('unifiedOrder failed', err);
    await db
      .collection('orders')
      .where({ outTradeNo })
      .update({ data: { status: 'failed', failReason: err.message } });
    return {
      error: err.message || '支付下单失败',
      code: 'PAY_ERROR',
    };
  }
}

async function mockConfirm(event, openid) {
  if (!USE_MOCK) {
    return { error: '正式环境禁止 mockConfirm', code: 'FORBIDDEN' };
  }

  const outTradeNo = event.outTradeNo;
  if (!outTradeNo) {
    return { error: '缺少订单号', code: 'NO_ORDER' };
  }

  const orderRes = await db
    .collection('orders')
    .where({ outTradeNo, openid })
    .limit(1)
    .get();

  if (!orderRes.data || orderRes.data.length === 0) {
    return { error: '订单不存在', code: 'ORDER_NOT_FOUND' };
  }

  const order = orderRes.data[0];
  if (order.status === 'paid') {
    const member = await getMembership(openid);
    return {
      ok: true,
      alreadyPaid: true,
      membership: formatMembership(member),
    };
  }

  const product = PRODUCTS[order.productId];
  if (!product) {
    return { error: '商品无效', code: 'INVALID_PRODUCT' };
  }

  await db.collection('orders').doc(order._id).update({
    data: {
      status: 'paid',
      paidAt: db.serverDate(),
      mockPaid: true,
    },
  });

  const member = await grantEntitlement(openid, product, order);
  return {
    ok: true,
    mock: true,
    membership: formatMembership(member),
  };
}

function formatMembership(member) {
  if (!member) {
    return {
      isPremium: false,
      premiumUntil: null,
      credits: 0,
      plan: null,
    };
  }
  return {
    isPremium: isPremiumActive(member),
    premiumUntil: member.premiumUntil || null,
    credits: member.credits || 0,
    plan: member.plan || null,
  };
}

async function getStatus(openid) {
  const member = await getMembership(openid);
  return {
    mockPay: USE_MOCK,
    membership: formatMembership(member),
    products: Object.values(PRODUCTS).map((p) => ({
      id: p.id,
      name: p.name,
      desc: p.desc,
      price: p.price,
      priceYuan: (p.price / 100).toFixed(1).replace(/\.0$/, ''),
      type: p.type,
      durationDays: p.durationDays || null,
      credits: p.credits || null,
    })),
  };
}

/** 生成成功后由 generate 或客户端调用：消耗 1 次单次券 */
async function consumeCredit(openid) {
  const member = await getMembership(openid);
  if (!member) return { ok: false, reason: 'no_member' };
  if (isPremiumActive(member)) return { ok: true, skipped: true, reason: 'premium' };
  if ((member.credits || 0) <= 0) return { ok: false, reason: 'no_credit' };

  await db.collection('memberships').doc(openid).update({
    data: {
      credits: _.inc(-1),
      updatedAt: new Date(),
    },
  });
  return { ok: true };
}

exports.main = async (event) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) {
    return { error: '无法获取用户身份', code: 'NO_OPENID' };
  }

  const action = event.action || 'getStatus';

  try {
    await ensureCollections();

    switch (action) {
      case 'listProducts':
      case 'getStatus':
        return await getStatus(openid);
      case 'createOrder':
        return await createOrder(event, openid);
      case 'mockConfirm':
        return await mockConfirm(event, openid);
      case 'consumeCredit':
        return await consumeCredit(openid);
      default:
        return { error: '未知 action', code: 'BAD_ACTION' };
    }
  } catch (err) {
    console.error('pay cloud error', err);
    return { error: err.message || '支付服务异常', code: 'INTERNAL' };
  }
};

// 供 payCallback 复用：在同环境通过 require 不可跨函数，回调内会复制逻辑
exports._grantEntitlement = grantEntitlement;
exports._PRODUCTS = PRODUCTS;
exports._isPremiumActive = isPremiumActive;
