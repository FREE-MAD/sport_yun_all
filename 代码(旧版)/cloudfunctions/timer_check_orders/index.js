const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 配置常量
const REMINDER_INTERVAL_HOURS = 24
const AUTO_LOCK_HOURS = 72

exports.main = async (event, context) => {
  const now = new Date()
  console.log('[timer_check_orders] Start checking...', now)

  try {
    // 1. 获取所有 negotiation 状态的拼团订单
    // 只检查 atfirst_pddbox 中 publish_state = 'nearby_group' 的
    const ordersRes = await db.collection('atfirst_pddbox')
        .where({
        publish_state: 'nearby_group'
        })
        .get()

    const orders = ordersRes.data
    console.log(`[timer_check_orders] Found ${orders.length} orders in negotiation`)

    const tasks = []

    for (const order of orders) {
        tasks.push(processOrder(order, now))
    }

    await Promise.all(tasks)

    return { msg: 'Check completed', processed: orders.length }
  } catch (err) {
      console.error('[timer_check_orders] Fatal Error', err)
      return { error: err }
  }
}

async function processOrder(order, now) {
  const createdAt = new Date(order.createdAt)
  const diffMs = now - createdAt
  const diffHours = diffMs / (1000 * 60 * 60)
  
  // === 1. 自动锁班检查 ===
  if (diffHours >= AUTO_LOCK_HOURS) {
    console.log(`[Order ${order._id}] Trigger Auto Lock (Diff: ${diffHours.toFixed(1)}h)`)
    try {
        // 调用 execution_order 锁班
        await cloud.callFunction({
            name: 'execution_order',
            data: {
                action: 'lock_order',
                orderId: order._id,
                isSystem: true
            }
        })
        
        // 发送系统通知
        await sendSystemMsg(order._id, '【系统通知】由于拼团超过72小时未完成，系统已自动锁班并生成默认课表。')
        return // 锁班后不再提醒
    } catch (err) {
        console.error(`[Order ${order._id}] Auto Lock Failed`, err)
    }
  }

  // === 2. 24小时提醒检查 ===
  // 逻辑：每过 24 小时提醒一次
  // 检查 lastReminderTime
  const lastReminderTime = order.lastReminderTime ? new Date(order.lastReminderTime) : createdAt
  const timeSinceLast = (now - lastReminderTime) / (1000 * 60 * 60)

  // 必须满足：
  // 1. 距离创建时间超过 23 小时 (避免刚创建就提醒)
  // 2. 距离上次提醒超过 23.5 小时 (留点余量)
  if (diffHours > 23 && timeSinceLast >= 23.5) {
      console.log(`[Order ${order._id}] Trigger Reminder (Last: ${timeSinceLast.toFixed(1)}h ago)`)
      
      const hours = Math.floor(diffHours)
      const msg = `【系统提醒】本拼团已发布 ${hours} 小时。请家长和教练尽快确认意向，发布者可点击"锁班"进入排课阶段。超过72小时将自动锁班。`
      
      try {
          await sendSystemMsg(order._id, msg)
          
          // 更新提醒时间
          await db.collection('atfirst_pddbox').doc(order._id).update({
              data: {
                  lastReminderTime: now
              }
          })
      } catch (err) {
          console.error(`[Order ${order._id}] Send Reminder Failed`, err)
      }
  }
}

async function sendSystemMsg(orderId, content) {
    // 调用 pdd_chat_massage 发送协商群消息
    // conversationId 在 negotiation 阶段通常就是 orderId
    try {
        await cloud.callFunction({
            name: 'pdd_chat_massage',
            data: {
                action: 'send_negotiation_msg',
                conversationId: orderId,
                content: content,
                contentType: 'text'
            }
        })
    } catch (e) {
        console.error(`[Order ${orderId}] Call pdd_chat_massage failed`, e)
    }
}
