// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, orderId, conversationId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  if (!openid) {
    return { code: 401, msg: '未登录' }
  }

  console.log(`[pdd_manage] 收到请求: 动作=${action}, 订单ID=${orderId}, Openid=${openid}`)

  try {
    switch (action) {
      // === 拼团协商阶段业务 (atfirst_pddbox) ===
      case 'get_detail':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await getDetail(orderId, openid)
      case 'join':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await joinOrder(orderId, openid, event.intention)
      case 'update_intention':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await updateIntention(orderId, openid, event.intention)

      case 'submit_plan':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await submitPlan(orderId, openid, event.plan)

      case 'vote_plan':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await votePlan(orderId, openid, event.agree)
      
      case 'list':
      case 'list_othersparent':
        return await listOrders(event, openid)

      default:
        console.warn(`[pdd_manage] 未知操作: ${action}`)
        return { code: 404, msg: '未知操作或非本函数职责' }
    }
  } catch (err) {
    console.error('[pdd_manage] 服务器错误:', err)
    return { code: 500, msg: '服务器错误', error: err }
  }
}

/**
 * 获取详情 (拼团协商阶段)
 * 优先查询 atfirst_pddbox (拼团), 其次 atfirst_req (单人)
 */
async function getDetail(orderId, openid) {
  console.log(`[pdd_manage] [getDetail] 开始获取详情. OrderId: ${orderId}`)
  
  let collectionName = 'atfirst_pddbox'
  let orderRes = await db.collection(collectionName).doc(orderId).get().catch(() => null)
  
  if (!orderRes) {
    console.log('[pdd_manage] atfirst_pddbox 未找到, 尝试查询 atfirst_req...')
    collectionName = 'atfirst_req'
    orderRes = await db.collection(collectionName).doc(orderId).get().catch(() => null)
  }

  if (!orderRes) {
    console.log('[pdd_manage] 未找到订单 (可能已进入下一阶段)')
    return { code: 404, msg: '订单不存在或已进入下一阶段(请尝试order_manage)' }
  }

  const order = orderRes.data
  console.log(`[pdd_manage] [getDetail] 找到订单, 集合: ${collectionName}`)

  // 3. 判断用户状态
  let userState = 'not_joined'
  const participants = order.participants || []
  const myParticipant = participants.find(p => p.openid === openid)

  if (myParticipant) {
    if (order.publish_state === 'nearby_group' || order.publish_state === 'public_view') {
      userState = 'joined'
    } else if (order.publish_state === 'locked_pre') {
       // 理论上 locked_pre 应该在 final_* 集合，但为了兼容过渡期
       userState = 'locked_pre'
    }
  }

  // 格式化数据
  const formattedOrder = {
    title: order.title || '拼团课程',
    intention: order.intention || '无',
    status: mapStatusText(order.publish_state),
    location: order.address || order.location || '待定',
    deadline: order.deadline || '待定',
    price: order.price ? `${order.price}元` : '待协商',
    ...order
  }

  return {
    code: 0,
    data: {
      order: formattedOrder,
      userState: userState,
      isOwner: order._openid === openid,
      collection: collectionName // 返回所在集合，方便调试
    }
  }
}

function mapStatusText(state) {
  const map = {
    'draft': '草稿',
    'public_view': '招生中',
    'nearby_group': '拼团中',
    'direct_invite': '邀请中',
    'locked_pre': '确认中',
    'locked_post': '已成团',
    'closed': '已关闭'
  }
  return map[state] || '未知'
}

/**
 * 加入拼团 (仅限 atfirst_pddbox)
 */
