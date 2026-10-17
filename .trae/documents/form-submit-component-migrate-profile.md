# form-submit 组件扩展 + profile 整体迁移实施方案

## Context（背景与目标）

教练资料编辑页 `代码_8月中进行重构/miniprogram/pages/index/profile/profile.*` 当前是一个 900 行的单体 Page，自己实现了 17 个字段、默认头像联动、多块佐证、擅长领域多选、安全审核、预览草稿等所有逻辑。提交直接 `wx.cloud.callFunction({name:'NEWDL_mine_user', data:{action:'updateProfile', profile}})`。

业务积木组件 `sport_yun/comp/form-submit/` 是一个轻量表单组件，目前是 Page 形态，只支持 text/phone/textarea 三种字段，通过 `config.js` 的 biz map 多业务复用，通用云函数只做 `db.collection(x).add(formData)`。

**目标**：把 profile 页面的表单 UI 与提交链路整体迁移到 form-submit 组件中，由 form-submit 承载所有字段渲染、校验、提交、审核触发；profile 页面退化为宿主外壳，只保留路由、跳预览页、审核状态 banner。

**用户已确认的核心决策**：

1. 整体迁移替换 profile 页面表单 UI 与提交逻辑
2. form-submit 改造为微信小程序 Component 形态被 profile 引入
3. 允许修改 form-submit 核心文件（form.js / form.wxml / 通用云函数），README 同步更新

**用户规则约束**：

* 不允许删除注释，添加新功能要添加注释

* 不动 `NEWDL_mine_user` 云函数（仍按现有接口调用，ai 只改 dev\_index.js 但本次不改）

* ai 不允许执行 sync-dev-to-true.js 迁移

## 关键事实（探索结论）

* form-submit 当前位于 `sport_yun/comp/form-submit/`，与小程序根 `代码_8月中进行重构/miniprogram/` 平级，**无法被小程序 usingComponents 引用**，必须迁移到 miniprogram 树内。

* app.json 的 pages 数组未注册 form-submit 页面，student/course 业务仅是 config.js 中的示例配置，**没有任何页面 navigateTo 到 form-submit**，因此迁移目录不会破坏现有调用链。

* `NEWDL_mine_user` 云函数 action 列表：`getProfile` / `updateProfile` / `submitProfileSecurityReview` / `logSharedProfileView` / `updateAvatar` / `getStats(默认)`，还服务于 mine.js / profile.js(展示页) / edit.js(预览页) / organization\_create.js / app.js，**不能改其接口**。

* updateProfile 入参 key 是 `profile`（不是 formData），返回 `{status, message, profile, securityReview}`。

* submitProfileSecurityReview 入参 key 是 `reviewProfile`，返回 `{status, review}`。

* profile.js 的审核图压缩工具 `prepareImageForUpload` 位于 `代码_8月中进行重构/miniprogram/utils/imageUpload.js`，组件迁移到 `miniprogram/components/form-submit/` 后 require 路径为 `../../utils/imageUpload`。

## 实施方案

### 步骤 1：迁移 form-submit 目录到 miniprogram 树内

把 `sport_yun/comp/form-submit/` 整体移动到 `代码_8月中进行重构/miniprogram/components/form-submit/`，目录结构由 `pages/form/` 改为组件目录 `form-submit/`：

```
miniprogram/components/form-submit/
├── form-submit.js         # 由 form.js 改造为 Component
├── form-submit.wxml       # 由 form.wxml 改名
├── form-submit.wxss       # 由 form.wxss 改名
├── form-submit.json       # {"component": true, "usingComponents": {}}
└── config.js              # 业务配置 map（保留原文件名）
```

`cloudfunctions/formSubmit/index.js` 保留原位置不动（通用 add 云函数，供未来 student/course 类业务使用）。

原 `sport_yun/comp/form-submit/` 目录在迁移后可保留作为历史归档，或由用户决定是否删除（不在本方案自动删除范围内）。

### 步骤 2：form-submit.js 从 Page 改造为 Component

核心改动：

