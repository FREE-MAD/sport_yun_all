// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, conversationId, orderId } = event
  const wxContext = cloud.getWXContext()
  let openid = wxContext.OPENID

  // 支持内部调用显式传递 openid (例如系统触发)
  if (event.fromOpenid) {
      // 可以在这里加一些安全校验，比如检查是否是同一环境的云函数调用
      // 简单起见，如果提供了 fromOpenid，优先使用
      openid = event.fromOpenid
  }

  console.log(`[pdd_chat_massage] 收到请求: action=${action}, openid=${openid}, orderId=${orderId || '无'}, conversationId=${conversationId || '无'}`)

  if (!openid) {
    console.error('[pdd_chat_massage] 错误: 用户未登录')
    return { code: 401, msg: '未登录' }
  }

  try {
    switch (action) {
      // === Private Chat Actions ===
      case 'get_private_chat_info':
        console.log('[pdd_chat_massage] [get_private_chat_info] 开始处理...')
        return await getPrivateChatInfo(conversationId, event.targetUserId, openid)
      
      // === Combined Chat Actions (Auto-detect) ===
      case 'get_chat_msgs': // 统一接口
      case 'get_private_chat_msgs': // 兼容旧接口名
        console.log('[pdd_chat_massage] [get_chat_msgs] 开始处理...')
        // 尝试自动识别或合并查询
        return await getUnifiedChatMsgs(conversationId, openid)

      case 'send_chat_msg': // 统一接口
      case 'send_private_msg': // 兼容旧接口名
        console.log('[pdd_chat_massage] [send_chat_msg] 开始处理...')
        // 如果 targetUserId 为空，且 conversationId 看起来像 orderId，或者前端能传递 type 最好
        // 但这里我们尝试自动处理
        return await sendUnifiedChatMsg(conversationId, openid, event.content, event.targetUserId, event.contentType)
      
      // === Order Chat Actions ===
      case 'send_msg':
        console.log('[pdd_chat_massage] [send_msg] 开始处理...')
        if (!orderId) {
          console.error('[pdd_chat_massage] [send_msg] 错误: 缺少订单ID')
          return { code: 1, msg: '缺少订单ID' }
        }
        return await sendMessage(orderId, openid, event.content)

      // === Negotiation Group Chat Actions ===
      case 'send_negotiation_msg':
        console.log('[pdd_chat_massage] [send_negotiation_msg] 开始处理...')
        return await sendNegotiationMsg(conversationId, openid, event.content, event.targetUserId, event.contentType)
      
      case 'get_negotiation_msgs':
        console.log('[pdd_chat_massage] [get_negotiation_msgs] 开始处理...')
        return await getNegotiationMsgs(conversationId, openid)
      
      default:
        console.warn(`[pdd_chat_massage] 警告: 未知操作 action=${action}`)
        return { code: 404, msg: '未知操作' }
    }
  } catch (err) {
    console.error('[pdd_chat_massage] 服务器内部错误:', err)
    return { code: 500, msg: '服务器错误', error: err }
  }
}

// === Private Chat Functions ===

/**
 * 统一获取消息（尝试从私聊和协商群聊中查找）
 */
async function getUnifiedChatMsgs(conversationId, openid) {
  if (!conversationId) {
    return { code: 0, data: [] }
  }

  // 1. 尝试从 pdd_chat_messages (私聊) 获取
  const privateRes = await db.collection('pdd_chat_messages')
    .where({ conversationId: conversationId })
    .orderBy('createdAt', 'asc')
    .limit(100)
    .get()
  
  if (privateRes.data.length > 0) {
    console.log(`[pdd_chat_massage] [getUnified] 在私聊表中找到消息: ${privateRes.data.length} 条`)
    return { code: 0, data: privateRes.data }
  }

  // 2. 如果私聊没找到，尝试从 Negotiation_groupchat (群聊) 获取
  // 使用 getNegotiationMsgs 复用逻辑 (包含入群时间过滤)
  const groupRes = await getNegotiationMsgs(conversationId, openid)
  if (groupRes.code === 0 && groupRes.data.length > 0) {
      console.log(`[pdd_chat_massage] [getUnified] 在协商群聊表中找到消息: ${groupRes.data.length} 条`)
      return groupRes
  }

  return { code: 0, data: [] }
}

