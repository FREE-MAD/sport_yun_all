// ============================================================
// 业务积木：表单提交 - 核心逻辑（多类型版）
// 核心链路：路由 biz → 取配置 → 输入（8 种 type）→ 校验 → wx.cloud.callFunction → 反馈
// ★ 不要修改本文件，业务调整请改 config.js
// 支持 type: text / number / textarea / phone / date / select / radio / checkbox / switch
// 字段通用属性: placeholder / defaultValue / maxlength / min / max / options
// ============================================================

const configMap = require('./config.js')

Page({
  data: {
    fields: [],                    // 当前业务字段定义（onLoad 时按 biz 注入）
    formData: {},                 // 当前表单数据
    submitting: false             // 提交中状态锁
  },

  onLoad(options) {
    // 从路由参数取业务 key，例如 /pages/form/form?biz=student
    const biz = options.biz
    if (!biz || !configMap[biz]) {
      wx.showToast({ title: '未配置业务:' + biz, icon: 'none' })
      return
    }

    // 取对应业务配置，存到实例属性
    this._biz = configMap[biz]

    // 初始化 formData，按 type 设默认值
    // - text/number/phone/textarea/date/select/radio: defaultValue || ''
    // - checkbox: defaultValue || []
    // - switch: defaultValue || false
    const formData = {}
    this._biz.fields.forEach(f => {
      if (f.defaultValue !== undefined) {
        formData[f.name] = f.defaultValue
      } else if (f.type === 'checkbox') {
        formData[f.name] = []
      } else if (f.type === 'switch') {
        formData[f.name] = false
      } else if (f.type === 'location') {
        formData[f.name] = null           // 地图选点：值是对象 {name, address, latitude, longitude}，未选时为 null
      } else {
        formData[f.name] = ''
      }

      // select 用 _label 字段缓存显示文本（picker 模式优化）
      if (f.type === 'select' && f.defaultValue !== undefined) {
        const opt = (f.options || []).find(o => o.value === f.defaultValue)
        formData[f.name + '_label'] = opt ? opt.label : ''
      }
    })
    this.setData({ fields: this._biz.fields, formData })
  },

  // 输入回调：input/textarea/number 的 bindinput
  onInput(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  // 选择回调：date/radio/checkbox 的 bindchange，value 直接取 e.detail.value
  onPick(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  // select 选择回调：picker mode=selector 返回的是 index，需要转 value + 缓存 label
  onPickSelect(e) {
    const { field } = e.currentTarget.dataset
    const fieldDef = this._biz.fields.find(f => f.name === field)
    const idx = e.detail.value
    const opt = fieldDef.options[idx]
    this.setData({
      [`formData.${field}`]: opt ? opt.value : '',
      [`formData.${field}_label`]: opt ? opt.label : '',
      [`formData.${field}_index`]: idx
    })
  },

  // switch 回调：value 是 boolean
  onSwitch(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  // 地图选点：调 wx.chooseLocation，返回 {name, address, latitude, longitude} 存到 formData
  // 业务方可覆盖 onLocationPicked 自定义后续动作（如反查行政区/逆地理）
  onChooseLocation(e) {
    const { field } = e.currentTarget.dataset
    wx.chooseLocation({
      success: (res) => {
        // res 含 name/address/latitude/longitude
        this.setData({
          [`formData.${field}`]: {
            name: res.name,
            address: res.address || res.name,
            latitude: res.latitude,
            longitude: res.longitude
          }
        })
        if (typeof this.onLocationPicked === 'function') {
          this.onLocationPicked({ field, location: res })
        }
      },
      fail: (err) => {
        // 用户取消选择不算错误，只打 log
        console.log('[form-submit] chooseLocation 取消或失败:', err)
      }
    })
  },

  // 校验：按 type + required + min/max 逐项检查
  validate() {
    for (const f of this._biz.fields) {
      const value = this.data.formData[f.name]

      // switch 类型不参与必填校验（默认 false）
      if (f.type === 'switch') continue

      // 必填校验：text/number/phone/textarea/date/select/radio 判空字符串
      if (f.required) {
        let isEmpty
        if (f.type === 'checkbox') {
          isEmpty = !Array.isArray(value) || value.length === 0
        } else if (f.type === 'location') {
          // 地图选点：值是对象，按 address 字段判空
          isEmpty = !value || !value.address
        } else {
          isEmpty = !value || value === ''
        }
        if (isEmpty) {
          wx.showToast({ title: `请填写${f.label}`, icon: 'none' })
          return false
        }
      }

      // 数字范围校验：min/max
      if (f.type === 'number' && value !== '' && value !== undefined) {
        const num = Number(value)
        if (f.min !== undefined && num < f.min) {
          wx.showToast({ title: `${f.label}不能小于${f.min}`, icon: 'none' })
          return false
        }
        if (f.max !== undefined && num > f.max) {
          wx.showToast({ title: `${f.label}不能大于${f.max}`, icon: 'none' })
          return false
        }
      }

      // 手机号格式校验：11 位、首位为 1
      if (f.type === 'phone' && value && !/^1\d{10}$/.test(value)) {
        wx.showToast({ title: `${f.label}格式错误`, icon: 'none' })
        return false
      }

      // 文本最大长度校验：maxlength
      if (f.maxlength && typeof value === 'string' && value.length > f.maxlength) {
        wx.showToast({ title: `${f.label}不能超过${f.maxlength}字`, icon: 'none' })
        return false
      }
    }
    return true
  },

  // 提交：防重复点击 → 校验 → 调云函数 → 反馈
  async onSubmit() {
    if (this.data.submitting) return       // 防止重复提交
    if (!this._biz) return                  // 业务配置未加载
    if (!this.validate()) return            // 校验失败则中断

    this.setData({ submitting: true })

    try {
      // 构造提交数据：剔除 select 的 _label / _index 缓存字段
      const submitData = {}
      this._biz.fields.forEach(f => {
        submitData[f.name] = this.data.formData[f.name]
      })

      // 调用当前业务配置的云函数名
      const res = await wx.cloud.callFunction({
        name: this._biz.cloudFunctionName,
        data: {
          collection: this._biz.collection,
          formData: submitData
        }
      })

      // 入库成功
      if (res.result && res.result.success) {
        wx.showToast({ title: this._biz.feedback.successText, icon: 'success' })
        // 业务方可覆盖 onSubmitted 做后续动作
        if (typeof this.onSubmitted === 'function') {
          this.onSubmitted(res.result)
        }
      } else {
        // 云函数返回失败
        throw new Error((res.result && res.result.message) || 'unknown')
      }
    } catch (err) {
      // 入库失败
      console.error('[form-submit] 提交失败:', err)
      wx.showToast({ title: this._biz.feedback.errorText, icon: 'none' })
      if (typeof this.onSubmitFailed === 'function') {
        this.onSubmitFailed(err)
      }
    } finally {
      this.setData({ submitting: false })
    }
  }
})