* `Page({...})` → `Component({...})`

* 删除 `onLoad(options)`，改为 `properties: { biz: { type: String, value: '' } }` + `lifetimes.attached()` 读 `this.data.biz` 取 config

* 业务配置挂到 `this._bizConfig` 实例属性（不进 setData）

* 所有方法迁入 `methods: {}` 块

* 提交成功 `triggerEvent('submitted', { result, submitData })`；失败 `triggerEvent('error', { err, submitData })`；加载完成 `triggerEvent('loaded', { result })`

* 保留 `wx.showToast` 默认反馈，新增 `feedback.silent: true` 配置项可关闭

骨架：

```js
Component({
  properties: { biz: { type: String, value: '' } },
  data: {
    fields: [], formData: {}, submitting: false,
    multiBlockList: {},          // multiblock 字段内部数组态
    defaultAvatarMap: {},        // image 字段默认头像映射
    hasCustomImage: {},          // image 字段是否自定义
    securityReview: {}           // 审核状态（上抛宿主展示）
  },
  lifetimes: {
    attached() {
      const cfg = configMap[this.data.biz]
      if (!cfg) { this.triggerEvent('error', { message: '未配置业务:' + this.data.biz }); return }
      this._bizConfig = cfg
      this.initFormData()         // 按 fields 初始化 formData + multiBlockList
      if (cfg.loadAction) this.loadProfile()  // 自动回填
    }
  },
  methods: {
    onInput, onOptionSelect, toggleMultiSelect, onMultiBlockInput,
    addMultiBlock, removeMultiBlock, chooseAndUploadImage, resetImageToDefault,
    validate, buildSubmitData, onSubmit, loadProfile, triggerSecurityReview,
    buildReviewProfile, applyFormData, getFormData  // 暴露给宿主
  }
})
```

`getFormData()` 作为外部方法暴露，宿主页面可通过 `this.selectComponent('#form').getFormData()` 拿到当前表单数据，供预览草稿使用。

### 步骤 3：config.js 字段类型扩展

在原有 text/phone/textarea 基础上新增 5 种 type：

| type          | 额外属性                                                                                               | 渲染控件                                |
| ------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `image`       | `cloudDir`、`defaultBy: 'gender'`、`defaultMap: {男:fileId,女:fileId}`、`resetLabel`、`avatarSync: true` | 上传区 + 默认图缩略 + 恢复默认按钮                |
| `options`     | `options: [string]`                                                                                | `.option-chip` 横排单选                 |
| `multiselect` | `optionGroups: [{title,options:[string]}]`、`separator: '、'`                                        | `.skill-chip` 分组横向滚动多选              |
| `multiblock`  | `blockLabel`、`proofLabel`、`proofRequired: true`、`placeholder`                                      | `.multi-block-card` 列表 + add/remove |
| `proofImage`  | `dependsOn: 'education'`（条件必填）、`cloudDir`                                                          | 上传区，依赖字段非空时才必传                      |

顶层新增配置项（仅 callByName 模式需要）：

| 顶层字段                          | 含义                                                         |
| ----------------------------- | ---------------------------------------------------------- |
| `mode: 'add' \| 'callByName'` | 提交链路开关。无该字段默认 `'add'`，走原通用云函数；`'callByName'` 走指定云函数+action |
| `cloudFunctionName`           | 云函数名（两种模式都需要）                                              |
| `action`                      | callByName 模式提交用 action                                    |
| `dataKey`                     | callByName 模式提交时 formData 的入参 key（默认 `'formData'`）         |
| `loadAction`                  | callByName 模式自动回填用 action（不配则不回填）                          |
| `loadDataKey`                 | 回填返回数据所在 key（默认 `'profile'`）                               |
| `reviewAction`                | 提交成功后异步触发的审核 action（不配则不触发）                                |
| `reviewDataKey`               | 审核入参 key（默认 `'reviewProfile'`）                             |
| `buildReviewProfile: true`    | 是否在触发审核前压缩图片构建审核专用资料                                       |
| `envVersion: true`            | 是否自动传 envVersion（取自 `getApp().globalData.miniEnvVersion`）  |

