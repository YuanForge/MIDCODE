import type { CreationMode } from './constants'

export type PromptItem = { text: string; category: string }
export type TagBlock = { group: string; tags: string[] }

/** 灵感广场展示项：含类型、预览渐变、题材、热度 */
export type GalleryItem = {
  id: string
  type: CreationMode
  category: string
  text: string
  gradient: string
  hot?: boolean
  likes?: string
}

export const PROMPT_LIBRARY: Record<CreationMode, PromptItem[]> = {
  image: [
    { category: '人像写真', text: '一位身着米白色针织衫的东方女性，柔和窗边自然光，浅景深，胶片质感，35mm 镜头' },
    { category: '人像写真', text: '复古港风男士肖像，霓虹灯光下的侧脸轮廓，电影感色调，颗粒感，强烈明暗对比' },
    { category: '风景意境', text: '清晨薄雾中的桂林漓江，水墨意境，远山层叠，渔舟唱晚，国画留白构图' },
    { category: '风景意境', text: '北欧极光下的雪山木屋，星空倒映在湖面，超广角，冷暖对比，4K 细节' },
    { category: '概念设计', text: '赛博朋克未来城市夜景，霓虹反射在湿润街道，飞行器穿梭，电影级光效' },
    { category: '概念设计', text: '悬浮在云端的机械神殿，蒸汽朋克风格，齿轮与黄铜质感，史诗氛围' },
    { category: '商业产品', text: '悬浮在大理石台面上的香水瓶，柔和影棚布光，水珠飞溅，商业摄影，8K' },
    { category: '国风插画', text: '工笔重彩的仙鹤与古松，金箔背景，传统祥云纹样，故宫文创风格' },
  ],
  video: [
    { category: '人物运镜', text: '镜头缓缓推进，少女回眸一笑，发丝随风轻扬，背景虚化的樱花飘落' },
    { category: '人物运镜', text: '舞者在空旷舞台旋转，裙摆飞扬，环绕镜头跟随，逆光剪影，慢动作' },
    { category: '自然航拍', text: '航拍俯瞰云海翻涌，日出金光穿透云层，镜头平稳横移，史诗级氛围' },
    { category: '自然航拍', text: '无人机贴海面飞行掠过海浪，溅起水花，速度感，黄昏暖色调' },
    { category: '产品演绎', text: '化妆品瓶身 360 度环绕旋转，影棚布光，金属反光流动，质感特写' },
    { category: '产品演绎', text: '新能源汽车在盘山公路行驶，跟随镜头，光影掠过车身，电影预告片质感' },
    { category: '氛围场景', text: '雨夜咖啡馆窗边，雨滴顺玻璃滑落，暖黄灯光，镜头缓慢拉远，治愈氛围' },
    { category: '氛围场景', text: '森林清晨光束穿过树叶，尘埃漂浮，镜头缓慢上摇，宁静神秘' },
  ],
}

export const TAG_BLOCKS: Record<CreationMode, TagBlock[]> = {
  image: [
    { group: '风格', tags: ['电影感', '胶片质感', '3D 渲染', '国风工笔', '赛博朋克', '极简', '水彩'] },
    { group: '光线', tags: ['柔和自然光', '逆光剪影', '霓虹光效', '影棚布光', '黄昏暖调', '丁达尔光束'] },
    { group: '镜头', tags: ['35mm', '微距特写', '超广角', '浅景深', '俯拍', '对称构图'] },
    { group: '画质', tags: ['8K 超清', '高细节', 'HDR', '锐利对焦'] },
  ],
  video: [
    { group: '运镜', tags: ['镜头推进', '环绕跟随', '平稳横移', '上摇', '航拍俯瞰', '手持跟拍'] },
    { group: '节奏', tags: ['慢动作', '延时摄影', '快速剪辑', '一镜到底'] },
    { group: '光线', tags: ['逆光', '霓虹夜景', '暖黄灯光', '日出金光'] },
    { group: '质感', tags: ['电影预告片', '治愈氛围', '史诗感', '纪录片质感'] },
  ],
}

const G = [
  'linear-gradient(135deg,#1f3a5f,#4a90c2)',
  'linear-gradient(140deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#41295a,#7b2ff7)',
  'linear-gradient(135deg,#134e5e,#71b280)',
  'linear-gradient(135deg,#3a1c71,#d76d77 60%,#ffaf7b)',
  'linear-gradient(135deg,#203a43,#2c5364,#4a6f8a)',
  'linear-gradient(135deg,#42275a,#a06b8f)',
  'linear-gradient(135deg,#1d4350,#a43931)',
]

/** 灵感广场展示数据（静态，后续可替换为后端接口）。 */
export const GALLERY_ITEMS: GalleryItem[] = [
  ...PROMPT_LIBRARY.image.map((it, i) => ({
    id: `img-${i}`, type: 'image' as const, category: it.category, text: it.text,
    gradient: G[i % G.length], hot: i % 3 === 0, likes: `${(i + 7) * 137}`,
  })),
  ...PROMPT_LIBRARY.video.map((it, i) => ({
    id: `vid-${i}`, type: 'video' as const, category: it.category, text: it.text,
    gradient: G[(i + 2) % G.length], hot: i % 4 === 0, likes: `${(i + 5) * 211}`,
  })),
]

export function appendToPrompt(current: string, addition: string) {
  if (!current.trim()) return addition
  return current.trim().replace(/[，,。]$/, '') + '，' + addition
}