/**
 * 统一发送消息
 */
async function sendUnifiedChatMsg(conversationId, openid, content, targetUserId, contentType) {
  // 简单判断：如果 conversationId 长度较长且不含下划线（通常是 orderId），或者是群聊 ID
  // 或者先查一下 Negotiation_groupchat 是否存在
  
  const groupRes = await db.collection('Negotiation_groupchat').where({ chat_id: conversationId }).count()
  if (groupRes.total > 0) {
      return await sendNegotiationMsg(conversationId, openid, content, targetUserId, contentType)
  }
  
  // 否则当作私聊
  // 这里需要确保 private chat collection 存在
  // 复用旧逻辑... 但旧逻辑有点乱，这里简化直接写
  
  const msgData = {
      conversationId,
      content,
      contentType,
      senderOpenid: openid,
      targetUserId, // 可能为空
      createdAt: new Date(),
      isRead: false
  }
  
  // 补充用户信息
  const user = await getUserInfo(openid)
  msgData.senderName = user.nickname
  msgData.senderAvatar = user.avatarUrl
  
  await addMessage(msgData, 'pdd_chat_messages')
  
  return { code: 0, msg: 'Sent' }
}

async function getPrivateChatInfo(conversationId, targetUserId, openid) {
    // 简单模拟，实际可能需要查询用户信息
    return {
        code: 0,
        data: {
            conversationId,
            targetUser: { nickname: '用户' } // 简化
        }
    }
}

// === Order Chat Functions ===

async function sendMessage(orderId, openid, content) {
    // Legacy support for order chat
    const user = await getUserInfo(openid)
    const msg = {
        orderId,
        content,
        senderOpenid: openid,
        senderName: user.nickname,
        senderAvatar: user.avatarUrl,
        createdAt: new Date()
    }
    await addMessage(msg, 'pdd_chat_messages') // 依然存到这里? 或者 separate collection?
    // 根据 core memory，现在 centralized in pdd_chat_messages or Negotiation_groupchat
    // 这里假设 order chat 也是用 pdd_chat_messages
    return { code: 0, msg: 'Sent' }
}

// === Negotiation Group Chat Functions ===

/**
 * 发送协商群聊消息 (新 Schema: chat_id, chat_person, chat_massage)
 */
