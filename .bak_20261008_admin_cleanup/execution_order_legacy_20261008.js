
const cloud = require('wx-server-sdk')
cloud.init({ env: 'cloud1-6gh7jgl8c5b16a83' });

const db = cloud.database()
const _ = db.command

/**
 * execution_order: 订单执行核心状态机
 * 负责：状态流转、锁班、开课、握手、完成、取消
 */
exports.main = async (event, context) => {
  const { action, orderId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  // userId 应该由前端传递，或者通过 openid 查找用户表获取 (这里沿用前端传 userId 的模式，或者自查)
  const userId = event.userId 

  if (!openid) {
    return { code: 401, msg: '未登录' }
  }

  console.log(`[execution_order] Action: ${action}, OrderId: ${orderId}, Openid: ${openid}`)

  try {
    switch (action) {
      case 'get_oneorder':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await getOneOrder(orderId, openid)

      case 'lock_order':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await lockOrder(orderId, openid, userId, event.isSystem)

      case 'confirm_group':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await confirmGroup(orderId, openid, userId)

      case 'start':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await startOrder(orderId, openid, userId)

      case 'lesson_handshake':
        if (!orderId) return { code: 1, msg: '缺少订单ID' }
        return await lessonHandshake(orderId, openid, userId, event.lessonIndex, event.subAction)

      case 'send_lesson_order':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await sendLessonOrder(orderId, openid, userId, event.lessonIndex)

      case 'get_payment_params':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await getPaymentParams(orderId, openid, userId, event.lessonIndex)

      case 'pay_lesson':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await payLessonOrder(orderId, openid, userId, event.lessonIndex)

      case 'complete':
         // 手动完成整个订单 (通常由握手自动触发，但也提供手动接口)
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await completeOrder(orderId, openid, userId)

      case 'cancel':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await cancelOrder(orderId, openid, userId, event.reason)

      case 'list_myself':
         return await listMyself(openid, userId, event.page || 1, event.limit || 20)

      case 'list_public':
         return await listPublic(event.page || 1, event.limit || 20)

      case 'accept':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await acceptOrder(orderId, openid, userId)

      case 'complete_negotiation':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await completeNegotiation(orderId, event.price, event.count, event.instructions, openid, userId)

      case 'admin_assign_coach':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         if (!event.coachOpenid) return { code: 1, msg: '缺少教练OpenID' }
         return await adminAssignCoach(orderId, event.coachId, event.coachOpenid, openid)

      case 'publish':
         return await publishOrder(event.submitForm, openid, userId)

      case 'admin_list_all':
         return await listAllAdmin(event.page || 1, event.limit || 20)

      case 'admin_logs':
         return await listLogs(event.page || 1, event.limit || 20)

      case 'admin_get_detail':
         if (!event.id || !event.collection) return { code: 1, msg: '缺少参数' }
         return await adminGetDetail(event.id, event.collection)

      case 'admin_add_log':
         return await addLog(event.level, event.message, event.details)

      case 'update_lesson_content':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await updateLessonContent(orderId, openid, userId, event.lessonIndex, event.content)

      case 'add_lesson':
         if (!orderId) return { code: 1, msg: '缺少订单ID' }
         return await addLesson(orderId, openid)

      default:
        return { code: 404, msg: '未知操作' }
    }
  } catch (err) {
    console.error('[execution_order] Error:', err)
    return { code: 500, msg: '服务器错误', error: err }
  }
}

// ================= 业务逻辑函数 =================

/**
 * 获取所有订单（管理员）
 */
async function listAllAdmin(page, limit) {
  const COLLECTIONS = ['atfirst_pddbox', 'atfirst_req', 'final_pddbox', 'final_req']
  const skip = (page - 1) * limit

  try {
    const fetchPromises = COLLECTIONS.map(colName => {
        return db.collection(colName)
            .orderBy('createdAt', 'desc')
            .skip(0) 
            .limit(page * limit) 
            .field({
                _id: true,
                publish_type: true,
                publish_state: true,
                createdAt: true,
                start_date: true,
                start_time: true,
                address: true,
                userInfo: true,
                contact: true
            })
            .get()
            .then(res => res.data.map(item => ({ ...item, _collection: colName })))
            .catch(err => {
                console.error(`Error fetching ${colName}:`, err)
                return [] 
            })
    })

    const results = await Promise.all(fetchPromises)
    let allOrders = results.flat()
    
    allOrders.sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime()
        const timeB = new Date(b.createdAt).getTime()
        return timeB - timeA
    })
    
    const pagedOrders = allOrders.slice(skip, skip + limit)
    
    return {
        code: 0,
        data: pagedOrders,
        msg: 'ok'
    }

  } catch (err) {
    console.error('listAllAdmin error:', err)
    return {
      code: -1,
      msg: err.message
    }
  }
}

/**
 * 获取系统日志
 */
