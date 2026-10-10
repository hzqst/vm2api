import type { ComponentType } from 'react'
// 按变体深导入：根入口每个图标会挂上 Avatar/Combine（依赖 @lobehub/ui + antd-style），
// 打包器摇不掉，日志页因此多拉 1.2MB。
import Ai21BrandColor from '@lobehub/icons/es/Ai21/components/BrandColor'
import Ai360Color from '@lobehub/icons/es/Ai360/components/Color'
import AlephAlpha from '@lobehub/icons/es/AlephAlpha/components/Mono'
import AlibabaColor from '@lobehub/icons/es/Alibaba/components/Color'
import AntGroupColor from '@lobehub/icons/es/AntGroup/components/Color'
import ArceeColor from '@lobehub/icons/es/Arcee/components/Color'
import AssemblyAIColor from '@lobehub/icons/es/AssemblyAI/components/Color'
import AwsColor from '@lobehub/icons/es/Aws/components/Color'
import AzureColor from '@lobehub/icons/es/Azure/components/Color'
import BAAI from '@lobehub/icons/es/BAAI/components/Mono'
import BaichuanColor from '@lobehub/icons/es/Baichuan/components/Color'
import BaiduColor from '@lobehub/icons/es/Baidu/components/Color'
import BedrockColor from '@lobehub/icons/es/Bedrock/components/Color'
import Bfl from '@lobehub/icons/es/Bfl/components/Mono'
import ByteDanceColor from '@lobehub/icons/es/ByteDance/components/Color'
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color'
import CohereColor from '@lobehub/icons/es/Cohere/components/Color'
import CoquiColor from '@lobehub/icons/es/Coqui/components/Color'
import DbrxColor from '@lobehub/icons/es/Dbrx/components/Color'
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color'
import ElevenLabs from '@lobehub/icons/es/ElevenLabs/components/Mono'
import EssentialAIColor from '@lobehub/icons/es/EssentialAI/components/Color'
import FireworksColor from '@lobehub/icons/es/Fireworks/components/Color'
import FishAudio from '@lobehub/icons/es/FishAudio/components/Mono'
import GoogleColor from '@lobehub/icons/es/Google/components/Color'
import Grok from '@lobehub/icons/es/Grok/components/Mono'
import Groq from '@lobehub/icons/es/Groq/components/Mono'
import Haiper from '@lobehub/icons/es/Haiper/components/Mono'
import Hedra from '@lobehub/icons/es/Hedra/components/Mono'
import IBM from '@lobehub/icons/es/IBM/components/Mono'
import Ideogram from '@lobehub/icons/es/Ideogram/components/Mono'
import Inception from '@lobehub/icons/es/Inception/components/Mono'
import Inflection from '@lobehub/icons/es/Inflection/components/Mono'
import InternLMColor from '@lobehub/icons/es/InternLM/components/Color'
import Jina from '@lobehub/icons/es/Jina/components/Mono'
import KlingColor from '@lobehub/icons/es/Kling/components/Color'
import KwaipilotColor from '@lobehub/icons/es/Kwaipilot/components/Color'
import LLaVAColor from '@lobehub/icons/es/LLaVA/components/Color'
import Liquid from '@lobehub/icons/es/Liquid/components/Mono'
import LongCatColor from '@lobehub/icons/es/LongCat/components/Color'
import LumaColor from '@lobehub/icons/es/Luma/components/Color'
import MetaColor from '@lobehub/icons/es/Meta/components/Color'
import MicrosoftColor from '@lobehub/icons/es/Microsoft/components/Color'
import Midjourney from '@lobehub/icons/es/Midjourney/components/Mono'
import MinimaxColor from '@lobehub/icons/es/Minimax/components/Color'
import MistralColor from '@lobehub/icons/es/Mistral/components/Color'
import Moonshot from '@lobehub/icons/es/Moonshot/components/Mono'
import MorphColor from '@lobehub/icons/es/Morph/components/Color'
import MyShellColor from '@lobehub/icons/es/MyShell/components/Color'
import NousResearch from '@lobehub/icons/es/NousResearch/components/Mono'
import NovelAI from '@lobehub/icons/es/NovelAI/components/Mono'
import NvidiaColor from '@lobehub/icons/es/Nvidia/components/Color'
import Ollama from '@lobehub/icons/es/Ollama/components/Mono'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'
import OpenChatColor from '@lobehub/icons/es/OpenChat/components/Color'
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Mono'
import PerplexityColor from '@lobehub/icons/es/Perplexity/components/Color'
import Pika from '@lobehub/icons/es/Pika/components/Mono'
import PixVerseColor from '@lobehub/icons/es/PixVerse/components/Color'
import QwenColor from '@lobehub/icons/es/Qwen/components/Color'
import Recraft from '@lobehub/icons/es/Recraft/components/Mono'
import Runway from '@lobehub/icons/es/Runway/components/Mono'
import RwkvColor from '@lobehub/icons/es/Rwkv/components/Color'
import SenseNovaColor from '@lobehub/icons/es/SenseNova/components/Color'
import SkyworkColor from '@lobehub/icons/es/Skywork/components/Color'
import SparkColor from '@lobehub/icons/es/Spark/components/Color'
import StabilityColor from '@lobehub/icons/es/Stability/components/Color'
import Stepfun from '@lobehub/icons/es/Stepfun/components/Mono'
import Suno from '@lobehub/icons/es/Suno/components/Mono'
import TIIColor from '@lobehub/icons/es/TII/components/Color'
import TencentColor from '@lobehub/icons/es/Tencent/components/Color'
import TogetherColor from '@lobehub/icons/es/Together/components/Color'
import TripoColor from '@lobehub/icons/es/Tripo/components/Color'
import UpstageColor from '@lobehub/icons/es/Upstage/components/Color'
import ViduColor from '@lobehub/icons/es/Vidu/components/Color'
import VoyageColor from '@lobehub/icons/es/Voyage/components/Color'
import XuanyuanColor from '@lobehub/icons/es/Xuanyuan/components/Color'
import Yandex from '@lobehub/icons/es/Yandex/components/Mono'
import YiColor from '@lobehub/icons/es/Yi/components/Color'
import ZhipuColor from '@lobehub/icons/es/Zhipu/components/Color'
import { resolveByDashPrefix } from './dash-prefix-lookup'
import {
  iconFileForVendor,
  type VendorIconFileEntry,
} from './vendor-icon-files'

