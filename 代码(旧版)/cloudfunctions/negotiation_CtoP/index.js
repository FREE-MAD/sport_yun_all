const cloud = require('wx-server-sdk')

cloud.init({ env: 'cloud1-6gh7jgl8c5b16a83' });

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, orderId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const userId = event.userId // 教练或家长的 UserID

  if (!openid) {
    return { code: 401, msg: '未登录' }
  }

  console.log(`[negotiation_CtoP] Action: ${action}, OrderId: ${orderId}, Openid: ${openid}`)

  try {
    switch (action) {
      case 'coach_apply':
        // 教练申请接单 / 报名
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await coachApply(orderId, openid, userId, event.proposal)

      case 'coach_propose':
        // 教练提交/修改方案
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await coachPropose(orderId, openid, userId, event.proposal)

      case 'parent_confirm':
        // 家长确认选用某位教练
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await parentConfirm(orderId, openid, event.coachOpenid, event.coachUserId)

      case 'parent_reject':
        // 家长拒绝某位教练
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await parentReject(orderId, openid, event.coachOpenid)

      case 'submit_intent':
        // 教练提交接单意向
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await submitIntent(orderId, openid, userId, event.coachIntent, event.rejectReason, event.expectedPrice)

      default:
        return { code: 404, msg: '未知操作' }
    }
  } catch (err) {
    console.error('[negotiation_CtoP] Error:', err)
    return { code: 500, msg: '服务器错误', error: err }
  }
}

/**
 * 教练申请接单
 * 将教练信息添加到 coach_negotiation.candidates
 */
async function coachApply(orderId, openid, userId, proposal) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 检查阶段 (Phase Check)
  const now = new Date();
  let parentPhaseEnd = data.parent_phase_end_time ? new Date(data.parent_phase_end_time) : null;
  if (!parentPhaseEnd && data.createdAt) {
      // 兼容旧数据: createdAt + 24h
      parentPhaseEnd = new Date(new Date(data.createdAt).getTime() + 24 * 60 * 60 * 1000);
  }
  
  if (parentPhaseEnd && now < parentPhaseEnd) {
      return { code: 403, msg: '当前为家长协商阶段，暂未开放教练申请' }
  }

  // 检查是否已经申请
  const negotiation = data.coach_negotiation || { candidates: [], proposals: [] }
  const candidates = negotiation.candidates || []
  
  if (candidates.some(c => c.openid === openid)) {
    return { code: 0, msg: '已申请，请勿重复' }
  }

  const coachInfo = await getUserInfo(openid)
  const candidate = {
    openid,
    userId,
    nickname: coachInfo.nickname,
    avatar: coachInfo.avatarUrl,
    appliedAt: new Date(),
    status: 'applied' // applied, rejected, selected
  }

  const updateData = {
    'coach_negotiation.candidates': _.push(candidate)
  }

  // 如果有方案，也保存
  if (proposal) {
    const prop = {
      openid,
      userId,
      content: proposal,
      updatedAt: new Date()
    }
    updateData['coach_negotiation.proposals'] = _.push(prop)
  }

  // 如果是空对象 (首次)，需要初始化
  if (!data.coach_negotiation) {
    await ref.update({
      data: {
        coach_negotiation: {
          candidates: [candidate],
          proposals: proposal ? [{
             openid, userId, content: proposal, updatedAt: new Date()
          }] : [],
        }
      }
    })
  } else {
    await ref.update({ data: updateData })
  }

  await sendSystemMessage(orderId, openid, `教练 ${coachInfo.nickname} 申请接单`, coachInfo, 'coach')

  return { code: 0, msg: '申请成功' }
}

/**
 * 教练提交/修改方案
 */
async function coachPropose(orderId, openid, userId, proposal) {
  if (!proposal) return { code: 400, msg: '方案内容为空' }
  
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 必须是已申请的教练
  const negotiation = data.coach_negotiation || {}
  const candidates = negotiation.candidates || []
  if (!candidates.some(c => c.openid === openid)) {
    return { code: 403, msg: '请先申请接单' }
  }

  const prop = {
    openid,
    userId,
    content: proposal,
    updatedAt: new Date()
  }

  await ref.update({
    data: {
      'coach_negotiation.proposals': _.push(prop)
    }
  })

  const coachInfo = await getUserInfo(openid)
  await sendSystemMessage(orderId, openid, `教练 ${coachInfo.nickname} 更新了方案`, coachInfo, 'coach')

  return { code: 0, msg: '方案已提交' }
}