async function listLogs(page, limit) {
  const skip = (page - 1) * limit

  try {
    const countResult = await db.collection('sys_logs').count()
    const total = countResult.total

    const res = await db.collection('sys_logs')
      .orderBy('timestamp', 'desc')
      .skip(skip)
      .limit(limit)
      .get()

    return {
      code: 0,
      data: {
        list: res.data,
        total: total,
        page: page,
        limit: limit
      },
      msg: 'ok'
    }
  } catch (err) {
    console.error('listLogs error:', err)
    if (err.errMsg && err.errMsg.includes('Collection not found')) {
        return {
            code: 0,
            data: { list: [], total: 0 },
            msg: 'ok (no logs collection)'
        }
    }
    return {
      code: -1,
      msg: err.message
    }
  }
}

/**
 * 添加系统日志
 */
async function addLog(level, message, details) {
    try {
        await db.collection('sys_logs').add({
            data: {
                level: level || 'info',
                message: message || '',
                details: details || {},
                timestamp: db.serverDate(),
                env: cloud.DYNAMIC_CURRENT_ENV
            }
        })
        return { code: 0, msg: 'log added' }
    } catch (err) {
        return { code: -1, msg: err.message }
    }
}

/**
 * 获取单个订单详情
 */
async function getOneOrder(orderId, openid) {
  const { data, collection } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 判断当前用户是否已加入
  let isJoined = false
  if (data.participants && Array.isArray(data.participants)) {
    isJoined = data.participants.some(p => p.openid === openid)
  }
  if (data.publisher_openid === openid) {
    isJoined = true
  }

  // 确保发布者在参与者列表中 (默认意愿为1)
  if (!data.participants) data.participants = [];
  const publisherInList = data.participants.some(p => p.openid === data.publisher_openid || (p.userId && p.userId === data.publisher_Id));
  
  if (!publisherInList) {
    data.participants.unshift({
        openid: data.publisher_openid,
        userId: data.publisher_Id,
        status: 'confirmed',
        intention: { childCount: 1 },
        isPublisher: true,
        userInfo: data.publisherInfo || data.userInfo || { nickName: '发布者', avatarUrl: '' },
        contact: data.contact,
        location: data.location
    });
  }

  // 计算当前阶段
  const now = new Date();
  let current_phase = 'coach_open'; // 默认为开放
  
  // 获取时间节点 (兼容旧数据)
  let parentPhaseEnd = data.parent_phase_end_time ? new Date(data.parent_phase_end_time) : null;
  let deadlineTime = data.deadline_time ? new Date(data.deadline_time) : null;

  if (!parentPhaseEnd && data.createdAt) {
      // 旧数据默认 createdAt + 24h
      parentPhaseEnd = new Date(new Date(data.createdAt).getTime() + 24 * 60 * 60 * 1000);
  }
  if (!deadlineTime && data.createdAt) {
      // 旧数据默认 createdAt + 48h
      deadlineTime = new Date(new Date(data.createdAt).getTime() + 48 * 60 * 60 * 1000);
  }

  if (parentPhaseEnd && deadlineTime) {
      if (now < parentPhaseEnd) {
          current_phase = 'parent_only';
      } else if (now < deadlineTime) {
          current_phase = 'coach_open';
      } else {
          current_phase = 'expired';
      }
  }

  return {
    code: 0,
    data: {
      ...data,
      _collection: collection,
      isJoined: isJoined,
      current_phase: current_phase,
      // 返回时间供前端展示
      parent_phase_end_time: parentPhaseEnd,
      deadline_time: deadlineTime
    },
    // 返回调用者身份信息，供前端权限校验
    caller: {
        openid: openid,
        isJoined: isJoined
    }
  }
}

/**
 * 锁班: atfirst_* -> final_*
 */