async function joinOrder(orderId, openid, intention) {
  let collectionName = 'atfirst_pddbox'
  let orderRes = await db.collection(collectionName).doc(orderId).get().catch(() => null)

  if (!orderRes) {
    collectionName = 'atfirst_req'
    orderRes = await db.collection(collectionName).doc(orderId).get().catch(() => null)
  }

  if (!orderRes) {
     return { code: 404, msg: '订单不存在' }
  }

  const orderRef = db.collection(collectionName).doc(orderId)
  
  try {
    const order = orderRes.data

    if (order.publish_state !== 'nearby_group') {
      return { code: 400, msg: '当前状态不可加入' }
    }

    const participants = order.participants || []
    if (participants.find(p => p.openid === openid)) {
      return { code: 0, msg: '已加入' }
    }

    const user = await getUserInfo(openid)
    const nickname = user.nickname || '新用户'

    await orderRef.update({
      data: {
        participants: _.push({
          openid: openid,
          joinedAt: new Date(),
          status: 'joined',
          nickname: nickname,
          avatar: user.avatarUrl || '/images/icons/avatar.png',
          intention: intention || {}
        }),
        'Task status that is easy to understand and refine': 'Collect individual intentions and enter negotiations'
      }
    })

    // 写入 Negotiation_groupchat 消息 (使用 chat_massage 数组模式)
    const msgContent = `用户 ${nickname} 加入了拼团`
    const sysMsg = {
        senderOpenid: openid,
        sender: nickname,
        avatar: user.avatarUrl || '/images/icons/avatar.png',
        content: msgContent,
        contentType: 'system',
        createdAt: new Date().getTime(),
        targetUserId: null
    }

    try {
        const chatCol = db.collection('Negotiation_groupchat')
        const chatRes = await chatCol.where({ chat_id: orderId }).get()
        
        if (chatRes.data.length > 0) {
            // 更新现有文档
            const docId = chatRes.data[0]._id
            const chatPerson = chatRes.data[0].chat_person || []
            let updateData = {
                chat_massage: _.push(sysMsg),
                updatedAt: new Date().getTime()
            }
            // 确保用户在 chat_person 中
            if (!chatPerson.some(p => p.openid === openid)) {
                updateData.chat_person = _.push({
                    openid: openid,
                    nickname: nickname,
                    avatar: user.avatarUrl || '/images/icons/avatar.png'
                })
            }
            await chatCol.doc(docId).update({ data: updateData })
        } else {
            // 创建新文档
            await chatCol.add({
                data: {
                    chat_id: orderId,
                    chat_person: [{
                        openid: openid,
                        nickname: nickname,
                        avatar: user.avatarUrl || '/images/icons/avatar.png'
                    }],
                    chat_massage: [sysMsg],
                    createdAt: new Date().getTime(),
                    updatedAt: new Date().getTime()
                }
            })
        }
    } catch(err) {
      console.warn('[pdd_manage] 写入 Negotiation_groupchat 失败:', err)
    }
    
    return { code: 0, msg: '加入成功' }
  } catch (err) {
    console.error('[joinOrder] Error:', err)
    return { code: 500, msg: '加入失败', error: err }
  }
}

/**
 * 更新意向
 */
async function updateIntention(orderId, openid, intention) {
  // 尝试两个集合
  let collectionName = 'atfirst_pddbox'
  let orderRef = db.collection(collectionName).doc(orderId)
  let orderRes = await orderRef.get().catch(() => null)

  if (!orderRes) {
    collectionName = 'atfirst_req'
    orderRef = db.collection(collectionName).doc(orderId)
    orderRes = await orderRef.get().catch(() => null)
  }

  if (!orderRes) return { code: 404, msg: '订单不存在' }

  const order = orderRes.data
  const participants = order.participants || []
  const idx = participants.findIndex(p => p.openid === openid)

  if (idx === -1) {
    // 自动加入
    const user = await getUserInfo(openid)
    participants.push({
      openid: openid,
      joinedAt: new Date(),
      status: 'joined',
      nickname: user.nickname || '新用户',
      avatar: user.avatarUrl || '/images/icons/avatar.png',
      intention: intention
    })
  } else {
    participants[idx].intention = intention
    participants[idx].updatedAt = new Date()
  }

  await orderRef.update({
    data: { participants: participants }
  })

  // 写入 Negotiation_groupchat 消息 (意向更新)
  try {
      const user = await getUserInfo(openid)
      const nickname = user.nickname || '用户'
      const sysMsg = {
          senderOpenid: openid,
          sender: nickname,
          avatar: user.avatarUrl || '/images/icons/avatar.png',
          content: `用户 ${nickname} 更新了意向`,
          contentType: 'system',
          createdAt: new Date().getTime(),
          targetUserId: null
      }

      const chatCol = db.collection('Negotiation_groupchat')
      const chatRes = await chatCol.where({ chat_id: orderId }).get()

      if (chatRes.data.length > 0) {
          const docId = chatRes.data[0]._id
          await chatCol.doc(docId).update({
              data: {
                  chat_massage: _.push(sysMsg),
                  updatedAt: new Date().getTime()
              }
          })
      } else {
          // 理论上更新意向时应该已经加入并创建了会话，但为了健壮性
          await chatCol.add({
              data: {
                  chat_id: orderId,
                  chat_person: [{
                      openid: openid,
                      nickname: nickname,
                      avatar: user.avatarUrl || '/images/icons/avatar.png'
                  }],
                  chat_massage: [sysMsg],
                  createdAt: new Date().getTime(),
                  updatedAt: new Date().getTime()
              }
          })
      }
  } catch(e) {
      console.warn('[pdd_manage] 写入 Negotiation_groupchat 失败:', e)
  }

  return { code: 0, msg: '意向已保存' }
}

/**
 * 提交协商方案 (发起方)
 */
