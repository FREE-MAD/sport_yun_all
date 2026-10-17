# 表单提交积木 (form-submit) · 多业务 + 多字段类型版

> 业务积木库 · 第 1 块
> 原则：核心链路不动，业务方只改 config.js

## 链路

```
路由参数 biz → config.js 取业务配置 → 按 type 动态渲染控件 → 输入 → 校验 → wx.cloud.callFunction → 云函数 → 数据库 → 反馈
```

## 多业务模型

```
A 页面入口  /pages/form/form?biz=student   → 收集 123 → 云函数 C → 入库 K
B 页面入口  /pages/form/form?biz=course    → 收集 786 → 云函数 B → 入库 J
加新业务    在 config.js 加一项             → 自动生成新表单
```

## 字段类型支持（8 种 type）

| type | 渲染控件 | 取值方式 | 校验规则 |
|---|---|---|---|
| text | input (type=text) | bindinput | required + maxlength |
| number | input (type=digit) | bindinput | required + min/max |
| phone | input (type=number) | bindinput | required + 11 位格式 + maxlength |
| textarea | textarea | bindinput | required + maxlength |
| date | picker mode=date | bindchange | required |
| select | picker mode=selector | bindchange → index 转 value | required |
| radio | radio-group | bindchange (单 value) | required |
| checkbox | checkbox-group | bindchange (数组) | required 时数组非空 |
| switch | switch | bindchange (boolean) | 不做必填校验 |

## 字段通用属性

| 属性 | 适用 type | 说明 |
|---|---|---|
| name | 所有 | 字段标识，对应数据库列名 |
| label | 所有 | 字段显示名 |
| type | 所有 | 控件类型，见上表 |
| required | 所有 | 是否必填（switch 不参与） |
| placeholder | text/number/phone/textarea/date/select | 占位提示 |
| defaultValue | 所有 | 默认值（checkbox 用数组，switch 用 boolean） |
| maxlength | text/phone/textarea | 最大长度 |
| min | number | 最小值 |
| max | number | 最大值 |
| options | select/radio/checkbox | 选项数组 `[{label, value}]` |

## 字段配置示例

```js
// 文本输入
{ name: 'name', label: '姓名', type: 'text', required: true,
  placeholder: '请输入姓名', defaultValue: '', maxlength: 20 }

// 数字输入
{ name: 'age', label: '年龄', type: 'number', required: true,
  placeholder: '请输入年龄', defaultValue: '', min: 1, max: 100 }

// 下拉选择
{ name: 'gender', label: '性别', type: 'select', required: true,
  placeholder: '请选择性别',
  options: [
    { label: '男', value: 'M' },
    { label: '女', value: 'F' }
  ], defaultValue: '' }

// 多选按钮组
{ name: 'tags', label: '标签', type: 'checkbox', required: false,
  options: [
    { label: '运动', value: 'sport' },
    { label: '音乐', value: 'music' }
  ], defaultValue: [] }

// 开关
{ name: 'subscribe', label: '订阅消息', type: 'switch', required: false,
  defaultValue: false }
```

## 目录

```
form-submit/
├── README.md
├── pages/
│   └── form/
│       ├── config.js          # ★ 配置区（业务方加业务 + 字段）
│       ├── form.wxml          # 表单结构（按 type 分支渲染）
│       ├── form.js            # 核心逻辑（勿改）
│       ├── form.wxss          # 样式
│       └── form.json
└── cloudfunctions/
    └── formSubmit/
        └── index.js           # 通用写入云函数
```

## 使用方法

### 1. 注册页面（项目根 app.json）

```json
{
  "pages": [
    "comp/form-submit/pages/form/form"
  ]
}
```

### 2. 配置业务（改 config.js）

见 [config.js](./pages/form/config.js) 里的 student / course 示例，包含全部 8 种字段类型演示。

### 3. 部署云函数

每个业务的 `cloudFunctionName` 对应一个云函数目录，复制通用版改名部署即可：
- `cloudfunctions/formSubmitC/` ← 业务 A
- `cloudfunctions/formSubmitB/` ← 业务 B

### 4. 触发跳转

```js
wx.navigateTo({ url: '/comp/form-submit/pages/form/form?biz=student' })
wx.navigateTo({ url: '/comp/form-submit/pages/form/form?biz=course' })
```

## 扩展钩子

业务方可覆盖以下方法：

```js
Page({
  onSubmitted(res) { wx.navigateBack() },          // 成功后回上一页
  onSubmitFailed(err) { console.error(err) }       // 失败后做埋点
})
```

## 扩展新 type（仅升级时一次性修改）

如需新增 type（如 file 上传、image 选图）：
1. `form.wxml` 加一个 `wx:elif="{{item.type === 'xxx'}}"` 分支
2. `form.js` 增加对应 handler + validate 规则
3. `form.wxss` 增加该控件样式
4. `README.md` 字段类型表加一行

升级完成后，业务方在 config.js 加 `type: 'xxx'` 字段即可使用。

## 不允许出现的词

- ❌ 学生、课程、教练、家长、机构...
- ✅ collection、fields、formData、submit、success、error、biz、type、options