/**
 * 家长确认选用某位教练
 */
async function parentConfirm(orderId, openid, coachOpenid, coachUserId) {
  const { data, ref, collection } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 仅发布者可确认
  if (data.publisher_openid !== openid) {
    return { code: 403, msg: '仅发布者可确认' }
  }

  // 校验教练是否在候选列表中
  const candidates = (data.coach_negotiation && data.coach_negotiation.candidates) || []
  const selectedCandidate = candidates.find(c => c.openid === coachOpenid)
  
  if (!selectedCandidate) {
    return { code: 404, msg: '该教练未申请' }
  }

  // 1. 更新 candidates 状态
  // 由于云开发更新数组元素限制，这里简化处理：
  // 实际上只要更新 coach_negotiation.selected_coach 即可
  
  // 2. 转移到 execution 状态 (accepted)
  // 确定目标集合
  // let targetCollection = ''
  // if (collection === 'atfirst_req') targetCollection = 'final_req'
  // else if (collection === 'atfirst_pddbox') targetCollection = 'final_pddbox'
  // else if (collection.startsWith('final_')) targetCollection = collection // 已经是 final
  // else return { code: 500, msg: '集合状态异常' }

  const classCount = data.class_count || data.progress_total || 1
  const schedule = []
  for (let i = 0; i < classCount; i++) {
    schedule.push({
      lesson: i + 1,
      status: 'PENDING',
      coach_status: 'none',
      parent_status: 'none',
      logs: []
    })
  }

  const updates = {
    'coach_negotiation.selected_coach': {
       openid: coachOpenid,
       userId: coachUserId,
       confirmedAt: new Date()
    },
    acceptorId: coachUserId,
    acceptorOpenid: coachOpenid,
    fulfill_state: 'negotiating', // 防止迁移，保持协商状态
    acceptedAt: new Date(),
    schedule: schedule,
    progress_total: classCount,
    progress_done: 0
  }

  // 原地更新
  await ref.update({ data: updates })

  // 发送欢迎消息
  // 这里是系统发的，operatorOpenid 是 parent
  const coachInfoObj = await getUserInfo(coachOpenid)
  await sendSystemMessage(orderId, openid, `[系统通知] 欢迎 ${coachInfoObj.nickname} (教练) 加入群聊！`, null, 'parent')
  
  // 确保教练加入群聊并记录入场时间
  try {
      const coachInfoObj = await getUserInfo(coachOpenid)
      const chatCol = db.collection('Negotiation_groupchat')
      const chatRes = await chatCol.where({ chat_id: orderId }).get()
      
      if (chatRes.data.length > 0) {
          const chatDoc = chatRes.data[0]
          const chatPerson = chatDoc.chat_person || []
          
          if (!chatPerson.some(p => p.openid === coachOpenid)) {
              await chatCol.doc(chatDoc._id).update({
                  data: {
                      chat_person: _.push({
                          openid: coachOpenid,
                          nickname: coachInfoObj.nickname,
                          avatar: coachInfoObj.avatarUrl,
                          joinTime: new Date().getTime(),
                          role: 'coach'
                      })
                  }
              })
              console.log(`[negotiation_CtoP] [parentConfirm] 教练 ${coachInfoObj.nickname} 已加入群聊`)
          }
      }
  } catch (e) {
      console.error('[negotiation_CtoP] [parentConfirm] 添加教练进群失败', e)
  }

  return { code: 0, msg: '已确认教练' }
}

/**
 * 家长拒绝某位教练
 */
async function parentReject(orderId, openid, coachOpenid) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  if (data.publisher_openid !== openid) {
    return { code: 403, msg: '仅发布者可操作' }
  }
  
  // 实际场景中可能不需要物理拒绝，只是不选。
  // 如果需要明确拒绝，可以在 candidates 里标记 status='rejected'
  // 这里暂时不做复杂处理，仅发送通知
  
  await sendSystemMessage(orderId, openid, `家长拒绝了您的申请`, null) // 这可能会发给群里所有人，略显尴尬，但现有逻辑是群聊
  
  return { code: 0, msg: '操作成功' }
}

/**
 * 教练提交接单意向
 */