profile 业务完整 config（17 字段）：

```js
// profile 业务专属常量（从 profile.js 抽出，原注释保留）
const DEFAULT_COACH_AVATAR = {
  男: 'cloud://cloud1-6gh7jgl8c5b16a83.636c-cloud1-6gh7jgl8c5b16a83-1398046944/NEWDL/users/默认头像defaultavatar/default_coach_avatar_male_cropped.png',
  女: 'cloud://cloud1-6gh7jgl8c5b16a83.636c-cloud1-6gh7jgl8c5b16a83-1398046944/NEWDL/users/默认头像defaultavatar/default_coach_avatar_female_cropped.png'
}
const SKILL_OPTION_GROUPS = [
  { title: '体态矫正', options: ['圆肩驼背改善', '脊柱侧弯预防', 'X/O 型腿调整'] },
  { title: '专业追高', options: ['基础能力巩固', '专项成绩突破', '考级与比赛冲刺'] },
  { title: '田径专项', options: ['短跑爆发力', '中长跑耐力', '跑跳投综合训练'] },
  { title: '中考体育', options: ['长跑专项', '跳绳专项', '实心球专项'] },
  { title: '少儿体能班', options: ['基础体能', '协调性训练', '平衡能力'] },
  { title: '跳绳班', options: ['基础跳绳', '速度跳绳', '花样跳绳'] },
  { title: '球类专项班', options: ['乒乓球', '羽毛球', '篮球', '足球'] }
]

profile: {
  mode: 'callByName',
  cloudFunctionName: 'NEWDL_mine_user',
  action: 'updateProfile',
  dataKey: 'profile',
  loadAction: 'getProfile',
  loadDataKey: 'profile',
  reviewAction: 'submitProfileSecurityReview',
  reviewDataKey: 'reviewProfile',
  buildReviewProfile: true,
  envVersion: true,
  feedback: { successText: '成功保存', errorText: '保存失败，请稍后再试' },
  fields: [
    { name: 'avatarUrl', label: '照片', type: 'image', cloudDir: 'avatarUrl',
      defaultBy: 'gender', defaultMap: DEFAULT_COACH_AVATAR,
      resetLabel: '恢复默认头像', avatarSync: true },
    { name: 'nickname', label: '昵称', type: 'text', required: true, placeholder: '教练' },
    { name: 'phone', label: '联系方式', type: 'phone', required: true, maxlength: 11 },
    { name: 'gender', label: '性别', type: 'options', required: true, options: ['男','女'] },
    { name: 'experienceLevel', label: '工作经验', type: 'options', options: ['1年+','2年+'] },
    { name: 'studentCountLevel', label: '带过学员', type: 'options', options: ['5+','10+','20+'] },
    { name: 'city', label: '城市', type: 'text' },
    { name: 'address', label: '地址', type: 'text' },
    { name: 'basicPhotoProof', label: '照片佐证', type: 'image', cloudDir: 'basicPhotoProof' },
    { name: 'aboutMe', label: '关于我', type: 'textarea' },
    { name: 'workExperience', label: '工作经历', type: 'textarea' },
    { name: 'education', label: '教育背景', type: 'textarea' },
    { name: 'educationPhotoProof', label: '教育佐证', type: 'proofImage',
      dependsOn: 'education', cloudDir: 'educationPhotoProof' },
    { name: 'skills', label: '擅长领域', type: 'multiselect',
      optionGroups: SKILL_OPTION_GROUPS, separator: '、' },
    { name: 'languages', label: '语言', type: 'text' },
    { name: 'honors', label: '荣誉', type: 'textarea' },
    { name: 'relatedCertificates', label: '相关证书', type: 'multiblock',
      blockLabel: '证书内容', proofLabel: '证书佐证', proofRequired: true,
      placeholder: '如：教师资格证、救生员证、体适能教练证' },
    { name: 'honorShowcase', label: '荣誉展示', type: 'multiblock',
      blockLabel: '荣誉内容', proofLabel: '荣誉佐证', proofRequired: true,
      placeholder: '如：比赛获奖、优秀教练、学员成果展示' }
  ]
}
```