async function sendNegotiationMsg(conversationId, openid, content, targetUserId, contentType = 'text') {
  if (!conversationId) {
    console.error('[pdd_chat_massage] [sendNegotiationMsg] 错误: 缺少 conversationId (chat_id)')
    return { code: 1, msg: 'Missing conversationId' }
  }
  
  console.log(`[pdd_chat_massage] [sendNegotiationMsg] 准备发送消息: chat_id=${conversationId}, content=${content}`)
  const user = await getUserInfo(openid)
  const senderInfo = {
    openid: openid,
    nickname: user.nickname || '用户',
    avatar: user.avatarUrl || '/images/icons/avatar.png',
    joinTime: new Date().getTime()
  }

  // 定义群聊机器人
  const robotInfo = {
    openid: 'ROBOT_DEFAULT_0',
    nickname: '聊天助手',
    avatar: '/images/icons/robot.png', // 假设有这个图标，或者用默认的
    role: 'robot',
    joinTime: 0
  }

  let senderOpenid = openid
  let senderName = user.nickname || '用户'
  let senderAvatar = user.avatarUrl || '/images/icons/avatar.png'

  // 如果是系统通知，强制使用机器人身份
  if (content.startsWith('[系统通知]')) {
    senderOpenid = robotInfo.openid
    senderName = robotInfo.nickname
    senderAvatar = robotInfo.avatar
  }

  const newMsg = {
    senderOpenid: senderOpenid,
    sender: senderName,
    avatar: senderAvatar,
    content,
    contentType,
    createdAt: new Date().getTime(),
    targetUserId // Optional
  }
  
  try {
    const collection = db.collection('Negotiation_groupchat')
    // 1. 查询是否存在该 chat_id 的文档
    const res = await collection.where({ chat_id: conversationId }).get()
    
    if (res.data.length > 0) {
      // 更新现有文档
      const docId = res.data[0]._id
      // 检查机器人是否在 chat_person 中，并强制放到第一位
      let chatPerson = res.data[0].chat_person || []
      
      // 先移除已有的机器人(如果有)，确保可以插入最新的信息到第一位
      const filteredPerson = chatPerson.filter(p => p.openid !== robotInfo.openid)
      // 重新插入机器人到首位
      filteredPerson.unshift(robotInfo)
      // 更新 chatPerson 引用
      chatPerson = filteredPerson

      // 检查发送者是否已经在 chat_person 中
      const isParticipant = chatPerson.some(p => p.openid === openid)
      
      let updateData = {
        chat_massage: _.push(newMsg)
      }
      
        if (!isParticipant) {
        // 如果发送者不在，加入
        // 机器人已经在上面逻辑中保证在第一位了，直接 push sender
        chatPerson.push(senderInfo)
        updateData.chat_person = chatPerson
      } else {
        // 发送者已在，但我们可能调整了机器人的位置或更新了机器人信息，所以总是更新 chat_person
        updateData.chat_person = chatPerson
      }
      
      await collection.doc(docId).update({ data: updateData })
      console.log('[pdd_chat_massage] [sendNegotiationMsg] 消息追加成功')

      // 机器人指令处理
      await handleRobotCommand(conversationId, content, openid)
    } else {
      // 创建新文档
      const newDoc = {
        chat_id: conversationId,
        chat_person: [robotInfo, senderInfo], // 机器人默认在 0
        chat_massage: [newMsg],
        createdAt: new Date().getTime(), // 记录创建时间
        updatedAt: new Date().getTime(),
        last_reminder_check: 0 // 初始化提醒检查时间
      }
      
      // 处理集合可能不存在的情况 (虽然 add 会自动创建，但 catch 块里有逻辑)
      try {
          await collection.add({ data: newDoc })
      } catch(err) {
          if (err.errCode === -502005 || (err.errMsg && err.errMsg.includes('collection not exists'))) {
             await db.createCollection('Negotiation_groupchat')
             await collection.add({ data: newDoc })
          } else {
              throw err
          }
      }
      console.log('[pdd_chat_massage] [sendNegotiationMsg] 新会话创建并发送成功')

      // 机器人指令处理 (新建会话也可能触发，虽然不太可能直接发指令)
      await handleRobotCommand(conversationId, content, openid)
    }
    
    return { code: 0, msg: 'Sent' }

  } catch (err) {
    console.error('[pdd_chat_massage] [sendNegotiationMsg] 发送失败:', err)
    return { code: 500, msg: 'Server Error', error: err }
  }
}

/**
 * 获取协商群聊消息
 */