async function submitIntent(orderId, openid, userId, coachIntent, rejectReason, expectedPrice) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 获取用户信息
  const userInfo = await getUserInfo(openid)

  const intentData = {
    orderId,
    userId,
    openid,
    userInfo: {
        nickName: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl
    },
    rejectReason: rejectReason || '',
    timestamp: new Date().toISOString(),
    expectedPrice: (expectedPrice !== undefined && expectedPrice !== null && expectedPrice !== '') ? Number(expectedPrice) : null
  }

  // 获取或初始化 Willing_coach 结构
  // 结构: Willing_coach: { willing: [], unwilling: [] }
  let willingCoach = data.Willing_coach || { willing: [], unwilling: [] }
  let willingList = willingCoach.willing || []
  let unwillingList = willingCoach.unwilling || []

  // 先从两个列表中移除该用户（避免重复或状态不一致）
  willingList = willingList.filter(i => i.openid !== openid)
  unwillingList = unwillingList.filter(i => i.openid !== openid)

  // 根据意向添加到对应列表
  if (coachIntent) {
    willingList.push(intentData)
  } else {
    unwillingList.push(intentData)
  }

  // 更新数据库
  await ref.update({
    data: {
      Willing_coach: {
        willing: willingList,
        unwilling: unwillingList
      }
      // 可以选择移除旧的 coach_intents 字段，或者保留作为历史兼容
      // coach_intents: _.remove() 
    }
  })

  return { code: 0, msg: coachIntent ? '已确认意向' : '已反馈拒绝原因' }
}

// ================= 辅助函数 =================

async function findOrder(orderId) {
  const collections = ['atfirst_req', 'atfirst_pddbox', 'final_req', 'final_pddbox']
  for (const c of collections) {
    try {
      const res = await db.collection(c).doc(orderId).get()
      if (res.data) {
        return { data: res.data, collection: c, ref: db.collection(c).doc(orderId) }
      }
    } catch (e) {}
  }
  return { data: null, collection: null, ref: null }
}

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
    const sysMsg = {
      senderOpenid: operatorOpenid || 'SYSTEM',
      sender: user.nickname || '系统通知',
      avatar: user.avatarUrl || '/images/icons/system.png',
      content: content,
      contentType: 'system',
      createdAt: new Date().getTime(),
      targetUserId: null
    }

    const chatCol = db.collection('Negotiation_groupchat')
    const chatRes = await chatCol.where({ chat_id: orderId }).get()

    if (chatRes.data.length > 0) {
      const docId = chatRes.data[0]._id
      
      const chatPerson = chatRes.data[0].chat_person || []
      let updateData = {
          chat_massage: _.push(sysMsg),
          updatedAt: new Date().getTime()
      }
      
      // 确保 robot 在 chat_person 中
      const robotInfo = {
          openid: 'ROBOT_DEFAULT_0',
          nickname: '聊天助手',
          avatar: '/images/icons/robot.png',
          role: 'robot',
          joinTime: 0
      }
      
      // 如果机器人不在，需要添加
      let needAddRobot = !chatPerson.some(p => p.openid === robotInfo.openid);
      let needAddUser = operatorOpenid && !chatPerson.some(p => p.openid === operatorOpenid);

      if (needAddRobot || needAddUser) {
          // 为了简单，我们使用全量更新 chat_person (类似 negotiation_parent)
          // 先过滤掉旧机器人
          let newChatPerson = chatPerson.filter(p => p.openid !== robotInfo.openid);
          // 添加新机器人到首位
          newChatPerson.unshift(robotInfo);
          
          if (needAddUser) {
              newChatPerson.push({
                  openid: operatorOpenid,
                  nickname: user.nickname,
                  avatar: user.avatarUrl,
                  joinTime: new Date().getTime(),
                  role: 'coach' // 既然是 CtoP，操作者多半是教练 (或者家长 confirm)
              });
          }
          updateData.chat_person = newChatPerson;
      }
      
      await chatCol.doc(docId).update({ data: updateData })
    } else {
      const robotInfo = {
          openid: 'ROBOT_DEFAULT_0',
          nickname: '聊天助手',
          avatar: '/images/icons/robot.png',
          role: 'robot',
          joinTime: 0
      }
      
      const initialPerson = [robotInfo];
      if (operatorOpenid) {
          initialPerson.push({
             openid: operatorOpenid,
             nickname: user.nickname,
             avatar: user.avatarUrl,
             joinTime: new Date().getTime(),
             role: 'coach'
          });
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
    console.warn('[negotiation_CtoP] 发送系统消息失败', e)
  }
}
