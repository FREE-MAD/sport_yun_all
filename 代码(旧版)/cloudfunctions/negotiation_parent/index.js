const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-6gh7jgl8c5b16a83' });

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, orderId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: 401, msg: '未登录' }
  }

  console.log(`[negotiation_parent] Action: ${action}, OrderId: ${orderId}, Openid: ${openid}`)

  try {
    switch (action) {
      case 'join':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await joinOrder(orderId, openid, event.intention)
      
      case 'update_intent':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await updateIntention(orderId, openid, event.intention)
      
      case 'withdraw':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await withdrawOrder(orderId, openid)
        
      case 'can_lock':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await checkCanLock(orderId, openid)

      case 'list_othersparent':
        // 列出附近的拼团 (家长视角)
        return await listOthersParent(event, openid)

      default:
        return { code: 404, msg: '未知操作' }
    }
  } catch (err) {
    console.error('[negotiation_parent] Error:', err)
    return { code: 500, msg: '服务器错误', error: err }
  }
}

/**
 * 家长加入拼团
 */
async function joinOrder(orderId, openid, intention) {
  // 核心操作：atfirst_pddbox
  const collectionName = 'atfirst_pddbox'
  const orderRef = db.collection(collectionName).doc(orderId)
  const orderRes = await orderRef.get().catch(() => null)

  if (!orderRes) {
    return { code: 404, msg: '拼团订单不存在' }
  }

  const order = orderRes.data
  
  // 校验状态
  if (order.publish_state !== 'nearby_group') {
    return { code: 400, msg: '当前状态不可加入' }
  }

  // 校验时间 (截止后不可加入)
  const now = new Date();
  let deadlineTime = order.deadline_time ? new Date(order.deadline_time) : null;
  if (!deadlineTime && order.createdAt) {
      deadlineTime = new Date(new Date(order.createdAt).getTime() + 48 * 60 * 60 * 1000);
  }
  
  if (deadlineTime && now >= deadlineTime) {
      return { code: 400, msg: '拼团已截止' }
  }

  // 校验是否已加入
  const participants = order.participants || []
  const existingUserIndex = participants.findIndex(p => p.openid === openid)
  
  if (existingUserIndex !== -1) {
      const existingUser = participants[existingUserIndex];
      if (existingUser.parentStatus === '已加入') {
          return { code: 0, msg: '已加入' }
      }
      // 如果是已退出状态，允许重新加入
      if (existingUser.parentStatus === '已退出') {
          // 更新用户信息重新加入
          const user = await getUserInfo(openid)
          const nickname = user.nickname || '新用户'
          const i = intention || {}
          
          participants[existingUserIndex] = {
              ...existingUser,
              parentStatus: '已加入',
              joinedAt: new Date(),
              nickname: nickname,
              avatar: user.avatarUrl || '/images/icons/avatar.png',
              participant_Childcount: i.participant_count || i.childCount || 1,
              price_budget: i.price || i.budget || i.price_budget || '',
              intention: i
          };
          
          await orderRef.update({
              data: { participants: participants }
          })
          
          await sendSystemMessage(orderId, openid, `[系统通知] 欢迎 ${nickname} (家长) 加入群聊！`, user)
      return { code: 0, msg: '加入成功' }
      }
  }

  // 获取用户信息
  const user = await getUserInfo(openid)
  const nickname = user.nickname || '新用户'

  // 提取意向中的关键字段到 participants 顶层
  const i = intention || {}
  const participant_Childcount = i.participant_count || i.childCount || 1
  const price_budget = i.price || i.budget || i.price_budget || ''

  // 执行加入
  await orderRef.update({
    data: {
      participants: _.push({
        openid: openid,
        joinedAt: new Date(),
        status: 'joined',
        parentStatus: '已加入', // 新增字段
        nickname: nickname,
        avatar: user.avatarUrl || '/images/icons/avatar.png',
        participant_Childcount: participant_Childcount, // 用户要求字段
        price_budget: price_budget, // 用户要求字段
        intention: i
      })
    }
  })

  // 发送系统消息
  await sendSystemMessage(orderId, openid, `[系统通知] 欢迎 ${nickname} (家长) 加入群聊！`, user)

  return { code: 0, msg: '加入成功' }
}

/**
 * 更新意向
 */