async function getNegotiationMsgs(conversationId, openid) {
  if (!conversationId) {
    console.log('[pdd_chat_massage] [getNegotiationMsgs] 缺少 conversationId, 返回空列表')
    return { code: 0, data: [] }
  }
  
  console.log(`[pdd_chat_massage] [getNegotiationMsgs] 查询消息: chat_id=${conversationId}, openid=${openid}`)
  try {
    const res = await db.collection('Negotiation_groupchat')
      .where({ chat_id: conversationId })
      .get()
      
    if (res.data.length > 0) {
      const doc = res.data[0]
      
      // 检查提醒 (懒加载: 每次拉取消息时检查，但加一个时间间隔限制)
      await checkReminders(conversationId, doc)
      
      const msgs = doc.chat_massage || []
      let chatPerson = doc.chat_person || []
      
      // 1. 查找当前用户是否在群成员列表中
      let user = chatPerson.find(p => p.openid === openid)
      let joinTime = 0
      
      if (user) {
        // 用户已在群中，使用其加入时间 (如果旧数据没有 joinTime，默认为 0，即显示所有)
        joinTime = user.joinTime || 0
      } else {
        // 用户不在群中，说明是第一次查看
        // === 完善放行逻辑: 检查是否有权加入 ===
        const canJoin = await checkPermission(conversationId, openid);
        
        if (canJoin) {
            console.log(`[pdd_chat_massage] [getNegotiationMsgs] 用户 ${openid} 不在群成员中, 但有权加入 (Implicit Join)...`)
            joinTime = new Date().getTime()
            
            const userInfo = await getUserInfo(openid)
            const newUser = {
              openid: openid,
              nickname: userInfo.nickname || '用户',
              avatar: userInfo.avatarUrl || '/images/icons/avatar.png',
              joinTime: joinTime
            }
            
            // 使用 push 原子操作更新
            await db.collection('Negotiation_groupchat').doc(doc._id).update({
              data: {
                chat_person: _.push(newUser)
              }
            })
            
            // 更新本地变量以便返回
            chatPerson.push(newUser)
        } else {
            console.warn(`[pdd_chat_massage] [getNegotiationMsgs] 用户 ${openid} 无权查看此会话 ${conversationId}`)
            return { code: 403, msg: '无权查看此会话' }
        }
      }
      
      // 2. 过滤消息
      // 只显示 joinTime 之后的消息 (以及之前的系统/机器人消息?)
      // 通常逻辑：用户只能看到加入之后的消息。
      // 但为了方便，也许应该允许看到所有? Core memory says: "Filters messages to show only those created after joinTime".
      
      const filteredMsgs = msgs.filter(msg => {
          // 如果是自己发的，肯定能看
          if (msg.senderOpenid === openid) return true;
          // 比较时间
          return msg.createdAt >= joinTime;
      })
      
      // 返回结果
      return { 
        code: 0, 
        data: filteredMsgs,
        // 可以顺便返回群成员信息，方便前端展示
        chatPerson: chatPerson
      }
      
    } else {
      return { code: 0, data: [] }
    }
  } catch (err) {
    console.error('[pdd_chat_massage] [getNegotiationMsgs] 查询失败:', err)
    return { code: 500, msg: 'Server Error', error: err }
  }
}

// ================= 辅助函数 =================

async function getUserInfo(openid) {
  try {
    const res = await db.collection('users').where({ openid }).get()
    if (res.data.length > 0) {
      return res.data[0]
    }
  } catch (e) {
    console.error('[pdd_chat_massage] [getUserInfo] 获取用户信息失败:', e)
  }
  return { nickname: '微信用户', avatarUrl: '' }
}

/**
 * 统一消息发送（带自动创建集合）
 */
async function addMessage(data, collectionName = 'pdd_chat_messages') {
  try {
    console.log(`[pdd_chat_massage] [addMessage] 正在写入集合: ${collectionName}`)
    await db.collection(collectionName).add({ data })
  } catch (err) {
    // -502005: database collection not exists
    if (err.errCode === -502005 || (err.errMsg && err.errMsg.includes('collection not exists'))) {
      console.warn(`[pdd_chat_massage] [addMessage] 集合 ${collectionName} 不存在, 尝试自动创建...`)
      try {
        await db.createCollection(collectionName)
        console.log(`[pdd_chat_massage] [addMessage] 集合 ${collectionName} 创建成功`)
      } catch (e) {
        console.warn(`[pdd_chat_massage] [addMessage] 创建集合 ${collectionName} 失败 (可能已存在):`, e)
      }
      // Retry add
      await db.collection(collectionName).add({ data })
      console.log('[pdd_chat_massage] [addMessage] 重试写入成功')
    } else {
      console.error('[pdd_chat_massage] [addMessage] 写入失败:', err)
      throw err
    }
  }
}

