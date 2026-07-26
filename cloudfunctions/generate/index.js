// 云函数：generate
// 调用 DeepSeek + SiliconFlow API 生成记忆投射物
// 契约：emotions 为 id 数组（也兼容中文 label）

const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const TEXT_MODEL = 'deepseek-v4-flash';
const IMAGE_MODEL = 'Qwen/Qwen-Image';
const MAX_TEXT_LENGTH = 500;
const MAX_EMOTIONS = 3;
const FREE_PER_DAY = 2;

const EMOTIONS = [
  { id: 'calm', label: '平静', color: '#7EB8C9' },
  { id: 'joy', label: '喜悦', color: '#C9A55C' },
  { id: 'touched', label: '感动', color: '#D4A0B8' },
  { id: 'happy', label: '幸福', color: '#E8A87C' },
  { id: 'grateful', label: '感恩', color: '#A8C686' },
  { id: 'passion', label: '热烈', color: '#C9544D' },
  { id: 'excited', label: '兴奋', color: '#E8744F' },
  { id: 'thrilled', label: '激动', color: '#D4634B' },
  { id: 'proud', label: '骄傲', color: '#D4A04A' },
  { id: 'lonely', label: '孤独', color: '#5B6B8C' },
  { id: 'sorrow', label: '哀伤', color: '#6B7B8D' },
  { id: 'lost', label: '迷茫', color: '#9B8EC9' },
  { id: 'down', label: '失落', color: '#7A8B9A' },
  { id: 'relief', label: '释然', color: '#8CB88C' },
  { id: 'embarrassed', label: '窘迫', color: '#B8856B' },
  { id: 'awkward', label: '尴尬', color: '#A89070' },
  { id: 'collapsed', label: '崩溃', color: '#5A4A6B' },
  { id: 'nostalgic', label: '怀念', color: '#8FA4B8' },
  { id: 'bittersweet', label: '百感交集', color: '#9A8AA0' },
  { id: 'awe', label: '敬畏', color: '#4A6B8A' },
];

const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map((e) => [e.id, e]));
const EMOTION_BY_LABEL = Object.fromEntries(EMOTIONS.map((e) => [e.label, e]));

const USE_MOCK = !DEEPSEEK_API_KEY || !SILICONFLOW_API_KEY;

const MOCK_IMAGES = [
  'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1024&h=1024&fit=crop',
  'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1024&h=1024&fit=crop',
  'https://images.unsplash.com/photo-1539321908154-04927596764d?w=1024&h=1024&fit=crop',
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1024&h=1024&fit=crop',
];

const MOCK_DATA = [
  {
    category: '星尘鹿',
    interpretation:
      '你描述的那个瞬间，被凝固为一只由星尘构成的鹿 — 它站在薄雾中，鹿角上挂着未落下的露珠。这只鹿代表着宁静中的力量，是你内心深处最柔软的坚持。',
  },
  {
    category: '时光树',
    interpretation:
      '你的记忆被凝固为一棵时光树 — 根系是时钟的指针，叶片是半透明的金色。每一次风吹都是时间在低语，记录着你那些不曾说出口的成长。',
  },
  {
    category: '记忆水母',
    interpretation:
      '那个瞬间化作了一只记忆水母 — 它在深海中缓缓漂浮，触须是光线织成的丝线。它代表着你在那个时刻的柔软与透明，一切都刚刚好。',
  },
  {
    category: '梦境星球',
    interpretation:
      '你的瞬间被投射为一颗微型星球 — 表面布满裂纹，裂缝中透出温暖的琥珀色光芒。这颗星球孤独却不自卑，它是你独有宇宙的证据。',
  },
];

function normalizeEmotionIds(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const value = item.trim();
    const found = EMOTION_BY_ID[value] || EMOTION_BY_LABEL[value];
    if (found && !ids.includes(found.id)) ids.push(found.id);
    if (ids.length >= MAX_EMOTIONS) break;
  }
  return ids;
}

