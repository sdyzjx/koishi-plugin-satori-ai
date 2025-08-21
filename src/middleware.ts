// src/middleware.ts
import { Context, Session, Next, Logger } from 'koishi'
import { } from '@koishijs/censor'
import { SAT } from './index'
import { FavorabilityConfig, MiddlewareConfig } from './types'
import { ensureUserExists } from './database'

const logger = new Logger('satori-ai-middleware')

export function createMiddleware(
  ctx: Context,
  sat: SAT,
  config: MiddlewareConfig & FavorabilityConfig,
) {
  return async (session: Session, next: Next) => {
    if (config.enable_favorability && config.enable_warning && session.channelId === config.warning_group)
      sat.getWarningList(session)
    await sat.broadcastManager.seedBroadcast(session)
    if (!isSpecialMessage(session)) await sat.handleChannelMemoryManager(session)

    // 私信处理
    if (config.private && isPrivateSession(session)) {
      return await handlePrivateMessage(sat, session)
    }

    // 昵称处理
    if (config.nick_name && await hasNickName(ctx, session, config)) {
      return await handleNickNameMessage(sat, session)
    }

    // 自动回复处理
    if (await shouldAutoReply(sat, session, config)) {
      return await sat.handleAutoReplyMiddleware(session, session.content)
    }

    return next()
  }
}

// 私聊会话判断
function isPrivateSession(session: Session): boolean {
  if (isSpecialMessage(session)) return false
  return session.subtype === 'private' || session.channelId.includes('private')
}

// 处理私聊消息
async function handlePrivateMessage(SAT: SAT, session: Session) {
  const content = session.content.trim()
  if (content) return await SAT.handleNickNameMiddleware(session, content)
}

// 昵称判断
async function hasNickName(ctx: Context, session: Session, config: MiddlewareConfig): Promise<boolean> {
  if (session.userId === session.selfId) return false
  if (config.nick_name_block_words.some(word => session.content.includes(word))) return false
  const user = await ensureUserExists(ctx, session.userId, session.username)
  let names = config.nick_name_list
  if (user?.items?.['情侣合照']?.metadata?.botNickName){
    names = names.concat(user.items['情侣合照'].metadata.botNickName)
  }
  return names.some(name => session.content.includes(name))
}

// 处理昵称消息
async function handleNickNameMessage(SAT: SAT, session: Session) {
  const content = session.content.trim()
  if (content) return await SAT.handleNickNameMiddleware(session, content)
}

// 自动回复前置判断
async function shouldAutoReply(
  sat: SAT,
  session: Session,
  config: MiddlewareConfig
): Promise<boolean> {
  // 如果未开启功能、是特殊消息或超出token限制，则直接跳过
  if (!config.enable_auto_reply || isSpecialMessage(session) || session.content.length > config.max_tokens) {
    return false
  }

  // 交给核心函数使用 LLM 判断
  return await sat.shouldReplyToChannelMessage(session);
}

// 特殊消息类型判断
function isSpecialMessage(session: Session): boolean {
  const firstElement = session.elements[0]
  return ['at', 'file'].includes(firstElement?.type) || session.content.includes(':poke') || session.content.includes('file://') || session.content.includes('http://') || session.content.includes('https://')
}