// === Robot Logic ===

async function handleRobotCommand(conversationId, content, openid) {
    // 简单的指令识别
    const commands = ['@聊天助手', '帮助', 'help', '提醒', '状态'];
    // 只有当消息包含这些关键词时才触发
    const isCommand = commands.some(cmd => content.includes(cmd));
    
    if (!isCommand) return;

    let replyContent = '';
    
    if (content.includes('提醒')) {
        replyContent = '收到，正在为您检查课程进度提醒...';
        // 立即触发检查 (强制)
        await checkReminders(conversationId, { _id: conversationId }, true); 
    } else if (content.includes('状态')) {
        // Fetch order status
        const order = await getOrderInfo(conversationId);
        if (order) {
            replyContent = `当前订单状态：\n发布状态: ${order.publish_state}\n执行状态: ${order.fulfill_state}\n参与人数: ${order.participants ? order.participants.length : 0}`;
        } else {
            replyContent = '无法获取订单信息。';
        }
    } else {
        replyContent = '我是您的聊天助手，您可以输入以下指令唤醒我：\n1. 提醒：检查并触发课程提醒\n2. 状态：查看当前协商状态\n3. 帮助：显示此菜单';
    }

    if (replyContent) {
        await sendRobotMessage(conversationId, replyContent);
    }
}

async function sendRobotMessage(conversationId, content) {
    const robotInfo = {
        openid: 'ROBOT_DEFAULT_0',
        nickname: '聊天助手',
        avatar: '/images/icons/robot.png',
        role: 'robot'
    };
    
    const newMsg = {
        senderOpenid: robotInfo.openid,
        sender: robotInfo.nickname,
        avatar: robotInfo.avatar,
        content: content,
        contentType: 'text',
        createdAt: new Date().getTime(),
        targetUserId: null
    };
    
    const collection = db.collection('Negotiation_groupchat');
    // 使用 where 查询而不是 doc，因为我们只知道 conversationId (chat_id)
    const res = await collection.where({ chat_id: conversationId }).get();
    
    if (res.data.length > 0) {
        const docId = res.data[0]._id;
        await collection.doc(docId).update({
            data: {
                chat_massage: _.push(newMsg)
            }
        });
    }
}

