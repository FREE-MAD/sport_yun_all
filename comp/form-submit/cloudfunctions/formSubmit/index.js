// ============================================================
// 业务积木：表单提交 - 云函数（通用写入）
// 接收 event.collection 和 event.formData，写入对应数据库集合
// 业务方无需修改本文件，仅通过调用方传入 collection 区分业务
// ============================================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

module.exports.main = async (event, context) => {
  const { collection, formData } = event

  // 基础参数校验
  if (!collection) {
    return { success: false, message: '缺少集合名 collection' }
  }
  if (!formData || typeof formData !== 'object') {
    return { success: false, message: '缺少表单数据 formData' }
  }

  try {
    // 注入时间戳，便于后续排序与维护
    const payload = {
      ...formData,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }

    // 写入数据库
    const res = await db.collection(collection).add({ data: payload })

    return {
      success: true,
      _id: res._id,
      message: '入库成功'
    }
  } catch (err) {
    console.error('[formSubmit] 写入失败:', err)
    return {
      success: false,
      message: err.errMsg || err.message || '写入异常'
    }
  }
}
