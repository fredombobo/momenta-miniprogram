// 云函数：generate
// 调用 DeepSeek + SiliconFlow API 生成记忆投射物

const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// API 配置（生产环境应从环境变量读取）
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const TEXT_MODEL = 'deepseek-v4-flash';
const IMAGE_MODEL = 'Qwen/Qwen-Image';

const EMOTIONS_MAP = {
  '平静': '#7EB8C9', '喜悦': '#C9A55C', '感动': '#D4A0B8', '幸福': '#E8A87C',
  '感恩': '#A8C686', '热烈': '#C9544D', '兴奋': '#E8744F', '激动': '#D4634B',
  '骄傲': '#D4A04A', '孤独': '#5B6B8C', '哀伤': '#6B7B8D', '迷茫': '#9B8EC9',
  '失落': '#7A8B9A', '释然': '#8CB88C', '窘迫': '#B8856B', '尴尬': '#A89070',
  '崩溃': '#5A4A6B', '怀念': '#8FA4B8', '百感交集': '#9A8AA0', '敬畏': '#4A6B8A',
};

exports.main = async (event, context) => {
  const { text, emotions } = event;

  if (!text || !text.trim()) {
    return { error: '请描述你的瞬间' };
  }

  try {
    // Step 1: DeepSeek 分析
    const analysis = await analyzeWithLLM(text.trim(), emotions);

    // Step 2: SiliconFlow 生成图片
    const imageUrl = await generateImage(analysis, emotions);

    return {
      imageUrl,
      category: analysis.category,
      interpretation: analysis.interpretation,
      emotionColor: analysis.emotionColor,
      timestamp: new Date().toISOString(),
      prompt: analysis.visualKeywords.join(', '),
    };
  } catch (error) {
    console.error('Generation failed:', error);
    return { error: '生成失败', detail: error.message };
  }
};

async function analyzeWithLLM(text, emotions) {
  const emotionText = (emotions && emotions.length > 0) ? emotions.join('、') : '平静';

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

  const response = await axios.post(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    model: TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `用户描述的瞬间：${text}\n用户选择的情绪：${emotionText}` },
    ],
    temperature: 0.85,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
  });

  const data = response.data;
  const content = data.choices?.[0]?.message?.content || '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: parsed.category || '星尘鹿',
      visualKeywords: parsed.visualKeywords || ['starlight', 'mist'],
      composition: parsed.composition || 'centered, ethereal',
      emotionColor: parsed.emotionColor || '#C9A55C',
      interpretation: parsed.interpretation || '你的瞬间被凝固为此，它代表着那些无法言说却真实存在的力量。',
    };
  }

  return {
    category: '星尘鹿',
    visualKeywords: ['starlight', 'mist'],
    composition: 'centered, ethereal',
    emotionColor: '#C9A55C',
    interpretation: '你的瞬间被凝固为一只星尘鹿，它代表着宁静中的力量。',
  };
}

async function generateImage(analysis, emotions) {
  const emotionText = (emotions && emotions.length > 0) ? emotions.join('、') : '平静';
  const stylePrefix = 'Surreal dreamlike illustration, dark background, warm amber lighting, ethereal glow, fine art quality, ';
  const emotionSuffix = `, atmosphere: ${emotionText}, mood: ${analysis.emotionColor}`;
  const prompt = stylePrefix + `A ${analysis.category} made of ${analysis.visualKeywords.join(' and ')}, ${analysis.composition}` + emotionSuffix;

  const response = await axios.post(`${SILICONFLOW_BASE_URL}/images/generations`, {
    model: IMAGE_MODEL,
    prompt,
    image_size: '1024x1024',
    num_inference_steps: 20,
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
    },
  });

  const data = response.data;
  return data.images?.[0]?.url || '';
}