student/course 业务配置**完全不动**，无 `mode` 字段时默认走原 add 链路（向后兼容）。

### 步骤 4：form-submit.wxml 字段渲染扩展

在原 text/phone/textarea 分支后新增 5 个 `wx:elif` 分支，结构直接参考 profile.wxml 现有实现：

* `image` 分支：默认头像缩略行（仅 `defaultBy` 配置时显示）+ 上传区 + 恢复默认按钮

* `options` 分支：`.option-row` 内循环 `item.options` 渲染 `.option-chip`，active 态由 `formData[item.name] === opt` 判断

* `multiselect` 分支：循环 `item.optionGroups`，每组 `.skill-group` + `scroll-view.skill-scroll-view` 横向滚动，底部 `.skill-selected-text` 展示当前已选

* `multiblock` 分支：循环 `multiBlockList[item.name]`，每块 `.multi-block-card` 含 textarea + 佐证上传区，底部 add/remove 按钮

* `proofImage` 分支：与 image 类似但无默认头像行，必填态由 `formData[item.dependsOn]` 是否非空决定

form-submit.wxss 把 profile.wxss 里的 `.option-chip / .skill-chip / .multi-block-card / .upload-area / .default-avatar-thumb / .field-action-btn` 等通用类整体迁入，保持视觉一致。

### 步骤 5：form-submit.js 提交链路扩展（双模式）

```js
async onSubmit() {
  if (this.data.submitting) return
  if (!this.validate()) return
  this.setData({ submitting: true })
  const cfg = this._bizConfig
  const submitData = this.buildSubmitData()  // multiblock/multiselect 序列化为字符串
  try {
    let res
    if (cfg.mode === 'callByName') {
      // 新链路：透传 action + dataKey + envVersion
      const data = { action: cfg.action, [cfg.dataKey || 'formData']: submitData }
      if (cfg.envVersion) data.envVersion = getApp().globalData.miniEnvVersion || 'develop'
      res = await wx.cloud.callFunction({ name: cfg.cloudFunctionName, data })
    } else {
      // 旧链路：通用 add（student/course 业务）
      res = await wx.cloud.callFunction({
        name: cfg.cloudFunctionName,
        data: { collection: cfg.collection, formData: submitData }
      })
    }
    const ok = res.result && (res.result.success || res.result.status === 'success')
    if (ok) {
      if (!cfg.feedback || !cfg.feedback.silent) {
        wx.showToast({ title: cfg.feedback.successText, icon: 'success' })
      }
      this.triggerEvent('submitted', { result: res.result, submitData })
      // 异步触发审核（不阻塞）
      if (cfg.reviewAction) this.triggerSecurityReview(submitData)
    } else throw new Error((res.result && res.result.message) || 'unknown')
  } catch (err) {
    if (!cfg.feedback || !cfg.feedback.silent) {
      wx.showToast({ title: cfg.feedback.errorText, icon: 'none' })
    }
    this.triggerEvent('error', { err, submitData })
  } finally {
    this.setData({ submitting: false })
  }
}
```

**loadProfile 回填**：attached 后若 `cfg.loadAction`，调 callFunction 取回数据，`applyFormData()` 反序列化 skills/multiblock 字段后 setData，同时 setData securityReview，triggerEvent('loaded')。

**triggerSecurityReview**：复用 profile.js 的 `buildReviewProfile` 逻辑（整体下沉到组件 methods），用 `prepareImageForUpload` 把每张图压成最小图上传到 `_security_review` 目录，再 callFunction action=cfg.reviewAction。默认头像免压缩（沿用 `isDefaultCoachAvatar` 判断）。

**avatarSync**：image 字段配置 `avatarSync: true` 时，上传成功后写 `getApp().globalData.avatarUrl` + `wx.setStorageSync('avatarUrl', ...)`。