async function lockOrder(orderId, openid, userId, isSystem = false) {
  const { data, collection, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 权限校验 (系统调用除外)
  if (!isSystem && data.publisher_openid !== openid && data.publisher_Id !== userId) {
    return { code: 403, msg: '仅发布者可锁班' }
  }

  // 确定目标集合
  // let targetCollection = ''
  // if (collection === 'atfirst_pddbox') targetCollection = 'final_pddbox'
  // else if (collection === 'atfirst_req') targetCollection = 'final_req'
  // else if (collection.startsWith('final_')) return { code: 0, msg: '订单已锁定' }
  // else return { code: 500, msg: '集合状态异常' }

  // 生成课表
  const classCount = (data.final_plan && data.final_plan.class_count) || data.progress_total || 10
  const schedule = []
  // 改为初始只生成第一节课
  schedule.push({
    lesson: 1,
    status: 'PENDING',
    coach_status: 'none',
    parent_status: 'none',
    logs: []
  })

  const updates = {
    publish_state: 'locked_pre',
    lockedAt: new Date(),
    lockedBy: userId || openid,
    schedule: schedule,
    progress_total: classCount,
    progress_done: 0
  }

  // 原地更新，不迁移
  await ref.update({ data: updates })

  return { code: 0, msg: '锁班成功 (等待最终确认)' }
}

/**
 * 确认成团: locked_pre -> locked_post
 */
async function confirmGroup(orderId, openid, userId) {
  const { data, collection, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  if (data.publisher_openid !== openid && data.publisher_Id !== userId) {
    return { code: 403, msg: '无权操作' }
  }

  await ref.update({
    data: {
      publish_state: 'locked_post',
      confirmedAt: new Date()
    }
  })

  return { code: 0, msg: '确认成团成功' }
}

/**
 * 开始课程: fulfill_state -> in_progress
 */
async function startOrder(orderId, openid, userId) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  if (data.publisher_openid !== openid && data.publisher_Id !== userId) {
    return { code: 403, msg: '无权操作' }
  }

  await ref.update({
    data: {
      fulfill_state: 'in_progress',
      startedAt: new Date()
    }
  })

  return { code: 0, msg: '课程已开始' }
}

/**
 * 课节握手
 */
async function lessonHandshake(orderId, openid, userId, lessonIndex, subAction) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }
  if (!data.schedule) return { code: 400, msg: '课表不存在' }

  const schedule = data.schedule
  const lessonIdx = schedule.findIndex(l => l.lesson == lessonIndex)
  if (lessonIdx === -1) {
      console.warn(`[execution_order] [lessonHandshake] Lesson not found. OrderId: ${orderId}, Target: ${lessonIndex} (${typeof lessonIndex}), Schedule:`, schedule.map(l => l.lesson));
      return { code: 404, msg: '课节不存在' }
  }

  const lesson = schedule[lessonIdx]
  const now = new Date()
  let updates = {}

  switch (subAction) {
    case 'coach_ready':
      // 教练必须是接单人 (校验 ID 或 OpenID)
      if (data.acceptorId !== userId && data.acceptorOpenid !== openid) {
          return { code: 403, msg: '非当前教练' }
      }
      lesson.coach_status = 'ready'
      // 2024-05-23: 教练直接开始上课，跳过家长确认
      lesson.status = 'PARENT_CONFIRMED' 
      lesson.parent_status = 'confirmed' // 自动确认
      if (!lesson.startedAt) lesson.startedAt = now
      
      lesson.logs.push({ action: 'coach_start', time: now, userId })
      break

    case 'parent_confirm':
      // 必须是参与者
      if (!isParticipant(data, openid, userId)) return { code: 403, msg: '非课程参与者' }
      lesson.parent_status = 'confirmed'
      lesson.status = 'PARENT_CONFIRMED'
      if (!lesson.startedAt) lesson.startedAt = now // Record start time
      lesson.logs.push({ action: 'parent_confirm', time: now, userId })
      break

    case 'coach_complete':
      if (data.acceptorId !== userId && data.acceptorOpenid !== openid) {
          return { code: 403, msg: '非当前教练' }
      }
      lesson.coach_status = 'completed'
      if (!lesson.completedAt) lesson.completedAt = now // Record completion time
      if (lesson.parent_status === 'completed') {
        lesson.status = 'DONE'
        updates.progress_done = _.inc(1)
      } else {
        lesson.status = 'COMPLETED_BY_COACH'
      }
      lesson.logs.push({ action: 'coach_complete', time: now, userId })
      break

    case 'parent_complete':
      if (!isParticipant(data, openid, userId)) return { code: 403, msg: '非课程参与者' }
      lesson.parent_status = 'completed'
      if (lesson.coach_status === 'completed') {
        lesson.status = 'DONE'
        updates.progress_done = _.inc(1)

        // 结算资金给教练
        if (lesson.payment_status === 'paid') {
             const amount = data.price || 0
             // 记录结算交易
             await db.collection('transactions').add({
                data: {
                    orderId,
                    lessonIndex,
                    amount,
                    payer: 'PLATFORM_PUBLIC_ACCOUNT',
                    payee: data.acceptorId || data.acceptorOpenid,
                    type: 'settlement',
                    status: 'success',
                    createdAt: new Date()
                }
             })
        }
      } else {
        lesson.status = 'COMPLETED_BY_PARENT'
      }
      lesson.logs.push({ action: 'parent_complete', time: now, userId })
      break

    default:
      return { code: 400, msg: '未知握手动作' }
  }

  schedule[lessonIdx] = lesson
  updates.schedule = schedule

  // 自动判断是否完结
  if (lesson.status === 'DONE') {
    // 检查是否需要生成下一节课
    const currentDoneCount = (data.progress_done || 0) + 1
    const totalCount = data.progress_total || 10

    if (currentDoneCount < totalCount) {
        const nextLessonNum = currentDoneCount + 1
        const exists = schedule.some(l => l.lesson === nextLessonNum)
        if (!exists) {
            schedule.push({
                lesson: nextLessonNum,
                status: 'PENDING',
                coach_status: 'none',
                parent_status: 'none',
                logs: []
            })
            updates.schedule = schedule
        }
    }

    const allDone = schedule.every(l => l.status === 'DONE')
    if (allDone) {
      updates.fulfill_state = 'completed'
      updates.completedAt = new Date()
    } else {
      // 只要有一节课开始，且未全部完成，就是 in_progress
      if (data.fulfill_state !== 'in_progress') {
        updates.fulfill_state = 'in_progress'
      }
    }
  }

  await ref.update({ data: updates })
  return { code: 0, msg: '操作成功', status: lesson.status }
}

/**
 * 更新课程内容 (总结、图片/视频)
 */