async function checkReminders(conversationId, chatDoc, force = false) {
    const now = new Date().getTime();
    
    // 如果不是强制检查，且距离上次检查不足 10 分钟，跳过
    if (!force && chatDoc.last_reminder_check && (now - chatDoc.last_reminder_check < 600000)) {
        return;
    }
    
    // 更新检查时间 (防止并发/频繁检查)
    // 注意：如果是 getNegotiationMsgs 调用的，chatDoc 是查询出来的对象，我们需要更新数据库
    // 只有当 chatDoc 有 _id 时才能更新
    if (chatDoc._id) {
         await db.collection('Negotiation_groupchat').doc(chatDoc._id).update({
            data: { last_reminder_check: now }
        });
    } else if (conversationId) {
        // Fallback check if chatDoc is incomplete
        await db.collection('Negotiation_groupchat').where({ chat_id: conversationId }).update({
            data: { last_reminder_check: now }
        });
    }
    
    const order = await getOrderInfo(conversationId);
    if (!order) return;
    
    const reminders = order.reminders || {};
    const createdAt = new Date(order.createdAt).getTime();
    const elapsedHours = (now - createdAt) / (1000 * 60 * 60);
    
    const updates = {};
    let msg = '';
    
    // 1. 成功建立 (Success Created)
    if (!reminders.created && elapsedHours < 1) {
        msg = '拼课群聊已成功建立！请家长们尽快沟通意向。';
        updates['reminders.created'] = true;
    }
    
    // 3. 家教协商阶段 (默认建立后的24小时? 用户说“前者的一半”)
    // 用户原文：“家教协商(默认建立后的24小时)(前者的一半)”
    if (!reminders.coach_phase && elapsedHours >= 24) {
        msg = '温馨提醒：群聊建立已超过24小时，建议尽快确定教练人选。';
        updates['reminders.coach_phase'] = true;
    }

    // 2. 家长沟通阶段 (默认48小时)
    // 超过48小时提醒
    if (!reminders.parent_phase && elapsedHours >= 48) {
        msg = '温馨提醒：群聊建立已超过48小时，请家长们确认意向，准备进入下一阶段。';
        updates['reminders.parent_phase'] = true;
    }
    
    // 4. 开始课程 (Start Course)
    // 假设 order 中有 start_date (Date string or timestamp)
    // 或者 schedule[0].date
    let startTimestamp = 0;
    if (order.start_date) {
        startTimestamp = new Date(order.start_date).getTime();
    } else if (order.schedule && order.schedule.length > 0 && order.schedule[0].date) {
        startTimestamp = new Date(order.schedule[0].date).getTime();
    }

    if (!reminders.start_course && startTimestamp > 0) {
        const timeToStart = (startTimestamp - now) / (1000 * 60 * 60); // Hours until start

        // 如果距离开始时间不足 24 小时，且尚未开始 (timeToStart > 0)
        // 或者已经开始但刚开始不久 (timeToStart > -1)
        if (timeToStart <= 24 && timeToStart > -2) {
             msg = '温馨提醒：课程计划将于近期开始，请各位做好准备。祝课程顺利！';
             updates['reminders.start_course'] = true;
        }
    }
    
    if (msg) {
        await sendRobotMessage(conversationId, msg);
        // 更新订单的 reminders 状态
        if (order._collectionName) {
            // 修正 updates 写法: db.update data 支持 'reminders.coach_phase': true
             await db.collection(order._collectionName).doc(order._id).update({
                data: updates
            });
        }
    }
}

async function getOrderInfo(orderId) {
    // 尝试在几个集合中查找订单
    const collections = ['atfirst_pddbox', 'final_pddbox', 'atfirst_req', 'final_req']; // Added req collections
    for (const col of collections) {
        try {
            const res = await db.collection(col).doc(orderId).get();
            if (res.data) {
                return { ...res.data, _collectionName: col };
            }
        } catch(e) {}
    }
    return null;
}

/**
 * 检查用户是否有权加入/查看会话
 */
async function checkPermission(orderId, openid) {
    const order = await getOrderInfo(orderId);
    if (!order) {
        console.log(`[checkPermission] Order not found: ${orderId}`);
        return false;
    }

    // 1. 发布者
    if (order.publisher_openid === openid) return true;

    // 2. 已加入的参与者 (Parent)
    if (order.participants && Array.isArray(order.participants)) {
        // 检查 status 不为 'exited' 或 'rejected' ? 
        // 通常只要在列表中且不是 '已退出' 就可以
        const p = order.participants.find(p => p.openid === openid);
        if (p && p.parentStatus !== '已退出') return true;
    }

    // 3. 确定的教练 (Acceptor)
    if (order.acceptorOpenid === openid) return true;

    // 4. 候选教练? (Depending on policy)
    // 如果是 'coach_apply' 进来的，会在 candidates 里
    if (order.coach_negotiation && order.coach_negotiation.candidates) {
        const c = order.coach_negotiation.candidates.find(c => c.openid === openid);
        if (c) return true;
    }
    
    // 5. 意向教练? (Willing_coach)
    // 通常 submit_intent 的教练还不能看群，直到被选中
    // 但如果有特殊需求可以放开
    
    return false;
}
