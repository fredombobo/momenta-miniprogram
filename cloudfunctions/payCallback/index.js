/**
 * 微信支付结果通知回调（由 cloud.cloudPay.unifiedOrder 的 functionName 指定）
 * 成功后更新 orders 并授予 memberships 权益
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PRODUCTS = {
  monthly: {
    id: 'monthly',
    type: 'membership',
    durationDays: 30,
  },
  yearly: {
    id: 'yearly',
    type: 'membership',
    durationDays: 365,
  },
  single: {
    id: 'single',
    type: 'credit',
    credits: 1,
  },
};

function isPremiumActive(member) {
  if (!member || !member.premiumUntil) return false;
  return new Date(member.premiumUntil).getTime() > Date.now();
}

async function getMembership(openid) {
  try {
    const res = await db.collection('memberships').doc(openid).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

async function grantEntitlement(openid, product, outTradeNo) {
  let member = await getMembership(openid);
  const now = Date.now();

  let premiumUntil = member && member.premiumUntil ? member.premiumUntil : null;
  let credits = (member && member.credits) || 0;
  let plan = (member && member.plan) || null;

  if (product.type === 'membership') {
    const base =
      premiumUntil && new Date(premiumUntil).getTime() > now
        ? new Date(premiumUntil).getTime()
        : now;
    premiumUntil = new Date(
      base + product.durationDays * 24 * 60 * 60 * 1000
    ).toISOString();
    plan = product.id;
  } else if (product.type === 'credit') {
    credits += product.credits || 1;
  }

  const data = {
    openid,
    premiumUntil,
    credits,
    plan,
    lastOrderId: outTradeNo,
    updatedAt: new Date(),
    createdAt: (member && member.createdAt) || new Date(),
  };

  try {
    await db.collection('memberships').doc(openid).set({ data });
  } catch (e) {
    await db.collection('memberships').doc(openid).update({
      data: {
        premiumUntil,
        credits,
        plan,
        lastOrderId: outTradeNo,
        updatedAt: new Date(),
      },
    });
  }
}

exports.main = async (event) => {
  console.log('payCallback event', JSON.stringify(event));

  // 云开发支付回调字段
  const resultCode = event.resultCode || event.returnCode;
  const outTradeNo = event.outTradeNo;
  const openid = event.userInfo?.openId || event.openid || event.subOpenid;

  if (resultCode !== 'SUCCESS' && event.returnCode !== 'SUCCESS') {
    if (outTradeNo) {
      try {
        const r = await db.collection('orders').where({ outTradeNo }).limit(1).get();
        if (r.data[0]) {
          await db.collection('orders').doc(r.data[0]._id).update({
            data: { status: 'failed', failReason: event.errCodeDes || 'pay_fail' },
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    // 需返回给微信
    return { errcode: 0, errmsg: 'ok' };
  }

  if (!outTradeNo) {
    return { errcode: 0, errmsg: 'ok' };
  }

  try {
    const orderRes = await db
      .collection('orders')
      .where({ outTradeNo })
      .limit(1)
      .get();

    if (!orderRes.data || orderRes.data.length === 0) {
      console.error('order not found', outTradeNo);
      return { errcode: 0, errmsg: 'ok' };
    }

    const order = orderRes.data[0];
    if (order.status === 'paid') {
      return { errcode: 0, errmsg: 'ok' };
    }

    await db.collection('orders').doc(order._id).update({
      data: {
        status: 'paid',
        paidAt: db.serverDate(),
        transactionId: event.transactionId || event.transaction_id || '',
      },
    });

    const product = PRODUCTS[order.productId];
    const uid = openid || order.openid;
    if (product && uid) {
      await grantEntitlement(uid, product, outTradeNo);
    }
  } catch (err) {
    console.error('payCallback error', err);
  }

  return { errcode: 0, errmsg: 'ok' };
};