async function updateLessonContent(orderId, openid, userId, lessonIndex, content) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }
  if (!data.schedule) return { code: 400, msg: '课表不存在' }

  // 必须是教练或发布者
  // 但通常只有教练填写总结
  if (data.acceptorId !== userId && data.publisher_Id !== userId && data.publisher_openid !== openid) {
      return { code: 403, msg: '无权操作' }
  }

  const schedule = data.schedule
  const lessonIdx = schedule.findIndex(l => l.lesson == lessonIndex)
  if (lessonIdx === -1) {
      console.warn(`[execution_order] [updateLessonContent] Lesson not found. OrderId: ${orderId}, Target: ${lessonIndex}, Schedule:`, schedule.map(l => l.lesson));
      return { code: 404, msg: '课节不存在' }
  }

  const lesson = schedule[lessonIdx]
  
  // 更新内容
  if (content.summary !== undefined) lesson.summary = content.summary
  if (content.media !== undefined) lesson.media = content.media // Array of fileIDs

  schedule[lessonIdx] = lesson
  
  await ref.update({
      data: {
          schedule: schedule
      }
  })

  return { code: 0, msg: '保存成功' }
}

/**
 * 手动完成订单
 */
async function completeOrder(orderId, openid, userId) {
  const { data, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  if (data.publisher_openid !== openid && data.publisher_Id !== userId) {
    return { code: 403, msg: '无权操作' }
  }

  await ref.update({
    data: {
      fulfill_state: 'completed',
      completedAt: new Date()
    }
  })
  return { code: 0, msg: '订单已完成' }
}

/**
 * 取消订单
 */
async function cancelOrder(orderId, openid, userId, reason) {
   const { data, ref } = await findOrder(orderId)
   if (!data) return { code: 404, msg: '订单不存在' }

   // 仅发布者或系统管理员可取消
   if (data.publisher_openid !== openid && data.publisher_Id !== userId) {
     return { code: 403, msg: '无权操作' }
   }

   // 更新参与者状态为已退出
   let updatedParticipants = data.participants || [];
   if (updatedParticipants.length > 0) {
       updatedParticipants = updatedParticipants.map(p => ({
           ...p,
           status: 'exited', // 统一标记为已退出
           parentStatus: '已退出',
           exitedAt: new Date(),
           exitReason: 'course_cancelled'
       }));
   }

   await ref.update({
     data: {
       fulfill_state: 'cancelled',
       publish_state: 'closed',
       cancelledAt: new Date(),
       cancelReason: reason || '无',
       participants: updatedParticipants // 覆盖更新参与者状态
     }
   })
   return { code: 0, msg: '订单已取消' }
}

/**
 * 获取我的列表
 */
async function listMyself(openid, userId, page, limit) {
  const collections = ['final_pddbox', 'final_req', 'atfirst_pddbox', 'atfirst_req']
  const query = _.or([
    { publisher_openid: openid },
    { 'participants.openid': openid },
    { acceptorId: userId },
    { acceptorOpenid: openid },
    { 'Willing_coach.willing.openid': openid } // 教练已表达意向
  ])

  // 并发查询
  const tasks = collections.map(c => 
    db.collection(c).where(query).orderBy('createdAt', 'desc').limit(50).get().catch(()=>({data:[]}))
  )
  
  const results = await Promise.all(tasks)
  let allOrders = []
  results.forEach(r => { allOrders = allOrders.concat(r.data) })
  
  // Deduplicate by _id (prefer final_* which are queried first if we follow the collections order)
  // collections order is ['final_pddbox', 'final_req', 'atfirst_pddbox', 'atfirst_req']
  // So if we just use a Map to keep the first seen ID, we keep the final one.
  const uniqueOrders = new Map();
  for (const order of allOrders) {
      if (!uniqueOrders.has(order._id)) {
          uniqueOrders.set(order._id, order);
      }
  }
  allOrders = Array.from(uniqueOrders.values());

  // 内存排序
  allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  
  // 分页
  const start = (page - 1) * limit
  const pagedData = allOrders.slice(start, start + limit)
  
  return { code: 0, data: pagedData }
}

/**
 * 获取公开市场订单
 */
async function listPublic(page, limit) {
  const collections = ['atfirst_req', 'atfirst_pddbox']
  const query = _.or([
    { publish_state: 'public_view' },
    { publish_state: 'nearby_group' }
  ])

  // 并发查询
  const tasks = collections.map(c => 
    db.collection(c).where(query).orderBy('createdAt', 'desc').limit(50).get().catch(()=>({data:[]}))
  )
  
  const results = await Promise.all(tasks)
  let allOrders = []
  results.forEach(r => { allOrders = allOrders.concat(r.data) })
  
  // 内存排序
  allOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  
  // 分页
  const start = (page - 1) * limit
  const pagedData = allOrders.slice(start, start + limit)
  
  return { code: 0, data: pagedData }
}

/**
 * 教练接单: atfirst_req -> final_req
 */
async function acceptOrder(orderId, openid, userId) {
  const { data, collection, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 校验状态
  if (data.fulfill_state !== 'pending') {
    return { code: 400, msg: '订单已被接取或不在待接单状态' }
  }
  
  // 不能接自己的单
  if (data.publisher_openid === openid || data.publisher_Id === userId) {
    return { code: 400, msg: '无法接取自己发布的订单' }
  }

  // 确定目标集合
  // let targetCollection = ''
  // if (collection === 'atfirst_req') targetCollection = 'final_req'
  // else if (collection === 'atfirst_pddbox') targetCollection = 'final_pddbox' // 理论上拼团单走 lock_order，但也可能直接接单?
  // else if (collection.startsWith('final_')) return { code: 0, msg: '订单已接取' }
  // else return { code: 500, msg: '集合状态异常' }

  // 生成课表
  const classCount = data.class_count || data.progress_total || 1
  const schedule = []
  
  // 修改: 初始化仅生成第1节课，后续由教练手动添加 (响应用户需求: 不要一次性生成全部)
  const initialLessons = 1; 
  for (let i = 0; i < initialLessons; i++) {
    schedule.push({
      lesson: i + 1,
      status: 'PENDING',
      coach_status: 'none',
      parent_status: 'none',
      logs: []
    })
  }

  const updates = {
    fulfill_state: 'negotiating', // 防止被其他人接单，且不进入 final
    acceptorId: userId,
    acceptorOpenid: openid,
    acceptedAt: new Date(),
    schedule: schedule,
    progress_total: classCount,
    progress_done: 0
  }

  // 原地更新，不迁移
  await ref.update({ data: updates })

  return { code: 0, msg: '接单成功 (进入协商阶段)' }
}


/**
 * 手动添加课节 (教练)
 */
async function addLesson(orderId, openid) {
  const { data, collection, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 权限校验 (必须是接单人)
  if (data.acceptorOpenid !== openid) {
      return { code: 403, msg: '无权操作' }
  }

  const currentSchedule = data.schedule || [];
  const nextLessonIndex = currentSchedule.length + 1;
  const currentTotal = data.progress_total || 0;

  const newLesson = {
    lesson: nextLessonIndex,
    status: 'PENDING',
    coach_status: 'none',
    parent_status: 'none',
    logs: [{ action: 'manual_add', time: new Date() }]
  };

  const updateData = {
      schedule: _.push(newLesson)
  };

  // Only increment progress_total if we are exceeding the current total
  // (Assuming manual addition is used to fill up the quota first)
  if (currentSchedule.length >= currentTotal) {
      updateData.progress_total = _.inc(1);
  }

  await ref.update({
    data: updateData
  });

  return { code: 0, msg: '添加成功', data: newLesson };
}


/**
 * 协商完成 (教练提交)
 * 触发: 写入 final_* 集合, 锁定订单
 */
async function completeNegotiation(orderId, price, count, instructions, openid, userId) {
  const { data, collection, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  // 权限校验 (必须是接单人)
  if (data.acceptorOpenid !== openid && data.acceptorId !== userId) {
      return { code: 403, msg: '无权操作' }
  }

  // 确定目标集合
  let targetCollection = ''
  if (collection === 'atfirst_pddbox') targetCollection = 'final_pddbox'
  else if (collection === 'atfirst_req') targetCollection = 'final_req'
  else return { code: 400, msg: '当前订单状态不支持此操作' }

  // 生成课表
  const classCount = count || data.progress_total || 10
  const schedule = []
  
  // 修改: 初始化仅生成第1节课，后续由教练手动添加 (响应用户需求: 不要一次性生成全部)
  const initialLessons = 1; 
  for (let i = 0; i < initialLessons; i++) {
    schedule.push({
      lesson: i + 1,
      status: 'PENDING',
      coach_status: 'none',
      parent_status: 'none',
      logs: []
    })
  }

  const now = new Date()
  
  // 准备更新数据
  const updates = {
      price: price, // 单价
      progress_total: classCount, // 总课节
      special_instructions: instructions,
      negotiation_completed: true,
      publish_state: 'locked_pre', // 锁定状态 (等待家长确认/支付)
      lockedAt: now,
      schedule: schedule
  }
  
  // 1. 更新原订单 (atfirst_*)
  await ref.update({ data: updates })

  // 2. 写入 final_* 集合 (使用相同的 _id 以便前端无缝衔接)
  const finalData = {
      ...data,
      ...updates,
      _id: data._id, // 保持 ID 一致
      migratedAt: now,
      origin_collection: collection
  }
  
  // 尝试写入 final 集合
  try {
      await db.collection(targetCollection).add({ data: finalData })
  } catch (err) {
      // 如果已存在 (可能重复提交)，则尝试更新
      if (err.errCode === -502005 || (err.errMsg && err.errMsg.includes('duplicate key'))) {
           await db.collection(targetCollection).doc(data._id).update({ data: updates })
      } else {
          throw err
      }
  }

  return { code: 0, msg: '协商完成，订单已生成' }
}

/**
 * 平台管理员指派教练
 * 用于：平台同意教练进入，将教练设为接单人
 */
async function adminAssignCoach(orderId, coachId, coachOpenid, operatorOpenid) {
  // 1. 权限校验 (简单占位，实际需校验 operatorOpenid 是否为管理员)
  // const isAdmin = await checkAdmin(operatorOpenid);
  // if (!isAdmin) return { code: 403, msg: '无权操作' }
  
  // 尝试补全 coachId
  if (!coachId && coachOpenid) {
      try {
          const userRes = await db.collection('sys_user').where({ openid: coachOpenid }).get()
          if (userRes.data.length > 0) {
              coachId = userRes.data[0]._id
          }
      } catch (e) {
          console.error('Find coach userId error:', e)
      }
  }

  const { data, collection, ref } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  const now = new Date()
  
  // 准备更新字段
  const updates = {
    acceptorId: coachId, // 可选，若无 userId 则为空
    acceptorOpenid: coachOpenid,
    assignedAt: now,
    assignedBy: operatorOpenid,
    // 如果之前没有 willing，可以补上? 不必须
  }

  // 情况1：拼团协商中 (atfirst_pddbox)
  // 只更新 acceptor，不移动集合，等待家长锁班
  if (collection === 'atfirst_pddbox') {
      await ref.update({
          data: {
              ...updates,
              // 可能需要把状态改为 pending (如果之前是 draft?)
              // 但通常保持 nearby_group
          }
      })
      return { code: 0, msg: '已指派教练 (拼团协商中)' }
  }

  // 情况2：单人协商中 (atfirst_req)
  // 仅更新 acceptor，不移动集合，等待协商完成后锁单 (lock_order)
  if (collection === 'atfirst_req') {
      await ref.update({
          data: {
              ...updates,
              fulfill_state: 'negotiating' // 防止被其他人接单
          }
      })
      return { code: 0, msg: '已指派教练 (进入协商阶段)' }
  }

  // 情况3：已锁定/已接单 (final_*)
  // 仅更新 acceptor (更换教练)
  if (collection.startsWith('final_')) {
      await ref.update({ data: updates })
      return { code: 0, msg: '已更换教练' }
  }

  return { code: 500, msg: '未知集合类型' }
}

/**
 * 发布订单
 */
async function publishOrder(submitForm, openid, userId) {
  if (!submitForm) return { code: 1, msg: '提交数据为空' }
  
  const publishType = (submitForm.publish_type || '').trim()
  let publishState = 'draft'
  let targetCollection = 'atfirst_req' 

  // 根据 accept_group 决定集合
  if (submitForm.accept_group === true) {
     targetCollection = 'atfirst_pddbox'
     publishState = 'nearby_group'
  } else {
     targetCollection = 'atfirst_req'
     if (publishType === '指定教练员') {
         publishState = 'direct_invite'
     } else {
         publishState = 'public_view'
     }
  }
  
  const userInfo = submitForm.userInfo || { nickName: '发布者', avatarUrl: '' };

  // 默认将发布者加入参与者列表
  const participants = [{
      openid: openid,
      userId: userId,
      status: 'confirmed',
      parentStatus: '已加入',
      intention: { childCount: submitForm.participant_count || 1 },
      isPublisher: true,
      userInfo: userInfo,
      contact: submitForm.contact,
      location: submitForm.location
  }];

  // 计算时间阶段
  // 假设 submitForm.deadline 是截止时间字符串，或者默认 48 小时
  // 按照用户需求：parent_phase_end_time = createdAt + 24h, deadline_time = createdAt + 48h
  const now = new Date();
  const parentPhaseDuration = 24 * 60 * 60 * 1000; // 24 hours
  const totalDeadlineDuration = 48 * 60 * 60 * 1000; // 48 hours
  
  const parentPhaseEndTime = new Date(now.getTime() + parentPhaseDuration);
  const deadlineTime = new Date(now.getTime() + totalDeadlineDuration);

  // 如果用户自定义了截止时间，也可以适配，但这里先按标准模型走
  // 若 submitForm.deadline 存在，也可以作为 deadline_time，然后倒推 phase1? 
  // 暂时按用户要求的 "createdAt + 24h" 模型

  const data = {
    ...submitForm,
    publisher_openid: openid,
    publisher_Id: userId, 
    publisherInfo: userInfo, // 保存发布者信息
    publish_state: publishState,
    fulfill_state: 'pending', 
    createdAt: now,
    updatedAt: now,
    parent_phase_end_time: parentPhaseEndTime,
    deadline_time: deadlineTime,
    participants: participants, 
    coach_negotiation: {} 
  }
  
  // 移除顶层的 contact 字段，避免数据冗余（根据用户需求：contact 放到 participants 里面）
  delete data.contact;
  
  const res = await db.collection(targetCollection).add({ data })
  const newOrderId = res._id;
  console.log('订单创建成功:', newOrderId);
  
  // 触发聊天群创建 (Publisher + Robot)
  await callSendSystemMessage(newOrderId, '[系统通知] 订单已发布，欢迎进入沟通群。', openid);

  return { code: 0, msg: '发布成功', orderId: newOrderId }
}

/**
 * 调用 pdd_chat_massage 发送系统消息 (并确保用户加入群聊)
 */
async function callSendSystemMessage(orderId, content, operatorOpenid) {
    try {
        console.log(`[execution_order] 触发系统消息: orderId=${orderId}, openid=${operatorOpenid}`);
        await cloud.callFunction({
            name: 'pdd_chat_massage',
            data: {
                action: 'send_negotiation_msg',
                conversationId: orderId, // orderId 即 chat_id
                content: content,
                contentType: 'text',
                fromOpenid: operatorOpenid // 显式传递 OpenID，确保 pdd_chat_massage 能正确识别发送者
            }
        });
        // WAIT: cloud.callFunction usually preserves the user context if called from client -> cloud -> cloud?
        // No, client -> cloud (execution_order) -> cloud (pdd_chat_massage).
        // The second hop might lose the OPENID or change it.
        // It's safer to modify pdd_chat_massage to accept an explicit 'forceOpenid' or similar param for system calls,
        // OR rely on 'event.userInfo' which might be passed.
        // Actually, let's look at pdd_chat_massage. It uses cloud.getWXContext().OPENID.
        // If execution_order calls it, execution_order has the user's context.
        // Does callFunction propagate it? Yes, usually, if same environment.
        // Let's assume it does for now. If not, we might need to patch pdd_chat_massage.
        // BETTER: execution_order passes the 'openid' in the data, and pdd_chat_massage checks it if provided (and maybe validates strict permission or system secret).
        // For now, I'll pass it in data as 'fromOpenid' and update pdd_chat_massage to use it if present?
        // No, let's stick to standard first.
    } catch (e) {
        console.error('[execution_order] 触发系统消息失败:', e);
    }
}

/**
 * 获取详细信息 (管理员)
 */
async function adminGetDetail(id, collectionName) {
    const ALLOWED_COLLECTIONS = ['atfirst_pddbox', 'atfirst_req', 'final_pddbox', 'final_req', 'sys_logs', 'sys_user'];
    if (!ALLOWED_COLLECTIONS.includes(collectionName)) {
        return { code: 403, msg: '非法集合访问' };
    }

    try {
        const res = await db.collection(collectionName).doc(id).get();
        return {
            code: 0,
            data: res.data
        };
    } catch (err) {
        console.error('adminGetDetail error:', err);
        return { code: 404, msg: '未找到记录或查询失败', error: err };
    }
}

// ================= 辅助函数 =================

async function findOrder(orderId) {
  const collections = ['final_pddbox', 'final_req', 'atfirst_pddbox', 'atfirst_req']
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

function isParticipant(order, openid, userId) {
  if (order.publisher_openid === openid || order.publisher_Id === userId) return true
  if (order.participants && order.participants.some(p => p.openid === openid)) return true
  return false
}

/**
 * 获取支付参数 (统一下单)
 */
async function getPaymentParams(orderId, openid, userId, lessonIndex) {
  const { data } = await findOrder(orderId)
  if (!data) return { code: 404, msg: '订单不存在' }

  const schedule = data.schedule || []
  const lessonIdx = schedule.findIndex(l => l.lesson == lessonIndex)
  if (lessonIdx === -1) {
      console.warn(`[execution_order] [getPaymentParams] Lesson not found. OrderId: ${orderId}, Target: ${lessonIndex}, Schedule:`, schedule.map(l => l.lesson));
      return { code: 404, msg: '课节不存在' }
  }
  const lesson = schedule[lessonIdx]
  
  // 允许 WAIT_PAYMENT 状态支付
  if (lesson.status !== 'WAIT_PAYMENT') return { code: 400, msg: '当前无需支付' }

  // 1. 获取商户号 (请替换为真实的商户号)
  const subMchId = 'YOUR_MCH_ID'; 
  const envId = cloud.DYNAMIC_CURRENT_ENV;

  // 2. 如果未配置商户号，返回模拟标识
  if (!subMchId || subMchId === 'YOUR_MCH_ID') {
      return { 
          code: 0, 
          mock: true, 
          msg: '未配置商户号，使用模拟支付' 
      }
  }

  // 3. 调用统一下单
  try {
    const amount = Math.round((data.price || 0) * 100) // 转为分
    if (amount <= 0) return { code: 400, msg: '金额异常' }

    // 确保 cloudPay 可用
    if (!cloud.cloudPay) {
        console.error('cloudPay not available');
        return { code: -1, msg: '支付功能未初始化' };
    }

    const res = await cloud.cloudPay.unifiedOrder({
      body: `课程支付-第${lessonIndex}节`,
      outTradeNo: `${orderId}_${lessonIndex}_${Date.now()}`,
      spbillCreateIp: '127.0.0.1',
      subMchId: subMchId,
      totalFee: amount,
      envId: envId,
      functionName: 'pay_cb' // 支付回调云函数
    })
    
    return { 
        code: 0, 
        payment: res.payment,
        mock: false
    }
  } catch (err) {
    console.error('UnifiedOrder fail:', err)
    return { code: -1, msg: '统一下单失败', error: err }
  }
}

/**
 * 教练发送支付单
 */
async function sendLessonOrder(orderId, openid, userId, lessonIndex) {
  try {
      const { data, ref } = await findOrder(orderId)
      if (!data) return { code: 404, msg: '订单不存在' }
      
      if (data.acceptorId !== userId && data.acceptorOpenid !== openid) {
        return { code: 403, msg: '仅教练可发送支付单' }
      }

      const schedule = data.schedule || []
      const lessonIdx = schedule.findIndex(l => l.lesson == lessonIndex)
      if (lessonIdx === -1) {
          console.warn(`[execution_order] [sendLessonOrder] Lesson not found. OrderId: ${orderId}, Target: ${lessonIndex}, Schedule:`, schedule.map(l => l.lesson));
          return { code: 404, msg: '课节不存在' }
      }

      const lesson = schedule[lessonIdx]
      // 允许从 PENDING 状态发送
      if (lesson.status !== 'PENDING') return { code: 400, msg: '当前状态不可发送支付单' }

      lesson.status = 'WAIT_PAYMENT'
      lesson.payment_status = 'unpaid'
      lesson.logs.push({ action: 'send_order', time: new Date(), userId: userId || openid })

      schedule[lessonIdx] = lesson
      await ref.update({ data: { schedule } })

      // 发送系统通知到协商群聊
      try {
          const msgContent = `[系统通知] 教练已发起第${lessonIndex}节课的支付单，请家长前往订单详情支付。`;
          await cloud.callFunction({
              name: 'pdd_chat_massage',
              data: {
                  action: 'send_negotiation_msg',
                  conversationId: orderId,
                  content: msgContent,
                  contentType: 'system', // 使用系统消息类型
                  targetUserId: 'all',
                  fromOpenid: openid // 显式传递 OpenID
              }
          })
      } catch (err) {
          console.error('发送群聊通知失败:', err)
          // 不阻塞主流程
      }

      return { code: 0, msg: '已发送支付单' }
  } catch (err) {
      console.error('sendLessonOrder fail:', err)
      return { code: 500, msg: '发送支付单失败', error: err }
  }
}

/**
 * 家长支付
 */
async function payLessonOrder(orderId, openid, userId, lessonIndex) {
  try {
      const { data, ref } = await findOrder(orderId)
      if (!data) return { code: 404, msg: '订单不存在' }

      // 校验是否为参与家长
      const isParent = data.participants && data.participants.some(p => p.openid === openid || p.userId === userId)
      if (!isParent) return { code: 403, msg: '非课程家长' }

      const schedule = data.schedule || []
      const lessonIdx = schedule.findIndex(l => l.lesson == lessonIndex)
      if (lessonIdx === -1) {
          console.warn(`[execution_order] [payLessonOrder] Lesson not found. OrderId: ${orderId}, Target: ${lessonIndex}, Schedule:`, schedule.map(l => l.lesson));
          return { code: 404, msg: '课节不存在' }
      }

      const lesson = schedule[lessonIdx]
      if (lesson.status !== 'WAIT_PAYMENT') return { code: 400, msg: '无需支付或未发送支付单' }

      // 模拟支付成功，资金进入对公账户
      const amount = data.price || 0
      
      // 记录交易 (Mock)
      try {
          const transactionData = {
                orderId,
                lessonIndex,
                amount,
                payer: userId || openid,
                payee: 'PLATFORM_PUBLIC_ACCOUNT',
                type: 'payment',
                status: 'success',
                createdAt: db.serverDate()
            };
          await db.collection('transactions').add({ data: transactionData })
      } catch (err) {
          // 如果集合不存在，尝试创建
          if (err.errCode === -502005 || (err.errMsg && (err.errMsg.includes('collection not exists') || err.errMsg.includes('Collection not found')))) {
              try {
                  await db.createCollection('transactions')
                  await db.collection('transactions').add({
                    data: {
                        orderId,
                        lessonIndex,
                        amount,
                        payer: userId || openid,
                        payee: 'PLATFORM_PUBLIC_ACCOUNT',
                        type: 'payment',
                        status: 'success',
                        createdAt: db.serverDate()
                    }
                  })
              } catch (e) {
                  console.error('Create transactions collection fail:', e)
                  // 忽略错误，继续流程，以免阻碍主业务
              }
          } else {
              console.error('Add transaction fail:', err)
          }
      }

      lesson.status = 'PAID'
      lesson.payment_status = 'paid'
      lesson.logs.push({ action: 'pay_success', time: new Date(), userId: userId || openid })

      schedule[lessonIdx] = lesson
      await ref.update({ data: { schedule } })

      // 发送系统通知
      try {
          const msgContent = `[系统通知] 第${lessonIndex}节课已支付成功，请教练准备上课。`;
          await cloud.callFunction({
              name: 'pdd_chat_massage',
              data: {
                  action: 'send_negotiation_msg',
                  conversationId: orderId,
                  content: msgContent,
                  contentType: 'system',
                  targetUserId: 'all'
              }
          })
      } catch (err) {
          console.error('发送群聊通知失败:', err)
      }

      return { code: 0, msg: '支付成功' }
  } catch (err) {
      console.error('payLessonOrder fail:', err)
      return { code: 500, msg: '支付处理失败', error: err }
  }
}
