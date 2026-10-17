# API 文档

## 订单管理 RBAC API

### 云函数：`order_manage`

**描述**：订单状态管理和权限控制，基于用户角色进行操作验证

#### 请求参数
```javascript
{
  action: string,        // 操作类型：accept, start, complete, after_sales, cancel
  orderId: string,       // 订单ID
  userId: string,        // 当前用户ID
  userRole: string,      // 用户角色：P(体育从业者), R(需求方), V(访客)
  status?: string        // 目标状态（某些操作需要）
}
```

#### 响应格式
```javascript
{
  code: number,          // 0: 成功, 400: 参数错误, 403: 权限不足, 500: 服务器错误
  msg: string,           // 消息说明
  data?: {              // 成功时返回的数据
    orderId: string,
    newStatus: string,
    updateTime: string
  }
}
```

#### 权限说明

| 用户角色 | 操作权限 | 说明 |
|---------|---------|------|
| P (体育从业者) | 接单、开始执行、完成订单、发布订单、取消自己的订单、管理售后 | 可以执行所有订单操作 |
| R (需求方) | 发布订单、取消自己的订单、管理售后 | 只能发布和管理自己的订单 |
| V (访客) | 仅查看 | 无操作权限 |

#### 订单状态流转

```
pending (待接取) 
    ↓ accept
accepted (已接取)
    ↓ start  
in_progress (进行中)
    ↓ complete
completed (已完成)
    ↓ after_sales
after_sales (售后中)
```

#### 操作示例

**接单**：
```javascript
wx.cloud.callFunction({
  name: 'order_manage',
  data: {
    action: 'accept',
    orderId: 'order123',
    userId: 'user456', 
    userRole: 'P'
  }
})
```

**开始执行**：
```javascript
wx.cloud.callFunction({
  name: 'order_manage',
  data: {
    action: 'start',
    orderId: 'order123',
    userId: 'user456',
    userRole: 'P' 
  }
})
```

## 私聊功能 API

### 1. conversation_getorcreate

**描述**：获取或创建会话

**请求参数**：
```javascript
{
  userId: string,         // 当前用户ID
  targetUserId: string,   // 目标用户ID
  contextType?: string,   // 上下文类型：job
  contextId?: string,     // 上下文ID：订单ID
  from?: string          // 调用来源
}
```

**响应**：
```javascript
{
  success: boolean,
  conversationId: string,  // 会话ID
  targetUserId: string,   // 目标用户ID
  userA: string,
  userB: string
}
```

### 2. conversation_getById

**描述**：获取会话详情和目标用户信息

**请求参数**：
```javascript
{
  id: string,           // 会话ID
  userId: string,       // 当前用户ID
  target_id?: string    // 目标用户ID（可选）
}
```

**响应**：
```javascript
{
  code: number,
  data: {
    conversationId: string,
    targetUser: {
      _id: string,
      nickname: string,
      avatar: string,
      role: string
    }
  }
}
```

### 3. Chat_Message

**描述**：获取会话消息列表

**请求参数**：
```javascript
{
  conversationId: string,  // 会话ID
  userId: string          // 当前用户ID
}
```

**响应**：
```javascript
{
  code: number,
  data: [
    {
      _id: string,
      conversationId: string,
      from: string,            // 发送者ID
      content: string,         // 消息内容
      contentType: string,     // 消息类型：text, image, voice
      createdAt: string        // 创建时间
    }
  ]
}
```

### 4. send_massage

**描述**：发送消息

**请求参数**：
```javascript
{
  conversationId: string,  // 会话ID
  userId: string,         // 发送者ID
  content: string,        // 消息内容
  contentType: string     // 消息类型，默认 'text'
}
```

**响应**：
```javascript
{
  code: number,
  msg: string
}
```

## 数据库集合结构

### req (订单集合)
```javascript
{
  _id: string,
  title: string,           // 订单标题
  description: string,     // 订单描述
  price: number,           // 价格
  publisher_Id: string,    // 发布者ID
  acceptorId?: string,     // 接取者ID
  status: string,          // 订单状态
  createdAt: Date,
  acceptedAt?: Date,       // 接取时间
  startedAt?: Date,        // 开始时间
  completedAt?: Date,      // 完成时间
  afterSalesAt?: Date,     // 售后时间
  cancelledAt?: Date,      // 取消时间
  cancelledBy?: string    // 取消人
}
```

### Conversation_Page (会话集合)
```javascript
{
  _id: string,
  userA: string,           // 用户A ID
  userB: string,           // 用户B ID
  createdAt: Date,
  updatedAt?: Date,
  lastMessage: string,      // 最后一条消息内容
  unreadCount: number      // 未读消息数
}
```

### Message (消息集合)
```javascript
{
  _id: string,
  conversationId: string,   // 会话ID
  from: string,            // 发送者ID
  content: string,         // 消息内容
  contentType: string,     // 消息类型
  createdAt: Date
}
```

### users (用户集合)
```javascript
{
  _id: string,
  openid: string,          // 微信openid
  nickname: string,        // 昵称
  avatar: string,          // 头像URL
  role: string,           // 用户角色：P, R, V
  phone: string,          // 手机号
  createdAt: Date,
  updatedAt: Date
}
```