function resolveEmotions(raw) {
  const ids = normalizeEmotionIds(raw);
  const labels = ids.map((id) => EMOTION_BY_ID[id].label);
  const emotionText = labels.length > 0 ? labels.join('、') : '平静';
  const emotionColor =
    ids.length > 0 ? EMOTION_BY_ID[ids[0]].color : '#C9A55C';
  return { ids, labels, emotionText, emotionColor };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockGenerate(text, emotions) {
  await sleep(1200);
  await sleep(1200);
  const { emotionText, emotionColor } = resolveEmotions(emotions);
  const idx = Math.floor(Math.random() * MOCK_IMAGES.length);
  const mock = MOCK_DATA[idx];
  return {
    imageUrl: MOCK_IMAGES[idx],
    category: mock.category,
    interpretation: mock.interpretation,
    emotionColor,
    timestamp: new Date().toISOString(),
    prompt: `mock, emotion: ${emotionText}, text: ${text.slice(0, 40)}`,
    mock: true,
  };
}

async function getMembership(openid) {
  if (!openid) return null;
  try {
    const res = await db.collection('memberships').doc(openid).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

function isPremiumActive(member) {
  if (!member || !member.premiumUntil) return false;
  return new Date(member.premiumUntil).getTime() > Date.now();
}

/**
 * 配额：会员无限 / 单次券 / 每日免费次数
 * usage 集合：docId = openid_YYYY-MM-DD，字段 count
 */
async function checkAndConsumeQuota(openid) {
  const member = await getMembership(openid);
  if (isPremiumActive(member)) {
    return { ok: true, mode: 'premium', credits: member.credits || 0, isPremium: true };
  }

  if (member && (member.credits || 0) > 0) {
    await db.collection('memberships').doc(openid).update({
      data: { credits: _.inc(-1), updatedAt: new Date() },
    });
    return {
      ok: true,
      mode: 'credit',
      credits: (member.credits || 1) - 1,
      isPremium: false,
    };
  }

  // 每日免费
  const day = new Date().toISOString().slice(0, 10);
  const usageId = `${openid}_${day}`;
  let count = 0;
  try {
    const u = await db.collection('usage').doc(usageId).get();
    count = (u.data && u.data.count) || 0;
  } catch (e) {
    count = 0;
  }

  if (count >= FREE_PER_DAY) {
    return {
      ok: false,
      code: 'QUOTA_EXCEEDED',
      error: '今日免费次数已用完，请升级会员或购买单次生成',
      isPremium: false,
      credits: (member && member.credits) || 0,
      remainingFree: 0,
    };
  }

  try {
    await db.collection('usage').doc(usageId).set({
      data: {
        openid,
        day,
        count: count + 1,
        updatedAt: new Date(),
      },
    });
  } catch (e) {
    await db.collection('usage').doc(usageId).update({
      data: { count: _.inc(1), updatedAt: new Date() },
    });
  }

  return {
    ok: true,
    mode: 'free',
    remainingFree: FREE_PER_DAY - count - 1,
    isPremium: false,
    credits: (member && member.credits) || 0,
  };
}

exports.main = async (event) => {
  const { text, emotions } = event || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID || '';

  if (!text || typeof text !== 'string' || !text.trim()) {
    return { error: '请描述你的瞬间', code: 'EMPTY_TEXT' };
  }

  const trimmed = text.trim();
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return {
      error: `描述请控制在 ${MAX_TEXT_LENGTH} 字以内`,
      code: 'TEXT_TOO_LONG',
    };
  }

  // 服务端配额（有 openid 时）
  let quota = { ok: true, mode: 'local', remainingFree: null };
  if (openid) {
    try {
      quota = await checkAndConsumeQuota(openid);
      if (!quota.ok) {
        return {
          error: quota.error,
          code: quota.code || 'QUOTA_EXCEEDED',
          isPremium: false,
          credits: quota.credits || 0,
          remainingFree: 0,
        };
      }
    } catch (quotaErr) {
      // 数据库未建集合时不阻断生成（兼容未初始化环境）
      console.warn('quota check skipped:', quotaErr.message);
    }
  }

  const emotionIds = normalizeEmotionIds(emotions);

  try {
    let result;
    if (USE_MOCK) {
      console.log('generate: using mock (missing API keys)');
      result = await mockGenerate(trimmed, emotionIds);
    } else {
      const analysis = await analyzeWithLLM(trimmed, emotionIds);
      const imageUrl = await generateImage(analysis, emotionIds);
      result = {
        imageUrl,
        category: analysis.category,
        interpretation: analysis.interpretation,
        emotionColor: analysis.emotionColor,
        timestamp: new Date().toISOString(),
        prompt: analysis.visualKeywords.join(', '),
      };
    }

    return {
      ...result,
      quotaMode: quota.mode,
      remainingFree: quota.remainingFree,
      isPremium: quota.isPremium || false,
      credits: quota.credits,
    };
  } catch (error) {
    console.error('Generation failed:', error);
    return {
      error: error.message || '生成失败',
      code: error.code || 'INTERNAL',
      detail: error.response?.data || undefined,
    };
  }
};

async function analyzeWithLLM(text, emotionIds) {
  const { emotionText, emotionColor } = resolveEmotions(emotionIds);

  const systemPrompt = `你是一个记忆分析师，也是诗人。用户会描述一个瞬间，你需要：
1. 决定最能代表这个瞬间的"记忆投射物"（从以下选一个方向：动物/植物/微生物/物体/星球），给出一个富有诗意的名字
2. 给出3-5个视觉关键词描述这个投射物的外观（用英文）
3. 给出构图建议（用英文）
4. 根据情绪选择一个主色调（hex color）
5. 写一段2-3句的"记忆解读"，用诗意的语言解释为什么这个瞬间被凝固为这个投射物

请以JSON格式返回：
{
  "category": "富有诗意的名字",
  "visualKeywords": ["keyword1", "keyword2"],
  "composition": "composition in English",
  "emotionColor": "#hexcolor",
  "interpretation": "2-3句中文解读"
}`;

  let response;
  try {
    response = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: TEXT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `用户描述的瞬间：${text}\n用户选择的情绪：${emotionText}`,
          },
        ],
        temperature: 0.85,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        timeout: 60000,
      }
    );
  } catch (err) {
    const e = new Error('记忆解读服务暂时不可用');
    e.code = 'LLM_FAIL';
    throw e;
  }

  const data = response.data;
  const content = data.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        category: parsed.category || '星尘鹿',
        visualKeywords: Array.isArray(parsed.visualKeywords)
          ? parsed.visualKeywords
          : ['starlight', 'mist'],
        composition: parsed.composition || 'centered, ethereal',
        emotionColor: parsed.emotionColor || emotionColor,
        interpretation:
          parsed.interpretation ||
          '你的瞬间被凝固为此，它代表着那些无法言说却真实存在的力量。',
      };
    } catch (parseErr) {
      console.error('JSON parse failed', parseErr);
    }
  }

  return {
    category: '星尘鹿',
    visualKeywords: ['starlight', 'mist'],
    composition: 'centered, ethereal',
    emotionColor,
    interpretation: '你的瞬间被凝固为一只星尘鹿，它代表着宁静中的力量。',
  };
}

async function generateImage(analysis, emotionIds) {
  const { emotionText } = resolveEmotions(emotionIds);
  const stylePrefix =
    'Surreal dreamlike illustration, dark background, warm amber lighting, ethereal glow, fine art quality, ';
  const emotionSuffix = `, atmosphere: ${emotionText}, mood: ${analysis.emotionColor}`;
  const prompt =
    stylePrefix +
    `A ${analysis.category} made of ${analysis.visualKeywords.join(' and ')}, ${analysis.composition}` +
    emotionSuffix;

  try {
    const response = await axios.post(
      `${SILICONFLOW_BASE_URL}/images/generations`,
      {
        model: IMAGE_MODEL,
        prompt,
        image_size: '1024x1024',
        num_inference_steps: 20,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
        },
        timeout: 120000,
      }
    );

    return response.data.images?.[0]?.url || '';
  } catch (err) {
    console.error('Image generation failed:', err.response?.data || err.message);
    return '';
  }
}