async function updateIntention(orderId, openid, intention) {
  const collectionName = 'atfirst_pddbox'
  const orderRef = db.collection(collectionName).doc(orderId)
  const orderRes = await orderRef.get().catch(() => null)

  if (!orderRes) return { code: 404, msg: '订单不存在' }

  const order = orderRes.data
  const participants = order.participants || []
  const idx = participants.findIndex(p => p.openid === openid)

  const user = await getUserInfo(openid)

  // 校验时间 (截止后不可加入/更新)
  const now = new Date();
  let deadlineTime = order.deadline_time ? new Date(order.deadline_time) : null;
  if (!deadlineTime && order.createdAt) {
      deadlineTime = new Date(new Date(order.createdAt).getTime() + 48 * 60 * 60 * 1000);
  }
  
  if (deadlineTime && now >= deadlineTime) {
      return { code: 400, msg: '拼团已截止，无法操作' }
  }

  if (idx === -1) {
    // 如果未加入，自动加入
    const nickname = user.nickname || '新用户'
    const i = intention || {}
    const participant_Childcount = i.participant_count || i.childCount || 1
    const price_budget = i.price || i.budget || i.price_budget || ''

    await orderRef.update({
      data: {
        participants: _.push({
          openid: openid,
          joinedAt: new Date(),
          status: 'joined',
          parentStatus: '已加入',
          nickname: nickname,
          avatar: user.avatarUrl || '/images/icons/avatar.png',
          participant_Childcount: participant_Childcount,
          price_budget: price_budget,
          intention: i
        })
      }
    })
    await sendSystemMessage(orderId, openid, `用户 ${nickname} 加入并提交了意向`, user)
  } else {
    // 更新意向
    const i = intention || {}
    const participant_Childcount = i.participant_count || i.childCount || 1
    const price_budget = i.price || i.budget || i.price_budget || ''
    
    // 检查当前状态
    const currentStatus = participants[idx].parentStatus;
    const isRejoining = currentStatus === '已退出';

    // 尝试使用带 query 的 update
    try {
      const updateData = {
          'participants.$.intention': i,
          'participants.$.participant_Childcount': participant_Childcount,
          'participants.$.price_budget': price_budget,
          'participants.$.updatedAt': new Date()
      };

      if (isRejoining) {
          updateData['participants.$.parentStatus'] = '已加入';
          updateData['participants.$.joinedAt'] = new Date(); // 更新加入时间
      }

      await db.collection(collectionName).where({
        _id: orderId,
        'participants.openid': openid
      }).update({
        data: updateData
      })
      
      const msgAction = isRejoining ? '重新加入并更新了意向' : '更新了意向';
      await sendSystemMessage(orderId, openid, `用户 ${user.nickname || '用户'} ${msgAction}`, user)
    } catch (e) {
      console.error('更新意向失败', e)
      return { code: 500, msg: '更新失败' }
    }
  }

  return { code: 0, msg: '意向已保存' }
}

/**
 * 撤回意向 / 退出拼团
 */
async function withdrawOrder(orderId, openid) {
  const collectionName = 'atfirst_pddbox'
  const orderRef = db.collection(collectionName).doc(orderId)
  
  const orderRes = await orderRef.get().catch(() => null)
  if (!orderRes) return { code: 404, msg: '订单不存在' }
  
  const participants = orderRes.data.participants || []
  const userIndex = participants.findIndex(p => p.openid === openid)
  
  if (userIndex === -1 || participants[userIndex].parentStatus === '已退出') {
    return { code: 0, msg: '未加入，无需退出' }
  }
  
  // 更新状态为已退出
  participants[userIndex].parentStatus = '已退出';
  participants[userIndex].exitedAt = new Date();
  
  await orderRef.update({
    data: {
      participants: participants
    }
  })
  
  const user = await getUserInfo(openid)
  await sendSystemMessage(orderId, openid, `用户 ${user.nickname || '用户'} 退出了拼团`, user)
  
  return { code: 0, msg: '已退出拼团' }
}

/**
 * 判断是否可以锁班
 */
async function checkCanLock(orderId, openid) {
  const collectionName = 'atfirst_pddbox'
  const orderRes = await db.collection(collectionName).doc(orderId).get().catch(() => null)
  
  if (!orderRes) return { code: 404, msg: '订单不存在' }
  
  const order = orderRes.data
  const participants = order.participants || []
  
  // 简单的逻辑：例如至少2人
  // 或者根据 order.min_pdd_count
  const minCount = order.min_pdd_count || 2
  
  // 仅计算已加入的用户
  const activeParticipants = participants.filter(p => p.parentStatus === '已加入');
  const currentCount = activeParticipants.length
  
  const canLock = currentCount >= minCount
  
  return {
    code: 0,
    data: {
      canLock,
      currentCount,
      minCount,
      missing: Math.max(0, minCount - currentCount)
    }
  }
}

