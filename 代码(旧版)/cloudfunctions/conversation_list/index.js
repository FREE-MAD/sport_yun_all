const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-6gh7jgl8c5b16a83' })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { userId } = event
  const { OPENID } = cloud.getWXContext()
  const userOpenid = OPENID
  
  console.log('进行会话 userid 检查:', userId)

  if (!userId) {
    return { code: 400, msg: 'userId 缺失' }
  }

  /* 直接查询 Negotiation_groupchat 数据库 */
  console.log('[conversation_list] 开始查询 Negotiation_groupchat, userOpenid:', userOpenid)

  try {
    const res = await db.collection('Negotiation_groupchat')
      .where({
        'chat_person.openid': userOpenid
      })
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get()

    const conversations = res.data.map(doc => {
      // 提取最后一条消息
      const msgs = doc.chat_massage || []
      const lastMsgObj = msgs.length > 0 ? msgs[msgs.length - 1] : {}
      
      // 确定显示的名称和头像 (排除自己和机器人，除非只有机器人)
      // 机器人ID假设为 ROBOT_DEFAULT_0
      const allOthers = (doc.chat_person || []).filter(p => p.openid !== userOpenid);
      const realHumans = allOthers.filter(p => p.openid !== 'ROBOT_DEFAULT_0');
      
      const target = realHumans.length > 0 ? realHumans[0] : (allOthers.length > 0 ? allOthers[0] : { nickname: '未知用户', avatar: '' });
      
      // 如果是群聊(多人)，名字可以特殊处理
      let displayName = target.nickname || '用户'
      if (realHumans.length > 1) {
          displayName = realHumans.map(p => p.nickname).slice(0, 3).join(', ') + (realHumans.length > 3 ? '...' : '')
      } else if (realHumans.length === 0 && allOthers.some(p => p.openid === 'ROBOT_DEFAULT_0')) {
          displayName = '聊天助手'
      }

      // 格式化时间为北京时间
      const rawTime = lastMsgObj.createdAt || doc.updatedAt;
      let timeStr = '';
      if (rawTime) {
          const date = new Date(rawTime);
          // 增加8小时
          const offset = 8;
          const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
          const beijingDate = new Date(utc + (3600000 * offset));
          
          const M = (beijingDate.getMonth() + 1).toString().padStart(2, '0');
          const D = beijingDate.getDate().toString().padStart(2, '0');
          const h = beijingDate.getHours().toString().padStart(2, '0');
          const m = beijingDate.getMinutes().toString().padStart(2, '0');
          timeStr = `${M}月${D}日 ${h}:${m}`;
      }

      return {
        conversationId: doc.chat_id, // 使用 chat_id 作为会话ID
        type: 'group', // 明确标识为群聊类型
        targetUserId: '', // 统一不返回特定 targetUserId，由前端根据 conversationId 处理
        name: displayName,
        avatar: target.avatar || '/images/icons/avatar.png',
        lastMsg: lastMsgObj.content || '暂无消息',
        time: timeStr || rawTime, // 返回格式化后的时间字符串
        rawTime: rawTime, // 保留原始时间戳备用
        unreadCount: 0 // 暂未实现未读计数
      }
    })

    console.log(`[conversation_list] 返回会话列表: ${conversations.length} 条`)
    
    return {
      code: 0,
      data: conversations
    }

  } catch (err) {
    console.error('[conversation_list] 查询失败:', err)
    return { code: 500, msg: '查询失败', error: err }
  }
}