**validate 校验扩展**：multiblock 字段循环 blockList 校验每块 content+proof；proofImage 字段在 dependsOn 字段非空时才必传；其余沿用原 required + phone 格式校验。

### 步骤 6：profile 页面外壳化

profile.json：

```json
{ "usingComponents": { "form-submit": "/components/form-submit/form-submit" } }
```

profile.wxml 精简为：

```xml
<view class="page">
  <view class="header">
    <view class="header-info">填写教练资料</view>
    <view class="stats">补充您的专业背景与教学信息，让家长更全面地了解您</view>
  </view>
  <!-- 审核 banner：未通过时展示原因 -->
  <view wx:if="{{securityReview.status === 'rejected'}}" class="security-banner">
    {{securityReview.message}}
  </view>
  <view class="section">
    <form-submit id="form" biz="profile"
      bind:submitted="onProfileSaved"
      bind:error="onProfileError"
      bind:loaded="onProfileLoaded" />
  </view>
  <view class="bottom-bar">
    <button bindtap="goToProfilePreview">预览资料</button>
  </view>
</view>
```

profile.js 精简到 \~80 行，保留：

* `data: { securityReview: {} }`

* `onProfileLoaded(e)`：`setData({ securityReview: e.detail.result.securityReview })`

* `onProfileSaved(e)`：`setData({ securityReview: e.detail.result.securityReview })`，更新全局 nickname/avatarUrl

* `onProfileError(e)`：console.warn

* `goToProfilePreview()`：`this.selectComponent('#form').getFormData()` 拿当前数据 → `wx.setStorageSync('NEWDL_profile_preview_draft', ...)` → `wx.navigateTo({url:'/pages/profile/edit/edit'})`

下沉到组件的逻辑：所有字段输入、图片上传、多块操作、擅长领域多选、默认头像联动、saveProfile 提交链路、buildReviewProfile、loadProfile、validateMultiBlockField、normalizeProfileForm。

profile.wxss 保留：header / bottom-bar / security-banner / page 等外壳样式；通用字段样式（option-chip/skill-chip/multi-block-card 等）迁入 form-submit.wxss。

### 步骤 7：README 更新

修改 `miniprogram/components/form-submit/README.md`（迁移后路径）：

* 顶部约定变更：核心文件 form-submit.js / form-submit.wxml / 通用云函数现在**可扩展**，但扩展必须保持向后兼容（无 `mode` 字段默认走 add 链路）

* 字段类型表新增 image / options / multiselect / multiblock / proofImage 五行

* 新增顶层配置项说明：mode / action / dataKey / loadAction / loadDataKey / reviewAction / reviewDataKey / buildReviewProfile / envVersion

* 新增"Component 接入方式"段：`<form-submit biz="xxx" bind:submitted />`

* 保留原 student/course 示例与"扩展新 type"步骤说明

* 更新目录结构图（pages/form/ → form-submit/ 组件目录）

## 风险与权衡

| 风险                                                          | 影响                                  | 缓解                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| form-submit 目录迁移后路径变化                                       | 原 sport\_yun/comp/form-submit/ 不再可达 | student/course 无实际调用方，迁移无破坏；旧目录保留作归档                                                                      |
| config.js 字段定义复杂度上升                                         | 业务方阅读成本增加                           | README 加完整 profile 示例 + 字段类型表                                                                             |
| Component triggerEvent 替代原 saveProfile 钩子                   | 宿主对提交流程精细控制减弱                       | 通过 submitted/error/loaded 三个事件覆盖关键节点                                                                      |
| buildReviewProfile 业务专属逻辑下沉到通用组件                            | 组件变重                                | 用 cfg.buildReviewProfile 开关控制，未配置则不执行                                                                     |
| localImagePathMap 在组件 attached 后丢失                          | 审核时无法复用本地图，需重新下载                    | loadProfile 回填后通过 fileID 重新下载到 tempFilePath 重建 map（沿用 profile.js 现有 resolveReviewSourceFilePath fallback） |
| DEFAULT\_COACH\_AVATAR / SKILL\_OPTION\_GROUPS 抽到 config.js | config.js 不再纯粹通用                    | 用注释明确标注"profile 业务专属常量"，允许在 config 项内联定义                                                                  |