async function submitPlan(orderId, openid, plan) {
  const orderRef = db.collection('atfirst_pddbox').doc(orderId)
  const orderRes = await orderRef.get().catch(() => null)
  
  if (!orderRes) return { code: 404, msg: '订单不存在' }
  const order = orderRes.data
  
  // 权限校验：仅发起方可提交方案
  if (order._openid !== openid && order.publisher_openid !== openid) {
      return { code: 403, msg: '仅发起人可提交方案' }
  }
  
  // 更新方案草稿，重置投票
  await orderRef.update({
      data: {
          final_plan_draft: plan,
          votes: {}, // 重置投票: { openid: true/false }
          plan_status: 'voting', // voting, passed, rejected
          updatedAt: new Date()
      }
  })
  
  // 发送系统消息
  await sendSystemMessage(orderId, openid, '发起方提交了最终方案，请前往投票')
  
  return { code: 0, msg: '方案已提交，等待投票' }
}

/**
 * 投票 (参与方)
 */
async function votePlan(orderId, openid, agree) {
  const orderRef = db.collection('atfirst_pddbox').doc(orderId)
  const orderRes = await orderRef.get().catch(() => null)
  
  if (!orderRes) return { code: 404, msg: '订单不存在' }
  const order = orderRes.data
  
  if (order.plan_status !== 'voting') {
      return { code: 400, msg: '当前无需投票' }
  }
  
  // 检查是否是参与者
  const participants = order.participants || []
  if (!participants.some(p => p.openid === openid)) {
      return { code: 403, msg: '非参与者不可投票' }
  }
  
  // 更新投票
  const voteKey = `votes.${openid}`
  await orderRef.update({
      data: {
          [voteKey]: agree
      }
  })
  
  // 检查是否达成共识
  // 获取最新数据 (为了准确计算)
  const updatedOrderRes = await orderRef.get()
  const updatedOrder = updatedOrderRes.data
  const votes = updatedOrder.votes || {}
  const totalMembers = participants.length
  const agreeCount = Object.values(votes).filter(v => v === true).length
  
  // 规则： >= total - 1 (允许1人弃权/反对?) 或者 全员同意?
  // 用户说： "6 人中 ≥ 5 人同意" -> 也就是说允许少量反对?
  // 让我们设定阈值： >= ceil(total * 0.8) 或 total - 1
  const threshold = Math.max(1, totalMembers - 1) 
  
  if (agreeCount >= threshold) {
      // 通过 -> 写入 final_plan
      await orderRef.update({
          data: {
              final_plan: order.final_plan_draft,
              plan_status: 'passed'
          }
      })
      await sendSystemMessage(orderId, null, '最终方案已通过投票！')
      return { code: 0, msg: '投票成功，方案已通过' }
  }
  
  return { code: 0, msg: '投票成功' }
}

/**
 * 发送系统消息辅助函数
 */
async function sendSystemMessage(orderId, operatorOpenid, content) {
    try {
        const sysMsg = {
            senderOpenid: operatorOpenid || 'SYSTEM',
            sender: '系统通知',
            avatar: '/images/icons/system.png',
            content: content,
            contentType: 'system',
            createdAt: new Date().getTime(),
            targetUserId: null
        }
        
        const chatCol = db.collection('Negotiation_groupchat')
        const chatRes = await chatCol.where({ chat_id: orderId }).get()
        
        if (chatRes.data.length > 0) {
             const docId = chatRes.data[0]._id
             await chatCol.doc(docId).update({
                 data: { chat_massage: _.push(sysMsg), updatedAt: new Date().getTime() }
             })
        }
    } catch (e) {
        console.warn('发送系统消息失败', e)
    }
}

async function getUserInfo(openid) {
  try {
    const res = await db.collection('users').where({ openid }).get()
    if (res.data.length > 0) return res.data[0]
  } catch (e) {}
  return { nickname: '微信用户', avatarUrl: '' }
}

/**
 * 获取列表
 */
async function listOrders(event, openid) {
  const { mode, userId } = event
  console.log(`[pdd_manage] [listOrders] mode=${mode}, userId=${userId}`)

  if (mode === 'nearby') {
    // 构造查询条件
    const conditions = [
      { publish_state: 'nearby_group' }, // 必须是拼团状态
      { _openid: _.neq(openid) }         // 排除自己 (基于 openid)
    ]
    
    // 如果传了 userId (通常是业务系统的用户ID)，也排除
    if (userId) {
       conditions.push({ publisher_Id: _.neq(userId) })
    }

    const query = _.and(conditions)

    try {
      const res = await db.collection('atfirst_pddbox')
        .where(query)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
      
      return { code: 0, data: res.data }
    } catch (err) {
      console.error('[pdd_manage] [listOrders] 查询失败:', err)
      // 如果集合不存在，返回空数组，不要报错
      if (err.errCode === -502001) { // DATABASE_COLLECTION_NOT_EXIST
         return { code: 0, data: [] }
      }
      return { code: 500, msg: '查询失败', error: err }
    }
  }
  
  return { code: 0, data: [] }
}
