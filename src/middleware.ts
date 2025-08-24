// src/middleware.ts
import { Context, Session } from 'koishi'
import { SAT } from './index'
import { MiddlewareConfig, FavorabilityConfig } from './types'
import { processPrompt } from './utils'
import { getUser } from './database'

export function createMiddleware(ctx: Context, sat: SAT, config: MiddlewareConfig & FavorabilityConfig) {
  return async (session: Session, next: () => Promise<void>) => {
    // 這個中介軟體現在只關心是否要觸發 AI 回覆。

    // 隨機回覆邏輯
    const isPrivate = session.isDirect;
    if (config.randnum > 0 && !isPrivate && Math.random() < config.randnum && session.content.length > config.random_min_tokens) {
      return sat.handleRandomMiddleware(session, session.content);
    }

    // 暱稱觸發邏輯
    if (config.nick_name && !isPrivate) {
      const user = await getUser(ctx, session.userId)
      const nickName = user.items['情侶合照']?.metadata?.userNickName || ''
      const nickNameList = [...config.nick_name_list]
      if (nickName) nickNameList.push(nickName)
      
      const prompt = processPrompt(session.content);
      const isAt = session.elements.some(e => e.type === 'at' && e.attrs.id === session.bot.selfId);
      const hasNick = nickNameList.some(name => prompt.includes(name));

      if ((isAt || hasNick) && !config.nick_name_block_words.some(word => prompt.includes(word))) {
        return sat.handleNickNameMiddleware(session, prompt);
      }
    }

    // 私聊邏輯
    if (config.private && isPrivate) {
      const prompt = processPrompt(session.content);
      return sat.handleNickNameMiddleware(session, prompt);
    }

    // 如果以上條件都不滿足，則交給下一個中介軟體或指令處理
    return next();
  }
}