## 验证

### 端到端流程验证（profile 业务）

1. 进入 `pages/index/profile/profile` 页面，控制台无报错
2. 自动加载资料：所有字段回填正常，头像按性别展示默认图，多块证书/荣誉按 JSON 反序列化为可编辑块
3. 编辑昵称、切换性别（默认头像跟随变化）、上传自定义头像、点选擅长领域多选、添加/删除多块证书、上传佐证图
4. 点保存按钮：toast "成功保存"，securityReview 状态变成 pending
5. 等待几秒后刷新页面，securityReview 状态变成 approved 或 rejected（取决于内容安全检测结果）
6. 点预览按钮：跳转到 `/pages/profile/edit/edit`，预览页能看到刚填写的所有字段（含未保存的草稿）
7. 故意填违规文本或留空必填项，验证校验和审核拒绝路径

### 向后兼容验证（student/course 业务）

1. config.js 中 student/course 配置保持原样
2. 由于改成了 Component，旧的 `wx.navigateTo({url:'/comp/form-submit/pages/form/form?biz=student'})` 已不可用（但本来就没有调用方）
3. 如需保留 student/course 独立页面入口，由用户后续在需要时单独创建薄 Page 包装，本方案不预先实现（避免过度工程）

### 受影响的其他页面验证

* mine.js / profile.js(展示页) / edit.js(预览页) / organization\_create.js / app.js 均通过 NEWDL\_mine\_user 调用其他 action，未修改该云函数，无需回归

## 关键文件清单

待创建/修改：

* `代码_8月中进行重构/miniprogram/components/form-submit/form-submit.js`（由 form.js 改造为 Component）

* `代码_8月中进行重构/miniprogram/components/form-submit/form-submit.wxml`

* `代码_8月中进行重构/miniprogram/components/form-submit/form-submit.wxss`

* `代码_8月中进行重构/miniprogram/components/form-submit/form-submit.json`

* `代码_8月中进行重构/miniprogram/components/form-submit/config.js`

* `代码_8月中进行重构/miniprogram/components/form-submit/README.md`

* `代码_8月中进行重构/miniprogram/pages/index/profile/profile.wxml`（精简为外壳）

* `代码_8月中进行重构/miniprogram/pages/index/profile/profile.js`（精简到 \~80 行）

* `代码_8月中进行重构/miniprogram/pages/index/profile/profile.json`（局部注册 form-submit）

* `代码_8月中进行重构/miniprogram/pages/index/profile/profile.wxss`（保留外壳样式）

只读参考（不动）：

* `代码_8月中进行重构/cloudfunctions/NEW_DL_fun/NEWDL_mine_user/dev_index.js`（按现有接口调用）

* `代码_8月中进行重构/miniprogram/utils/imageUpload.js`（复用 prepareImageForUpload）

## 分步实施顺序

1. 创建 `miniprogram/components/form-submit/` 目录，把原 form-submit 文件迁入并改名（form.js → form-submit.js 等），调整 require 路径
2. form-submit.js 从 Page 改造为 Component（properties/lifetimes/methods/triggerEvent），保留原 3 种 type 逻辑
3. 扩展 form-submit.wxml + form-submit.wxss，新增 5 种 type 分支与样式
4. 扩展 form-submit.js 提交链路：mode 开关、callByName+action、loadProfile、triggerSecurityReview、buildReviewProfile、image 上传、avatarSync
5. config.js 增加 profile 业务配置（含 DEFAULT\_COACH\_AVATAR / SKILL\_OPTION\_GROUPS 常量）
6. profile.wxml/wxss/json/js 改造为外壳 + `<form-submit biz="profile" />`
7. README 同步更新约定 + 字段类型表 + profile 示例 + Component 接入方式
8. 端到端验证（按上文"验证"段执行）