export type VendorIconComponent = ComponentType<{ className?: string }>

/**
 * vendor/provider slug -> 本地打包的品牌图标组件(离线可用)。
 * 未覆盖的 slug 由 vendor-icon-files 的本地静态 SVG（public/model-icons）与
 * monogram 逐级兜底,视觉与云端价格表 providers 字典下发的 icon 一致。
 */
const VENDOR_ICON_COMPONENTS: Record<string, VendorIconComponent> = {
  // 主力厂商(与云端价格表 vendor slug 对齐)
  anthropic: ClaudeColor,
  openai: OpenAI,
  google: GoogleColor,
  meta: MetaColor,
  deepseek: DeepSeekColor,
  alibaba: AlibabaColor,
  qwen: QwenColor,
  mistral: MistralColor,
  xai: Grok,
  cohere: CohereColor,
  ai21: Ai21BrandColor,
  moonshotai: Moonshot,
  zhipuai: ZhipuColor,
  minimax: MinimaxColor,
  perplexity: PerplexityColor,
  stepfun: Stepfun,
  baidu: BaiduColor,
  tencent: TencentColor,
  bytedance: ByteDanceColor,
  '01-ai': YiColor,
  nvidia: NvidiaColor,
  ibm: IBM,
  liquid: Liquid,
  amazon: AwsColor,
  inception: Inception,
  morph: MorphColor,
  '360': Ai360Color,
  microsoft: MicrosoftColor,
  iflytek: SparkColor,
  tii: TIIColor,
  jina: Jina,
  voyage: VoyageColor,
  baai: BAAI,
  bfl: Bfl,
  kling: KlingColor,
  recraft: Recraft,
  longcat: LongCatColor,
  // LobeHub 品牌兜底集
  alephalpha: AlephAlpha,
  antgroup: AntGroupColor,
  arcee: ArceeColor,
  assemblyai: AssemblyAIColor,
  baichuan: BaichuanColor,
  coqui: CoquiColor,
  databricks: DbrxColor,
  elevenlabs: ElevenLabs,
  essentialai: EssentialAIColor,
  fishaudio: FishAudio,
  haiper: Haiper,
  hedra: Hedra,
  ideogram: Ideogram,
  inflection: Inflection,
  internlm: InternLMColor,
  kwaipilot: KwaipilotColor,
  llava: LLaVAColor,
  luma: LumaColor,
  midjourney: Midjourney,
  myshell: MyShellColor,
  nousresearch: NousResearch,
  novelai: NovelAI,
  openchat: OpenChatColor,
  pika: Pika,
  pixverse: PixVerseColor,
  runway: Runway,
  rwkv: RwkvColor,
  sensenova: SenseNovaColor,
  skywork: SkyworkColor,
  stability: StabilityColor,
  suno: Suno,
  tripo: TripoColor,
  upstage: UpstageColor,
  vidu: ViduColor,
  xuanyuan: XuanyuanColor,
  yandex: Yandex,
  // 常见 provider 渠道(供应商价格对比等场景)
  openrouter: OpenRouter,
  groq: Groq,
  azure: AzureColor,
  together: TogetherColor,
  'together-ai': TogetherColor,
  fireworks: FireworksColor,
  'fireworks-ai': FireworksColor,
  ollama: Ollama,
  bedrock: BedrockColor,
  'amazon-bedrock': BedrockColor,
  'google-vertex': GoogleColor,
}

/** slug 精确命中 -> 最长 dash 前缀家族回退(与 SVG 映射规则一致) */
export function getVendorIconComponent(
  slug: string
): VendorIconComponent | null {
  return resolveByDashPrefix(slug, VENDOR_ICON_COMPONENTS)
}

export interface ModelVendorEntry {
  vendor: string
  /** 本地打包的图标组件(可能为空,走静态 SVG/monogram 兜底) */
  icon: VendorIconComponent | null
  /** public/model-icons 下的静态 SVG */
  iconFile: VendorIconFileEntry | null
}

/** 按 vendor slug 组装图标条目 */
export function getVendorEntry(vendor: string): ModelVendorEntry {
  return {
    vendor,
    icon: getVendorIconComponent(vendor),
    iconFile: iconFileForVendor(vendor),
  }
}
