# Momenta凝刻 · 微信支付接入说明

## 结论：可以现在做

代码侧**已经接好**：

| 能力 | 状态 |
|------|------|
| 商品：月卡 ¥19.9 / 年卡 ¥128 / 单次 ¥3.9 | ✅ |
| 云函数下单 `pay` | ✅ |
| 支付回调 `payCallback` | ✅ |
| 会员 / 单次券入库 `memberships` | ✅ |
| 生成配额服务端校验（`generate`） | ✅ |
| 小程序会员页 + 调起支付 | ✅ |
| **无商户号时 Mock 支付** | ✅ 可立刻联调 |

**真实收款**仍依赖你完成微信侧开通（见下文「上线前配置」）。未配置时走 Mock：点购买 → 确认 → 立即开通权益。

---

## 商品

| productId | 名称 | 价格 | 权益 |
|-----------|------|------|------|
| `monthly` | 月度会员 | 1990 分（¥19.9） | 会员 +30 天 |
| `yearly` | 年度会员 | 12800 分（¥128） | 会员 +365 天 |
| `single` | 单次生成 | 390 分（¥3.9） | credits +1 |

会员期内生成无限次；非会员优先扣 `credits`，再扣每日 2 次免费。

---

## 云函数

```
cloudfunctions/
  pay/           # createOrder | getStatus | mockConfirm | consumeCredit
  payCallback/   # 微信支付结果通知
  generate/      # 生成前 checkAndConsumeQuota
```

### 环境变量

| 变量 | 函数 | 说明 |
|------|------|------|
| `WX_PAY_MCH_ID` | `pay` | 微信支付商户号（subMchId）。**不配则自动 Mock** |
| `MOCK_PAY=true` | `pay` | 强制 Mock（联调推荐） |
| `CLOUD_ENV` | `pay` | 云环境 ID（统一下单回调用，可与当前环境一致） |
| `DEEPSEEK_API_KEY` / `SILICONFLOW_API_KEY` | `generate` | 生成用 |

### 数据库集合（云开发控制台创建，权限建议仅管理端可写）

| 集合 | 用途 |
|------|------|
| `orders` | 订单 |
| `memberships` | 用户权益（docId = openid） |
| `usage` | 每日免费次数（docId = `{openid}_{YYYY-MM-DD}`） |

首次 `add` 时也可能自动建集合；建议手动建好并配置权限。

---

## 部署步骤

1. 微信开发者工具打开 `momenta-miniprogram`
2. 填入真实 **AppID**、`app.js` 云环境 ID
3. 右键上传并部署云函数：`pay`、`payCallback`、`generate`（安装依赖）
4. 创建上述三个集合
5. **联调 Mock**：不配 `WX_PAY_MCH_ID`，或设 `MOCK_PAY=true`  
   → 打开小程序 → 点「升级」→ 选方案 →「确认支付」→ 会员状态应更新
6. **正式支付**（见下）

---

## 上线前配置（真实收款）

1. 小程序已认证，开通**微信支付**
2. 商户平台完成进件，获得**商户号**
3. 云开发控制台 → 设置 → 全局设置 → 开通**云调用 / 微信支付**
4. 将商户号与小程序绑定（按微信文档：云开发微信支付）
5. 云函数 `pay` 配置环境变量：
   ```
   WX_PAY_MCH_ID=你的商户号
   MOCK_PAY=false
   CLOUD_ENV=你的环境ID
   ```
6. 重新部署 `pay`、`payCallback`
7. 真机支付 0.01 元测试（可临时改 `products` 价格），确认：
   - `wx.requestPayment` 能拉起
   - `payCallback` 收到成功
   - `memberships` 写入正确
   - 生成不再受每日 2 次限制

官方参考：  
[云开发微信支付](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/wechatpay/wechatpay.html)

---

## 客户端入口

- 页面：`pages/premium/premium`
- 工具：`miniprogram/utils/pay.js`
- 首页「升级」→ 会员页 → 点商品卡片购买

---

## 注意

1. **Web 端**未接支付（需独立方案：如微信扫码 / Stripe）。本实现面向**微信小程序**。
2. Mock 仅用于开发；正式环境务必配置商户号并关闭 Mock。
3. 退款、发票、续费提醒未做，可按业务后续加。
4. 若 `cloud.cloudPay.unifiedOrder` 字段与你账号 SDK 版本不一致，以控制台报错为准微调 `pay/index.js` 返回的 `payment` 字段映射。
