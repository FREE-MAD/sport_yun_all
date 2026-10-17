// ============================================================
// 业务积木：表单提交 - 配置区（多业务 + 多字段类型版）
// 业务方只允许修改本文件，核心代码（form.js / form.wxml / 云函数）一行不改
//
// 支持字段类型 (type)：
//   text      文本输入        属性: placeholder / defaultValue / maxlength
//   number    数字输入        属性: placeholder / defaultValue / min / max
//   phone     手机号输入       属性: placeholder / defaultValue / maxlength (11)
//   textarea  多行文本        属性: placeholder / defaultValue / maxlength
//   date      日期选择        属性: placeholder / defaultValue (YYYY-MM-DD)
//   select    下拉选择        属性: placeholder / defaultValue / options:[{label,value}]
//   radio     单选按钮组      属性: defaultValue / options:[{label,value}]
//   checkbox  多选按钮组      属性: defaultValue:[] / options:[{label,value}]
//   switch    开关           属性: defaultValue (boolean)
//
// 通用属性：name / label / type / required
// ============================================================

module.exports = {

  // ----------------------------------------------------------
  // 业务 A：收集 123 → 云函数 C → 数据库 K
  // 演示全部 8 种字段类型
  // 入口：?biz=student
  // ----------------------------------------------------------
  student: {
    collection: 'students',           // 数据库 K
    cloudFunctionName: 'formSubmitC', // 云函数 C
    fields: [
      // 文本输入
      {
        name: 'name', label: '姓名', type: 'text', required: true,
        placeholder: '请输入姓名',
        defaultValue: '',
        maxlength: 20
      },
      // 数字输入
      {
        name: 'age', label: '年龄', type: 'number', required: true,
        placeholder: '请输入年龄',
        defaultValue: '',
        min: 1,
        max: 100
      },
      // 多行文本
      {
        name: 'remark', label: '备注', type: 'textarea', required: false,
        placeholder: '请输入备注',
        defaultValue: '',
        maxlength: 200
      },
      // 日期选择
      {
        name: 'birthday', label: '生日', type: 'date', required: true,
        placeholder: '请选择生日',
        defaultValue: ''
      },
      // 下拉选择
      {
        name: 'gender', label: '性别', type: 'select', required: true,
        placeholder: '请选择性别',
        options: [
          { label: '男', value: 'M' },
          { label: '女', value: 'F' }
        ],
        defaultValue: ''
      },
      // 单选按钮组
      {
        name: 'level', label: '等级', type: 'radio', required: true,
        options: [
          { label: '初级', value: '1' },
          { label: '中级', value: '2' },
          { label: '高级', value: '3' }
        ],
        defaultValue: ''
      },
      // 多选按钮组（值是数组）
      {
        name: 'tags', label: '标签', type: 'checkbox', required: false,
        options: [
          { label: '运动', value: 'sport' },
          { label: '音乐', value: 'music' },
          { label: '阅读', value: 'read' }
        ],
        defaultValue: []
      },
      // 开关（值是 boolean）
      {
        name: 'subscribe', label: '订阅消息', type: 'switch', required: false,
        defaultValue: false
      }
    ],
    feedback: {
      successText: '提交成功',
      errorText: '提交失败，请稍后再试'
    }
  },

  // ----------------------------------------------------------
  // 业务 B：收集 786 → 云函数 B → 数据库 J
  // 简化演示
  // 入口：?biz=course
  // ----------------------------------------------------------
  course: {
    collection: 'courses',            // 数据库 J
    cloudFunctionName: 'formSubmitB', // 云函数 B
    fields: [
      { name: 'field7', label: '字段7', type: 'text', required: true, placeholder: '请输入', defaultValue: '' },
      { name: 'field8', label: '字段8', type: 'textarea', required: true, placeholder: '请输入', defaultValue: '' },
      { name: 'field6', label: '字段6', type: 'number', required: true, placeholder: '请输入', defaultValue: '', min: 0, max: 9999 }
    ],
    feedback: {
      successText: '发布成功',
      errorText: '发布失败，请稍后再试'
    }
  },

  // ==========================================================
  // 真实业务对齐：task/publish 课程发布
  // 来源：miniprogram/pages/task/publish/publish.{wxml,js}
  // 云函数：NEWDL_execution_order（action 路由模式）
  //   - action='publish'（新建态）
  //   - action='update_order'（编辑态，已有 orderId）
  //   - action='confirm_generate_pickup_code'（生成 pl 接取码）
  //   - action='get_oneorder'（拉取订单详情）
  //   - action='update_lesson_content'（写每日总结）
  // 入口：?biz=taskPublish
  //
  // ⚠️ 粗修改清单（已对齐 7/9 字段）：
  //   1. 7 个字段直接用 form-submit 积木 8 种 type 覆盖
  //   2. location 字段：原 publish 用 chooseLocation 选点，form-submit 暂未支持 type=location
  //      → 待 form-submit 积木加 type=location 扩展后才能完全替换
  //   3. child_profiles 字段：原 publish 是子表数组（nickname/age/gender/height/weight）
  //      → 待 form-submit 加子表积木 sub-form 后才能完全替换
  //   4. publish_type / class_count / order_org_info / B 端桥接字段
  //      是服务端逻辑字段，不属于表单字段，由原 NEWDL_execution_order 云函数处理
  //   5. cloudFunctionName 这里指到 NEWDL_execution_order，但 form-submit
  //      通用云函数按 collection.add 写入，与 publish 的 action='publish' 路由不兼容。
  //      要正式替换需在 form-submit 云函数里加 action 路由分支，或业务方自行
  //      部署一个 NEWDL_execution_order_publish 云函数接 formData 后转调原逻辑。
  // ==========================================================
  taskPublish: {
    collection: 'orders',                       // publish 实际写入 orders 集合（待云函数确认）
    cloudFunctionName: 'NEWDL_execution_order', // 原 publish 走的云函数
    fields: [
      // 课程标题
      { name: 'title', label: '课程标题', type: 'text', required: true,
        placeholder: '例如 少儿体能启蒙班', defaultValue: '', maxlength: 50 },
      // 课程计划
      { name: 'course_plan', label: '课程计划', type: 'textarea', required: true,
        placeholder: '可以在默认课程计划基础上继续补充、更改', defaultValue: '', maxlength: 500 },
      // 课程人数
      { name: 'course_size_mode', label: '课程人数', type: 'radio', required: true,
        options: [
          { label: '1对1', value: '1对1' },
          { label: '1对多', value: '1对多' }
        ],
        defaultValue: '1对1' },
      // 上课时间
      { name: 'frequency', label: '上课时间', type: 'text', required: false,
        placeholder: '例如 每周二、四 19:00-20:00', defaultValue: '' },
      // 任务位置（地图选点，值是对象 {name, address, latitude, longitude}）
      { name: 'location', label: '任务位置', type: 'location', required: true,
        placeholder: '点击选择上课地点', defaultValue: null },
      // 联系方式（11 位手机号）
      { name: 'contact', label: '联系方式', type: 'phone', required: true,
        placeholder: '请输入11位手机号', defaultValue: '' },
      // 课程价格
      { name: 'price_interval', label: '客单价(一节)', type: 'select', required: false,
        placeholder: '请选择课程价格',
        options: [
          { label: '不同地区不同', value: '不同地区不同' },
          { label: '100-130', value: '100-130' },
          { label: '130-160', value: '130-160' },
          { label: '160-190', value: '160-190' },
          { label: '190-220', value: '190-220' },
          { label: '220-250', value: '220-250' },
          { label: '250以上', value: '250以上' }
        ],
        defaultValue: '' },
      // 教练内部备注
      { name: 'coach_private_note', label: '课程备注', type: 'textarea', required: false,
        placeholder: '填写特殊要求、内部提醒、家长沟通注意事项', defaultValue: '', maxlength: 500 }
    ],
    feedback: {
      successText: '发布成功',
      errorText: '发布失败，请重试'
    }
  }

  // ----------------------------------------------------------
  // 加新业务：直接在下面追加一项即可
  // 入口：?biz=<key>
  // ----------------------------------------------------------
}