/**
 * 获取附近的拼团 (家长视角)
 */
async function listOthersParent({ userId, mode, limit = 20, page = 1 }, openid) {
  const collectionName = 'atfirst_pddbox'
  
  // 查询条件：状态为 nearby_group，排除自己发布的
  const query = _.and([
    { publish_state: 'nearby_group' },
    { publisher_Id: _.neq(userId) },
    { publisher_openid: _.neq(openid) }
  ])
  
  const skip = (page - 1) * limit
  
  const res = await db.collection(collectionName)
    .where(query)
    .orderBy('createdAt', 'desc')
    .skip(skip)
    .limit(limit)
    .get()
    
  return { code: 0, data: res.data }
}

// ================= 辅助函数 =================

async function getUserInfo(openid) {
  try {
    const res = await db.collection('users').where({ openid }).get()
    if (res.data.length > 0) return res.data[0]
  } catch (e) {}
  return { nickname: '微信用户', avatarUrl: '' }
}

async function sendSystemMessage(orderId, operatorOpenid, content, userInfo) {
  try {
    const user = userInfo || await getUserInfo(operatorOpenid)
    const robotInfo = {
      openid: 'ROBOT_DEFAULT_0',
      nickname: '聊天助手',
      avatar: '/images/icons/robot.png',
      role: 'robot'
    }

    // 系统消息统一由机器人发送
    const sysMsg = {
      senderOpenid: robotInfo.openid,
      sender: robotInfo.nickname,
      avatar: robotInfo.avatar,
      content: content,
      contentType: 'system',
      createdAt: new Date().getTime(),
      targetUserId: null
    }

    const chatCol = db.collection('Negotiation_groupchat')
    const chatRes = await chatCol.where({ chat_id: orderId }).get()

    if (chatRes.data.length > 0) {
      const docId = chatRes.data[0]._id
      
      // 确保用户在 chat_person 中
      let chatPerson = chatRes.data[0].chat_person || []
      let updateData = {
          chat_massage: _.push(sysMsg),
          updatedAt: new Date().getTime()
      }
      
      let needUpdatePerson = false

      // 强制更新机器人到第一位
      // 先过滤掉旧机器人
      const filteredPerson = chatPerson.filter(p => p.openid !== robotInfo.openid)
      // 如果长度变了，说明有旧机器人被移除，或者本来就没有
      if (filteredPerson.length !== chatPerson.length || !chatPerson.some(p => p.openid === robotInfo.openid)) {
          needUpdatePerson = true
      }
      // 插入新机器人到头部
      filteredPerson.unshift(robotInfo)
      chatPerson = filteredPerson
      // 这里的 chatPerson 现在一定是 [Robot, ...Users]
      // 实际上我们总是更新了机器人位置，所以 needUpdatePerson 可以设为 true，除非我们想深度比较
      // 为了简单和确保正确性，如果机器人不是在 index 0，我们就更新
      // 但上面的逻辑已经重构了数组，所以直接标记需要更新
      needUpdatePerson = true

      // 检查当前用户
      if (operatorOpenid && !chatPerson.some(p => p.openid === operatorOpenid)) {
          chatPerson.push({
              openid: operatorOpenid,
              nickname: user.nickname,
              avatar: user.avatarUrl
          })
          needUpdatePerson = true
      }
      
      if (needUpdatePerson) {
          updateData.chat_person = chatPerson
      }
      
      await chatCol.doc(docId).update({ data: updateData })
    } else {
      // 创建新会话
      const initialPerson = [robotInfo]
      if (operatorOpenid) {
          initialPerson.push({
             openid: operatorOpenid,
             nickname: user.nickname,
             avatar: user.avatarUrl,
             joinTime: new Date().getTime(),
             role: 'parent'
          })
      }

      await chatCol.add({
        data: {
          chat_id: orderId,
          chat_person: initialPerson,
          chat_massage: [sysMsg],
          createdAt: new Date().getTime(),
          updatedAt: new Date().getTime()
        }
      })
    }
  } catch (e) {
    console.warn('[negotiation_parent] 发送系统消息失败', e)
  }
}
